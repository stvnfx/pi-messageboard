import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as mbDb from "./db.js";
import type { MbLoop } from "./types.js";
import * as boardDb from "../db.js";
import { getRandomName, generateSuffix, generateAgentId } from "../names.js";
import { startHeartbeat, stopHeartbeat } from "./spawn.js";

const LOG_DIR = join(homedir(), ".pi", "agent", "messageboard");
const LOG_FILE = join(LOG_DIR, "loop.jsonl");

function logLoopEvent(event: string, data: Record<string, unknown> = {}): void {
	try {
		mkdirSync(LOG_DIR, { recursive: true });
		const entry = { ts: new Date().toISOString(), event, ...data };
		appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
	} catch {
		// Best effort logging
	}
}

export interface GoalCheckResult {
	passed: boolean;
	output: string;
}

export async function runGoalCheck(
	command: string,
	timeoutMs = 30000,
): Promise<GoalCheckResult> {
	const { execSync } = await import("node:child_process");
	try {
		const output = execSync(command, {
			timeout: timeoutMs,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { passed: true, output: output.trim().slice(0, 500) };
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string; message: string };
		const output = [e.stdout, e.stderr]
			.filter(Boolean)
			.join("\n")
			.trim()
			.slice(0, 500);
		return { passed: false, output: output || e.message };
	}
}

const CONTINUE_DIRECTIVES = [
	"Continue the loop. Execute the next concrete progress batch.",
	"Keep going — pick the next step and do it now.",
	"Proceed with the next focused unit of work on the goal.",
	"Advance the goal with one concrete, verifiable change.",
];

const STUCK_STRATEGIES = [
	"List 3 different approaches, then execute the most promising one.",
	"Switch to a different subtask you haven't touched recently.",
	"Check the board for help from other agents.",
	"Run tests, pick one failure, and fix it.",
	"Review recent changes and verify correctness.",
];

// ─── Fingerprint-based stuck detection ──────────────────────────────

const REPEAT_WINDOW = 3;
const SIMILARITY_THRESHOLD = 0.8;

export function fingerprint(text: string): string {
	const normalized = text
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
		.slice(0, 2000);
	return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function wordShingles(text: string, n = 3): Set<string> {
	const words = text.replace(/\s+/g, " ").trim().toLowerCase().split(" ");
	const set = new Set<string>();
	if (words.length < n) {
		if (words.length > 0) set.add(words.join(" "));
		return set;
	}
	for (let i = 0; i <= words.length - n; i++)
		set.add(words.slice(i, i + n).join(" "));
	return set;
}

export function textSimilarity(a: string, b: string): number {
	const setA = wordShingles(a);
	const setB = wordShingles(b);
	if (setA.size === 0 || setB.size === 0) return 0;
	let intersection = 0;
	for (const shingle of setA) if (setB.has(shingle)) intersection++;
	return intersection / (setA.size + setB.size - intersection);
}

export interface StuckDetection {
	stuck: boolean;
	reason?: string;
}

export function detectStuck(
	recentFingerprints: string[],
	recentTexts: string[],
	currentText: string,
): StuckDetection {
	if (!currentText.trim()) return { stuck: false };
	const currentFp = fingerprint(currentText);

	// Check exact fingerprint repeats
	const recentCount = recentFingerprints.filter(
		(fp) => fp === currentFp,
	).length;
	if (recentCount >= REPEAT_WINDOW) {
		return {
			stuck: true,
			reason: `same response repeated ${recentCount + 1}x (fingerprint ${currentFp})`,
		};
	}

	// Check near-duplicate via text similarity
	if (recentTexts.length >= 1) {
		const prev = recentTexts[recentTexts.length - 1];
		if (prev && currentText.length > 60) {
			const sim = textSimilarity(currentText, prev);
			if (sim >= SIMILARITY_THRESHOLD) {
				return {
					stuck: true,
					reason: `response ~${Math.round(sim * 100)}% similar to previous`,
				};
			}
		}
	}

	return { stuck: false };
}

export function registerLoopTools(pi: ExtensionAPI) {
	// ─── mb_loop: Start a loop with agents ─────────────────────────────
	pi.registerTool({
		name: "mb_loop",
		label: "MB Loop",
		description: "Start a loop that spawns agents and iterates on a goal",
		promptSnippet: "Start MB loop",
		promptGuidelines: [
			"Use mb_loop to start an autonomous loop that spawns agents to work on a goal.",
			"mb_loop requires goal. Optional: criteria, max_iterations, model, spawn_count.",
		],
		parameters: Type.Object({
			goal: Type.String({ description: "Goal description" }),
			criteria: Type.Optional(
				Type.String({ description: "Completion criteria" }),
			),
			max_iterations: Type.Optional(
				Type.Number({ description: "Max iterations (0=infinite)" }),
			),
			model: Type.Optional(Type.String({ description: "Model for agents" })),
			rescue_model: Type.Optional(
				Type.String({ description: "Stronger model for stuck loops" }),
			),
			check_command: Type.Optional(
				Type.String({
					description:
						"Shell command to verify goal completion (exit 0 = done)",
				}),
			),
			spawn_count: Type.Optional(
				Type.Number({ description: "Number of agents to spawn (default 1)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const myId = getMyAgentId(ctx);
			const loop = mbDb.createMbLoop(
				myId,
				params.goal,
				params.criteria ?? "",
				params.max_iterations ?? 0,
				params.model,
			);

			// Post loop start to board
			const msg = boardDb.createMessage(
				myId,
				"info",
				`🔄 Loop started: ${params.goal}`,
				`**Loop ID:** ${loop.id.slice(0, 8)}\n` +
					`**Goal:** ${params.goal}\n` +
					`**Criteria:** ${params.criteria ?? "Continuous improvement"}\n` +
					`**Max iterations:** ${params.max_iterations ?? "∞"}\n\n` +
					`Spawning ${params.spawn_count ?? 1} agent(s) to work on this goal.`,
				["mb-loop"],
			);

			mbDb.updateMbLoop(loop.id, { post_id: msg.id });
			logLoopEvent("loop_start", {
				loopId: loop.id,
				goal: params.goal,
				agentCount: params.spawn_count ?? 1,
				model: params.model,
				rescueModel: params.rescue_model,
			});
			if (params.check_command) {
				mbDb.updateMbLoop(loop.id, { check_command: params.check_command });
			}

			// Spawn agents
			const agentIds: string[] = [];
			for (let i = 0; i < (params.spawn_count ?? 1); i++) {
				const sessionId = `${loop.id.slice(0, 8)}-${i}`;
				const suffix = generateSuffix(sessionId);
				const name = getRandomName();
				const agentId = generateAgentId(name, suffix);

				mbDb.registerMbAgent({
					id: agentId,
					session_id: sessionId,
					name,
					suffix,
					status: "online",
					last_heartbeat: Date.now(),
					spawned_by: myId,
					task: params.goal,
					task_post_id: msg.id,
					loop_id: loop.id,
				});

				startHeartbeat(agentId);
				agentIds.push(agentId);
			}

			mbDb.updateMbLoop(loop.id, { agent_ids: agentIds });

			ctx.ui.notify(
				`🔄 Loop started: ${params.goal} (${agentIds.length} agents)`,
				"info",
			);

			return {
				content: [
					{
						type: "text",
						text: `Loop started: ${loop.id.slice(0, 8)}\nGoal: ${params.goal}\nAgents: ${agentIds.join(", ")}\nBoard: ${msg.id.slice(0, 8)}`,
					},
				],
				details: { loopId: loop.id, agentIds },
			};
		},
	});

	// ─── mb_loop_update: Post loop progress ────────────────────────────
	pi.registerTool({
		name: "mb_loop_update",
		label: "MB Loop Update",
		description: "Post a progress update to an active loop",
		promptSnippet: "Update loop progress",
		promptGuidelines: [
			"Use mb_loop_update to report progress on a loop iteration.",
		],
		parameters: Type.Object({
			loop_id: Type.String({ description: "Loop ID" }),
			iteration: Type.Number({ description: "Current iteration number" }),
			status: Type.Union([
				Type.Literal("running"),
				Type.Literal("stuck"),
				Type.Literal("completed"),
			]),
			message: Type.String({ description: "Progress update message" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const myId = getMyAgentId(ctx);
			const loop = mbDb.getMbLoop(params.loop_id);
			if (!loop) {
				return {
					content: [
						{ type: "text", text: `Loop "${params.loop_id}" not found.` },
					],
					details: {},
					isError: true,
				};
			}

			mbDb.updateMbLoop(params.loop_id, {
				iteration: params.iteration,
				status: params.status,
				last_notice: params.message,
			});

			// Post update to board
			boardDb.createMessage(
				myId,
				params.status === "completed"
					? "resolved"
					: params.status === "stuck"
						? "help"
						: "info",
				`🔄 Loop ${params.status}: ${loop.goal.slice(0, 40)}`,
				`**Loop:** ${params.loop_id.slice(0, 8)}\n` +
					`**Iteration:** ${params.iteration}\n` +
					`**Status:** ${params.status}\n` +
					`**Update:** ${params.message}`,
				["mb-loop", `loop-${params.loop_id.slice(0, 8)}`],
			);

			logLoopEvent("loop_update", {
				loopId: params.loop_id,
				iteration: params.iteration,
				status: params.status,
				message: params.message.slice(0, 200),
			});

			// Rescue model switching for stuck loops
			let rescueDirective = "";
			if (
				params.status === "stuck" &&
				loop.rescue_model &&
				!loop.rescue_active
			) {
				const newStuck = (loop.consecutive_stuck || 0) + 1;
				mbDb.updateMbLoop(params.loop_id, { consecutive_stuck: newStuck });
				if (newStuck >= 3) {
					mbDb.updateMbLoop(params.loop_id, {
						rescue_active: true,
						consecutive_stuck: 0,
					});
					rescueDirective = `\n\nRESCUE TURN: Switch to model ${loop.rescue_model}. Inspect the project state, fix or finish ONE concrete thing, then report with mb_loop_update.`;
					logLoopEvent("rescue_start", {
						loopId: params.loop_id,
						model: loop.rescue_model,
					});
				}
			} else if (params.status === "running" && loop.rescue_active) {
				mbDb.updateMbLoop(params.loop_id, { rescue_active: false });
				logLoopEvent("rescue_end", { loopId: params.loop_id });
			}

			if (params.status === "completed") {
				// Stop all agents in this loop
				for (const agentId of loop.agent_ids) {
					stopHeartbeat(agentId);
					mbDb.setMbAgentOffline(agentId);
				}
			}

			const responseText = `Loop ${params.loop_id.slice(0, 8)} updated: ${params.status} (iter ${params.iteration})${rescueDirective}`;

			return {
				content: [
					{
						type: "text",
						text: responseText,
					},
				],
				details: {
					loopId: params.loop_id,
					status: params.status,
					rescueDirective: rescueDirective || undefined,
				},
			};
		},
	});

	// ─── mb_loop_stop: Stop a loop ─────────────────────────────────────
	pi.registerTool({
		name: "mb_loop_stop",
		label: "MB Loop Stop",
		description: "Stop an active loop",
		promptSnippet: "Stop MB loop",
		promptGuidelines: ["Use mb_loop_stop to halt a running loop."],
		parameters: Type.Object({
			loop_id: Type.String({ description: "Loop ID to stop" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const loop = mbDb.getMbLoop(params.loop_id);
			if (!loop) {
				return {
					content: [
						{ type: "text", text: `Loop "${params.loop_id}" not found.` },
					],
					details: {},
					isError: true,
				};
			}

			mbDb.updateMbLoop(params.loop_id, {
				status: "paused",
				last_notice: "Stopped by operator",
			});
			logLoopEvent("loop_stop", { loopId: params.loop_id });

			for (const agentId of loop.agent_ids) {
				stopHeartbeat(agentId);
				mbDb.setMbAgentOffline(agentId);
			}

			ctx.ui.notify(`Loop ${params.loop_id.slice(0, 8)} stopped.`, "info");

			return {
				content: [
					{ type: "text", text: `Loop ${params.loop_id.slice(0, 8)} stopped.` },
				],
				details: { loopId: params.loop_id },
			};
		},
	});
}

// ─── Loop Directive Generation ──────────────────────────────────────

export function getLoopDirective(
	kind: "start" | "continue" | "stuck",
	loop: MbLoop,
): string {
	const iter = loop.iteration + 1;
	const label =
		loop.max_iterations > 0 ? `${iter}/${loop.max_iterations}` : `${iter}/∞`;

	switch (kind) {
		case "start":
			return `Start loop. Goal: ${loop.goal}\nCriteria: ${loop.criteria || "continuous improvement"}\nIteration: ${label}\n\nDo one concrete progress batch, then report with mb_loop_update.`;
		case "continue":
			return (
				CONTINUE_DIRECTIVES[
					Math.floor(Math.random() * CONTINUE_DIRECTIVES.length)
				] + `\nIteration: ${label}\nGoal: ${loop.goal}`
			);
		case "stuck":
			return (
				STUCK_STRATEGIES[Math.floor(Math.random() * STUCK_STRATEGIES.length)] +
				`\nIteration: ${label}\nGoal: ${loop.goal}\nCheck the board for help from other agents.`
			);
	}
}

// ─── Helpers ────────────────────────────────────────────────────────

function getMyAgentId(ctx: ExtensionContext): string {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { getMyAgentId: getMainId } = require("../tools.js");
		return getMainId();
	} catch {
		const sessionId = ctx.sessionManager.getSessionId?.() ?? "unknown";
		return `agent-${sessionId.slice(0, 4)}`;
	}
}
