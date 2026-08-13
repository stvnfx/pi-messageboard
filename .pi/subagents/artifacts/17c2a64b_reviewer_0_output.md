## Review

### Correct: what is already good
- Clean SQLite schema with WAL mode and foreign keys. Solid foundation.
- Tests use in-memory DB with real schema — good practice.
- Integration tests exercise the full agent flow end-to-end.
- Names module is self-contained, deduplicates correctly.
- `parseTags` handles JSON parse failures gracefully.

---

### Findings — ranked by severity

**1. Duplicate tool + command surface (medium — YAGNI)**
- `commands.ts` reimplements every tool as a slash command with slightly different formatting. `/board` duplicates `messageboard_read`, `/inbox` duplicates `agent_read_inbox`, `/who` duplicates `agent_list_online`, `/tasks` duplicates filtering logic, `/profile` duplicates `agent_profile`, `/bookmarks` duplicates bookmark listing, `/policy` duplicates `agent_set_policy`.
- Each command handler is ~15 lines that could be eliminated if the tool layer handled both agent-initiated and user-initiated calls. Commands exist but are thin wrappers around the same DB calls with different output formatting.
- Suggestion: Either make commands call tools directly (shared formatting function), or drop commands entirely if tools cover all use cases. Having two parallel code paths for the same operations is a maintenance burden.

**2. `getThreadedReplies` is identical to `getReplies` (db.ts:182-189 vs db.ts:172-177)**
- `getReplies` and `getThreadedReplies` execute the exact same SQL query, just with whitespace differences. `getThreadedReplies` doesn't actually implement threading (no recursive CTE, no tree ordering).
- Suggestion: Remove `getThreadedReplies`. It's dead code masquerading as a feature. If threading is needed later, implement it with a recursive CTE.

**3. `inbox_policy` field is stored but never enforced (db.ts:55, tools.ts throughout)**
- Every agent has `inbox_policy` (board/direct/both), `/policy` command and `agent_set_policy` tool let you set it, `getAgent` returns it. But nowhere in the codebase does any logic check `inbox_policy` before delivering a message or DM. The field is write-only — stored, displayed, never consulted.
- Suggestion: Either enforce it in `sendDirectMessage`/`createMessage` delivery, or remove the field and its UI. A policy that's never checked is worse than no policy — it gives false confidence.

**4. `bookmarks` table exists but has no useful query path (db.ts:55-60, tools.ts)**
- Bookmarks are stored and retrievable via `/bookmarks` command and `messageboard_bookmark` tool, but `messageboard_read` doesn't show bookmark status on messages, there's no way to remove bookmarks via a tool (only `removeBookmark` exists in db.ts but no tool exposes it), and the feature adds 3 DB operations + 1 tool + 1 command for marginal value.
- Suggestion: If bookmarks are wanted, expose `removeBookmark` via a tool. If not, cut the table, tool, and command.

**5. `Mention` type defined but never used (types.ts:50-54)**
- The `Mention` interface is exported but never imported or used anywhere. Mentions are handled inline in `tools.ts:68-78` using `extractMentions` + ad-hoc agent lookup.
- Suggestion: Delete the `Mention` type. If mentions need persistence, that's a future feature.

**6. `isValidName` exported but never called outside tests (names.ts:62-64)**
- Only used in `names.test.ts`. No runtime code validates names.
- Suggestion: Keep it — it's one line and useful for tests. But note it's test-only currently.

**7. `MessageStatus` and `InboxPolicy` type exports unused outside types.ts (types.ts:58-60)**
- `Category` is used in `db.ts`. `MessageStatus` and `InboxPolicy` are only referenced within `types.ts` itself and `db.ts` parameter types. Not a problem per se, but `InboxPolicy` is particularly pointless given finding #3.

**8. Stats module reaches into `db` internals via `(db as any).getDb?.()` (stats.ts:17)**
- Stats bypasses the public `db` API and casts to `any` to access the raw SQLite handle. This is fragile — if `db.ts` changes its internal structure, `stats.ts` silently breaks.
- Suggestion: Export a `countMessages()`, `countReplies()` etc. from `db.ts`, or expose `getDb` properly. The `as any` cast is a code smell.

**9. `NORSE_MYTHOLOGY` has duplicate "Valkyrie" (names.ts:40 vs names.ts:28)**
- Deduped at runtime via `new Set()` on `ALL_NAMES`, so no bug. But the source array has a literal duplicate.
- Suggestion: Remove the second "Valkyrie" from the array. Minor.

