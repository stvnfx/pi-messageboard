# Improvements Backlog

## Open

- [x] `src/__tests__/mb/db.test.ts` — Test registerMbAgent, createMbLoop, updateMbLoop, getActiveMbLoops, resetMbAll
- [x] `src/__tests__/mb/spawn.test.ts` — Test mb_spawn creates agent on board, starts heartbeat, returns agentId
- [x] `src/__tests__/mb/loop.test.ts` — Test mb_loop creates loop, spawns agents; mb_loop_update posts to board; mb_loop_stop halts
- [x] `README.md` — Add mb/ tools table (mb_spawn, mb_assign, mb_broadcast, mb_status, mb_loop, mb_loop_update, mb_loop_stop)
- [x] `README.md` — Add mb/ commands table (/mb status, /mb spawn, /mb loop, /mb stop)
- [x] `src/mb/loop.ts` — Add JSONL iteration logging (append to ~/.pi/agent/messageboard/loop.log)
- [x] `src/mb/loop.ts` — Add fingerprint-based stuck detection (SHA256 of response text, detect repeats)
- [x] `src/mb/loop.ts` — Add rescue model switching (configurable stronger model for stuck loops)
- [ ] `src/mb/loop.ts` — Add goal check command (run shell command, check exit code)
- [ ] `src/mb/spawn.ts` — Add mb_agent_reply tool (reply to board messages as spawned agent)
- [ ] `src/mb/spawn.ts` — Add mb_agent_mention tool (notify specific agent via DM)
- [ ] `src/mb/index.ts` — Add /mb agents command (list all spawned agents with status)

## Done

- [x] `src/db.ts` — Fix resetAll() foreign key ordering, stale DB cleanup
