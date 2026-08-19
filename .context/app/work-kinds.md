# Work kinds and completion accounting

What a task **is** (`Task.kind`), what a feature's completion **counts** (the
`Feature.shippedAt` boundary), and how the two are kept from lying to each other.

Applies to every task. `bug` is one kind of three and has behaviour of its own —
`next_task` bias, the active-fixes strip, the standing Platform feature — which lives
in [bug handling](./bug-handling.md).

## The two facts a task carries

`Task.kind` records **what the work is** — provenance, nothing else. It used to also
decide **whether the work counts toward its feature's completion**, and welding the
two meant a task-sized improvement on a shipped feature had to be filed as a `bug` to
avoid denting the progress bar — falsifying the provenance the model exists for.

Completion now hangs off a date, not the enum:

- **`enum TaskKind { feature_work bug enhancement }`**, `Task.kind` non-null,
  `@default(feature_work)`.
  - **`feature_work`** — building the feature. The unmarked default.
  - **`bug`** — a defect, filed on the feature it broke. Drives `next_task`'s bias and
    the open-fixes tally; see [bug handling](./bug-handling.md).
  - **`enhancement`** — a task-sized improvement to a feature that has **already
    shipped**.
  - A **closed enum, not a free-form label.** The bar is _"every value earns rendering
    and filtering"_. A many-per-task, behaviour-free labelling system would be a
    separate model.
- **`Feature.shippedAt`** — the completion boundary, stamped by `ship_feature` in the
  same transaction as `status: 'shipped'`. `computeFeatureProgress` counts only tasks
  created **at or before** it, so **any** post-ship task is off the completion axis
  whatever its kind — which is what makes a future kind safe by default. A `null`
  counts everything (unshipped features, and any feature whose date couldn't be
  resolved) — the failure mode is "counts too much", never "reads complete when it
  isn't".

## When a task landed

**`Task.mergedAt`** — stamped by `complete_task` in the same transaction as
`status: 'merged'`. It is the source of truth for _when a task landed_; read it rather
than the `task_merged` journal event.

- **`null` means "merged before we tracked it", not "unmerged".** Merge instants used
  to exist only as the `task_merged` event, and §19's cutover imported most of the
  Hub's own history before that stream existed — **34 of 47** merged tasks had no
  event when the column was added. Those rows are honestly null rather than given an
  invented timestamp. **Any read must handle it**: sort it oldest (which it is), never
  drop the row.
- **Never moved once set.** The stamp is guarded by a SQL predicate
  (`updateMany({ where: { mergedAt: null } })`), so two concurrent completions can't
  overwrite each other — Postgres re-evaluates the predicate after taking the row
  lock and the loser writes nothing. An already-merged task with a null `mergedAt` is
  deliberately **not** back-stamped, even when a webhook arrives to attribute the
  merger: `now()` is not when it landed.
- **`Feature.shippedAt` works the same way** and carries the same guarantee — _first
  ship wins_, enforced by the same predicate. `ship_feature` is idempotent and
  re-runnable (a corrected narrative, an agent retrying), and re-stamping would move
  the completion boundary forward and pull post-ship work back inside the bar.

The two together are the model's lifecycle timestamps, alongside
`Phase.startedAt`/`completedAt`.

### The line is _shipped_, not _small_

Work on an **unshipped** feature is `feature_work` even when it is scope discovered
mid-build: an enhancement raised before ship is scope, not an afterthought.
`ship_feature`'s unmerged-task warning applies the same rule.

### An `enhancement` is born unassigned

It is new work on an existing, already-claimed feature, so the feature's owner says
nothing about who should do it. `bug` and `feature_work` keep the owner cascade — a
bug goes to the most relevant owner and is visible to everyone on the active-fixes
strip. See [task assignment](./task-assignment.md).

## The accounting is closed

`total`/`merged` exclude exactly two groups — bugs, and work raised after the ship —
so **each gets a counter**, or the ratio silently under-reports:

```
unmerged === (total − merged) + openFixes + openSinceShip
```

The three terms are **disjoint and exhaustive** over the unmerged tasks, so no open
task can be invisible _by construction_ rather than by vigilance. The identity is
asserted directly over an exhaustive kind × status × side-of-boundary matrix, so a
future kind — or a new exclusion — breaks a test instead of quietly hiding a row.

`computeFeatureProgress` (`lib/projects/feature-progress.ts`) returns:

| field                | means                                                     |
| -------------------- | --------------------------------------------------------- |
| `total` / `merged`   | completion, **sealed** at `shippedAt`; excludes bugs      |
| `openFixes`          | open `bug` tasks, pre- **and** post-ship                  |
| `openSinceShip`      | open non-bug tasks raised after the ship — closure term   |
| `unstartedSinceShip` | the subset of those nobody has started — what a row shows |
| `live` / `blocked`   | descriptive overlays (see below)                          |

