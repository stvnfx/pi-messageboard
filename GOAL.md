# Goal: Fix pi-messageboard bugs and reliability issues

## Refined Objective

Make pi-messageboard work reliably in live Pi sessions. The extension loads and registers 24 tools + 11 commands in isolation, but has runtime issues when loaded by Pi.

## Bugs Found

### Bug 1: Extension may not load in Pi

- `index.ts` wrapper exists, symlink exists, npm package includes it
- All commands work when tested manually
- Pi may not follow symlinks or may have load order issues
- Need to verify Pi actually loads the extension by checking `/reload` output

### Bug 2: `getMyAgentId()` throws before session_start

- `src/mb/loop.ts:448` and `src/mb/spawn.ts:460` use `require("../tools.js")`
- If tools.js throws (agent not registered), getMyAgentId crashes the tool
- The fallback `catch` block generates a generic ID, losing context

### Bug 3: `getMyAgentId()` uses CommonJS require in ESM

- `require("../tools.js")` may fail in ESM context
- Should use dynamic `import()` or pass agent ID through context

### Bug 4: Two separate DBs may cause confusion

- `board.db` (main messageboard) and `mb.db` (subagent/loop) are separate
- Agents registered in mb.db don't appear in board.db's agents table
- FK constraints fail when posting messages with mb.db agent IDs

### Bug 5: `/mb loop` command just says "use the tool"

- Doesn't actually start a loop
- Should either start a loop directly or provide clearer guidance

### Bug 6: `pi.sendMessage()` in `/mb prepare` may not work

- Command handlers don't have access to `pi` via closure in mb/index.ts
- The `pi` variable is captured in the outer function but the handler is registered inside

## Scope

1. Fix extension loading in Pi (test with `/reload`)
2. Fix getMyAgentId to not crash on missing agent
3. Unify DB or fix FK constraints between board.db and mb.db
4. Make `/mb loop` command actually usable
5. Verify `/mb prepare` triggers agent correctly

## Non-Goals

- Adding new features
- Refactoring the entire DB schema
- Changing the tool interface

## Measurable Completion Criteria

- [ ] `/reload` in Pi shows "messageboard" in loaded extensions
- [ ] `/mb status` works without errors
- [ ] `mb_loop` tool starts a loop without crashing
- [ ] `mb_spawn` tool creates agent without FK errors
- [ ] `/mb prepare` triggers agent to write GOAL.md
- [ ] All 30 unit tests still pass

## Milestones

### Milestone 1: Diagnose and fix extension loading

- Check Pi extension discovery logs
- Verify index.ts is loaded
- Fix any import errors

### Milestone 2: Fix getMyAgentId crash

- Make it return a fallback ID without throwing
- Or register agent properly before tools are called

### Milestone 3: Fix DB integration

- Either use single DB or register agents in both
- Fix FK constraint violations

### Milestone 4: Verify full loop workflow

- Test mb_loop → mb_loop_update → mb_loop_stop
- Test /mb prepare → agent writes GOAL.md

## Assumptions

1. Pi extension discovery works with symlinks
2. The extension API (registerTool, registerCommand, sendMessage) works as documented
3. better-sqlite3 works in Pi's runtime environment
