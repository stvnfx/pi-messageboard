import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as mbDb from "../../mb/db.js";

// Reset before tests
mbDb.resetMbAll();

describe("mb_agents", () => {
	it("registers and retrieves an agent", () => {
		const agent = mbDb.registerMbAgent({
			id: "Zeus-test1",
			session_id: "sess-1",
			name: "Zeus",
			suffix: "test1",
			status: "online",
			last_heartbeat: Date.now(),
		});
		assert.equal(agent.id, "Zeus-test1");
		assert.equal(agent.name, "Zeus");
		assert.equal(agent.status, "online");
	});

	it("lists all agents", () => {
		mbDb.registerMbAgent({
			id: "Loki-test2",
			session_id: "sess-2",
			name: "Loki",
			suffix: "test2",
			status: "online",
			last_heartbeat: Date.now(),
		});
		const all = mbDb.getAllMbAgents();
		assert.ok(all.length >= 2);
	});

	it("updates heartbeat", () => {
		mbDb.registerMbAgent({
			id: "Athena-test3",
			session_id: "sess-3",
			name: "Athena",
			suffix: "test3",
			status: "online",
			last_heartbeat: Date.now() - 10000,
		});
		mbDb.updateMbAgentHeartbeat("Athena-test3");
		const agent = mbDb.getMbAgent("Athena-test3");
		assert.ok(agent!.last_heartbeat > Date.now() - 5000);
	});

	it("sets agent task", () => {
		mbDb.registerMbAgent({
			id: "Thor-test4",
			session_id: "sess-4",
			name: "Thor",
			suffix: "test4",
			status: "online",
			last_heartbeat: Date.now(),
		});
		mbDb.setMbAgentTask("Thor-test4", "Fix CI", "msg-123");
		const agent = mbDb.getMbAgent("Thor-test4");
		assert.equal(agent!.task, "Fix CI");
		assert.equal(agent!.task_post_id, "msg-123");
		assert.equal(agent!.status, "busy");
	});

	it("clears agent task", () => {
		mbDb.registerMbAgent({
			id: "Odin-test5",
			session_id: "sess-5",
			name: "Odin",
			suffix: "test5",
			status: "online",
			last_heartbeat: Date.now(),
		});
		mbDb.setMbAgentTask("Odin-test5", "Task", "msg-456");
		mbDb.clearMbAgentTask("Odin-test5");
		const agent = mbDb.getMbAgent("Odin-test5");
		assert.equal(agent!.task, null);
		assert.equal(agent!.status, "online");
	});

	it("marks agent offline", () => {
		mbDb.registerMbAgent({
			id: "Hel-test6",
			session_id: "sess-6",
			name: "Hel",
			suffix: "test6",
			status: "online",
			last_heartbeat: Date.now(),
		});
		mbDb.setMbAgentOffline("Hel-test6");
		const agent = mbDb.getMbAgent("Hel-test6");
		assert.equal(agent!.status, "offline");
	});
});

describe("mb_loops", () => {
	it("creates and retrieves a loop", () => {
		const loop = mbDb.createMbLoop(
			"Zeus-test1",
			"Fix tests",
			"All pass",
			10,
			"anthropic/claude-sonnet-4-5",
		);
		assert.equal(loop.goal, "Fix tests");
		assert.equal(loop.status, "running");
		assert.equal(loop.max_iterations, 10);
		assert.equal(loop.model, "anthropic/claude-sonnet-4-5");
	});

	it("updates loop fields", () => {
		const loop = mbDb.createMbLoop("Zeus-test1", "Iterate", "", 0);
		mbDb.updateMbLoop(loop.id, {
			iteration: 5,
			status: "stuck",
			last_notice: "Repeated 3x",
		});
		const updated = mbDb.getMbLoop(loop.id);
		assert.equal(updated!.iteration, 5);
		assert.equal(updated!.status, "stuck");
		assert.equal(updated!.last_notice, "Repeated 3x");
	});

	it("gets active loops", () => {
		const loop1 = mbDb.createMbLoop("Loki-test2", "Active loop", "", 0);
		const loop2 = mbDb.createMbLoop("Loki-test2", "Done loop", "", 0);
		mbDb.updateMbLoop(loop2.id, { status: "completed" });
		const active = mbDb.getActiveMbLoops();
		assert.ok(active.some((l) => l.id === loop1.id));
		assert.ok(!active.some((l) => l.id === loop2.id));
	});

	it("adds agent to loop", () => {
		const loop = mbDb.createMbLoop("Zeus-test1", "Agent loop", "", 0);
		mbDb.addAgentToLoop(loop.id, "Zeus-test1");
		mbDb.addAgentToLoop(loop.id, "Loki-test2");
		mbDb.addAgentToLoop(loop.id, "Zeus-test1"); // duplicate
		const updated = mbDb.getMbLoop(loop.id);
		assert.equal(updated!.agent_ids.length, 2);
	});
});

describe("mb_task_assignments", () => {
	it("creates and updates assignment", () => {
		mbDb.createTaskAssignment("task-abc", "Thor-test4", "Zeus-test1");
		mbDb.updateTaskAssignment("task-abc", "in_progress");
		const tasks = mbDb.getAgentTasks("Thor-test4");
		assert.ok(tasks.length >= 1);
		assert.equal(tasks[0].status, "in_progress");
	});
});

describe("resetMbAll", () => {
	it("clears all data", () => {
		mbDb.resetMbAll();
		assert.equal(mbDb.getAllMbAgents().length, 0);
		assert.equal(mbDb.getActiveMbLoops().length, 0);
	});
});