**`live`/`blocked` are overlays, not closure terms.** They may overlap any term — an
active pre-ship task is both `live` and part of the outstanding `total`, which has
always been true. **Never add them into the partition**; `get_feature`'s description
says so explicitly, because an agent that summed them would count one task twice.

**Why the counters key off status the way they do.** `live` keys off `active` and
`blocked` off `blocked`, so between them they cover only work somebody has _started_.
A post-ship task nobody has started matches neither — and since an enhancement is born
unassigned, unstarted is its normal state. That is the gap `openSinceShip` closes.

**`unstartedSinceShip` is derived by negation** (not `active`, not `blocked`) rather
than as `status === 'claimed'`. The positive form encodes today's status set, so a
value added to `TaskStatus` later would drop post-ship work in that state out of every
marker and make it invisible again.

## Where it renders

**A feature row** (`components/hub/projects/plan/feature-row.tsx`) shows the sealed
ratio plus, when non-zero, `· N open fixes` and `· N new`. "New" is
`unstartedSinceShip`, not `openSinceShip`: `live`/`blocked` already show the started
ones, and a shipped feature's ratio has no remainder for them to be a breakdown _of_,
so `4/4 · 1 live · 1 new` would read as two outstanding items where there is one. Each
marker carries its own signal token — "new" on `--signal-claimed`, the tone of the
"unassigned" pill such a task usually shows in the table below.

**The project line counts every task; the feature row does not.** `PlanSummary` sums
raw task rows, so it reconciles with the project header's `prisma.task.count`; the row
keeps its exclusions so a bug can never dent a feature's build-out. Two lines, two
questions — "how much of this project's work is done?" versus "did this feature's
build-out complete?". Summing the feature ratio for the project line is what once put
`76/81 tasks merged` under a header reading `96 tasks`.

**The kind tag** — the word, glyph and hue for every kind come from a single **total**
`Record<TaskKind, …>`, `TASK_KIND_CUE` in `components/hub/projects/kind-tag.tsx`. Total
so that a value added to the union is a compile error rather than a silence on screen.
`feature_work` maps to `null`: it is the unmarked default, so only work that isn't the
ordinary case earns a mark. An enhancement sits a step quieter than a bug (`--ink-mute`
vs the bug's brick) — a classification, not a signal.

**The label is not the kind's name.** An `enhancement` reads **"new"**: at "bug"'s
width the two kinds occupy the same visual slot, where an eleven-character tag shunts
the title right and truncates it. "New" is looser than the kind it stands for — a
merged enhancement still reads "new" long after it stopped being new — so the tooltip
carries the full meaning and is the only place the tag says _new relative to what_.
The exact word is pinned in `kind-tag.test.tsx` alone; the four surface tests assert on
the **tooltip**, so the label stays free to change.

**Four surfaces render the tag**: the Plan row, the feature page's task rows, the task
sheet header, and the Board card — the Board through its own `KindMark`, which sits
with the Blocked and Collision marks and takes only the _vocabulary_ from
`TASK_KIND_CUE`, so the two differ in weight but never in wording.

## Committing work to a phase

`Task.phaseId` records **the phase that chose to do this work** when that differs from
its feature's — a commitment marker, not a second home: it does not propagate upward,
so a task can't move its feature. `null` = inherit.

Such a task renders **inline in the borrowing phase's band** while staying in its own
feature's table. See [phases](./phases.md) for the band mechanics, and note the write
path is **MCP-only** — there is no UI control.

## MCP

- **`create_task { kind, phaseId }`** — `kind` defaults to `feature_work`; `phaseId`
  commits the task to a phase. Owner-tier via the
  [f-access](./planning/f-access.md) funnel.
- **`update_task { kind }`** — re-files a task whose kind was recorded wrong. Not
  hypothetical: before `enhancement` existed an improvement had to be filed as a `bug`
  to keep it off a shipped feature's bar, so the record contains "bugs" that were never
  defects. Re-filing emits **no event** — `bug_reported` recorded what was believed at
  creation, and rewriting that would lose the provenance.
- **`list_tasks { kind }`** — narrows to one kind; see [task reads](./task-reads.md).
- **`get_feature`** returns the full roll-up, including both post-ship counters, so the
  agent and the Plan hold the same numbers.

## Reconciliation with feature status

A bug — or any post-ship task — **can't un-ship a feature**. `computeFeatureStatus`
reads stored status + dependencies only, and `ship_feature` sets `shipped` with nothing
recomputing it from tasks. So the exclusions above are about the _progress count_, never
the status derivation.

`ship_feature`'s soft "unmerged tasks" warning counts feature-work only
(`kind: { not: 'bug' }`), so it agrees with the progress bar.
