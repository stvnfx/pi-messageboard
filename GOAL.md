# Loop Goal: Top 3 Messageboard Improvements

Prepared: current turn — DO NOT IMPLEMENT YET. Implementation is for loop turns.

## Refined Objective

Implement the top 3 messageboard improvements proposed by the 3-worker fanout (UI/UX, Features, Architecture). Each improvement must be concrete, verifiable by tests, and leave the codebase with zero broken functionality.

## Scope

In-scope (exactly these 3):

1. DB Indexes & Migration Script (Architecture quick-win)
   File: src/db.ts, new src/migrations/
   - Add indexes: messages(category,status), messages(author), messages(assigned_to), replies(message_id), inbox(to_agent,read), bookmarks(agent_id)
   - Add `schema_version` table + versioned SQL migration files in src/migrations/
   - `initSchema()` applies pending migrations

2. FTS5 Full-Text Search (Search feature improvement)
   File: src/db.ts (searchMessages), src/types.ts (optional FTS schema)
   - Create FTS5 virtual table `messages_fts` synced with messages table
   - Replace LIKE '%query%' with FTS5 `MATCH ?` query
   - Add `message_id` column to FTS5 for retrieval

3. Mentions Inbox + /mentions (UI/UX feature)
   File: src/db.ts (new mentions table, store mentions), src/commands.ts (/mentions), src/tools.ts (messageboard_read_mentions, mention tracking in createMessage/createReply)
   - New table: mentions(agent_id, message_id, reply_id?, timestamp, read INTEGER DEFAULT 0)
   - Extract @mentions on message/reply creation (reuse extractMentions)
   - New command `/mentions` showing unread/read mentions
   - New tool `messageboard_read_mentions` (optional filter unreadOnly)

## Non-Goals (explicit exclusions)

- DO NOT implement webhook relay (needs external endpoints)
- DO NOT implement scheduled reminders /remind (needs scheduling infra)
- DO NOT implement board federation (needs multi-instance sync)
- DO NOT implement reactions/vote system (not selected as top 3)
- DO NOT implement relative timestamps or thread tree display (good ideas, out of scope for this loop)
- DO NOT refactor naming, agent names, or heartbeat logic
- DO NOT change package.json dependencies beyond what FTS5 requires (FTS5 is built into SQLite — no new npm deps)

## Milestone Roadmap (small concrete steps)

Each milestone produces a tangible artifact.

M1 — DB Indexes (quick win, ~1 turn)

- Inspect current queries in db.ts that filter by category/status/author/assigned_to/reply/inbox/bookmark
- Add CREATE INDEX statements to initSchema or a migration file
- Verify indexes appear in `.schema` output
- Artifact: indexes exist, `npm run typecheck` passes

M2 — Schema Migration System (enables M1 cleanly)

- Create `migrations/` directory with `001_indexes.sql`
- Add `schema_version` table
- Modify initSchema to apply pending migrations
- Artifact: `migrations/` exists, initSchema uses it, DB starts clean

M3 — FTS5 Search (search feature)

- Create `messages_fts` virtual table
- Modify createMessage to insert into FTS5; add DELETE trigger for deletes; add INSERT/UPDATE triggers
- Rewrite searchMessages to use FTS5 MATCH
- Artifact: `messageboard_search` returns ranked results without LIKE

M4 — Mentions Tracking (communication feature)

- Create `mentions` table in schema
- Modify `createMessage` to insert into mentions for each @AgentId found
- Modify `createReply` to insert mentions for replies
- Add `messageboard_read_mentions` tool in tools.ts
- Add `/mentions` command in commands.ts
- Artifact: posting with @AgentId creates mention; /mentions shows it

M5 — Integration & Quality Verification (final turn)

- Run `npm run typecheck` — must pass (exit 0)
- Run `./run-tests.sh` — all 4 test files must pass
- Verify `messageboard_search`, `/mentions`, and `/board` work end-to-end
- Commit all changes with message: "loop: implement top 3 messageboard improvements"
- Artifact: passing tests, passing typecheck, clean git log

## Measurable Completion Criteria

Objective check (for --check script):

- [ ] `node --import tsx --test src/__tests__/*.ts` exits 0 (all 4 test files pass)
- [ ] `npm run typecheck` exits 0 (TypeScript clean)
- [ ] DB file `~/.pi/agent/messageboard/board.db` contains `messages_fts` (FTS5 table exists)
- [ ] DB contains `mentions` table with at least 1 row when @AgentId used
- [ ] Indexes exist: check `.indexes` or query `sqlite_master` for index names
- [ ] `src/migrations/` exists and has at least 1 `.sql` file
- [ ] `/mentions` command registered in commands.ts
- [ ] `messageboard_read_mentions` tool registered in tools.ts
- [ ] Git repo has at least 1 commit with message containing "loop:"

Score (0-100): 10 points per checked item above = max 100.

## Quality Standards

- Every file change must leave TypeScript compiling: `npm run typecheck` passes
- Every milestone must leave `node --test` passing (no regression)
- New SQL must use parameterized queries (`?` binds) — never string interpolation
- New commands/tools must follow existing naming (`messageboard_*`, `agent_*`)
- Migration SQL files must be numbered (001_*, 002_*) and include both up/down pairs if possible; minimum is up-only with rollback comment
- GOAL.md, ASSUMPTIONS.md (if needed), PROGRESS.md must be maintained if run exceeds 3 turns
- No new npm dependencies (FTS5 is SQLite native, indexes are SQL)

## Explicit Assumptions

- SQLite in `better-sqlite3` has FTS5 enabled (standard in sqlite >= 3.9; if disabled, loop uses LIKE as fallback and records assumption)
- The `initSchema` function can be extended without breaking existing `board.db` files (assumes `CREATE INDEX IF NOT EXISTS` is safe on existing DBs)
- The agent ID used for testing (`Zeus-a3f2` or test-generated) is sufficient for @mention extraction tests
- The loop model is weaker than the design model — it may miss edge cases, so M5 includes explicit verification steps rather than relying on model judgment alone
- If loop turns exceed 6 turns, a `PROGRESS.md` file must be created summarizing completed milestones and open ones

## Check Command

```bash
node --import tsx --test src/__tests__/names.test.ts src/__tests__/db.test.ts src/__tests__/tools.test.ts src/__tests__/integration.test.ts && npm run typecheck
```

This checks tests + typecheck together (exit 0 = success). For granular score tracking see `check.sh`.

## File References (read before implementing)

- src/db.ts — schema, queries, message/reply/inbox/bookmark storage
- src/commands.ts — /board, /inbox, /mentions (new), /tasks
- src/tools.ts — messageboard_post, messageboard_read, messageboard_search (modify), new mention tools
- src/types.ts — interfaces (may add Mention interface if new table)
- src/stats.ts — uses `(db as any).getDb?.()` hack (reference for M2)
- src/__tests__/db.test.ts — test patterns for DB queries
- src/__tests__/integration.test.ts — end-to-end patterns
- README.md — current feature list (do not add new public docs unless needed for loop)

## Loop Settings Recommendation

Use: `/loop start "Implement top 3 messageboard improvements. Done when: tests pass, features work." --max 8 --check "bash check.sh" --until-done`

This sets an 8-turn cap, uses the check script, and stops when criteria are met.
