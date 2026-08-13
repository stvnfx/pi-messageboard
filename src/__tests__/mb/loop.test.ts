import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as mbDb from '../../mb/db.js';
import * as boardDb from '../../db.js';
import { getLoopDirective } from '../../mb/loop.js';

mbDb.resetMbAll();

function regAgent(id: string, name: string) {
  boardDb.registerAgent('s-' + id, name, id.split('-')[1] || 't');
  mbDb.registerMbAgent({
    id, session_id: 's-' + id, name, suffix: id.split('-')[1] || 't',
    status: 'online', last_heartbeat: Date.now(),
  });
}

describe('mb_loop tool logic', () => {
  it('creates loop and spawns agents on board', () => {
    regAgent('Zeus-lp1', 'Zeus');
    const owner = 'Zeus-lp1';
    const loop = mbDb.createMbLoop(owner, 'Fix all tests', '100% pass', 5);
    assert.equal(loop.goal, 'Fix all tests');
    assert.equal(loop.status, 'running');

    const agentId = 'Ares-lp2';
    regAgent(agentId, 'Ares');
    const msg = boardDb.createMessage(agentId, 'info', 'Ares spawned', 'Joined', ['mb-spawn']);
    mbDb.addAgentToLoop(loop.id, agentId);

    const updated = mbDb.getMbLoop(loop.id);
    assert.ok(updated!.agent_ids.includes(agentId));

    const messages = boardDb.getMessages({ author: agentId });
    assert.ok(messages.length >= 1);
  });

  it('mb_loop_update posts to board and updates loop', () => {
    const loop = mbDb.createMbLoop('Zeus-lp1', 'Iterate', '', 0);
    boardDb.createMessage('Zeus-lp1', 'info', 'Loop update', 'Iteration 1 done', ['mb-loop']);

    mbDb.updateMbLoop(loop.id, { iteration: 1, status: 'running', last_notice: 'Done' });
    const updated = mbDb.getMbLoop(loop.id);
    assert.equal(updated!.iteration, 1);
    assert.equal(updated!.last_notice, 'Done');
  });

  it('mb_loop_update completed stops agents', () => {
    const loop = mbDb.createMbLoop('Zeus-lp1', 'Complete me', '', 0);
    mbDb.updateMbLoop(loop.id, { status: 'completed', last_notice: 'All done' });
    const updated = mbDb.getMbLoop(loop.id);
    assert.equal(updated!.status, 'completed');
  });

  it('mb_loop_stop pauses loop', () => {
    const loop = mbDb.createMbLoop('Zeus-lp1', 'Stop me', '', 0);
    mbDb.updateMbLoop(loop.id, { status: 'paused', last_notice: 'Stopped by operator' });
    const active = mbDb.getActiveMbLoops();
    assert.ok(!active.some(l => l.id === loop.id));
  });
});

describe('getLoopDirective', () => {
  it('start directive includes goal', () => {
    const loop = mbDb.createMbLoop('Zeus-lp1', 'My goal', 'My criteria', 10);
    const dir = getLoopDirective('start', loop);
    assert.ok(dir.includes('My goal'));
    assert.ok(dir.includes('My criteria'));
    assert.ok(dir.includes('1/10'));
  });

  it('continue directive mentions goal', () => {
    const loop = mbDb.createMbLoop('Zeus-lp1', 'Fix CI', '', 0);
    mbDb.updateMbLoop(loop.id, { iteration: 3 });
    const updated = mbDb.getMbLoop(loop.id)!;
    const dir = getLoopDirective('continue', updated);
    assert.ok(dir.includes('Fix CI'));
    assert.ok(dir.includes('4/∞'));
  });

  it('stuck directive mentions board', () => {
    const loop = mbDb.createMbLoop('Zeus-lp1', 'Stuck task', '', 0);
    const dir = getLoopDirective('stuck', loop);
    assert.ok(dir.includes('board'));
    assert.ok(dir.includes('Stuck task'));
  });
});
