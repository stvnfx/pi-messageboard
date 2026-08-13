import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as mbDb from '../../mb/db.js';
import * as boardDb from '../../db.js';

mbDb.resetMbAll();

function registerBoardAgent(id: string, name: string) {
  const suffix = id.includes('-') ? id.split('-')[1] : 'test';
  boardDb.registerAgent('session-' + id, name, suffix);
}

describe('mb_spawn tool logic', () => {
  it('creates agent and board message', () => {
    const agentId = 'Ares-sp01';
    const name = 'Ares';

    registerBoardAgent(agentId, name);
    const agent = mbDb.registerMbAgent({
      id: agentId,
      session_id: 'sess-sp01',
      name,
      suffix: 'sp01',
      status: 'online',
      last_heartbeat: Date.now(),
    });

    boardDb.createMessage(agentId, 'info', `${name} spawned`, `Agent **${agentId}** joined`, ['mb-spawn']);

    assert.equal(agent.id, agentId);
    assert.equal(agent.name, name);
    assert.equal(agent.status, 'online');

    const messages = boardDb.getMessages({ author: agentId });
    assert.ok(messages.length >= 1);
    assert.ok(messages[0].subject.includes('spawned'));
  });

  it('assigns task when provided', () => {
    const agentId = 'Ares-sp02';
    registerBoardAgent(agentId, 'Ares');
    mbDb.registerMbAgent({
      id: agentId,
      session_id: 'sess-sp02',
      name: 'Ares',
      suffix: 'sp02',
      status: 'online',
      last_heartbeat: Date.now(),
    });

    const msg = boardDb.createMessage(agentId, 'task', 'Fix CI', 'Build broken', ['mb-task'], undefined);
    mbDb.setMbAgentTask(agentId, 'Fix CI', msg.id);

    const agent = mbDb.getMbAgent(agentId);
    assert.equal(agent!.task, 'Fix CI');
    assert.equal(agent!.task_post_id, msg.id);
    assert.equal(agent!.status, 'busy');
  });

  it('mb_assign creates assignment and posts to board', () => {
    const assigner = 'Zeus-a1';
    const assignee = 'Loki-b2';
    registerBoardAgent(assigner, 'Zeus');
    registerBoardAgent(assignee, 'Loki');

    mbDb.registerMbAgent({ id: assigner, session_id: 's1', name: 'Zeus', suffix: 'a1', status: 'online', last_heartbeat: Date.now() });
    mbDb.registerMbAgent({ id: assignee, session_id: 's2', name: 'Loki', suffix: 'b2', status: 'online', last_heartbeat: Date.now() });

    const msg = boardDb.createMessage(assigner, 'task', 'Deploy app', 'Run deploy script', ['mb-task'], assignee);
    mbDb.createTaskAssignment(msg.id, assignee, assigner);

    const tasks = mbDb.getAgentTasks(assignee);
    assert.ok(tasks.length >= 1);
    assert.equal(tasks[0].assigned_by, assigner);
  });
});

describe('mb_status tool logic', () => {
  it('lists online agents', () => {
    mbDb.registerMbAgent({
      id: 'Freya-s1', session_id: 's1', name: 'Freya', suffix: 's1',
      status: 'online', last_heartbeat: Date.now(),
    });
    mbDb.registerMbAgent({
      id: 'Skadi-s2', session_id: 's2', name: 'Skadi', suffix: 's2',
      status: 'online', last_heartbeat: Date.now(),
    });

    const online = mbDb.getOnlineMbAgents();
    assert.ok(online.length >= 2);
  });

  it('lists active loops', () => {
    const loop = mbDb.createMbLoop('Freya-s1', 'Improve tests', '100% pass', 5);
    assert.equal(loop.status, 'running');

    const active = mbDb.getActiveMbLoops();
    assert.ok(active.length >= 1);
  });
});

describe('mb_broadcast logic', () => {
  it('creates broadcast message on board', () => {
    registerBoardAgent('Freya-s1', 'Freya');
    const msg = boardDb.createMessage('Freya-s1', 'info', '📢 System update', 'New version available', ['mb-broadcast']);
    assert.ok(msg.id);
    assert.ok(msg.subject.includes('System update'));
  });
});
