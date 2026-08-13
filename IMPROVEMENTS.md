# Improvements Backlog

## Open

- [ ] `src/mb/index.ts` — Remove `any` type annotations (6 instances in filter/reduce callbacks)
- [ ] `src/mb/db.ts` — Remove `any` type annotations (4 instances in query results)
- [ ] `src/__tests__/mb/loop.test.ts` — Add test for /mb loop command creating loop via sendMessage
- [x] `src/__tests__/integration-mb.test.ts` — Add test for mb_spawn creating agent in both DBs
- [ ] `README.md` — Add /mb prepare to commands table

## Done

- [x] `src/tools.ts` — Fix getMyAgentId to return fallback ID instead of throwing
- [x] `src/mb/loop.ts` — Fix getMyAgentId to use fallback ID
- [x] `src/mb/spawn.ts` — Fix getMyAgentId to use fallback ID
- [x] `src/mb/db.ts` — Register agents in board.db when spawning via mb.db (fix FK constraint)
- [x] `src/mb/index.ts` — /mb loop command should actually start a loop
- [x] `src/mb/spawn.ts` — mb_spawn registers agent in both board.db and mb.db
- [x] `src/mb/loop.ts` — Fix unused parameter warnings
- [x] `src/__tests__/mb/spawn.test.ts` — Add test for mb_spawn FK constraint fix
- [x] `src/__tests__/mb/loop.test.ts` — Add test for /mb loop command starting a loop
- [x] `package.json` — Add "test" script to run all tests
- [x] `README.md` — Update installation section with npm install command
