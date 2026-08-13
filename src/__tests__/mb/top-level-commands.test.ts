import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mbExtension from "../../mb/index.js";

describe("top-level subagent commands", () => {
	it("registers list and kill commands for slash autocomplete", () => {
		const names: string[] = [];
		mbExtension({
			registerTool() {},
			registerCommand(name: string) { names.push(name); },
			on() {},
		} as never);
		assert.ok(names.includes("mb-agents"));
		assert.ok(names.includes("mb-list"));
		assert.ok(names.includes("mb-kill"));
		assert.ok(names.includes("mb-kill-all"));
	});
});
