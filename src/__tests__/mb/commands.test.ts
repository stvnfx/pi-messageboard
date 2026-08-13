import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mbExtension from "../../mb/index.js";

describe("/mb command completions", () => {
	it("includes loop and subagent controls", () => {
		let command:
			| {
					getArgumentCompletions?: (
						prefix: string,
					) => Array<{ value: string }> | null;
			  }
			| undefined;
		mbExtension({
			registerTool() {},
			registerCommand(name: string, options: unknown) {
				if (name === "mb") command = options as typeof command;
			},
			on() {},
		} as never);
		const values =
			command?.getArgumentCompletions?.("")?.map((item) => item.value) ?? [];
		assert.ok(values.includes("kill"));
		assert.ok(values.includes("kill-all"));
		assert.ok(values.includes("loop"));
		assert.ok(values.includes("prepare"));
		assert.ok(values.includes("agents"));
	});
});
