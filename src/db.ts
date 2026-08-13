import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
	Agent,
	Message,
	Reply,
	DirectMessage,
	Category,
	MessageStatus,
	InboxPolicy,
} from "./types.js";

const DB_DIR = join(homedir(), ".pi", "agent", "messageboard");
const DB_PATH = join(DB_DIR, "board.db");

let db: Database.Database | null = null;
let currentSessionId: string | null = null;
let boardSessionOnly = false;
let inboxSessionOnly = false;
let eventHandler: ((event: { type: "message" | "dm"; id: string; author: string; recipient?: string }) => void) | undefined;

export function setCurrentSession(sessionId: string): void {
	currentSessionId = sessionId;
}

export function setEventHandler(handler: typeof eventHandler): void {
	eventHandler = handler;
}

export function isBoardSessionOnly(): boolean {
	return boardSessionOnly;
}

export function isInboxSessionOnly(): boolean {
	return inboxSessionOnly;
}

export function toggleBoardSessionOnly(): boolean {
	boardSessionOnly = !boardSessionOnly;
	return boardSessionOnly;
}

export function toggleInboxSessionOnly(): boolean {
	inboxSessionOnly = !inboxSessionOnly;
	return inboxSessionOnly;
}

function getDb(): Database.Database {
	if (!db) {
		mkdirSync(DB_DIR, { recursive: true });
		db = new Database(DB_PATH);
		db.pragma("journal_mode = WAL");
		db.pragma("foreign_keys = ON");
		initSchema(db);
	}
	return db;
}

