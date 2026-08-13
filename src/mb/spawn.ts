import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getRandomName, generateSuffix, generateAgentId } from "../names.js";
import * as mbDb from "./db.js";
import * as boardDb from "../db.js";

const HEARTBEAT_INTERVAL = 30_000;
const activeHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

export function registerSpawnTools(pi: ExtensionAPI) {
	// ─── mb_spawn: Spawn a new agent ──────────────────────────────────
	pi.registerTool({
		name: "mb_spawn",
		label: "MB Spawn Agent",
		description:
			"Spawn a new agent with a mythology name that appears on the messageboard",
		promptSnippet: "Spawn a messageboard agent",
		promptGuidelines: [
			"Use mb_spawn to create a new agent that can work on tasks and communicate via the messageboard.",
			"mb_spawn accepts optional task, model, and parent_agent parameters.",
		],
		parameters: Type.Object({
			task: Type.Optional(
				Type.String({ description: "Task to assign to the new agent" }),
			),
			model: Type.Optional(
				Type.String({
					description: "Model for the agent (e.g. anthropic/claude-sonnet-4-5)",
				}),
			),
			parent_agent: Type.Optional(
				Type.String({
					description: "Parent agent ID (auto-detected if omitted)",
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const sessionId = ctx.sessionManager.getSessionId?.() ?? randomHex(8);
			const suffix = generateSuffix(sessionId);
			const name = getRandomName();
			const agentId = generateAgentId(name, suffix);

			const agent = mbDb.registerMbAgent({
				id: agentId,
				session_id: sessionId,
				name,
				suffix,
				status: "online",
				last_heartbeat: Date.now(),
				spawned_by: params.parent_agent,
				task: params.task,
			});

			// Start heartbeat
			startHeartbeat(agentId);

			// Post spawn message to board
			const spawnMsg = boardDb.createMessage(
				agentId,
				params.task ? "task" : "info",
				`${name} spawned${params.task ? `: ${params.task}` : ""}`,
				`Agent **${agentId}** has joined the messageboard.\n\n` +
					(params.task ? `**Task:** ${params.task}\n` : "") +
					`**Status:** Online and ready.`,
				["mb-spawn"],
				undefined,
			);

			if (params.task) mbDb.setMbAgentTask(agentId, params.task, spawnMsg.id);

			ctx.ui.notify(`🎮 Spawned agent: ${agentId}`, "info");

			return {
				content: [
					{
						type: "text",
						text:
							`Spawned agent: ${agentId}\nName: ${name}\nStatus: Online` +
							(params.task ? `\nTask: ${params.task}` : "") +
							`\nBoard message: ${spawnMsg.id.slice(0, 8)}`,
					},
				],
				details: { agentId, name, taskId: spawnMsg.id },
			};
		},
	});

	// ─── mb_assign: Assign task to an agent ────────────────────────────
	pi.registerTool({
		name: "mb_assign",
		label: "MB Assign Task",
		description: "Assign a task to an agent via the messageboard",
		promptSnippet: "Assign task to agent",
		promptGuidelines: [
			"Use mb_assign to give work to a specific agent.",
			"mb_assign requires agent_id, subject, and body.",
		],
		parameters: Type.Object({
			agent_id: Type.String({ description: "Agent ID to assign task to" }),
			subject: Type.String({ description: "Task subject" }),
			body: Type.String({
				description: "Task description (supports markdown)",
			}),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const myId = getMyAgentId(ctx);
			const agent = mbDb.getMbAgent(params.agent_id);
			if (!agent) {
				return {
					content: [
						{ type: "text", text: `Agent "${params.agent_id}" not found.` },
					],
					details: {},
					isError: true,
				};
			}

			// Post task to board
			const msg = boardDb.createMessage(
				myId,
				"task",
				params.subject,
				params.body,
				["mb-task"],
				params.agent_id,
			);

			// Create assignment
			mbDb.createTaskAssignment(msg.id, params.agent_id, myId);
			mbDb.setMbAgentTask(params.agent_id, params.subject, msg.id);

			// Notify agent if online
			if (agent.status === "online" || agent.status === "busy") {
				ctx.ui.notify(
					`📋 Task assigned to ${params.agent_id}: ${params.subject}`,
					"info",
				);
			}

			return {
				content: [
					{
						type: "text",
						text: `Task assigned to ${params.agent_id}: "${params.subject}"\nBoard message: ${msg.id.slice(0, 8)}`,
					},
				],
				details: { taskId: msg.id, assignedTo: params.agent_id },
			};
		},
	});

	// ─── mb_broadcast: Message all online agents ───────────────────────
	pi.registerTool({
		name: "mb_broadcast",
		label: "MB Broadcast",
		description: "Broadcast a message to all online agents",
		promptSnippet: "Broadcast to all agents",
		promptGuidelines: [
			"Use mb_broadcast to send an announcement to all online agents.",
		],
		parameters: Type.Object({
			subject: Type.String({ description: "Broadcast subject" }),
			body: Type.String({ description: "Broadcast body (supports markdown)" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const myId = getMyAgentId(ctx);
			const online = mbDb.getOnlineMbAgents();

			const msg = boardDb.createMessage(
				myId,
				"info",
				`📢 ${params.subject}`,
				params.body,
				["mb-broadcast"],
			);

			return {
				content: [
					{
						type: "text",
						text: `Broadcast sent to ${online.length} online agents: "${params.subject}"\nBoard message: ${msg.id.slice(0, 8)}`,
					},
				],
				details: { recipientCount: online.length, messageId: msg.id },
			};
		},
	});

	// ─── mb_status: Dashboard ──────────────────────────────────────────
	pi.registerTool({
		name: "mb_status",
		label: "MB Status Dashboard",
		description: "Show messageboard agent dashboard",
		promptSnippet: "Show MB dashboard",
		promptGuidelines: [
			"Use mb_status to see all agents, their tasks, and recent activity.",
		],
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, unknown>,
			_signal: AbortSignal,
			_onUpdate?: unknown,
			_ctx?: unknown,
		) {
			const agents = mbDb.getAllMbAgents();
			const loops = mbDb.getActiveMbLoops();
			const online = agents.filter((a) => a.status !== "offline");
			const recentMessages = boardDb.getMessages({ limit: 5 });

			const lines = [
				`🎮 Messageboard Dashboard`,
				`━━━━━━━━━━━━━━━━━━━━━━━━`,
				`Agents: ${agents.length} total, ${online.length} online`,
				``,
				`Online Agents:`,
				...online.map(
					(a) =>
						`  ${a.id} ${a.status === "busy" ? "🔄" : "✅"}${a.task ? ` — ${a.task}` : ""}`,
				),
				``,
				`Active Loops: ${loops.length}`,
				...loops.map(
					(l) =>
						`  [${l.id.slice(0, 8)}] ${l.status} iter ${l.iteration}: ${l.goal.slice(0, 50)}`,
				),
				``,
				`Recent Board Activity:`,
				...recentMessages.map(
					(m) =>
						`  [${m.id.slice(0, 8)}] ${m.category.toUpperCase()}: ${m.subject} — ${m.author}`,
				),
			];

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: {
					agentCount: agents.length,
					onlineCount: online.length,
					loopCount: loops.length,
				},
			};
		},
	});
}

// ─── Heartbeat Management ───────────────────────────────────────────

export function startHeartbeat(agentId: string) {
	if (activeHeartbeats.has(agentId)) return;
	const timer = setInterval(() => {
		mbDb.updateMbAgentHeartbeat(agentId);
	}, HEARTBEAT_INTERVAL);
	activeHeartbeats.set(agentId, timer);
}

export function stopHeartbeat(agentId: string) {
	const timer = activeHeartbeats.get(agentId);
	if (timer) {
		clearInterval(timer);
		activeHeartbeats.delete(agentId);
	}
}

export function stopAllHeartbeats() {
	for (const [id, timer] of activeHeartbeats) {
		clearInterval(timer);
	}
	activeHeartbeats.clear();
}

// ─── Helpers ────────────────────────────────────────────────────────

function getMyAgentId(ctx: ExtensionContext): string {
	try {
		// Try to get from the main messageboard extension
		const { getMyAgentId: getMainId } = require("../tools.js");
		return getMainId();
	} catch {
		// Fallback: generate from session
		const sessionId = ctx.sessionManager.getSessionId?.() ?? "unknown";
		return `agent-${sessionId.slice(0, 4)}`;
	}
}

function randomHex(len: number): string {
	return Array.from({ length: len }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
}
