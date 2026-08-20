# Bug handling

[Phase 2](./planning/phase-2-plan.md)'s second feature. A bug is a **`bug`-kind
`Task` on the feature it broke** — surfaced by `next_task` as a bias, kept off the
feature's completion axis, and glanceable in a project-scoped active-bugs strip.
No Jira, no urgency theatre: a bug is a fix to _pull_, not a crisis. The settled
convention (why a Task, not a Feature or an `Issue` model) lives in
[planning/bug-handling.md](./planning/bug-handling.md); this documents what shipped.

> A bug surfaces while you're mid-phase. You `create_task { kind: 'bug' }` on the
> feature it broke — it doesn't reopen that shipped feature, it floats up your
> `next_task`, and it shows in a pinned "Active bugs" band above the board with a
> breadcrumb back to its origin. Fix it, merge the PR, the task closes — same flow
> as any task.

## The model (`prisma/schema/app.prisma`)

- **`Task.kind = 'bug'`** — a defect is a kind of task, not a model of its own. The
  enum, the `Feature.shippedAt` completion boundary and the counters a bug feeds are
  the general accounting model: **[work kinds](./work-kinds.md)**. What matters here
  is that a `bug` is **off its feature's completion axis** — an open bug on a shipped
  feature reads `N/N · M open bugs`, never `N-1/N`.
- **`ProjectEventKind.bug_reported`** — a reported bug journals distinctly from
  `task_created`, so "which shipped work generates defects" stays queryable.

## Enforcement — three surfaces

- **`next_task` bias** (`lib/projects/next-task-pick.ts` · `pickBiasedTask`) — among
  the caller's _pullable_ tasks (deps merged, oldest-ready order) a `bug` is
  preferred over feature-work of **equal readiness**. A bias, never an override: a
  dependency-blocked bug isn't pullable, so it's never chosen. Pulled, not pushed.
  - **Since f-work-kinds §32 t-90 the bias runs _within a focus tier_**, not across
    the whole ready set. `next_task`'s pool is now your work **plus the commons** (the
    unclaimed pool t-89 made real), and `pickFocusedTask` offers own work first — so
    an unclaimed bug on somebody else's feature does **not** interrupt your own ready
    work. Deliberate: the active-bugs strip is project-scoped and already shows every
    open bug to everyone, so a bug sweep is a thing you _go and do_, not something
    pushed at you mid-feature.
  - **Known divergence from the target principle.**
    [futures](./planning/futures.md#dynamic-focus-and-prioritisation) states focus
    should be _"bias, not exclusivity"_ — and a hard tier is exclusivity. That is the
    accepted cost of a **static default** chosen for the current posture (heads-down
    product development). When focus becomes _declared_, the tier order is what turns
    into the parameter, and hard tiers should soften into weights. This is why the
    policy is one named function over a ready set rather than a `where` clause.
- **Kept off completion** — a `bug` is excluded from its feature's
  `merged/total/live/blocked` and tallied separately as **`openBugs`**, so an open bug
  never makes a shipped feature read `N-1/N`. `openBugs` spans the whole set, pre- and
  post-ship: an open bug is open whenever it was raised. The counters it belongs to,
  and the closure that keeps them honest, are in
  [work kinds](./work-kinds.md#the-accounting-is-closed).
  _Reconciliation:_ a bug **can't** un-ship a feature anyway — `computeFeatureStatus`
  reads stored status + deps only — so the fix was the _progress count_, never the
  status derivation.
- **Ship warning** (`lib/projects/capabilities/ship-feature.ts`) — the soft
  "unmerged tasks" heads-up counts feature-work only (`kind: { not: 'bug' }`), so it
  agrees with the progress bar.

## Surfaces

### MCP / write (t1)

- **`create_task { kind: 'bug' }`** files a defect on the feature it broke; a bug keeps
  the **owner cascade** (it goes to the most relevant owner and is visible to everyone
  on the active-bugs strip), unlike an `enhancement`. Owner-tier via the
  [f-access](./planning/f-access.md) funnel. The kind vocabulary and the rest of the
  write surface are in [work kinds](./work-kinds.md#mcp).

### Journal

- A `bug` fires **`bug_reported`** ("reported a bug"); feature-work stays
  `task_created`. Rendered by `describeEvent` across the Log, feature-activity, and
  task-sheet timelines (`components/hub/projects/log/presentation.ts`).

### Plan (t1)

- Each feature row shows **"· N open bugs"** when a shipped/worked feature carries
  open bugs (`components/hub/projects/plan/feature-row.tsx`), beside the sealed ratio.
  The other markers on that line, and the rule that keeps them from double-counting one
  task, are in [work kinds](./work-kinds.md#where-it-renders).
- A `bug`-kind task gets a quiet **"bug"** tag wherever tasks render — one cue from the
  shared `TASK_KIND_CUE`, not a bug-specific control; see
  [work kinds](./work-kinds.md#where-it-renders).

### Active-bugs strip (t2)

- A **pinned, project-scoped, self-hiding** band above the Plan/Board body
  (`components/hub/projects/active-bugs-strip.tsx`, mounted in `project-view.tsx`),
  listing every open bug across the project with an origin breadcrumb
  (`f-journal · Foundations ↩`) and a click-through to the bug. A **reference**
  band on a different axis (bugs from any phase) — it never pulls the origin feature
  forward, and being project-scoped it survives the no-active-phase case.
- **Read:** rides the always-loaded project payload
  (`getProjectForUser.activeBugs`, `lib/projects/consumer.ts`) rather than a new
  endpoint — the strip shows on both Plan and Board, whose own payloads are
  tab-specific.

### Board, task sheet + feature page (t2/t3)

- A bug reads apart from feature-work on **every** task-render surface — the Board card,
  the task sheet header, the feature page's rows and the Plan row — so a defect is
  glanceable while it's being worked and legible historically once merged. All four take
  their cue from the shared `TASK_KIND_CUE`; see
  [work kinds](./work-kinds.md#where-it-renders).
- Verifying the bug UX end-to-end (t3) also closed the sheet's stale-surface gap: Start /
  Complete / Link-PR (and reassign) refresh the Plan/Board behind the sheet, so working a
  bug from the sheet updates the views without a manual reload.
- **Bugs can be hidden from the Board's Assigned column** (a per-viewer, per-project
  toggle in the column header, persisted in `localStorage`, **default showing**). Bugs
  keep the owner cascade, so they arrive assigned and accumulate there, crowding out work
  someone actually chose. **Assigned only** — a bug in the Active column is work in
  progress and stays visible. The column **count keeps the true total**; the number
  hidden rides on the toggle instead, because a count that moves with a display filter
  is the same quiet lie the `N/N` roll-up was fixed to stop telling.

## The standing "Platform / Maintenance" feature

An orphan/infra bug (a shell/nav defect belonging to no single feature) hangs on a
**standing "Platform / Maintenance" feature** per project — a plain feature, no
schema, **adopted on demand** (created when the first orphan bug appears), not
seeded.

## Not (yet) here

- A **first-class `Issue`/`Bug` model** (standalone from features) is the heavier
  alternative — deferred until it earns it. Onboarding Sunrise's real GitHub issues
  (some tagged `bug`) is what will pressure-test whether it's needed.
- **Priority as a hard field.** Priority is a `next_task` bias, not a stored flag;
  `help-wanted` is the escape valve when an owner can't get to a bug.