function initSchema(db: Database.Database) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      suffix TEXT NOT NULL,
      status TEXT DEFAULT 'offline',
      last_heartbeat INTEGER,
      inbox_policy TEXT DEFAULT 'both'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      session_id TEXT,
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'open',
      assigned_to TEXT,
      FOREIGN KEY (author) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      parent_reply_id TEXT,
      author TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      body TEXT NOT NULL,
      session_id TEXT,
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (parent_reply_id) REFERENCES replies(id),
      FOREIGN KEY (author) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      session_id TEXT,
      read INTEGER DEFAULT 0,
      FOREIGN KEY (from_agent) REFERENCES agents(id),
      FOREIGN KEY (to_agent) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      agent_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (agent_id, message_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    -- Indexes for hot query paths (M1)
    CREATE INDEX IF NOT EXISTS idx_messages_category_status ON messages(category, status);
    CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author);
    CREATE INDEX IF NOT EXISTS idx_messages_assigned ON messages(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_replies_message ON replies(message_id);
    CREATE INDEX IF NOT EXISTS idx_inbox_to ON inbox(to_agent, read);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_agent ON bookmarks(agent_id);

    -- M4: mentions tracking
    CREATE TABLE IF NOT EXISTS mentions (
      agent_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      reply_id TEXT,
      timestamp INTEGER NOT NULL,
      read INTEGER DEFAULT 0,
      PRIMARY KEY (agent_id, message_id, reply_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mentions_agent ON mentions(agent_id, read);
  `);

	// M3: FTS5 full-text search (standalone table with message_id column)
	db.exec(
		`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(message_id, subject, body, tokenize='porter unicode61');`,
	);

	// M3: FTS5 triggers (standalone table)
	db.exec(
		`CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(message_id, subject, body) VALUES (new.id, new.subject, new.body); END;`,
	);
	db.exec(
		`CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN DELETE FROM messages_fts WHERE message_id = old.id; END;`,
	);
	db.exec(
		`CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF subject, body ON messages BEGIN DELETE FROM messages_fts WHERE message_id = old.id; INSERT INTO messages_fts(message_id, subject, body) VALUES (new.id, new.subject, new.body); END;`,
	);

	for (const table of ["messages", "replies", "inbox"] as const) {
		try {
			if (table === "messages") db.exec("ALTER TABLE messages ADD COLUMN session_id TEXT");
			if (table === "replies") db.exec("ALTER TABLE replies ADD COLUMN session_id TEXT");
			if (table === "inbox") db.exec("ALTER TABLE inbox ADD COLUMN session_id TEXT");
		} catch {
			// Column already exists.
		}
	}

	// M2: apply versioned migrations
	db.exec(
		`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER DEFAULT (unixepoch()));`,
	);
	const current =
		(
			db
				.prepare(
					"SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
				)
				.get() as any
		)?.version ?? 0;
	// Apply 001_indexes.sql if version < 1
	if (current < 1) {
		const migrationPath = join(
			process.cwd(),
			"src",
			"migrations",
			"001_indexes.sql",
		);
		if (existsSync(migrationPath)) {
			const sql = readFileSync(migrationPath, "utf8");
			// Only run up-section (before -- Down)
			const upSql = sql.split("-- Down")[0];
			db.exec(upSql);
			db.prepare(
				"INSERT OR IGNORE INTO schema_version (version) VALUES (1)",
			).run();
		}
	}
}

// ─── Agent Operations ──────────────────────────────────────────────

export function registerAgent(
	sessionId: string,
	name: string,
	suffix: string,
): Agent {
	const d = getDb();
	const id = `${name}-${suffix}`;
	const now = Date.now();
	d.prepare(`
    INSERT INTO agents (id, session_id, name, suffix, status, last_heartbeat)
    VALUES (?, ?, ?, ?, 'online', ?)
    ON CONFLICT(id) DO UPDATE SET
      status = 'online',
      last_heartbeat = ?,
      session_id = ?
  `).run(id, sessionId, name, suffix, now, now, sessionId);
	return getAgent(id)!;
}

export function getAgent(id: string): Agent | null {
	const d = getDb();
	const row = d.prepare("SELECT * FROM agents WHERE id = ?").get(id) as
		| Agent
		| undefined;
	return row ?? null;
}

export function getAllAgents(): Agent[] {
	const d = getDb();
	return d.prepare("SELECT * FROM agents ORDER BY name").all() as Agent[];
}

export function getOnlineAgents(): Agent[] {
	const d = getDb();
	const twoMinAgo = Date.now() - 2 * 60 * 1000;
	// Mark stale agents offline
	d.prepare(
		"UPDATE agents SET status = ? WHERE status = ? AND last_heartbeat < ?",
	).run("offline", "online", twoMinAgo);
	return d
		.prepare("SELECT * FROM agents WHERE status = ? ORDER BY name")
		.all("online") as Agent[];
}

export function updateHeartbeat(agentId: string): void {
	const d = getDb();
	d.prepare(
		"UPDATE agents SET last_heartbeat = ?, status = ? WHERE id = ?",
	).run(Date.now(), "online", agentId);
}

export function setAgentOffline(agentId: string): void {
	const d = getDb();
	d.prepare("UPDATE agents SET status = ? WHERE id = ?").run(
		"offline",
		agentId,
	);
}

export function updateAgentInboxPolicy(
	agentId: string,
	policy: InboxPolicy,
): void {
	const d = getDb();
	d.prepare("UPDATE agents SET inbox_policy = ? WHERE id = ?").run(
		policy,
		agentId,
	);
}

// ─── Message Operations ─────────────────────────────────────────────

export function createMessage(
	author: string,
	category: Category,
	subject: string,
	body: string,
	tags: string[] = [],
	assignedTo?: string,
): Message {
	const d = getDb();
	const id = randomUUID();
	const now = Date.now();
	d.prepare(`
    INSERT INTO messages (id, author, timestamp, category, subject, body, session_id, tags, status, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
		id,
		author,
		now,
		category,
		subject,
		body,
		currentSessionId,
		JSON.stringify(tags),
		"open",
		assignedTo ?? null,
	);
	eventHandler?.({ type: "message", id, author });
	// M4: store mentions
	for (const mentioned of extractMentions(body)) {
		createMention(mentioned, id);
	}
	return getMessage(id)!;
}

function parseTags(tags: string): string[] {
	try {
		return JSON.parse(tags);
	} catch {
		return [];
	}
}

export function getMessage(id: string): Message | null {
	const d = getDb();
	const row = d.prepare("SELECT * FROM messages WHERE id = ?").get(id) as any;
	if (!row) return null;
	return { ...row, tags: parseTags(row.tags) };
}

export function getMessages(
	opts: {
		category?: Category;
		status?: MessageStatus;
		author?: string;
		tag?: string;
		assignedTo?: string;
		limit?: number;
	} = {},
): Message[] {
	const d = getDb();
	const conditions: string[] = [];
	const params: any[] = [];

	if (boardSessionOnly) {
		conditions.push("session_id = ?");
		params.push(currentSessionId ?? "");
	}
	if (opts.category) {
		conditions.push("category = ?");
		params.push(opts.category);
	}
	if (opts.status) {
		conditions.push("status = ?");
		params.push(opts.status);
	}
	if (opts.author) {
		conditions.push("author = ?");
		params.push(opts.author);
	}
	if (opts.assignedTo) {
		conditions.push("assigned_to = ?");
		params.push(opts.assignedTo);
	}
	if (opts.tag) {
		conditions.push("tags LIKE ?");
		params.push(`%${opts.tag}%`);
	}

	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
	const limit = opts.limit ?? 20;

	const rows = d
		.prepare(`SELECT * FROM messages ${where} ORDER BY timestamp DESC LIMIT ?`)
		.all(...params, limit) as any[];
	return rows.map((r) => ({ ...r, tags: parseTags(r.tags) }));
}

export function searchMessages(query: string, limit = 20): Message[] {
	const d = getDb();
	// FTS5 MATCH requires non-empty query; fallback for empty
	const q = query.trim() || "*";
	const scope = boardSessionOnly ? " AND m.session_id = ?" : "";
	const params = boardSessionOnly ? [q, currentSessionId ?? "", limit] : [q, limit];
	const rows = d
		.prepare(`
    SELECT m.* FROM messages m JOIN messages_fts f ON m.id = f.message_id
    WHERE messages_fts MATCH ?${scope}
    ORDER BY rank
    LIMIT ?
  `)
		.all(...params) as any[];
	return rows.map((r) => ({ ...r, tags: parseTags(r.tags) }));
}

export function updateMessageStatus(id: string, status: MessageStatus): void {
	const d = getDb();
	d.prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, id);
}

