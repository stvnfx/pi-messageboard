import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
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
			spawn_count: Type.Optional(
				Type.Number({ description: "Number of agents to spawn (default 1)" }),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const myId = getMyAgentId(ctx);
			const loop = mbDb.createMbLoop(
				myId,
				params.goal,
				params.criteria ?? "",
				(params.max_iterations as number) ?? 0,
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
			logLoopEvent("loop_start", { loopId: loop.id, goal: params.goal, agentCount: params.spawn_count ?? 1, model: params.model });

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
		async execute(toolCallId, params, signal, onUpdate, ctx) {
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

logLoopEvent("loop_update", { loopId: params.loop_id, iteration: params.iteration, status: params.status, message: params.message.slice(0, 200) });

			if (params.status === "completed") {
				// Stop all agents in this loop
				for (const agentId of loop.agent_ids) {
					stopHeartbeat(agentId);
					mbDb.setMbAgentOffline(agentId);
				}
		}

			return {
				content: [
					{
						type: "text",
						text: `Loop ${params.loop_id.slice(0, 8)} updated: ${params.status} (iter ${params.iteration})`,
					},
				],
				details: { loopId: params.loop_id, status: params.status },
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
		async execute(toolCallId, params, signal, onUpdate, ctx) {
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
		const { getMyAgentId: getMainId } = require("../tools.js");
		return getMainId();
	} catch {
		const sessionId = ctx.sessionManager.getSessionId?.() ?? "unknown";
		return `agent-${sessionId.slice(0, 4)}`;
	}
}
