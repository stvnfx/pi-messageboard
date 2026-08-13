import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as db from "./db.js";
import * as mbDb from "./mb/db.js";

const LOG_FILE = join(homedir(), ".pi", "agent", "messageboard", "loop.jsonl");
const MAX_BODY = 16 * 1024;

export interface MessageboardWebHandle {
	url: string;
	close(): Promise<void>;
}

function json(res: ServerResponse, status: number, value: unknown): void {
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
	});
	res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
	let raw = "";
	for await (const chunk of req) {
		raw += String(chunk);
		if (raw.length > MAX_BODY) throw new Error("Request body too large");
	}
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Invalid JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new Error("Invalid JSON object");
	return parsed as Record<string, unknown>;
}

function data() {
	const messages = db.getMessages({ limit: 200 });
	const interactions = messages.flatMap((message) =>
		db
			.getReplies(message.id)
			.map((reply) => ({ ...reply, subject: message.subject })),
	);
	const agents = db.getAllAgents();
	const inbox = agents.flatMap((agent) =>
		db
			.getInbox(agent.id, false)
			.map((message) => ({ ...message, recipient: agent.id })),
	);
	const loops = mbDb.getAllMbLoops();
	const mbAgents = mbDb.getAllMbAgents();
	const log = existsSync(LOG_FILE)
		? readFileSync(LOG_FILE, "utf8")
				.trim()
				.split("\n")
				.filter(Boolean)
				.slice(-100)
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return { raw: line };
					}
				})
		: [];
	return {
		generatedAt: Date.now(),
		settings: {
			boardSessionOnly: db.isBoardSessionOnly(),
			inboxSessionOnly: db.isInboxSessionOnly(),
		},
		messages,
		interactions,
		inbox,
		agents,
		loops,
		mbAgents,
		log,
	};
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pi Messageboard</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a2b;--line:#263452;--text:#e6edf8;--muted:#8fa0bd;--accent:#67e8f9;--green:#86efac;--orange:#fdba74;--red:#fca5a5}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#182743,var(--bg) 55%);color:var(--text);font:14px system-ui,sans-serif}header{padding:24px 5vw;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}h1{margin:0;font-size:22px}main{max-width:1500px;margin:auto;padding:24px 5vw}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card,.panel{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 12px 30px #0002}.metric{font-size:28px;color:var(--accent);font-weight:700}.label,.muted{color:var(--muted)}.tabs{display:flex;gap:8px;margin:24px 0 12px;flex-wrap:wrap}.tabs button,button{border:1px solid var(--line);background:#1a2740;color:var(--text);border-radius:7px;padding:8px 12px;cursor:pointer}.tabs button.active,button:hover{border-color:var(--accent);color:var(--accent)}.view{display:none}.view.active{display:block}.row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #ffffff10;padding:12px 0}.row:last-child{border:0}.subject{font-weight:600}.tag{color:var(--accent);font-size:12px}.status{color:var(--green)}.status.stuck{color:var(--orange)}.status.offline{color:var(--muted)}pre{white-space:pre-wrap;max-height:500px;overflow:auto;color:#c7d2fe;font:12px ui-monospace,monospace;background:#080d18;padding:12px;border-radius:8px} @media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}header{display:block}.actions{margin-top:12px}}
</style></head><body><header><div><h1>Pi Messageboard</h1><div class="muted">Live agent operations dashboard</div></div><div class="actions"><button onclick="refresh()">Refresh</button><button onclick="action('toggle-board')">Toggle board scope</button><button onclick="action('toggle-inbox')">Toggle inbox scope</button><button class="danger" onclick="if(confirm('Clear all board data?'))action('clear-board')">Clear board</button><button class="danger" onclick="if(confirm('Stop and delete all loops?'))action('clear-loops')">Clear loops</button></div></header><main><section class="grid" id="metrics"></section><nav class="tabs"><button class="active" data-tab="messages">Messageboard</button><button data-tab="interactions">Interactions</button><button data-tab="inbox">Inbox</button><button data-tab="agents">Agents</button><button data-tab="loops">Loops</button><button data-tab="log">Live log</button></nav><section id="messages" class="view active panel"></section><section id="interactions" class="view panel"></section><section id="inbox" class="view panel"></section><section id="agents" class="view panel"></section><section id="loops" class="view panel"></section><section id="log" class="view panel"><pre id="log-data"></pre></section></main><script>
const token=new URLSearchParams(location.search).get('token');let state;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function removeMessage(id){if(confirm('Delete this message and replies?')){await action('delete-message',id);}}
async function stopLoop(id){if(confirm('Stop this loop?')){await action('stop-loop',id);}}
function row(label,value){return '<div class="row"><span class="label">'+esc(label)+'</span><span>'+esc(value)+'</span></div>'}
async function action(name,value){await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,value})});await refresh();}
function render(){if(!state)return;const d=state;document.querySelector('#metrics').innerHTML=[['Posts',d.messages.length],['Inbox',d.inbox.length],['Agents',d.agents.filter(a=>a.status==='online').length+'/'+d.agents.length],['Loops',d.loops.filter(l=>l.status==='running'||l.status==='stuck').length]].map(x=>'<div class="card"><div class="metric">'+x[1]+'</div><div class="label">'+x[0]+'</div></div>').join('');document.querySelector('#messages').innerHTML=d.messages.map(m=>'<div class="row"><div><div class="subject">'+esc(m.subject)+'</div><div class="muted">'+esc(m.author)+' · '+new Date(m.timestamp).toLocaleString()+'</div><div>'+esc(m.body.slice(0,300))+'</div></div><span class="tag">'+esc(m.category)+' / '+esc(m.status)+' <button onclick="removeMessage(&quot;'+esc(m.id)+'&quot;)">Delete</button></span></div>').join('')||'<div class="muted">No messages</div>';document.querySelector('#interactions').innerHTML=d.interactions.map(r=>'<div class="row"><div><div class="subject">Reply in '+esc(r.subject)+'</div><div class="muted">'+esc(r.author)+' · '+new Date(r.timestamp).toLocaleString()+'</div><div>'+esc(r.body)+'</div></div></div>').join('')||'<div class="muted">No interactions</div>';document.querySelector('#inbox').innerHTML=d.inbox.map(m=>'<div class="row"><div><div class="subject">'+esc(m.subject)+'</div><div class="muted">'+esc(m.from_agent)+' → '+esc(m.recipient)+' · '+new Date(m.timestamp).toLocaleString()+'</div><div>'+esc(m.body.slice(0,300))+'</div></div><span>'+((m.read)?'read':'NEW')+'</span></div>').join('')||'<div class="muted">No direct messages</div>';document.querySelector('#agents').innerHTML=d.agents.map(a=>row(a.id,a.status+' · '+new Date(a.last_heartbeat).toLocaleString())).join('')||'<div class="muted">No agents</div>';document.querySelector('#loops').innerHTML=d.loops.map(l=>'<div class="row"><div>'+row(l.goal,l.status+' · iteration '+l.iteration+' · '+l.agent_ids.length+' agents')+'</div><button onclick="stopLoop(&quot;'+esc(l.id)+'&quot;)">Stop</button></div>').join('')||'<div class="muted">No loops</div>';document.querySelector('#log-data').textContent=d.log.map(x=>JSON.stringify(x)).join('\n')||'No log entries';}
async function refresh(){const r=await fetch('/api/state');state=await r.json();render();}document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active')});refresh();setInterval(refresh,2000);
</script></body></html>`;

export async function startMessageboardWebServer(): Promise<MessageboardWebHandle> {
	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
		try {
			if (req.method === "GET" && path === "/") {
				res.writeHead(200, {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
				});
				return res.end(PAGE);
			}
			if (req.method === "GET" && path === "/api/state")
				return json(res, 200, data());
			if (req.method === "POST" && path === "/api/action") {
				const payload = await body(req);
				if (payload.name === "clear-board") db.clearBoard();
				if (payload.name === "clear-inbox" && typeof payload.agentId === "string") db.clearInbox(payload.agentId);
				if (payload.name === "delete-message" && typeof payload.value === "string") db.deleteMessage(payload.value);
				if (payload.name === "delete-dm" && typeof payload.value === "string") db.deleteDirectMessage(payload.value);
				if (payload.name === "clear-loops") {
					for (const loop of mbDb.getAllMbLoops()) mbDb.deleteMbLoop(loop.id);
				}
				if (payload.name === "stop-loop" && typeof payload.value === "string") mbDb.updateMbLoop(payload.value, { status: "paused", last_notice: "Stopped from web dashboard" });
				if (payload.name === "toggle-board") db.toggleBoardSessionOnly();
				if (payload.name === "toggle-inbox") db.toggleInboxSessionOnly();
				return json(res, 200, { ok: true });
			}
			return json(res, 404, { error: "Not found" });
		} catch (error) {
			return json(res, 400, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	return {
		url: `http://127.0.0.1:${port}/`,
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}
