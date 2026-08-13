import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { startMessageboardWebServer } from "../web.js";

function getLocal(url: string): Promise<{ status: number; body: string }> {
	const target = new URL(url);
	assert.equal(target.hostname, "127.0.0.1");
	return new Promise((resolve, reject) => {
		const req = request({ hostname: target.hostname, port: target.port, path: target.pathname }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => { body += chunk; });
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
		});
		req.on("error", reject);
		req.end();
	});
}

describe("messageboard web dashboard", () => {
	it("serves local dashboard and state API without auth", async () => {
		const handle = await startMessageboardWebServer();
		try {
			const page = await getLocal(handle.url);
			assert.equal(page.status, 200);
			assert.match(page.body, /Pi Messageboard/);

			const state = await getLocal(`${handle.url}api/state`);
			assert.equal(state.status, 200);
			const payload = JSON.parse(state.body) as { messages: unknown[]; inbox: unknown[]; loops: unknown[] };
			assert.ok(Array.isArray(payload.messages));
			assert.ok(Array.isArray(payload.inbox));
			assert.ok(Array.isArray(payload.loops));
		} finally {
			await handle.close();
		}
	});
});
