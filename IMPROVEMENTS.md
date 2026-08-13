# Improvements Backlog

## Open

- [x] `src/__tests__/mb/loop.test.ts` — Add test for rescue switching: consecutive_stuck increments on stuck, resets on running
- [x] `src/__tests__/mb/loop.test.ts` — Add test for goal check: createMbLoop with check_command stores it
- [x] `src/__tests__/integration-mb.test.ts` — Integration test: spawn agent → post to board → reply → DM
- [ ] `src/mb/spawn.ts` — Add mb_loop_status tool: get loop state for monitoring (iteration, status, agents, last_notice)
- [ ] `src/mb/spawn.ts` — Add mb_loop_log tool: read last N entries from loop.jsonl
- [ ] `src/mb/index.ts` — Add /mb log command: show recent loop.jsonl entries
- [ ] `README.md` — Add /mb agents and /mb log to commands table
- [ ] `README.md` — Add mb_agent_reply, mb_agent_mention, mb_loop_status to tools table
- [ ] `src/mb/loop.ts` — Add anti-repetition sampling penalty hint: include "Do not repeat previous response" in stuck directive
- [ ] `src/mb/loop.ts` — Add context pressure handling: detect long responses and suggest compact
- [ ] `src/mb/loop.ts` — Add iteration delay param: wait N seconds between loop iterations
- [ ] `src/mb/db.ts` — Add resetMbLoop function: clear single loop's data
- [ ] `package.json` — Add "test" script: "node --import tsx --test src/__tests__/*.test.ts src/__tests__/mb/*.test.ts"
- [x] `src/__tests__/mb/spawn.test.ts` — Test mb_spawn creates agent on board, starts heartbeat, returns agentId
- [x] `src/__tests__/mb/loop.test.ts` — Test mb_loop creates loop, spawns agents; mb_loop_update posts to board; mb_loop_stop halts
- [x] `README.md` — Add mb/ tools table (mb_spawn, mb_assign, mb_broadcast, mb_status, mb_loop, mb_loop_update, mb_loop_stop)
- [x] `README.md` — Add mb/ commands table (/mb status, /mb spawn, /mb loop, /mb stop)
- [x] `src/mb/loop.ts` — Add JSONL iteration logging (append to ~/.pi/agent/messageboard/loop.log)
- [x] `src/mb/loop.ts` — Add fingerprint-based stuck detection (SHA256 of response text, detect repeats)
- [x] `src/mb/loop.ts` — Add rescue model switching (configurable stronger model for stuck loops)
- [x] `src/mb/loop.ts` — Add goal check command (run shell command, check exit code)
- [x] `src/mb/spawn.ts` — Add mb_agent_reply tool (reply to board messages as spawned agent)
- [x] `src/mb/spawn.ts` — Add mb_agent_mention tool (notify specific agent via DM)
- [x] `src/mb/index.ts` — Add /mb agents command (list all spawned agents with status)

## Done

- [x] `src/db.ts` — Fix resetAll() foreign key ordering, stale DB cleanup
- [x] `src/__tests__/mb/db.test.ts` — Test registerMbAgent, createMbLoop, updateMbLoop, getActiveMbLoops, resetMbAll
- [x] `src/__tests__/mb/spawn.test.ts` — Test mb_spawn creates agent on board, starts heartbeat, returns agentId
- [x] `src/__tests__/mb/loop.test.ts` — Test mb_loop creates loop, spawns agents; mb_loop_update posts to board; mb_loop_stop halts
- [x] `README.md` — Add mb/ tools table (mb_spawn, mb_assign, mb_broadcast, mb_status, mb_loop, mb_loop_update, mb_loop_stop)
- [x] `README.md` — Add mb/ commands table (/mb status, /mb spawn, /mb loop, /mb stop)
- [x] `src/mb/loop.ts` — Add JSONL iteration logging (append to ~/.pi/agent/messageboard/loop.log)
- [x] `src/mb/loop.ts` — Add fingerprint-based stuck detection (SHA256 of response text, detect repeats)
- [x] `src/mb/loop.ts` — Add rescue model switching (configurable stronger model for stuck loops)
- [x] `src/mb/loop.ts` — Add goal check command (run shell command, check exit code)
- [x] `src/mb/spawn.ts` — Add mb_agent_reply tool (reply to board messages as spawned agent)
- [x] `src/mb/spawn.ts` — Add mb_agent_mention tool (notify specific agent via DM)
- [x] `src/mb/index.ts` — Add /mb agents command (list all spawned agents with status)
