---
status: convention
opened: 2026-08-06
parent: next-phase-brief.md
---

# HCE Hub — bug handling

How the Hub treats a genuine bug that arrives while planning or delivering a
phase (or when no phase is active). Settled 2026-08-06; the primitives land as a
small feature alongside [`f-phases`](./next-phase-brief.md#the-keystone-phases). The
guiding aim: keep bugs _in the flow_ and easy to prioritise **without importing
Jira** — no urgency theatre, no history rewriting.

## The model in one line

A bug is a **`bug`-kind Task on the feature it broke**, surfaced by `next_task`
as a **bias** (a strong recommendation you pull, never a push), with
**`help-wanted` as the escape valve** if the owner is heads-down.

## Why a Task, not a Feature

A `Feature` carries ceremony a defect doesn't want — an owner, planning stages,
sub-tasks, a ship summary, dependency edges. A one-line fix shouldn't need it.
Modelling a bug as a Task hung on its origin feature buys three things for free:

- **Ownership with context** — the feature owner already knows that code, so the
  bug routes to the right person with no assignment. (Respects feature-ownership.)
- **Provenance** — "a bug in `f-journal`" is self-evident; you can see which
  shipped work is generating defects.
- **Phase-independence** — a Task belongs to a _feature_, and a feature may have
  no phase, so a bug always has a sensible home regardless of phase state. This is
  what makes the "no active phase" case a non-problem.

**Orphans / infra bugs.** Not every bug maps to a feature — a shell/nav bug
(e.g. no logout affordance) belongs to no single feature. Hang these on a
**standing "Platform / Maintenance" feature** per project (just a feature that's
always there — no schema change).

## The one new primitive: a task `kind`

The only addition is a **task kind** label (`feature-work` | `bug`) — a label,
**not a new model**. It lets `next_task` weight bugs up, lets the board/plan show
them distinctly (quiet treatment, not red-alert), and mirrors the GitHub `bug`
label. Everything else reuses existing Task machinery (claim/start/complete, PR
link, the §14 GitHub-sync reconcile — a bug-fix PR merges → the task closes, same
flow as any task).

## "Prioritised" = a `next_task` bias, not a priority field

No `priority: high` flag, no nagging. The Hub is deliberately anti-urgency (no red
badges, no "overdue", counts-as-information-not-pressure), and priority is
_declared bias_, not a hard field (see [futures](./futures.md#dynamic-focus-and-prioritisation)).
So "make bugs a priority for next action" is implemented as: **`next_task` weights
`bug`-kind tasks up.** Same effect as a `bug`-labelled issue floating up a triage
view — but pulled, not assigned. `help-wanted` on a bug is the pressure-release
valve when the owner can't get to it.

## Cross-phase bugs — reference, don't relocate

A bug found in Phase 3 that lives in a Phase 1 feature must **not** rewrite
history. It doesn't, by construction: **phase membership lives on the _feature_
(`Feature.phaseId`), never on the task** — a bug task has no phase field to
conflict, so it _cannot_ move its feature's phase.

**In the data — nothing from Phase 1 moves.** The Phase 1 feature keeps its phase,
its shipped tasks, its journal. The bug is one new row: a `Task` with
`featureId = <origin>`, `kind = bug`, a `createdAt` in the Phase 3 timeframe, plus
a "bug reported" `ProjectEvent`. The **when-found** (task timestamp) and the
**where-it-lives** (feature's phase) are two separate facts, both recorded,
neither overwriting the other. No import, no reassignment.

**In the UI:**

- **Plan (phase-grouped):** the bug appears nested under its origin feature, in
  that feature's phase band — historically correct.
- **Board (status columns):** the bug shows in the **active** column while it's
  being worked (the board groups by status, not phase) with a small origin
  breadcrumb chip.
- **Active-bugs strip:** a **pinned band at the top of the project view, above
  the Plan/Board body, shown only when non-empty.** Each row references a
  cross-phase bug with a breadcrumb to its origin (`f-journal · Phase 1 ↩`) and a
  link to the fix task. It sits _above_ the phase-grouped body precisely to signal
  it's a different axis (fixes pulled from _any_ phase), and it's project-scoped so
  it survives the no-active-phase case. Empty → gone. This is a **reference band,
  not a phase band** — it points at the bug and its history; it never pulls the
  origin feature forward.

```
Hub / Projects / HCE Hub
[ Plan ]  [ Board ]  [ Log ]
┌──────────────────────────────────────────────────────┐
│ ⚠ Active bugs · 2                             [ bugs ]│   ← pinned, hidden when empty
│   • Log decisions render raw     f-journal · Phase 1 ↩ │
│   • Logout missing in side nav   Platform             │
└──────────────────────────────────────────────────────┘
▸ Phase 3 — current      (features being worked now)
▸ Phase 1 — complete     (collapsed)
```

"See the feature's history when fixing" = follow the breadcrumb (the feature page
already renders its journal/decisions/shipped tasks). "Don't rewrite history" =
the feature stays in its phase; the current phase holds only the new bug task and
a reference.

## Kind-aware feature status

An open `bug` task on a shipped feature must **not** flip it back to `in_flight`.
Feature-status derivation is **kind-aware**: a shipped feature with open bug tasks
reads **"shipped · N open bugs"**, not reopened. This is what keeps the shipped
Phase 1 feature as history rather than dragging it into the present.

## What's minimal vs. polish

- **Core (small):** the task `kind` label · `next_task` bias · kind-aware feature
  status. With just these, bugs are already tasks-on-their-feature, prioritised,
  and non-history-rewriting, and they show in the board's active column with a
  breadcrumb.
- **Polish:** the **active-bugs strip** — the glanceable upgrade that keeps bugs
  from being buried among feature-work tasks (same instinct as not letting the
  board bury things). Layered on the board's native behaviour, not a prerequisite.

## Forward connections

- **Converges with [Sunrise-as-a-project](./next-phase-brief.md#3-onboard-sunrise-as-a-hub-project).**
  Sunrise's real GitHub issues — some tagged `bug` — become `bug`-kind tasks when
  we onboard it. Same primitive serves both.
- **A first-class `Issue`/`Bug` model** (standalone from features, à la GitHub
  issues) is the heavier alternative — a _defer-until-it-earns-it_ call, exactly
  like the [`Release` model](./futures.md#dedicated-release-divergence-modelling-architectural).
  The task-kind label is the minimal step; onboarding Sunrise's issues is what will
  pressure-test whether a real Issue model is needed.
