import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../db.js';
import { setMyAgentId } from '../tools.js';
import { extractMentions } from '../db.js';

// ─── Mock Pi context ────────────────────────────────────────────────

function mockCtx() {
  return {
    ui: {
      notify: () => {},
      setStatus: () => {},
    },
    sessionManager: {
      getSessionId: () => 'test-session-123',
    },
  };
}

function mockOnUpdate() {
  return (_data: unknown) => {};
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('extractMentions', () => {
  it('extracts agent IDs from text', () => {
    const mentions = extractMentions('Hey @Zeus-a3f2 and @Loki-b7c1');
    assert.deepEqual(mentions, ['Zeus-a3f2', 'Loki-b7c1']);
  });

  it('deduplicates mentions', () => {
    const mentions = extractMentions('@Zeus-a3f2 said @Zeus-a3f2 is right');
    assert.deepEqual(mentions, ['Zeus-a3f2']);
  });

  it('returns empty for no mentions', () => {
    const mentions = extractMentions('No mentions here');
    assert.deepEqual(mentions, []);
  });

  it('ignores non-agent patterns', () => {
    const mentions = extractMentions('@user and @Zeus-a3f2');
    assert.deepEqual(mentions, ['Zeus-a3f2']);
  });
});

describe('tool messageboard_post', () => {
  // We test the DB operations that the tool uses, since we can't
  // easily mock the full Pi registerTool flow in unit tests.
  // Integration tests cover the full tool execution.

  it('creates a message with correct fields', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    setMyAgentId('Zeus-a3f2');
    const msg = db.createMessage('Zeus-a3f2', 'help', 'Test subject', 'Test body', ['tag1']);
    assert.equal(msg.subject, 'Test subject');
    assert.equal(msg.category, 'help');
    assert.deepEqual(msg.tags, ['tag1']);
    assert.equal(msg.status, 'open');
  });

  it('creates a message with assignment', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    const msg = db.createMessage('Zeus-a3f2', 'task', 'Fix CI', 'Broken build', [], 'Loki-b7c1');
    assert.equal(msg.assigned_to, 'Loki-b7c1');
  });
});

describe('tool messageboard_reply', () => {
  it('creates a reply on a message', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    const msg = db.createMessage('Zeus-a3f2', 'help', 'Help', 'body');
    const reply = db.createReply(msg.id, 'Loki-b7c1', 'I can help');
    assert.equal(reply.message_id, msg.id);
    assert.equal(reply.author, 'Loki-b7c1');
  });

  it('creates threaded reply', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    const msg = db.createMessage('Zeus-a3f2', 'help', 'Help', 'body');
    const r1 = db.createReply(msg.id, 'Loki-b7c1', 'First');
    const r2 = db.createReply(msg.id, 'Zeus-a3f2', 'Thanks', r1.id);
    assert.equal(r2.parent_reply_id, r1.id);
  });
});

describe('tool agent_send_dm', () => {
  it('sends a DM between agents', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    const dm = db.sendDirectMessage('Zeus-a3f2', 'Loki-b7c1', 'Hello', 'Need help');
    assert.equal(dm.from_agent, 'Zeus-a3f2');
    assert.equal(dm.to_agent, 'Loki-b7c1');
    assert.equal(dm.read, false);
  });

  it('agent can read their inbox', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    db.sendDirectMessage('Zeus-a3f2', 'Loki-b7c1', 'Msg 1', 'body');
    db.sendDirectMessage('Zeus-a3f2', 'Loki-b7c1', 'Msg 2', 'body');
    const inbox = db.getInbox('Loki-b7c1', false);
    assert.equal(inbox.length, 2);
  });

  it('can filter unread only', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    db.sendDirectMessage('Zeus-a3f2', 'Loki-b7c1', 'Read', 'body');
    const dm2 = db.sendDirectMessage('Zeus-a3f2', 'Loki-b7c1', 'Unread', 'body');
    db.markAsRead(dm2.id);
    const unread = db.getInbox('Loki-b7c1', true);
    assert.equal(unread.length, 1);
    assert.equal(unread[0].subject, 'Read');
  });
});

describe('tool agent_list_online', () => {
  it('lists online agents', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.registerAgent('session-2', 'Loki', 'b7c1');
    db.setAgentOffline('Loki-b7c1');
    const online = db.getOnlineAgents();
    assert.equal(online.length, 1);
    assert.equal(online[0].id, 'Zeus-a3f2');
  });
});

describe('tool messageboard_search', () => {
  it('searches by subject', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.createMessage('Zeus-a3f2', 'help', 'Auth middleware broken', 'body');
    db.createMessage('Zeus-a3f2', 'info', 'CI pipeline updated', 'body');
    const results = db.searchMessages('auth');
    assert.equal(results.length, 1);
    assert.equal(results[0].subject, 'Auth middleware broken');
  });

  it('searches by body', () => {
    db.registerAgent('session-1', 'Zeus', 'a3f2');
    db.createMessage('Zeus-a3f2', 'help', 'Help needed', 'Token refresh failing');
    const results = db.searchMessages('token');
    assert.equal(results.length, 1);
  });
});
