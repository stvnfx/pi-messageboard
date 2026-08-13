# Goal: Improve subagent, loop and messageboard

## Refined Objective

Make pi-messageboard a production-quality Pi extension where agents can spawn subagents, run autonomous loops, and communicate via a shared message board — all with proper testing, documentation, and error handling.

## Scope

### In Scope

1. Fix the 1 failing test in tools.test.ts
2. Add unit tests for mb/ module (spawn, loop, db)
3. Add integration test for mb_loop lifecycle
4. Update README with mb/ tools and commands
5. Add error handling for edge cases (duplicate agent IDs, missing loops, DB failures)
6. Add mb_stop_all command to halt all loops
7. Add loop iteration logging (JSONL like pi-loop-mode)
8. Add anti-repetition detection for loop responses
9. Add rescue model switching for stuck loops
10. Add goal check command for loop completion verification

### Non-Goals

- Web UI or dashboard
- Authentication/permissions
- Real-time push notifications (polling is sufficient)
- Cross-machine messageboard (single-machine only)
- Migration from v1 schema (fresh DB is fine)

## Measurable Completion Criteria

- [ ] All unit tests pass (`node --import tsx --test src/__tests__/*.test.ts` exits 0)
- [ ] mb/ module has ≥80% line coverage
- [ ] README documents all 19 tools and 8 commands
- [ ] No TypeScript errors (`npx tsc --noEmit` exits 0)
- [ ] Loop can: start → iterate → detect stuck → recover → complete
- [ ] Spawned agents appear on board and respond to mentions

## Milestone Roadmap

### Milestone 1: Fix & Test (estimated: 1 iteration)

- [ ] Fix failing tools.test.ts test
- [ ] Add mb/db.test.ts (registerMbAgent, createMbLoop, updateMbLoop)
- [ ] Add mb/spawn.test.ts (mb_spawn tool logic)
- [ ] Add mb/loop.test.ts (mb_loop, mb_loop_update, mb_loop_stop)

### Milestone 2: Documentation (estimated: 1 iteration)

- [ ] Update README with mb/ tools table
- [ ] Update README with mb/ commands table
- [ ] Add installation section for mb/ extension
- [ ] Add examples for common workflows

### Milestone 3: Loop Robustness (estimated: 2-3 iterations)

- [ ] Add loop iteration JSONL logging
- [ ] Add anti-repetition fingerprinting (from pi-loop-mode)
- [ ] Add stuck detection (fingerprint repeat + no-progress window)
- [ ] Add rescue model switching for stuck loops
- [ ] Add goal check command for until-done mode
- [ ] Add context pressure handling (emergency compaction)

### Milestone 4: Agent Communication (estimated: 1-2 iterations)

- [ ] Add mb_agent_reply tool (reply to board messages as spawned agent)
- [ ] Add mb_agent_mention tool (notify specific agent)
- [ ] Add mb_loop_status tool (get loop state for monitoring)
- [ ] Add /mb agents command (list all spawned agents with status)

## Quality Standards

- **Tests:** Every tool function has at least 1 unit test
- **Types:** No `any` types in new code (use proper interfaces)
- **Errors:** All tool execute functions return isError: true on failure
- **Docs:** Every tool has promptSnippet and promptGuidelines
- **Git:** Each milestone gets its own commit with descriptive message

## Assumptions

1. SQLite (better-sqlite3) is available and reliable for single-machine use
2. Pi extension API is stable (registerTool, registerCommand, on events)
3. Agents are short-lived (session-scoped) — no persistent agent state needed
4. The messageboard DB can grow unbounded (no rotation needed yet)
5. Loop iteration delay is handled by the caller, not the extension