**10. `generateSuffix` only uses first 4 chars of session ID (names.ts:66-68)**
- Works but weakens uniqueness. Session IDs are long hex strings, so 4 chars = 16 bits of entropy. With ~120 names, collision probability is low for small agent counts but rises fast. Not urgent for a prototype.
- Suggestion: `ponytail:` comment noting the collision ceiling is fine for prototype use.

**11. `recentActivity` in stats queries all messages+replies but `formatStats` ignores it (stats.ts:86-93, stats.ts:96-109)**
- The `recentActivity` field is computed in `getBoardStats()` (UNION query, limit 10) but `formatStats()` never renders it.
- Suggestion: Either display it in the output or stop computing it. Free queries add up.

**12. Message formatting is duplicated across tools.ts (tools.ts:95-102 vs tools.ts:161-168)**
- `messageboard_read` and `messageboard_search` have identical message formatting blocks.
- Suggestion: Extract `formatMessage(m: Message): string`.

**13. Error response pattern is duplicated ~6 times (tools.ts)**
- The "not found" pattern `return { content: [{ type: "text", text: "X not found." }], details: {}, isError: true }` repeats across `messageboard_reply`, `messageboard_close`, `messageboard_bookmark`, `messageboard_read_thread`, `agent_send_dm`, `agent_profile`.
- Suggestion: One helper: `notFound(name: string)` → return object.

**14. Markdown transformer does almost nothing (index.ts:68-72)**
- Only bolds `@AgentId` patterns in assistant messages. The regex is hardcoded and only matches a specific format. This runs on every assistant message.
- Suggestion: Low value, low risk. Keep or cut — won't miss it either way.

---

### Summary of cuts by effort

| Cut | Effort | Impact |
|-----|--------|--------|
| Delete `getThreadedReplies` | 2 min | Removes dead code |
| Delete `Mention` type | 1 min | Removes unused export |
| Fix duplicate "Valkyrie" | 1 min | Clean source |
| Delete `recentActivity` or render it | 5 min | Stop computing unused data |
| Extract `formatMessage` helper | 10 min | Dedup across tools |
| Extract `notFound` helper | 5 min | Dedup error returns |
| Expose `getDb` or add count methods | 15 min | Remove `as any` hack |
| Remove/reduce commands layer | 30 min | Biggest structural simplification |
| Enforce or remove `inbox_policy` | 20 min | Remove false feature |
| Add `removeBookmark` tool or cut bookmarks | 15 min | Complete or remove feature |

```
acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Returned 14 concrete findings with file:line references and suggested simplifications"
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Review-only task. No files modified. All findings based on direct code inspection."
  ],
  "residualRisks": [
    "inbox_policy is write-only — no enforcement path exists. False confidence risk.",
    "stats.ts uses (db as any) to access internals — fragile if db.ts changes",
    "generateSuffix collision probability rises with agent count (~16 bits entropy)"
  ],
  "noStagedFiles": true,
  "diffSummary": "No changes made — review-only task",
  "reviewFindings": [
    "medium: src/commands.ts (entire file) - 7 commands duplicate tool logic with different formatting. Either make commands call tools or cut commands layer.",
    "medium: src/db.ts:182-189 - getThreadedReplies is identical to getReplies (db.ts:172-177). Dead code.",
    "medium: src/db.ts:55, src/tools.ts:agent_set_policy - inbox_policy stored but never enforced anywhere in delivery logic.",
    "low: src/types.ts:50-54 - Mention type defined, exported, never imported.",
    "low: src/names.ts:40 - NORSE_MYTHOLOGY has duplicate 'Valkyrie' (also at line 28).",
    "low: src/stats.ts:17 - getBoardStats uses (db as any).getDb?.() to bypass public API.",
    "low: src/stats.ts:86-93 - recentActivity computed but formatStats (line 96) never renders it.",
    "low: src/tools.ts:95-102 vs 161-168 - Message formatting duplicated across messageboard_read and messageboard_search.",
    "low: src/tools.ts (6 locations) - Error 'not found' response pattern duplicated across 6 tools.",
    "info: src/index.ts:68-72 - Markdown transformer is minimal, low value but low risk.",
    "info: src/db.ts (bookmarks section) - removeBookmark exposed in db.ts but no tool wraps it."
  ],
  "manualNotes": "Biggest structural win: eliminate the commands.ts layer by making commands delegate to shared formatting functions used by tools. Second: decide whether inbox_policy is a real feature (enforce it) or cut it (remove field + UI). The codebase is clean for a prototype — these are YAGNI and duplication issues, not bugs."
}
```