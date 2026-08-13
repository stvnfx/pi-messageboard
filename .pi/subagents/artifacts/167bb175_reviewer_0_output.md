All files read. Here's the full review.

## Review

### Correct (what is already good)
- **No SQL injection anywhere.** All queries use parameterized `?` placeholders — every function in `db.ts` passes values as bind parameters, never string-interpolated into SQL.
- **Schema uses `IF NOT EXISTS` and `ON CONFLICT` UPSERT.** `registerAgent` correctly handles re-registration without duplicates.
- **WAL mode + foreign keys enabled.** Good SQLite hygiene at `db.ts:27-28`.
- **Heartbeat staleness is computed correctly.** `getOnlineAgents` marks stale agents offline atomically within a single `better-sqlite3` call chain.
- **Mention deduplication works.** `extractMentions` uses `new Set()` at `db.ts:421`.
- **Tool error handling for missing entities.** `messageboard_reply`, `messageboard_close`, `messageboard_bookmark`, `messageboard_read_thread` all return `isError: true` when the target message doesn't exist.
- **Thread display indentation.** `tools.ts:462` distinguishes root replies from threaded replies.

---

### Ranked Findings

**#1 — Suffix/mention regex mismatch (MEDIUM)**
`names.ts:145-147` — `generateSuffix` does `sessionId.slice(0, 4)`, which is NOT guaranteed to produce hex chars. The comment says "hex" but the code doesn't enforce it.
`db.ts:415` — `extractMentions` uses regex `/@([A-Z][a-z]+-[a-f0-9]{4})/g` which requires exactly 4 hex chars `[a-f0-9]`.
`index.ts:59` — Same regex duplicated for markdown highlighting.
If any session ID starts with non-hex chars (e.g. `"xyz1..."`), the agent ID `Zeus-xyz1` becomes unmentionable — the regex won't match it.
The test at `names.test.ts:17` uses input `"abc123def456"` which happens to start with hex, giving false confidence. The test name says "returns 4-char hex string" but the function doesn't guarantee that.

**#2 — Cross-thread reply linking (MEDIUM)**
`db.ts:286-292` — `createReply` accepts `parentReplyId` and inserts it with only a FK check on `replies(id)`. No validation that the parent reply belongs to the same `messageId`.
`tools.ts:172-181` — The `messageboard_reply` tool validates `message_id` exists but never checks that `parent_reply_id` belongs to that same message.
SQLite FK only ensures the referenced reply row exists — not that it's in the same thread. An attacker (or confused agent) can nest a reply from message A under a reply from message B, creating a cross-thread link.

**#3 — LIKE wildcard injection in tag/search (LOW)**
`db.ts:246-247` — Tag filter: `tags LIKE ?` with `%${opts.tag}%`. The `%` and `_` in `opts.tag` are not escaped, so a tag value of `"%"` matches all rows, and `"_"` matches any single char.
`db.ts:257-258` — `searchMessages` has the same issue: `%${query}%` passed as LIKE value. Characters `%`, `_`, `\` in user queries aren't escaped. Not SQL injection (still parameterized), but expands search scope unexpectedly.

**#4 — No input validation on message/DM fields (LOW)**
`db.ts:173-193` — `createMessage` accepts empty `subject` and `body` without validation.
`db.ts:330-336` — `sendDirectMessage` same: empty subject/body accepted.
`db.ts:286-292` — `createReply` accepts empty body.
TypeScript types don't enforce non-empty strings. The tool layer relies on LLM to provide values, but a direct API caller can post blank messages.

**#5 — `stats.ts` accesses private `getDb` via cast (LOW)**
`stats.ts:21` — `const d = (db as any).getDb?.() ?? null` reaches into `db.ts`'s private module-scoped `getDb` function via a type-unsafe cast. If `db.ts` renames or removes `getDb`, this silently returns null and all stats return zeros. Fragile coupling.

**#6 — Unused exported functions (NOTE)**
`db.ts:121` — `getAllAgents` never called outside db.ts.
`db.ts:270` — `assignMessage` never called outside db.ts.
`db.ts:363` — `markAllAsRead` never called outside db.ts.
`db.ts:390` — `removeBookmark` never called outside db.ts.
Dead code that could confuse maintainers.

**#7 — `resetAll` has no guard (LOW)**
`db.ts:400-403` — Exported `resetAll()` deletes all data. No permission check, no confirmation. Used only in test setup (`tools.test.ts:7`) but accessible to any consumer of the module.

**#8 — Heartbeat timer unhandled errors (LOW)**
`index.ts:42-44` — `setInterval` callback calls `db.updateHeartbeat(agentId)` with no try/catch. If the DB is closed during shutdown race, or the agent ID is invalid, this throws unhandled into the event loop.

**#9 — DM delivery is polling-only (NOTE/by design)**
No push notification for DMs. Recipient discovers messages only on `session_start` (unread count) or explicit `agent_read_inbox` call. Agents that never check inbox accumulate unread messages indefinitely. This is a polling model by design, but worth documenting.

**#10 — Thread display is flat, not recursive (NOTE)**
`db.ts:312-317` — `getThreadedReplies` returns a flat list ordered by timestamp. `tools.ts:462` shows `└─` for any reply with a `parent_reply_id`, but doesn't compute depth. Deep nesting (A→B→C) displays as flat with single-level indentation, losing the tree structure visually.

---