## Improvements Backlog

- [ ] Fix `src/__tests__/tools.test.ts` failure (line ~736 assertion). Acceptance: `node --test src/__tests__/tools.test.ts` exits 0.
- [ ] Proper type fix for `agent_list_online` return (remove `as any` cast in `src/tools.ts` line 285, type `AgentToolResult` correctly). Acceptance: `npm run typecheck` exits 0 without `as any` casts.
- [ ] Ensure existing `board.db` picks up `messages_fts`, `mentions` tables, and indexes (re-open/re-init verification in `src/db.ts` or migration). Acceptance: `sqlite3 board.db ".tables"` shows all 3 new tables/indexes.
- [ ] Add `PROGRESS.md` tracking completed milestones M1-M5. Acceptance: file exists with milestone checklist.
- [ ] Verify `messageboard_read_mentions` returns `count` consistently (type fix). Acceptance: typecheck passes, tool test passes.
- [X] Create IMPROVEMENTS.md with concrete checklist (file paths + criteria).
- [~] Fix `tools.test.ts` failure — `SqliteError: datatype mismatch` at resetAll (likely FTS5 trigger interaction with existing DB); needs further isolation. Acceptance: test exits 0.
- [X] Fix `agent_list_online` pre-existing type error (cast removed).
