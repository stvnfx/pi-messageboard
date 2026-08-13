import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import * as db from "./db.js";
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
	};
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pi Messageboard</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a2b;--line:#263452;--text:#e6edf8;--muted:#8fa0bd;--accent:#67e8f9}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#182743,var(--bg) 55%);color:var(--text);font:14px system-ui,sans-serif}header{padding:24px 5vw;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:20px}h1{margin:0;font-size:22px}main{max-width:1500px;margin:auto;padding:24px 5vw}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card,.panel{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 12px 30px #0002}.metric{font-size:28px;color:var(--accent);font-weight:700}.label,.muted{color:var(--muted)}.tabs{display:flex;gap:8px;margin:24px 0 12px;flex-wrap:wrap}.tabs button,button{border:1px solid var(--line);background:#1a2740;color:var(--text);border-radius:7px;padding:8px 12px;cursor:pointer}.tabs button.active,button:hover{border-color:var(--accent);color:var(--accent)}.tabs button:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.view{display:none}.view.active{display:block}.row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #ffffff10;padding:12px 0}.row:last-child{border:0}.subject{font-weight:600}.empty{padding:24px;text-align:center}.tag{color:var(--accent);font-size:12px}@media(max-width:800px){.grid{grid-template-columns:1fr}header{display:block}.actions{display:flex;flex-wrap:wrap;margin-top:12px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><header><div><h1>Pi Messageboard</h1><div class="muted">Live agent communication dashboard · <span id="scope">All sessions</span></div></div><div class="actions"><span id="status" class="muted" role="status" aria-live="polite">Ready</span><button type="button" onclick="refresh()">Refresh</button><button type="button" onclick="action('toggle-board')">Toggle board scope</button><button type="button" onclick="action('toggle-inbox')">Toggle inbox scope</button><button type="button" class="danger" onclick="if(confirm('Clear all board data?'))action('clear-board')">Clear board</button></div></header><main><section class="grid" id="metrics"></section><nav class="tabs" aria-label="Dashboard views"><button class="active" data-tab="messages" aria-controls="messages" aria-selected="true">Messageboard</button><button data-tab="interactions" aria-controls="interactions" aria-selected="false">Interactions</button><button data-tab="inbox" aria-controls="inbox" aria-selected="false">Inbox</button><button data-tab="agents" aria-controls="agents" aria-selected="false">Agents</button></nav><section id="messages" class="view active panel" aria-label="Messageboard messages"></section><section id="interactions" class="view panel" aria-label="Message replies" hidden></section><section id="inbox" class="view panel" aria-label="Direct message inbox" hidden></section><section id="agents" class="view panel" aria-label="Agent presence" hidden></section></main><script>
let state;
let refreshing=false;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=(label)=>'<div class="muted empty">'+esc(label)+'</div>';
const preview=(value,limit=300)=>{const text=String(value??'');return esc(text.length>limit?text.slice(0,limit)+'…':text);};
const date=(value)=>{const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'Unknown time':parsed.toLocaleString();};
async function removeMessage(id){if(confirm('Delete this message and replies?')){await action('delete-message',id);}}
function row(label,value){return '<div class="row"><span class="label">'+esc(label)+'</span><span>'+esc(value)+'</span></div>'}
function setTab(tab,updateUrl=true){document.querySelectorAll('.tabs button').forEach(x=>{const active=x.dataset.tab===tab;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active));});document.querySelectorAll('.view').forEach(x=>{const active=x.id===tab;x.classList.toggle('active',active);x.toggleAttribute('hidden',!active);});if(updateUrl)history.replaceState(null,'','#'+tab);}
function initialTab(){const tab=location.hash.slice(1);return ['messages','interactions','inbox','agents'].includes(tab)?tab:'messages';}
function shortcut(event){if(event.target.closest('button,input,textarea,select'))return;const tabs=['messages','interactions','inbox','agents'];const index=tabs.indexOf(initialTab());if(event.key==='ArrowRight')setTab(tabs[(index+1)%tabs.length]);if(event.key==='ArrowLeft')setTab(tabs[(index+tabs.length-1)%tabs.length]);if(event.key==='Home')setTab(tabs[0]);if(event.key==='End')setTab(tabs[tabs.length-1]);}
async function action(name,value){setStatus('Saving…');try{const response=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,value})});if(!response.ok)throw new Error('Request failed');await refresh('Updated');}catch(error){setStatus(error.message||'Request failed');}}
function setStatus(message){const node=document.querySelector('#status');if(node)node.textContent=message;}
function render(){if(!state)return;const d=state;const scope=document.querySelector('#scope');if(scope)scope.textContent='Board: '+(d.settings.boardSessionOnly?'current session':'all sessions')+' · Inbox: '+(d.settings.inboxSessionOnly?'current session':'all sessions');document.querySelector('#metrics').innerHTML=[['Posts',d.messages.length],['Inbox',d.inbox.length],['Agents',d.agents.filter(a=>a.status==='online').length+'/'+d.agents.length]].map(x=>'<div class="card"><div class="metric">'+x[1]+'</div><div class="label">'+x[0]+'</div></div>').join('');document.querySelector('#messages').innerHTML=d.messages.map(m=>'<div class="row"><div><div class="subject">'+esc(m.subject)+'</div><div class="muted">'+esc(m.author)+' · '+date(m.timestamp)+'</div><div>'+esc(m.body.slice(0,300))+'</div></div><span class="tag">'+esc(m.category)+' / '+esc(m.status)+' <button type="button" onclick="removeMessage(&quot;'+esc(m.id)+'&quot;)">Delete</button></span></div>').join('')||empty('No messages yet.');document.querySelector('#interactions').innerHTML=d.interactions.map(r=>'<div class="row"><div><div class="subject">Reply in '+esc(r.subject)+'</div><div class="muted">'+esc(r.author)+' · '+date(r.timestamp)+'</div><div>'+preview(r.body,500)+'</div></div></div>').join('')||empty('No replies yet.');document.querySelector('#inbox').innerHTML=d.inbox.map(m=>'<div class="row"><div><div class="subject">'+esc(m.subject)+'</div><div class="muted">'+esc(m.from_agent)+' → '+esc(m.recipient)+' · '+date(m.timestamp)+'</div><div>'+esc(m.body.slice(0,300))+'</div></div><span>'+((m.read)?'read':'NEW')+'</span></div>').join('')||empty('No direct messages yet.');document.querySelector('#agents').innerHTML=d.agents.map(a=>row(a.id,a.status+' · '+date(a.last_heartbeat))).join('')||empty('No agents are online.');}
async function refresh(message='Refreshing…'){if(refreshing)return;refreshing=true;setStatus(message);try{const r=await fetch('/api/state');if(!r.ok)throw new Error('Unable to load dashboard');state=await r.json();render();setStatus('Updated '+new Date().toLocaleTimeString());}catch(error){setStatus(error.message||'Unable to load dashboard');}finally{refreshing=false;}}
function start(){document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));addEventListener('hashchange',()=>setTab(initialTab(),false));addEventListener('keydown',shortcut);setTab(initialTab(),false);refresh();setInterval(refresh,2000);}start();
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
				if (
					payload.name === "clear-inbox" &&
					typeof payload.agentId === "string"
				)
					db.clearInbox(payload.agentId);
				if (
					payload.name === "delete-message" &&
					typeof payload.value === "string"
				)
					db.deleteMessage(payload.value);
				if (payload.name === "delete-dm" && typeof payload.value === "string")
					db.deleteDirectMessage(payload.value);
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
