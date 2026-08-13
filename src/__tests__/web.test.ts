import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { startMessageboardWebServer } from "../web.js";
import vm from "node:vm";

function getLocal(url: string): Promise<{ status: number; body: string }> {
	const target = new URL(url);
	assert.equal(target.hostname, "127.0.0.1");
	return new Promise((resolve, reject) => {
		const req = request(
			{ hostname: target.hostname, port: target.port, path: target.pathname },
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
			},
		);
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
			assert.match(page.body, /role="status"/);
			assert.match(page.body, /function setTab/);
			assert.match(page.body, /id="scope"/);
			assert.match(page.body, /aria-label="Dashboard views"/);
			assert.match(page.body, /aria-selected="true"/);
			assert.match(page.body, /toggleAttribute\('hidden'/);
			assert.match(page.body, /function initialTab/);
			assert.match(page.body, /let refreshing=false/);
			assert.match(page.body, /hashchange/);
			assert.match(page.body, /function shortcut/);
			assert.match(page.body, /Unknown time/);
			assert.match(page.body, /prefers-reduced-motion/);
			assert.match(page.body, /event.key==='Home'/);
			assert.match(page.body, /button,input,textarea,select/);
			assert.match(page.body, /type="button" class="danger"/);
			assert.match(page.body, /function start/);
			assert.match(page.body, /Unable to load dashboard/);
			const script = page.body.match(/<script>([\s\S]*)<\/script>/)?.[1];
			assert.ok(script);
			assert.doesNotThrow(() => new vm.Script(script));

			const state = await getLocal(`${handle.url}api/state`);
			assert.equal(state.status, 200);
			const payload = JSON.parse(state.body) as {
				messages: unknown[];
				inbox: unknown[];
			};
			assert.ok(Array.isArray(payload.messages));
			assert.ok(Array.isArray(payload.inbox));
		} finally {
			await handle.close();
		}
	});
});
