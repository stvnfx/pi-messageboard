import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpawnTools, stopAllHeartbeats } from "./spawn.js";
import { registerLoopTools } from "./loop.js";
import * as mbDb from "./db.js";

export default function (pi: ExtensionAPI) {
	// Register all mb tools
	registerSpawnTools(pi);
	registerLoopTools(pi);

	// ─── Session lifecycle ──────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus("mb", "🎮 MB ready");
	});

	pi.on("session_shutdown", async () => {
		stopAllHeartbeats();
	});

	// ─── Commands ───────────────────────────────────────────────────────
	pi.registerCommand("mb", {
		description:
			"Messageboard agent management: /mb spawn, /mb status, /mb loop, /mb stop",
		handler: async (args, ctx) => {
			const [subcommand = "status", ...rest] = args.trim().split(/\s+/);
			const remainder = rest.join(" ").trim();

			switch (subcommand) {
				case "status": {
					const agents = mbDb.getAllMbAgents();
					const loops = mbDb.getActiveMbLoops();
					const online = agents.filter((a) => a.status !== "offline");
					const lines = [
						`🎮 MB Dashboard`,
						`Agents: ${agents.length} total, ${online.length} online`,
						`Active loops: ${loops.length}`,
						``,
						`Online:`,
						...online.map(
							(a) =>
								`  ${a.id} ${a.status === "busy" ? "🔄" : "✅"}${a.task ? ` — ${a.task}` : ""}`,
						),
					];
					if (loops.length > 0) {
						lines.push("", "Loops:");
						lines.push(
							...loops.map(
								(l) =>
									`  [${l.id.slice(0, 8)}] ${l.status} iter ${l.iteration}: ${l.goal.slice(0, 50)}`,
							),
						);
					}
					ctx.ui.notify(lines.join("\n"), "info");
					break;
				}
				case "spawn": {
					ctx.ui.notify("Use the mb_spawn tool to create a new agent.", "info");
					break;
				}
				case "loop": {
					ctx.ui.notify("Use the mb_loop tool to start a loop.", "info");
					break;
				}
				case "stop": {
					const loops = mbDb.getActiveMbLoops();
					for (const loop of loops) {
						mbDb.updateMbLoop(loop.id, {
							status: "paused",
							last_notice: "Stopped by operator",
						});
						for (const agentId of loop.agent_ids) {
							mbDb.setMbAgentOffline(agentId);
						}
					}
					ctx.ui.notify(`Stopped ${loops.length} active loop(s).`, "info");
					break;
				}
				default:
					ctx.ui.notify("Usage: /mb <status|spawn|loop|stop>", "info");
			}
		},
	});
}
