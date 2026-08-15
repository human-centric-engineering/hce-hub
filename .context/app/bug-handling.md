# Bug handling

[Phase 2](./planning/phase-2-plan.md)'s second feature. A bug is a **`bug`-kind
`Task` on the feature it broke** — surfaced by `next_task` as a bias, kept off the
feature's completion axis, and glanceable in a project-scoped active-fixes strip.
No Jira, no urgency theatre: a bug is a fix to _pull_, not a crisis. The settled
convention (why a Task, not a Feature or an `Issue` model) lives in
[planning/bug-handling.md](./planning/bug-handling.md); this documents what shipped.

> A bug surfaces while you're mid-phase. You `create_task { kind: 'bug' }` on the
> feature it broke — it doesn't reopen that shipped feature, it floats up your
> `next_task`, and it shows in a pinned "Active fixes" band above the board with a
> breadcrumb back to its origin. Fix it, merge the PR, the task closes — same flow
> as any task.

## The model (`prisma/schema/app.prisma`)

- **`enum TaskKind { feature_work bug enhancement }`** + `Task.kind TaskKind @default(feature_work)`
  — non-null, so existing rows backfill. Records **what the work is** (provenance),
  and since `f-work-kinds` §32 t-79 that is _all_ it records: `enhancement` was added
  for a task-sized improvement to work that already exists, and the accounting moved
  to `Feature.shippedAt` (below). `bug` still drives `next_task`'s bias and the
  open-fixes tally. Still a **closed enum, not a free-form label** — the bar is now
  "every value earns rendering and filtering" rather than "every value drives
  accounting", which still excludes vanity labels. A future organizational-label
  system (many-per-task, behaviour-free) would be a separate model.
