import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as db from "./db.js";
import { registerTools, setMyAgentId, getMyAgentId } from "./tools.js";
import { registerCommands } from "./commands.js";
import mbExtension from "./mb/index.js";
import { getRandomName, generateSuffix, generateAgentId } from "./names.js";
import { startMessageboardWebServer, type MessageboardWebHandle } from "./web.js";

const HEARTBEAT_INTERVAL = 30_000;
const NOTIFICATION_INTERVAL = 2_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let notificationTimer: ReturnType<typeof setInterval> | null = null;
let lastNotificationCheck = 0;
let webHandle: MessageboardWebHandle | null = null;

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId?.() ?? "unknown";
		db.setCurrentSession(sessionId);
		lastNotificationCheck = Date.now();
		db.setEventHandler((event) => {
			pi.events.emit(`messageboard:${event.type}`, event);
			if (event.type === "dm" && event.recipient === getMyAgentId()) {
				ctx.ui.notify("New direct message received.", "info");
			}
			if (event.type === "message" && event.author !== getMyAgentId()) {
				ctx.ui.notify("New messageboard post received.", "info");
			}
		});
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
		if (notificationTimer) clearInterval(notificationTimer);
		notificationTimer = setInterval(() => {
			const messages = db.getMessagesSince(lastNotificationCheck, agentId);
			const inbox = db.getInboxSince(agentId, lastNotificationCheck);
			lastNotificationCheck = Date.now();
			if (messages.length) {
				pi.events.emit("messageboard:message", {
					type: "message",
					count: messages.length,
					messages,
				});
				ctx.ui.notify(
					`${messages.length} new messageboard post${messages.length === 1 ? "" : "s"}.`,
					"info",
				);
			}
			if (inbox.length) {
				pi.events.emit("messageboard:dm", {
					type: "dm",
					count: inbox.length,
					inbox,
				});
				ctx.ui.notify(
					`${inbox.length} new direct message${inbox.length === 1 ? "" : "s"}.`,
					"info",
				);
			}
		}, NOTIFICATION_INTERVAL);

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
		if (webHandle) {
			await webHandle.close();
			webHandle = null;
		}
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
		if (notificationTimer) {
			clearInterval(notificationTimer);
			notificationTimer = null;
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
	mbExtension(pi);

	pi.registerCommand("mb-web", {
		description: "Open local messageboard admin dashboard",
		handler: async (_args, ctx) => {
			if (!webHandle) webHandle = await startMessageboardWebServer();
			ctx.ui.notify(`Messageboard dashboard: ${webHandle.url}`, "info");
			const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
			try {
				await pi.exec(command, [webHandle.url], { timeout: 5000 });
			} catch {
				// URL remains available in the notification if browser launch fails.
			}
		},
	});

	// Markdown transformer for code blocks in messageboard content
	if (typeof pi.registerMarkdownTransformer === "function") {
		pi.registerMarkdownTransformer((markdown, { messageType }) => {
			if (messageType !== "assistant") return markdown;
			return markdown.replace(/@([A-Z][a-z]+-[a-f0-9]{4})/g, "**@$1**");
		});
	}
}
