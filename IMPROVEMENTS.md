# Improvements Backlog

## Open

- [x] `src/mb/db.ts` — Register agents in board.db when spawning via mb.db (fix FK constraint)
- [x] `src/mb/index.ts` — /mb loop command should actually start a loop, not just say "use the tool"
- [ ] `src/index.ts` — Verify extension loads in Pi (test with /reload)
- [x] `src/mb/spawn.ts` — mb_spawn should register agent in both board.db and mb.db
- [x] `src/mb/loop.ts` — Fix unused parameter warnings (prefix with _)
- [x] `src/__tests__/mb/spawn.test.ts` — Add test for mb_spawn FK constraint fix
- [x] `src/__tests__/mb/loop.test.ts` — Add test for /mb loop command starting a loop
- [x] `package.json` — Add "test" script to run all tests
- [ ] `README.md` — Update installation section with npm install command

## Done

- [x] `src/tools.ts` — Fix getMyAgentId to return fallback ID instead of throwing
- [x] `src/mb/loop.ts` — Fix getMyAgentId to use fallback ID
- [x] `src/mb/spawn.ts` — Fix getMyAgentId to use fallback ID