- **`Feature.shippedAt`** (§32 t-79) — the completion boundary. `computeFeatureProgress`
  counts only tasks created at or before it, so **any** post-ship task is off the
  completion axis whatever its kind; a null means count everything, which is exactly
  the pre-§32 behaviour. This is what lets an improvement be filed honestly instead of
  disguised as a `bug` to keep a shipped feature's progress bar intact.
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
    work. Deliberate: the active-fixes strip is project-scoped and already shows every
    open bug to everyone, so a bug sweep is a thing you _go and do_, not something
    pushed at you mid-feature.
  - **Known divergence from the target principle.**
    [futures](./planning/futures.md#dynamic-focus-and-prioritisation) states focus
    should be _"bias, not exclusivity"_ — and a hard tier is exclusivity. That is the
    accepted cost of a **static default** chosen for the current posture (heads-down
    product development). When focus becomes _declared_, the tier order is what turns
    into the parameter, and hard tiers should soften into weights. This is why the
    policy is one named function over a ready set rather than a `where` clause.
- **Kind-aware completion** (`lib/projects/feature-progress.ts` ·
  `computeFeatureProgress`) — `bug` tasks are **excluded** from a feature's
  `merged/total/live/blocked` and tallied separately as **`openFixes`**. So a shipped
  feature with an open bug reads "N/N · _M open fixes_", not "N-1/N".
  _Reconciliation:_ a bug **can't** un-ship a feature anyway — `computeFeatureStatus`
  reads stored status + deps only, and `ship_feature` sets `shipped` with nothing
  recomputing it from tasks — so the fix was the _progress count_, not the status
  derivation. Since §32 t-79 this exclusion is the **pre-ship** rule only: past
  `Feature.shippedAt` the date decides and no task counts, whatever its kind.
  - **Every exclusion needs a counterpart** (§32 t-94). `total`/`merged` drop exactly
    two groups — bugs, and work raised after the ship — so each gets a counter:
    `openFixes` and **`openSinceShip`** ("· N new"). That is what makes the accounting
    _closed_, and the closure is asserted directly:
    `unmerged === (total − merged) + openFixes + openSinceShip`. The three terms are
    disjoint and exhaustive over the unmerged tasks, so no open task can be invisible
    **by construction** rather than by vigilance — a future kind, or a new exclusion,
    breaks that test instead of quietly hiding a row.
  - **How the gap was found:** `live`/`blocked` were unsealed precisely to protect the
    §09 "a summary can never disagree with the tasks beneath it" invariant, but they
    key off `active`/`blocked` — so a post-ship enhancement **nobody had started**
    matched no counter at all, and §20 rendered `4/4` with an unmerged fifth row in its
    own table. Since t-89 enhancements are born unassigned, unstarted is their _normal_
    state. Two correct decisions (seal at ship, unclaimed intake) composed into a hole
    neither owned.
  - `live`/`blocked` are **descriptive overlays, not closure terms** — they may overlap
    any term, which has always been true (an active pre-ship task is both `live` and
    part of the outstanding `total`).
- **Ship warning** (`lib/projects/capabilities/ship-feature.ts`) — the soft
  "unmerged tasks" heads-up counts feature-work only (`kind: { not: 'bug' }`), so it
  agrees with the progress bar.

## Surfaces

### MCP / write (t1)

- **`create_task { kind }`** — optional; `'bug'` files a defect, `'enhancement'` an
  improvement to a feature that has **already shipped**, defaulting to
  `'feature_work'`. Owner-tier via the [f-access](./planning/f-access.md) funnel; the
  seed's `functionDefinition` re-syncs on the update branch so MCP advertises `kind`.
  - **The line is _shipped_, not _small_** (§32 t-89): work on an unshipped feature is
    `feature_work` even when it is scope discovered mid-build — an enhancement raised
    before ship is scope, not an afterthought, which is the same rule
    `ship_feature`'s unmerged-task warning already applies.
  - **An `enhancement` is born unassigned** — it is new work on an existing, already
    claimed feature, so the owner says nothing about who should do it. `bug` and
    `feature_work` keep the owner cascade: a bug goes to the most relevant owner and
    is visible to everyone on the active-fixes strip. See
    [task assignment](./task-assignment.md).
- **`update_task { kind }`** (§32 t-79) — re-files a task whose kind was recorded
  wrong. Not hypothetical: before `enhancement` existed, an improvement had to be
  filed as a `bug` to keep it off a shipped feature's bar, so the record contains
  "bugs" that were never defects. Re-filing emits no event — `bug_reported` recorded
  what was believed at creation, and rewriting that would lose the provenance.

### Journal

- A `bug` fires **`bug_reported`** ("reported a bug"); feature-work stays
  `task_created`. Rendered by `describeEvent` across the Log, feature-activity, and
  task-sheet timelines (`components/hub/projects/log/presentation.ts`).

### Plan (t1)

- Each feature row shows **"· N open fixes"** when a shipped/worked feature carries
  open bugs, and **"· N new"** when it carries unmerged work raised after it shipped
  (§32 t-94) — the two counters for the two groups the `N/N` ratio excludes
  (`components/hub/projects/plan/feature-row.tsx`). "New" sits on `--ink-mute`, a step
  under the bug's brick: an improvement is a classification, not a signal.
- A `bug`-kind task in a feature's inset table gets a quiet **"bug"** tag
  (`components/hub/projects/plan/task-row.tsx`).

> **The bug tag is now a _kind_ tag** (f-work-kinds §32 t-88). The four render sites
> below each used to test `kind === 'bug'` on their own, so when `enhancement` joined
> the enum it rendered nowhere. The word, glyph and hue for every kind now come from a
> single **total** `Record<TaskKind, …>` — `TASK_KIND_CUE` in
> `components/hub/projects/kind-tag.tsx` (renamed from `bug-tag.tsx`) — which makes the
> next kind added to the union a compile error rather than a silence on screen.
> `feature_work` maps to `null`: it is the unmarked default, so only work that isn't
> the ordinary case earns a mark. An enhancement sits a step quieter than a bug
> (`--ink-mute` vs the bug's brick) — a classification, not a signal.
>
> **The label is not the kind's name.** An `enhancement` reads **"new"** (owner call):
> at "bug"'s width the two kinds occupy the same visual slot, where an eleven-character
> tag shunts the title right in the row surfaces and truncates it. "New" is looser than
> the kind it stands for — a merged enhancement still reads "new" long after it stopped
> being new — so the tooltip carries the full meaning, and it is the only place the tag
> says _new relative to what_. The exact word is pinned in `kind-tag.test.tsx` alone;
> the four surface tests assert on the tooltip, so the label stays free to change.

### Active-fixes strip (t2)

- A **pinned, project-scoped, self-hiding** band above the Plan/Board body
  (`components/hub/projects/active-fixes-strip.tsx`, mounted in `project-view.tsx`),
  listing every open bug across the project with an origin breadcrumb
  (`f-journal · Foundations ↩`) and a click-through to the fix task. A **reference**
  band on a different axis (fixes from any phase) — it never pulls the origin feature
  forward, and being project-scoped it survives the no-active-phase case.
- **Read:** rides the always-loaded project payload
  (`getProjectForUser.activeFixes`, `lib/projects/consumer.ts`) rather than a new
  endpoint — the strip shows on both Plan and Board, whose own payloads are
  tab-specific.

### Board (t2)

- A `bug` card shows a quiet **bug** cue (a muted glyph, no red, no pulse — a fix, not
  a crisis) in the card meta row (`components/hub/projects/board/task-card.tsx`). The
  card already carries its origin feature ref, so a bug reads apart from feature-work.
  The Board keeps its **own** register here — `KindMark` sits with the Blocked and
  Collision marks rather than borrowing the row surfaces' tag — and takes only the
  vocabulary from `TASK_KIND_CUE`, so the two can differ in weight but never in wording.

### Task sheet + feature page (t3)

- The same quiet **kind** tag rides the **task sheet** header (next to the status pill,
  `components/hub/projects/task-sheet/task-sheet.tsx`) and the **feature page's** task
  rows (`components/hub/projects/feature-view/feature-task-list.tsx`), so a defect reads
  apart from feature-work on **every** task-render surface — glanceable while working it,
  and legible historically once it's merged. The feature page is where the enhancement
  gap showed: a post-ship enhancement lands in a shipped feature's task table, outside
  its `N/N` roll-up (completion is sealed at `Feature.shippedAt`), so untagged it read
  as an unaccounted-for extra row. `kind` is threaded through the single-task
  read (`task-detail.ts`) and the feature read (`feature-detail.ts`) to feed them.
- Verifying the bug UX end-to-end here (t3) also closed the sheet's stale-surface gap:
  Start / Complete / Link-PR (and reassign) now refresh the Plan/Board behind the sheet,
  so working a bug from the sheet updates the views without a manual reload.

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
