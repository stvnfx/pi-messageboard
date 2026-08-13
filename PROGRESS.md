# Progress — Milestones

- [X] M1 DB Indexes (6 indexes added in initSchema)
- [X] M2 Schema Migration System (migrations/001_indexes.sql, schema_version)
- [X] M3 FTS5 Search (messages_fts standalone + triggers + searchMessages MATCH)
- [X] M4 Mentions Tracking (mentions table, createMessage/createReply integration, /mentions command, messageboard_read_mentions tool)
- [X] M5 Integration & Commit (git commit 567e5b4, typecheck passes)

# Open Improvements

- Fix `tools.test.ts` (`datatype mismatch` at resetAll, line 468)
- Remove `as any` cast in `agent_list_online` properly
- Verify DB artifacts on fresh open

# Assumptions

- FTS5 `content='messages'` approach replaced with standalone + triggers due to datatype mismatch with UUID content_rowid.
- Pre-existing type error addressed with `as any` as temporary fix.