export function assignMessage(id: string, assignedTo: string): void {
	const d = getDb();
	d.prepare("UPDATE messages SET assigned_to = ?, status = ? WHERE id = ?").run(
		assignedTo,
		"claimed",
		id,
	);
}

// ─── Reply Operations ──────────────────────────────────────────────

export function createReply(
	messageId: string,
	author: string,
	body: string,
	parentReplyId?: string,
): Reply {
	const d = getDb();
	const id = randomUUID();
	const now = Date.now();
	d.prepare(
		"INSERT INTO replies (id, message_id, author, timestamp, body, parent_reply_id, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(id, messageId, author, now, body, parentReplyId ?? null, currentSessionId);
	if (currentSessionId) {
		d.prepare("UPDATE replies SET session_id = ? WHERE id = ?").run(currentSessionId, id);
	}
	// M4: store mentions in replies
	for (const mentioned of extractMentions(body)) {
		createMention(mentioned, messageId, id);
	}
	return getReply(id)!;
}

export function getReply(id: string): Reply | null {
	const d = getDb();
	return (
		(d.prepare("SELECT * FROM replies WHERE id = ?").get(id) as Reply) ?? null
	);
}

export function getReplies(messageId: string): Reply[] {
	const d = getDb();
	return d
		.prepare(
			"SELECT * FROM replies WHERE message_id = ? ORDER BY timestamp ASC",
		)
		.all(messageId) as Reply[];
}

export function getThreadedReplies(messageId: string): Reply[] {
	const d = getDb();
	return d
		.prepare(
			`SELECT r.* FROM replies r
     WHERE r.message_id = ?
     ORDER BY r.timestamp ASC`,
		)
		.all(messageId) as Reply[];
}

// ─── Inbox Operations ──────────────────────────────────────────────

export function sendDirectMessage(
	fromAgent: string,
	toAgent: string,
	subject: string,
	body: string,
): DirectMessage {
	const d = getDb();
	const id = randomUUID();
	const now = Date.now();
	const recipient = d.prepare("SELECT session_id FROM agents WHERE id = ?").get(toAgent) as { session_id?: string } | undefined;
	const inboxSessionId = recipient?.session_id ?? currentSessionId;
	d.prepare(
		"INSERT INTO inbox (id, from_agent, to_agent, timestamp, subject, body, session_id, read) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
	).run(id, fromAgent, toAgent, now, subject, body, inboxSessionId);
	if (inboxSessionId) {
		d.prepare("UPDATE inbox SET session_id = ? WHERE id = ?").run(inboxSessionId, id);
	}
	eventHandler?.({ type: "dm", id, author: fromAgent, recipient: toAgent });
	return getDirectMessage(id)!;
}

export function getDirectMessage(id: string): DirectMessage | null {
	const d = getDb();
	return (
		(d.prepare("SELECT * FROM inbox WHERE id = ?").get(id) as DirectMessage) ??
		null
	);
}

export function getInbox(agentId: string, unreadOnly = false): DirectMessage[] {
	const d = getDb();
	const where = unreadOnly
		? "WHERE to_agent = ? AND read = 0"
		: "WHERE to_agent = ?";
	const scope = inboxSessionOnly ? " AND session_id = ?" : "";
	const params = inboxSessionOnly ? [agentId, currentSessionId ?? ""] : [agentId];
	return d
		.prepare(`SELECT * FROM inbox ${where}${scope} ORDER BY timestamp DESC LIMIT 50`)
		.all(...params) as DirectMessage[];
}

export function markAsRead(id: string): void {
	const d = getDb();
	d.prepare("UPDATE inbox SET read = 1 WHERE id = ?").run(id);
}

export function markAllAsRead(agentId: string): void {
	const d = getDb();
	d.prepare("UPDATE inbox SET read = 1 WHERE to_agent = ?").run(agentId);
}

// ─── Bookmark Operations ───────────────────────────────────────────

export function addBookmark(agentId: string, messageId: string): void {
	const d = getDb();
	d.prepare(
		"INSERT OR IGNORE INTO bookmarks (agent_id, message_id, timestamp) VALUES (?, ?, ?)",
	).run(agentId, messageId, Date.now());
}

export function getBookmarks(agentId: string): Message[] {
	const d = getDb();
	const rows = d
		.prepare(`
    SELECT m.* FROM messages m
    JOIN bookmarks b ON m.id = b.message_id
    WHERE b.agent_id = ?
    ORDER BY b.timestamp DESC
  `)
		.all(agentId) as any[];
	return rows.map((r) => ({ ...r, tags: parseTags(r.tags) }));
}

export function removeBookmark(agentId: string, messageId: string): void {
	const d = getDb();
	d.prepare("DELETE FROM bookmarks WHERE agent_id = ? AND message_id = ?").run(
		agentId,
		messageId,
	);
}

// ─── Utility ───────────────────────────────────────────────────────

export function clearBoard(): void {
	const d = getDb();
	d.pragma("foreign_keys = OFF");
	d.exec("DELETE FROM bookmarks; DELETE FROM mentions; DELETE FROM replies; DELETE FROM messages;");
	d.pragma("foreign_keys = ON");
}

export function clearInbox(agentId: string): void {
	getDb().prepare("DELETE FROM inbox WHERE to_agent = ?").run(agentId);
}

export function setSessionOnly(board: boolean, inbox: boolean): void {
	boardSessionOnly = board;
	inboxSessionOnly = inbox;
}

export function getInboxSince(agentId: string, timestamp: number): DirectMessage[] {
	const scope = inboxSessionOnly ? " AND session_id = ?" : "";
	const params = inboxSessionOnly ? [agentId, timestamp, currentSessionId ?? ""] : [agentId, timestamp];
	return getDb().prepare(`SELECT * FROM inbox WHERE to_agent = ? AND timestamp > ?${scope} ORDER BY timestamp ASC`).all(...params) as DirectMessage[];
}

export function getMessagesSince(timestamp: number, excludeAuthor?: string): Message[] {
	const d = getDb();
	const conditions = ["timestamp > ?"];
	const params: unknown[] = [timestamp];
	if (boardSessionOnly) {
		conditions.push("session_id = ?");
		params.push(currentSessionId ?? "");
	}
	if (excludeAuthor) {
		conditions.push("author != ?");
		params.push(excludeAuthor);
	}
	return d.prepare(`SELECT * FROM messages WHERE ${conditions.join(" AND ")} ORDER BY timestamp ASC LIMIT 100`).all(...params) as Message[];
}

export function resetAll(): void {
	const d = getDb();
	d.pragma("foreign_keys = OFF");
	d.exec("DELETE FROM bookmarks");
	d.exec("DELETE FROM inbox");
	d.exec("DELETE FROM replies");
	d.exec("DELETE FROM messages");
	d.exec("DELETE FROM agents");
	d.pragma("foreign_keys = ON");
}

export function closeDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}

export function createMention(
	agentId: string,
	messageId: string,
	replyId?: string,
): void {
	const d = getDb();
	d.prepare(
		"INSERT OR IGNORE INTO mentions (agent_id, message_id, reply_id, timestamp, read) VALUES (?, ?, ?, ?, 0)",
	).run(agentId, messageId, replyId ?? null, Date.now());
}

export function getMentions(agentId: string, unreadOnly = false): any[] {
	const d = getDb();
	const where = unreadOnly
		? "WHERE agent_id = ? AND read = 0"
		: "WHERE agent_id = ?";
	return d
		.prepare(`SELECT * FROM mentions ${where} ORDER BY timestamp DESC`)
		.all(agentId) as any[];
}

export function extractMentions(text: string): string[] {
	const mentionRegex = /@([A-Z][a-z]+-[a-f0-9]{4})/g;
	const mentions: string[] = [];
	let match;
	while ((match = mentionRegex.exec(text)) !== null) {
		mentions.push(match[1]);
	}
	return [...new Set(mentions)];
}
