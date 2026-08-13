# Goal: Improve the Web UI

## Refined objective

Improve the local messageboard web dashboard.

Make the dashboard clear, useful, responsive, and safe for daily agent communication.
Keep the dashboard focused on messages, replies, inbox data, and agent presence.

## Scope

- Improve the dashboard layout and visual hierarchy.
- Improve message, reply, inbox, and agent views.
- Improve empty states and error states.
- Improve refresh behavior and user feedback.
- Keep the dashboard local to `127.0.0.1`.
- Update web dashboard tests when behavior changes.
- Update `README.md` when the dashboard behavior or commands change.

## Non-goals

- Do not add subagent, worker, loop, or orchestration features.
- Do not add remote hosting or network access.
- Do not add authentication changes unless required to preserve local safety.
- Do not replace SQLite storage.
- Do not change messageboard tool names or their input contracts.
- Do not add a frontend framework or a new runtime dependency without a clear need.
- Do not redesign unrelated database or agent lifecycle code.

## Measurable completion criteria

1. `src/web.ts` remains a self-contained local dashboard.
2. The dashboard displays board messages, replies, inbox messages, and agent status.
3. The dashboard has clear navigation and usable empty states for each view.
4. Refresh and dashboard actions show a usable result or an error state.
5. The dashboard remains usable at desktop and narrow viewport widths.
6. User-controlled message content remains escaped before HTML insertion.
7. The web dashboard test passes.
8. TypeScript type checking passes.
9. README documentation matches the final dashboard behavior.
10. Each milestone leaves a small, reviewable commit.

## Milestones

### 1. Baseline and plan

- Run the goal check.
- Read `src/web.ts`, `src/__tests__/web.test.ts`, and `README.md`.
- Record the current UI limitations before editing.

### 2. Structure and navigation

- Improve page structure and headings.
- Make the active view clear.
- Keep all four communication views available.
- Preserve the existing local API routes.

### 3. Data presentation

- Improve message and reply readability.
- Improve inbox and agent status presentation.
- Add useful empty states.
- Keep long content bounded and readable.

### 4. Interaction and resilience

- Improve refresh feedback.
- Handle failed API requests without silent failure.
- Keep destructive actions confirmed.
- Verify HTML escaping for message content and identifiers.

### 5. Responsive quality

- Test narrow and wide layouts.
- Remove clipping, overflow, and unreadable controls.
- Keep controls accessible by keyboard where practical.

### 6. Verification and documentation

- Add or update focused web tests.
- Run the goal check and typecheck.
- Update README dashboard instructions.
- Commit the final focused changes.

## Quality standards

- Use simple TypeScript and browser APIs.
- Prefer small changes over new abstractions.
- Keep user text escaped.
- Keep the server bound to `127.0.0.1`.
- Do not hide test failures.
- Keep commits focused and descriptive.
- Do not commit database files, logs, or generated artifacts.

## Assumptions

- The dashboard is used by agents on the same machine as Pi.
- The existing `/api/state` and `/api/action` routes remain sufficient.
- SQLite remains the source of truth.
- Browser support includes modern JavaScript, CSS grid, and `fetch`.
- Visual review can be performed by starting the dashboard in a Pi session.

## Goal check

Run:

```bash
./check.sh
```

The script prints a score and exits with status `0` when the baseline checks pass.
