import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpawnTools, stopAllHeartbeats, stopHeartbeat } from "./spawn.js";
import { registerLoopTools } from "./loop.js";
import * as mbDb from "./db.js";

function stopAgent(agentId: string): void {
	stopHeartbeat(agentId);
	mbDb.setMbAgentOffline(agentId);
}

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
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] || "status";
			const remainder = parts.slice(1).join(" ");

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
					if (!remainder.trim()) {
						ctx.ui.notify(
							'Usage: /mb loop <goal>\nExample: /mb loop "Improve test coverage"',
							"info",
						);
					} else {
						// Create loop directly
						const loop = mbDb.createMbLoop("operator", remainder.trim(), "", 0);
						pi.sendMessage(
							{
								customType: "mb-loop",
								content: `Loop started: ${loop.id.slice(0, 8)}\nGoal: ${loop.goal}\n\nUse mb_loop_update to report progress.`,
								display: true,
								details: { kind: "loop_start", loopId: loop.id },
							},
							{ triggerTurn: true },
						);
					}
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
				case "list":
				case "agents": {
					const agents = mbDb.getAllMbAgents();
					if (agents.length === 0) {
						ctx.ui.notify("No agents spawned yet.", "info");
						break;
					}
					const lines = agents.map(
						(a) =>
							`${a.id} ${a.status === "online" ? "🟢" : a.status === "busy" ? "🔄" : "⚫"}${a.task ? ` — ${a.task.slice(0, 50)}` : ""}${a.loop_id ? ` [loop ${a.loop_id.slice(0, 8)}]` : ""}`,
					);
					ctx.ui.notify(
						`Agents (${agents.length}):\n${lines.join("\n")}`,
						"info",
					);
					break;
				}
				case "kill": {
					const agentId = remainder.trim();
					if (!agentId) {
						ctx.ui.notify("Usage: /mb kill <agent-id>", "error");
						break;
					}
					const agent = mbDb.getMbAgent(agentId);
					if (!agent) {
						ctx.ui.notify(`Agent "${agentId}" not found.`, "error");
						break;
					}
					stopAgent(agentId);
					ctx.ui.notify(`Stopped subagent ${agentId}.`, "info");
					break;
				}
				case "kill-all": {
					const agents = mbDb.getOnlineMbAgents();
					for (const agent of agents) stopAgent(agent.id);
					ctx.ui.notify(`Stopped ${agents.length} active subagent(s).`, "info");
					break;
				}
				case "goal": {
					if (!remainder.trim()) {
						const loops = mbDb.getActiveMbLoops();
						if (loops.length === 0) {
							ctx.ui.notify(
								"No active loops. Use /mb loop <goal> to start one.",
								"info",
							);
						} else {
							const l = loops[0];
							ctx.ui.notify(
								`Goal: ${l.goal}\nCriteria: ${l.criteria || "-"}\nMode: ${l.max_iterations > 0 ? `${l.max_iterations} max` : "endless"}\nModel: ${l.model || "-"}\nRescue: ${l.rescue_model || "-"}`,
								"info",
							);
						}
					} else {
						ctx.ui.notify(
							`Goal set: ${remainder}. Use /mb loop ${remainder} to start.`,
							"info",
						);
					}
					break;
				}
				case "resume": {
					const paused = mbDb
						.getActiveMbLoops()
						.filter((l) => l.status === "paused");
					if (paused.length === 0) {
						ctx.ui.notify("No paused loops to resume.", "info");
					} else {
						for (const loop of paused) {
							mbDb.updateMbLoop(loop.id, {
								status: "running",
								last_notice: "Resumed by operator",
							});
						}
						ctx.ui.notify(`Resumed ${paused.length} loop(s).`, "info");
					}
					break;
				}
				case "finish": {
					const active = mbDb.getActiveMbLoops();
					if (active.length === 0) {
						ctx.ui.notify("No active loops to finish.", "info");
					} else {
						for (const loop of active) {
							mbDb.updateMbLoop(loop.id, {
								status: "paused",
								last_notice: "Soft stop: finish current iteration",
							});
						}
						ctx.ui.notify(
							`Soft stop: ${active.length} loop(s) will finish current iteration.`,
							"info",
						);
					}
					break;
				}
				case "end": {
					const all = mbDb.getActiveMbLoops();
					for (const loop of all) {
						mbDb.updateMbLoop(loop.id, {
							status: "completed",
							last_notice: "Ended by operator",
						});
						for (const agentId of loop.agent_ids) {
							mbDb.setMbAgentOffline(agentId);
						}
					}
					ctx.ui.notify(
						`Ended ${all.length} loop(s). State preserved.`,
						"info",
					);
					break;
				}
				case "stats": {
					const loops = mbDb.getActiveMbLoops();
					const running = loops.filter((l) => l.status === "running").length;
					const completed = loops.filter(
						(l) => l.status === "completed",
					).length;
					const stuck = loops.filter((l) => l.status === "stuck").length;
					const totalIter = loops.reduce((s, l) => s + l.iteration, 0);
					ctx.ui.notify(
						`Loop Stats:\nTotal: ${loops.length} | Running: ${running} | Completed: ${completed} | Stuck: ${stuck}\nTotal iterations: ${totalIter}`,
						"info",
					);
					break;
				}
				case "prepare": {
					const loops = mbDb.getActiveMbLoops();
					if (loops.length === 0) {
						ctx.ui.notify(
							"No active loop. Use /mb loop <goal> first, then /mb prepare.",
							"error",
						);
						break;
					}
					const loop = loops[0];
					const instructions =
						`Prepare the loop goal specification. Do NOT start implementing the goal itself in this turn.\n\n` +
						`Goal: ${loop.goal}\n` +
						`Completion criteria: ${loop.criteria || "continuous improvement until the operator stops the loop"}\n\n` +
						`Tasks for this turn:\n` +
						`1. Inspect the current project state (files, README, tests) if one exists.\n` +
						`2. Write GOAL.md containing: refined objective, scope & non-goals, measurable completion criteria, a milestone roadmap of small steps, quality standards (tests, docs, git commits), and explicit assumptions.\n` +
						`3. If the goal is objectively checkable, create a goal-check script (e.g. check.sh: exit 0 = criteria met, print "SCORE: <n>", higher = better) and reference it in GOAL.md.\n` +
						`4. Keep GOAL.md under ~200 lines, concrete and unambiguous — it must guide another (possibly weaker) model through a long unattended run.\n\n` +
						`End your final message with "GOAL_READY: <one-line summary>" and, if you created a check script, the exact --check command to use.`;
					pi.sendMessage(
						{
							customType: "mb-loop",
							content: instructions,
							display: true,
							details: { kind: "prepare", goal: loop.goal },
						},
						{ triggerTurn: true },
					);
					break;
				}
				case "help": {
					ctx.ui.notify(
						`MB Loop Commands:\n` +
							`/mb loop <goal> — Start a loop\n` +
							`/mb goal — Show current goal\n` +
							`/mb prepare — Write goal spec (GOAL.md + check.sh)\n` +
							`/mb resume — Resume paused loops\n` +
							`/mb finish — Soft stop (finish iteration)\n` +
							`/mb stop — Hard stop all loops\n` +
							`/mb end — End and clear all loops\n` +
							`/mb status — Dashboard\n` +
							`/mb agents — List agents\n` +
							`/mb stats — Loop statistics\n` +
							`/mb help — This help`,
						"info",
					);
					break;
				}
				default:
					ctx.ui.notify(
						"Usage: /mb <status|spawn|loop|stop|list|agents|kill|kill-all|goal|resume|finish|end|stats|help>",
						"info",
					);
			}
		},
	});
}
