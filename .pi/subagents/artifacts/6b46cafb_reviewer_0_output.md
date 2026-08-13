## Review

### Correct (what's good)
- **db.test.ts**: Proper `beforeEach` isolation per describe block, temp dir cleanup in `after()`, in-memory DB for speed.
- **names.test.ts**: Clean, focused, tests both positive and negative paths.
- **Integration tests**: Real end-to-end flow covering the main happy paths.
- **tools.test.ts**: `extractMentions` dedup tested.

---

### Ranked Findings (severity → detail)

#### 1. 🔴 Blocker: Integration tests assert almost nothing real
`integration.test.ts:33,60,76,93,111,128,147,164` — 8 of 8 tests use `assert.ok(output.length > 0)` or extremely loose checks like `output.includes("Agent")`. These pass even if the tool silently does the wrong thing. Only 3 tests (`:49`, `:99`, `:134`) check for specific content. A tool returning "Error: something broke" would pass `output.length > 0`.

#### 2. 🔴 Blocker: Integration tests have sequential state dependency
`integration.test.ts:28-30` — No `beforeEach` cleanup. Test "agent B can read" depends on test "agent A can post" having run first. If any test fails, all downstream tests fail spuriously. Test ordering is implicit, not guaranteed by `node:test`.

#### 3. 🔴 Blocker: Zero test coverage for `commands.ts`
`commands.ts` — 8 commands (`board`, `inbox`, `who`, `tasks`, `bookmarks`, `profile`, `policy`, `stats`) registered but **never tested**. `policy` has input validation (`:64-67`) that's untested.

#### 4. 🟡 High: Zero test coverage for `stats.ts`
`stats.ts` — `getBoardStats()` and `formatStats()` completely untested. `formatStats` has string interpolation logic; `getBoardStats` has a null-db fallback path (`:14-26`).

#### 5. 🟡 High: Zero test coverage for `index.ts` lifecycle
`index.ts` — `session_start`/`session_shutdown` handlers, heartbeat timer setup/clear, markdown transformer, unread DM notification on connect — all untested.

#### 6. 🟡 High: `tools.test.ts` tests DB functions, not tool handlers
`tools.test.ts:15-18` — Comment admits it: "We test the DB operations that the tool uses." The actual `execute` functions in `tools.ts` (which contain validation, error returns, notification logic, mention extraction) are untested at the unit level.

#### 7. 🟡 High: Missing db functions from test coverage
Several `db.ts` export functions have zero unit tests:
- `removeBookmark` — no test anywhere
- `assignMessage` — no test anywhere
- `markAllAsRead` — no test anywhere
- `getAllAgents` — no test anywhere
- `updateAgentInboxPolicy` — no test anywhere
- `getDirectMessage` — no test anywhere
- `getThreadedReplies` — no test anywhere (vs `getReplies` which is tested)

#### 8. 🟡 Medium: `tools.test.ts` shared mutable state across describe blocks
`tools.test.ts:12` — `db.resetAll()` runs once at module scope. No `beforeEach` in any describe block. Agents/messages accumulate across test blocks. Test "agent_list_online" (`:97`) uses `>= 1` instead of exact count, likely working around this.

#### 9. 🟡 Medium: No `getMessages` filter combination tests
`db.ts:106-130` — `getMessages` supports 6 filter params (`category`, `status`, `author`, `tag`, `assignedTo`, `limit`). Zero tests for: tag filtering, assignedTo filtering, limit, status filtering, combined filters, or empty results.

#### 10. 🟡 Medium: No edge case / defensive tests
No tests for:
- Empty string inputs (`subject: ""`, `body: ""`)
- Very long strings (body > 200 chars — the truncation at `tools.ts:91` is untested)
- Special characters / SQL injection attempts in search (`searchMessages` uses LIKE with user input)
- Duplicate bookmark insertion (`addBookmark` uses `INSERT OR IGNORE` — untested idempotency)
- `getMyAgentId()` when `myAgentId` is null (should throw)

#### 11. 🟢 Low: `names.ts` — `generateSuffix` edge cases untested
`names.ts:52-54` — Returns `sessionId.slice(0, 4)`. No test for empty string input, short string (<4 chars), or non-hex input.

#### 12. 🟢 Low: Integration test subscriber leak
`integration.test.ts:35-41` — `agentA.subscribe()` called in every test but never unsubscribed. Multiple listeners accumulate on the same session. Could cause duplicate output capture.

#### 13. 🟢 Low: `db.test.ts` doesn't test the production `db.ts` module
`db.test.ts` duplicates the schema (`initTestSchema`) and test helpers instead of importing from `db.ts`. If schema drifts between test and production, tests pass while production breaks. `tools.test.ts` does import from `db.ts`.

#### 14. 🟢 Low: `db.test.ts` `resetDb` uses DELETE without testing cascade
`db.test.ts:63-65` — DELETE without `CASCADE` — orphaned FK references possible if DELETE order changes.

---