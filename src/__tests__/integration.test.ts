import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tempDir = mkdtempSync(join(tmpdir(), "mb-integration-"));
const __dirname = join(fileURLToPath(import.meta.url), "..", "..");

async function createSession(): Promise<AgentSession> {
	const loader = new DefaultResourceLoader({
		cwd: tempDir,
		agentDir: join(tempDir, ".pi", "agent"),
		additionalExtensionPaths: [join(__dirname, "index.ts")],
	});
	await loader.reload();

	const sessionManager = SessionManager.create(tempDir);
	const { session } = await createAgentSession({
		cwd: tempDir,
		sessionManager,
		tools: [
			"read",
			"bash",
			"messageboard_post",
			"messageboard_read",
			"messageboard_reply",
			"messageboard_close",
			"messageboard_search",
			"messageboard_read_thread",
			"messageboard_bookmark",
			"agent_list_online",
			"agent_send_dm",
			"agent_read_inbox",
			"agent_profile",
			"agent_set_policy",
		],
		resourceLoader: loader,
	});
	return session;
}

describe("integration: two agents on messageboard", () => {
	let agentA: AgentSession;
	let agentB: AgentSession;

	before(async () => {
		agentA = await createSession();
		agentB = await createSession();
	});

	after(() => {
		agentA?.dispose();
		agentB?.dispose();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("agent A can post a message", async () => {
		let output = "";
		agentA.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentA.prompt(
			'Use the messageboard_post tool to post a help message with subject "Auth middleware broken" and body "Token refresh path is wrong". Use category "help".',
		);

		assert.ok(output.length > 0, "Agent should produce output");
	});

	it("agent B can read the board and see agent A message", async () => {
		let output = "";
		agentB.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentB.prompt(
			"Use the messageboard_read tool to read all messages on the board.",
		);

		assert.ok(
			output.includes("Auth middleware broken"),
			"Agent B should see agent A message",
		);
	});

	it("agent B can reply to agent A message", async () => {
		let output = "";
		agentB.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentB.prompt(
			'Use the messageboard_reply tool to reply to the message with subject "Auth middleware broken". Reply with body "Try checking the token expiry path in auth.ts".',
		);

		assert.ok(output.length > 0, "Agent should produce output");
	});

	it("agent A can read the thread and see the reply", async () => {
		let output = "";
		agentA.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentA.prompt(
			'Use the messageboard_search tool to find messages about "auth", then use messageboard_read_thread to read the full thread.',
		);

		assert.ok(output.includes("token expiry"), "Agent A should see the reply");
	});

	it("agent A can send a DM to agent B", async () => {
		let output = "";
		agentA.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentA.prompt(
			'Use the agent_send_dm tool to send a direct message to the other online agent with subject "Thanks" and body "Got it working, thanks!"',
		);

		assert.ok(output.length > 0, "Agent should produce output");
	});

	it("agent B can read inbox and see the DM", async () => {
		let output = "";
		agentB.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentB.prompt("Use the agent_read_inbox tool to read your inbox.");

		assert.ok(output.includes("Thanks"), "Agent B should see the DM");
	});

	it("agent A can close the message as resolved", async () => {
		let output = "";
		agentA.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentA.prompt(
			'Use the messageboard_search tool to find messages about "auth", then use messageboard_close to close it.',
		);

		assert.ok(output.length > 0, "Agent should produce output");
	});

	it("agents can see each other online", async () => {
		let output = "";
		agentA.subscribe((event) => {
			if (
				event.type === "message_update" &&
				event.assistantMessageEvent.type === "text_delta"
			) {
				output += event.assistantMessageEvent.delta;
			}
		});

		await agentA.prompt(
			"Use the agent_list_online tool to list all online agents.",
		);

		assert.ok(
			output.includes("Agent") || output.includes("online"),
			"Should list online agents",
		);
	});
});
