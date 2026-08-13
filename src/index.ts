import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as db from "./db.js";
import { registerTools, setMyAgentId, getMyAgentId } from "./tools.js";
import { registerCommands } from "./commands.js";
import { getRandomName, generateSuffix, generateAgentId } from "./names.js";

const HEARTBEAT_INTERVAL = 30_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId?.() ?? "unknown";
		const suffix = generateSuffix(sessionId);
		const name = getRandomName();
		const agentId = generateAgentId(name, suffix);

		setMyAgentId(agentId);
		db.registerAgent(sessionId, name, suffix);

		ctx.ui.setStatus("messageboard", `📋 ${agentId}`);

		if (heartbeatTimer) clearInterval(heartbeatTimer);
		heartbeatTimer = setInterval(() => {
			db.updateHeartbeat(agentId);
		}, HEARTBEAT_INTERVAL);

		const unread = db.getInbox(agentId, true);
		if (unread.length > 0) {
			ctx.ui.notify(
				`📥 ${unread.length} unread message${unread.length > 1 ? "s" : ""} in inbox`,
				"info",
			);
		}

		ctx.ui.notify(`Messageboard agent: ${agentId}`, "info");
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
		try {
			const agentId = getMyAgentId();
			db.setAgentOffline(agentId);
		} catch {
			// Agent not registered yet
		}
	});

	registerTools(pi);
	registerCommands(pi);

	// Markdown transformer for code blocks in messageboard content
	pi.registerMarkdownTransformer((markdown, { messageType }) => {
		// Only transform assistant messages that look like board output
		if (messageType !== "assistant") return markdown;
		// Highlight agent IDs in messages
		return markdown.replace(/@([A-Z][a-z]+-[a-f0-9]{4})/g, "**@$1**");
	});
}
