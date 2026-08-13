import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as mbDb from "../mb/db.js";
import * as boardDb from "../db.js";

mbDb.resetMbAll();
// Also reset board.db
boardDb.resetAll();

describe("integration: spawn → post → reply → DM", () => {
	it("full agent lifecycle", () => {
		// 1. Register board agent
		const agentId = "Ares-int1";
		const name = "Ares";
		boardDb.registerAgent("s-int1", name, "int1");

		// 2. Register mb agent
		const agent = mbDb.registerMbAgent({
			id: agentId,
			session_id: "s-int1",
			name,
			suffix: "int1",
			status: "online",
			last_heartbeat: Date.now(),
			task: "Fix tests",
		});
		assert.equal(agent.status, "online");

		// 3. Post to board
		const msg = boardDb.createMessage(
			agentId,
			"help",
			"Auth broken",
			"Token refresh failing",
			["auth"],
		);
		assert.ok(msg.id);

		// 4. Another agent replies
		const replierId = "Zeus-int2";
		boardDb.registerAgent("s-int2", "Zeus", "int2");
		const reply = boardDb.createReply(
			msg.id,
			replierId,
			"Check auth.ts line 42",
		);
		assert.equal(reply.body, "Check auth.ts line 42");

		// 5. Thread has reply
		const replies = boardDb.getReplies(msg.id);
		assert.equal(replies.length, 1);

		// 6. Agent sends DM
		boardDb.sendDirectMessage(
			replierId,
			agentId,
			"Fixed it",
			"The token path was wrong",
		);
		const inbox = boardDb.getInbox(agentId, false);
		assert.equal(inbox.length, 1);
		assert.equal(inbox[0].from_agent, replierId);

		// 7. Search finds the message
		const results = boardDb.searchMessages("auth");
		assert.ok(results.length >= 1);

		// 8. Assign task
		mbDb.setMbAgentTask(agentId, "Deploy app", msg.id);
		const updated = mbDb.getMbAgent(agentId);
		assert.equal(updated!.status, "busy");

		// 9. Clear task
		mbDb.clearMbAgentTask(agentId);
		const cleared = mbDb.getMbAgent(agentId);
		assert.equal(cleared!.status, "online");

		// 10. Mark agent offline
		mbDb.setMbAgentOffline(agentId);
		const offline = mbDb.getMbAgent(agentId);
		assert.equal(offline!.status, "offline");
	});

	it("loop lifecycle: create → update → stop", () => {
		const loop = mbDb.createMbLoop(
			"Zeus-lc1",
			"Improve code",
			"All tests pass",
			5,
			"anthropic/claude-sonnet-4-5",
			"claude-opus",
		);
		assert.equal(loop.status, "running");

		// Update iteration
		mbDb.updateMbLoop(loop.id, {
			iteration: 1,
			last_notice: "Fixed 2 tests",
		});
		const u1 = mbDb.getMbLoop(loop.id);
		assert.equal(u1!.iteration, 1);

		// Stuck
		mbDb.updateMbLoop(loop.id, {
			consecutive_stuck: 1,
		});
		const u2 = mbDb.getMbLoop(loop.id);
		assert.equal(u2!.consecutive_stuck, 1);

		// Rescue triggered
		mbDb.updateMbLoop(loop.id, {
			rescue_active: true,
			consecutive_stuck: 0,
		});
		const u3 = mbDb.getMbLoop(loop.id);
		assert.equal(u3!.rescue_active, true);

		// Rescue ends
		mbDb.updateMbLoop(loop.id, {
			rescue_active: false,
		});
		const u4 = mbDb.getMbLoop(loop.id);
		assert.equal(u4!.rescue_active, false);

		// Complete
		mbDb.updateMbLoop(loop.id, { status: "completed" });
		const active = mbDb.getActiveMbLoops();
		assert.ok(!active.some((l) => l.id === loop.id));
	});

	it("agent communication via board and DM", () => {
		// Spawn two agents
		boardDb.registerAgent("s-odin", "Odin", "od");
		boardDb.registerAgent("s-thor", "Thor", "th");
		mbDb.registerMbAgent({
			id: "Odin-od",
			session_id: "s-odin",
			name: "Odin",
			suffix: "od",
			status: "online",
			last_heartbeat: Date.now(),
		});
		mbDb.registerMbAgent({
			id: "Thor-th",
			session_id: "s-thor",
			name: "Thor",
			suffix: "th",
			status: "online",
			last_heartbeat: Date.now(),
		});

		// Odin posts help request
		const helpMsg = boardDb.createMessage(
			"Odin-od",
			"help",
			"CI broken",
			"Tests failing on main",
			["ci"],
		);

		// Thor sees it and replies
		boardDb.createReply(helpMsg.id, "Thor-th", "I'll fix it");

		// Thor DMs Odin
		boardDb.sendDirectMessage(
			"Thor-th",
			"Odin-od",
			"Fixed CI",
			"Was a missing dep",
		);

		// Odin reads inbox
		const inbox = boardDb.getInbox("Odin-od", false);
		assert.ok(inbox.length >= 1);

		// Mark resolved
		const resolvedMsg = boardDb.createMessage(
			"Odin-od",
			"resolved",
			"CI fixed",
			"Thanks Thor!",
			["ci"],
		);
		boardDb.updateMessageStatus(resolvedMsg.id, "resolved");
		const resolved = boardDb.getMessages({ status: "resolved" });
		assert.ok(resolved.length >= 1);
	});
});
