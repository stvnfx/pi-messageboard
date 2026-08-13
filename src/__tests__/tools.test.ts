import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../db.js';
import { setMyAgentId } from '../tools.js';
import { extractMentions } from '../db.js';

db.resetAll(); // Clear file-backed DB before tests

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
    db.registerAgent('session-dm-1', 'Zeus', 'dm1');
    db.registerAgent('session-dm-2', 'Loki', 'dm2');
    const dm = db.sendDirectMessage('Zeus-dm1', 'Loki-dm2', 'Hello', 'Need help');
    assert.equal(dm.from_agent, 'Zeus-dm1');
    assert.equal(dm.to_agent, 'Loki-dm2');
    assert.ok(!dm.read, 'DM should be unread');
  });

  it('agent can read their inbox', () => {
    db.registerAgent('session-inb-1', 'Ares', 'in1');
    db.registerAgent('session-inb-2', 'Hel', 'in2');
    db.sendDirectMessage('Ares-in1', 'Hel-in2', 'Msg 1', 'body');
    db.sendDirectMessage('Ares-in1', 'Hel-in2', 'Msg 2', 'body');
    const inbox = db.getInbox('Hel-in2', false);
    assert.equal(inbox.length, 2);
  });

  it('can filter unread only', () => {
    db.registerAgent('session-ur-1', 'Thor', 'ur1');
    db.registerAgent('session-ur-2', 'Sif', 'ur2');
    const dm1 = db.sendDirectMessage('Thor-ur1', 'Sif-ur2', 'Read', 'body');
    db.sendDirectMessage('Thor-ur1', 'Sif-ur2', 'Unread', 'body');
    db.markAsRead(dm1.id);
    const unread = db.getInbox('Sif-ur2', true);
    assert.equal(unread.length, 1);
    assert.equal(unread[0].subject, 'Unread');
  });
});

describe('tool agent_list_online', () => {
  it('lists online agents', () => {
    db.registerAgent('session-lo-1', 'Hermes', 'lo1');
    db.registerAgent('session-lo-2', 'Sif', 'lo2');
    db.setAgentOffline('Sif-lo2');
    const online = db.getOnlineAgents();
    assert.ok(online.length >= 1, 'Should have at least one online agent');
    assert.ok(online.some(a => a.id === 'Hermes-lo1'), 'Hermes should be online');
    assert.ok(!online.some(a => a.id === 'Sif-lo2'), 'Sif should be offline');
  });
});

describe('tool messageboard_search', () => {
  it('searches by subject', () => {
    db.registerAgent('session-sr-1', 'Poseidon', 'sr1');
    db.createMessage('Poseidon-sr1', 'help', 'Unique search subject XYZ', 'body');
    db.createMessage('Poseidon-sr1', 'info', 'Other message ABC', 'body');
    const results = db.searchMessages('XYZ');
    assert.equal(results.length, 1);
    assert.equal(results[0].subject, 'Unique search subject XYZ');
  });

  it('searches by body', () => {
    db.registerAgent('session-sr-2', 'Hades', 'sr2');
    db.createMessage('Hades-sr2', 'help', 'Help needed', 'Unique body content QRS');
    db.createMessage('Hades-sr2', 'info', 'Other', 'Other content');
    const results = db.searchMessages('QRS');
    assert.equal(results.length, 1);
  });
});
