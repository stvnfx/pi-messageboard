import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Agent, Message, Reply, DirectMessage } from '../types.js';

// ─── In-memory DB wrapper for testing ──────────────────────────────

let testDb: Database.Database;
const tempDir = mkdtempSync(join(tmpdir(), 'mb-test-'));

function getTestDb(): Database.Database {
  if (!testDb) {
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    initTestSchema(testDb);
  }
  return testDb;
}

function initTestSchema(db: Database.Database) {
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
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'open',
      assigned_to TEXT
    );
    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      parent_reply_id TEXT,
      author TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      agent_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (agent_id, message_id)
    );
  `);
}

function resetDb() {
  const db = getTestDb();
  db.exec('DELETE FROM agents; DELETE FROM messages; DELETE FROM replies; DELETE FROM inbox; DELETE FROM bookmarks;');
}

function insertAgent(id: string, name: string, suffix: string, status = 'online'): Agent {
  const db = getTestDb();
  const now = Date.now();
  // ast-grep: false positive — suffix is a bind parameter, not SQL interpolation
  db.prepare('INSERT INTO agents (id, session_id, name, suffix, status, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, `session-${suffix}`, name, suffix, status, now);
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent;
}

function insertMessage(author: string, category = 'help', subject = 'Test', body = 'Body'): Message {
  const db = getTestDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO messages (id, author, timestamp, category, subject, body, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, author, now, category, subject, body, '[]', 'open');
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;
}

function insertReply(messageId: string, author: string, body: string, parentReplyId?: string): Reply {
  const db = getTestDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO replies (id, message_id, parent_reply_id, author, timestamp, body) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, messageId, parentReplyId ?? null, author, now, body);
  return db.prepare('SELECT * FROM replies WHERE id = ?').get(id) as Reply;
}

function insertDm(from: string, to: string, subject: string, body: string): DirectMessage {
  const db = getTestDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO inbox (id, from_agent, to_agent, timestamp, subject, body, read) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .run(id, from, to, now, subject, body);
  return db.prepare('SELECT * FROM inbox WHERE id = ?').get(id) as DirectMessage;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('agents', () => {
  beforeEach(() => resetDb());

  it('inserts and retrieves an agent', () => {
    const agent = insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    assert.equal(agent.id, 'Zeus-a3f2');
    assert.equal(agent.name, 'Zeus');
    assert.equal(agent.status, 'online');
  });

  it('lists online agents', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2', 'online');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1', 'offline');
    const db = getTestDb();
    const online = db.prepare("SELECT * FROM agents WHERE status = 'online'").all() as Agent[];
    assert.equal(online.length, 1);
    assert.equal(online[0].id, 'Zeus-a3f2');
  });

  it('updates heartbeat', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    const db = getTestDb();
    const before = db.prepare('SELECT last_heartbeat FROM agents WHERE id = ?').get('Zeus-a3f2') as any;
    db.prepare('UPDATE agents SET last_heartbeat = ? WHERE id = ?').run(Date.now() + 10000, 'Zeus-a3f2');
    const after = db.prepare('SELECT last_heartbeat FROM agents WHERE id = ?').get('Zeus-a3f2') as any;
    assert.ok(after.last_heartbeat > before.last_heartbeat);
  });

  it('marks agent offline', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2', 'online');
    const db = getTestDb();
    db.prepare("UPDATE agents SET status = 'offline' WHERE id = ?").run('Zeus-a3f2');
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('Zeus-a3f2') as Agent;
    assert.equal(agent.status, 'offline');
  });
});

describe('messages', () => {
  beforeEach(() => resetDb());

  it('creates and retrieves a message', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    const msg = insertMessage('Zeus-a3f2', 'help', 'Auth broken', 'Token refresh failing');
    assert.equal(msg.subject, 'Auth broken');
    assert.equal(msg.category, 'help');
    assert.equal(msg.status, 'open');
  });

  it('filters by category', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertMessage('Zeus-a3f2', 'help', 'Help 1', 'body');
    insertMessage('Zeus-a3f2', 'info', 'Info 1', 'body');
    insertMessage('Zeus-a3f2', 'help', 'Help 2', 'body');
    const db = getTestDb();
    const helps = db.prepare("SELECT * FROM messages WHERE category = 'help'").all();
    assert.equal(helps.length, 2);
  });

  it('searches messages by query', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertMessage('Zeus-a3f2', 'help', 'Auth middleware broken', 'Token refresh path wrong');
    insertMessage('Zeus-a3f2', 'info', 'CI pipeline updated', 'New build steps');
    const db = getTestDb();
    const results = db.prepare("SELECT * FROM messages WHERE subject LIKE ? OR body LIKE ?").all('%auth%', '%auth%');
    assert.equal(results.length, 1);
    assert.equal((results[0] as any).subject, 'Auth middleware broken');
  });

  it('updates message status', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    const msg = insertMessage('Zeus-a3f2');
    const db = getTestDb();
    db.prepare("UPDATE messages SET status = 'resolved' WHERE id = ?").run(msg.id);
    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id) as any;
    assert.equal(updated.status, 'resolved');
  });
});

describe('replies', () => {
  beforeEach(() => resetDb());

  it('creates a reply on a message', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1');
    const msg = insertMessage('Zeus-a3f2', 'help', 'Help needed', 'body');
    const reply = insertReply(msg.id, 'Loki-b7c1', 'I can help');
    assert.equal(reply.message_id, msg.id);
    assert.equal(reply.author, 'Loki-b7c1');
    assert.equal(reply.body, 'I can help');
  });

  it('creates threaded replies', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1');
    insertAgent('Athena-c9e4', 'Athena', 'c9e4');
    const msg = insertMessage('Zeus-a3f2');
    const r1 = insertReply(msg.id, 'Loki-b7c1', 'First reply');
    const r2 = insertReply(msg.id, 'Athena-c9e4', 'Reply to first', r1.id);
    assert.equal(r2.parent_reply_id, r1.id);
  });

  it('retrieves all replies for a message', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1');
    const msg = insertMessage('Zeus-a3f2');
    insertReply(msg.id, 'Zeus-a3f2', 'Self reply');
    insertReply(msg.id, 'Loki-b7c1', 'Other reply');
    const db = getTestDb();
    const replies = db.prepare('SELECT * FROM replies WHERE message_id = ?').all(msg.id);
    assert.equal(replies.length, 2);
  });
});

describe('inbox', () => {
  beforeEach(() => resetDb());

  it('sends and receives a DM', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1');
    const dm = insertDm('Zeus-a3f2', 'Loki-b7c1', 'Hello', 'Need help with auth');
    assert.equal(dm.from_agent, 'Zeus-a3f2');
    assert.equal(dm.to_agent, 'Loki-b7c1');
    assert.equal(dm.read, 0);
  });

  it('lists unread DMs', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1');
    insertDm('Zeus-a3f2', 'Loki-b7c1', 'Msg 1', 'body');
    insertDm('Zeus-a3f2', 'Loki-b7c1', 'Msg 2', 'body');
    const db = getTestDb();
    const unread = db.prepare('SELECT * FROM inbox WHERE to_agent = ? AND read = 0').all('Loki-b7c1');
    assert.equal(unread.length, 2);
  });

  it('marks DM as read', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    insertAgent('Loki-b7c1', 'Loki', 'b7c1');
    const dm = insertDm('Zeus-a3f2', 'Loki-b7c1', 'Read me', 'body');
    const db = getTestDb();
    db.prepare('UPDATE inbox SET read = 1 WHERE id = ?').run(dm.id);
    const updated = db.prepare('SELECT * FROM inbox WHERE id = ?').get(dm.id) as DirectMessage;
    assert.equal(updated.read, 1);
  });
});

describe('bookmarks', () => {
  beforeEach(() => resetDb());

  it('adds and retrieves a bookmark', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    const msg = insertMessage('Zeus-a3f2');
    const db = getTestDb();
    db.prepare('INSERT INTO bookmarks (agent_id, message_id, timestamp) VALUES (?, ?, ?)')
      .run('Zeus-a3f2', msg.id, Date.now());
    const bookmarks = db.prepare('SELECT * FROM bookmarks WHERE agent_id = ?').all('Zeus-a3f2');
    assert.equal(bookmarks.length, 1);
  });

  it('retrieves bookmarked messages', () => {
    insertAgent('Zeus-a3f2', 'Zeus', 'a3f2');
    const msg = insertMessage('Zeus-a3f2', 'help', 'Useful post', 'body');
    const db = getTestDb();
    db.prepare('INSERT INTO bookmarks (agent_id, message_id, timestamp) VALUES (?, ?, ?)')
      .run('Zeus-a3f2', msg.id, Date.now());
    const bookmarked = db.prepare(`
      SELECT m.* FROM messages m JOIN bookmarks b ON m.id = b.message_id WHERE b.agent_id = ?
    `).all('Zeus-a3f2') as any[];
    assert.equal(bookmarked.length, 1);
    assert.equal(bookmarked[0].subject, 'Useful post');
  });
});

after(() => {
  testDb?.close();
  rmSync(tempDir, { recursive: true, force: true });
});
