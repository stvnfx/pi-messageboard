import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as db from "./db.js";
import { getMyAgentId } from "./tools.js";
import { getBoardStats, formatStats } from "./stats.js";

export function registerCommands(pi: ExtensionAPI) {
	pi.registerCommand("mb-board", {
		description: "Show recent public board messages",
		handler: async (_args, ctx) => {
			const messages = db.getMessages({ limit: 10 });
			if (messages.length === 0) {
				ctx.ui.notify("Board is empty.", "info");
				return;
			}
			const lines = messages.map(
				(m) =>
					`[${m.id.slice(0, 8)}] ${m.status.toUpperCase()} ${m.category.toUpperCase()}: ${m.subject} — ${m.author}`,
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("mb-inbox", {
		description: "Show your inbox",
		handler: async (_args, ctx) => {
			const agentId = getMyAgentId();
			const dms = db.getInbox(agentId, false);
			if (dms.length === 0) {
				ctx.ui.notify("Inbox is empty.", "info");
				return;
			}
			const lines = dms.map(
				(dm) =>
					`[${dm.read ? "read" : "NEW"}] ${dm.id.slice(0, 8)} from ${dm.from_agent}: ${dm.subject}`,
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("mb-who", {
		description: "List online agents",
		handler: async (_args, ctx) => {
			const agents = db.getOnlineAgents();
			if (agents.length === 0) {
				ctx.ui.notify("No agents online.", "info");
				return;
			}
			const lines = agents.map(
				(a) =>
					`${a.id} — last seen ${new Date(a.last_heartbeat).toISOString()}`,
			);
			ctx.ui.notify(`Online:\n${lines.join("\n")}`, "info");
		},
	});

	pi.registerCommand("mb-tasks", {
		description: "Show open tasks on the board",
		handler: async (_args, ctx) => {
			const agentId = getMyAgentId();
			const tasks = db.getMessages({
				category: "task",
				status: "open",
				limit: 20,
			});
			const myTasks = db.getMessages({
				category: "task",
				assignedTo: agentId,
				limit: 20,
			});
			const all = [...tasks, ...myTasks];
			const unique = [...new Map(all.map((t) => [t.id, t])).values()];
			if (unique.length === 0) {
				ctx.ui.notify("No open tasks.", "info");
				return;
			}
			const lines = unique.map((t) => {
				const assignee = t.assigned_to ? ` → ${t.assigned_to}` : "";
				return `[${t.id.slice(0, 8)}] ${t.status.toUpperCase()}: ${t.subject}${assignee} — ${t.author}`;
			});
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("mb-bookmarks", {
		description: "Show your bookmarked messages",
		handler: async (_args, ctx) => {
			const agentId = getMyAgentId();
			const messages = db.getBookmarks(agentId);
			if (messages.length === 0) {
				ctx.ui.notify("No bookmarks yet.", "info");
				return;
			}
			const lines = messages.map(
				(m) =>
					`[${m.id.slice(0, 8)}] ${m.category.toUpperCase()}: ${m.subject} — ${m.author}`,
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("mb-mentions", {
		description: "Show your @mentions",
		handler: async (_args, ctx) => {
			const agentId = getMyAgentId();
			const mentions = db.getMentions(agentId, false);
			if (mentions.length === 0) {
				ctx.ui.notify("No mentions.", "info");
				return;
			}
			const lines = mentions.map(
				(m) =>
					`[${m.read ? "read" : "NEW"}] ${m.message_id.slice(0, 8)} in message by ${m.timestamp}`,
			);
			ctx.ui.notify(
				`Mentions (${mentions.length}):\n${lines.join("\n")}`,
				"info",
			);
		},
	});

	pi.registerCommand("mb-profile", {
		description: "Show agent profile (self or by ID)",
		handler: async (args, ctx) => {
			const agentId = getMyAgentId();
			const targetId = args?.trim() || agentId;
			const agent = db.getAgent(targetId);
			if (!agent) {
				ctx.ui.notify(`Agent "${targetId}" not found.`, "error");
				return;
			}
			const msgs = db.getMessages({ author: targetId, limit: 3 });
			const lines = [
				`Agent: ${agent.id}`,
				`Status: ${agent.status}`,
				`Policy: ${agent.inbox_policy}`,
				`Heartbeat: ${new Date(agent.last_heartbeat).toISOString()}`,
				`\nRecent:`,
				...msgs.map((m) => `  ${m.subject}`),
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("mb-policy", {
		description: "Set inbox policy (board/direct/both)",
		handler: async (args, ctx) => {
			const agentId = getMyAgentId();
			const policy = args?.trim();
			if (!policy || !["board", "direct", "both"].includes(policy)) {
				ctx.ui.notify("Usage: /mb-policy <board|direct|both>", "error");
				return;
			}
			db.updateAgentInboxPolicy(agentId, policy as any);
			ctx.ui.notify(`Inbox policy set to: ${policy}`, "info");
		},
	});

	pi.registerCommand("mb-stats", {
		description: "Show messageboard statistics",
		handler: async (_args, ctx) => {
			const stats = getBoardStats();
			ctx.ui.notify(formatStats(stats), "info");
		},
	});

	pi.registerCommand("mb-spawn-assistant", {
		description: "Spawn an assistant agent to ask active agents who needs help",
		handler: async (_args, _ctx) => {
			pi.sendMessage(
				{
					customType: "messageboard-assistant",
					content:
						"Use mb_spawn to spawn one assistant agent with task: Inspect active messageboard agents, use agent_list_online, ask each active agent via mb_agent_mention whether they need assistance, then report findings on the board. Do not modify project files.",
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.registerCommand("mb-clear-board", {
		description:
			"Clear all public messageboard posts, replies, mentions, and bookmarks",
		handler: async (_args, ctx) => {
			if (
				!(await ctx.ui.confirm(
					"Clear messageboard?",
					"Delete all board posts, replies, mentions, and bookmarks?",
				))
			)
				return;
			db.clearBoard();
			ctx.ui.notify("Messageboard cleared.", "info");
		},
	});

	pi.registerCommand("mb-clear-inbox", {
		description: "Clear your direct message inbox",
		handler: async (_args, ctx) => {
			if (
				!(await ctx.ui.confirm(
					"Clear inbox?",
					"Delete all direct messages addressed to you?",
				))
			)
				return;
			db.clearInbox(getMyAgentId());
			ctx.ui.notify("Inbox cleared.", "info");
		},
	});

	pi.registerCommand("mb-scope-board", {
		description:
			"Toggle board visibility between all sessions and current session",
		handler: async (_args, ctx) => {
			const enabled = db.toggleBoardSessionOnly();
			ctx.ui.notify(
				`Board scope: ${enabled ? "current session only" : "all sessions"}.`,
				"info",
			);
		},
	});

	pi.registerCommand("mb-scope-inbox", {
		description:
			"Toggle inbox visibility between all sessions and current session",
		handler: async (_args, ctx) => {
			const enabled = db.toggleInboxSessionOnly();
			ctx.ui.notify(
				`Inbox scope: ${enabled ? "current session only" : "all sessions"}.`,
				"info",
			);
		},
	});

	pi.registerCommand("mb-test-command", {
		description: "Test command for messageboard package",
		handler: async (_args, ctx) => {
			ctx.ui.notify("mb-test-command: messageboard extension active.", "info");
		},
	});
}
