# Reading tasks over MCP

[Phase 2](./planning/phase-2-plan.md). A coding agent could get a single
recommendation (`next_task`) and read a project's **features** (`list_phases`), but
**never a feature's tasks** — so "which open bugs are on this project?" had no answer
over MCP. That gap was felt live: while triaging an inbox idea, the agent couldn't see
the very bugs (`t-65` / `t-66`) that made the idea a near-duplicate. `list_tasks` closes
it.

## `list_tasks` (`lib/projects/capabilities/list-tasks.ts`)

The task-level sibling of `list_phases` / `list_ideas`. Given a project — and
optionally one feature, and/or a `status` / `kind` filter — it returns the project's
tasks, each projected to the refs an agent needs to identify and name one:

```
{ id, number (t-N), title, featureId, featureSlug, featureTitle,
  status, kind, phaseId, assigneeUserId, prUrl }
```

- **`phaseId`** (f-work-kinds §32 t-80) — the phase that _chose_ this work, when that
  differs from its feature's phase; `null` = inherit. A commitment marker, never a
  second home: it does not propagate upward, so a task can't move its feature.
  Since **§32 t-95** it finally _renders_: such a task appears inline in the borrowing
  phase's band on the Plan, while staying in its own feature's task table (see
  [phases](./phases.md#ui-t2-render--t3-management-componentshubprojectsplan)). Until
  t-95 this field was written by three verbs and read by none — write surface ahead of
  read surface, the same gap §32 was created to close for `TaskKind`.
- **Narrowing.** `featureId` → one feature's tasks; `kind: 'bug'` → the open-bugs read
  (the concrete need that motivated the feature), `kind: 'enhancement'` → the open
  improvements; `status` → one effective status.
  Filters compose. The motivating calls all narrow, so they're self-bounding; the read
  is otherwise **unbounded** — the tool description nudges narrowing on a large project,
  and a hard cap / pagination across the `list_` verbs is a tracked hardening idea.
- **Effective status is shared, not re-derived.** `status` is
  `computeEffectiveStatus` ([`lib/projects/task-status.ts`](../../lib/projects/task-status.ts)),
  the same computation the Plan and Board use — so a deps-blocked `claimed` task reads
  `blocked` everywhere. Because `blocked` is _derived_ (not a stored column), the
  `status` filter is applied **after** the computation, in the read helper.
- **Membership.** A thin projection over `getProjectTasks`
  ([`lib/projects/tasks.ts`](../../lib/projects/tasks.ts)), which funnels through
  `getAccessibleProject` — a **non-member or unknown project is `not_found`**, never a
  403 (anti-enumeration). A `featureId` is an in-project filter, not a second scope: a
  feature outside the accessible project simply matches nothing.
- **No PII.** Ids + refs + short labels, and `assigneeUserId` is returned **raw** (an
  opaque id, not a resolved name/email) — enough for an agent to tell
  assigned / unassigned / mine, with no user lookup. So `processesPii = false` and
  `readOnlyHint = true`.
- **Null `t-N`.** `Task.number` is nullable, so `number` is `number | null`; a caller
  falls back to the title rather than rendering `t-null` (the same rule `t-66` states
  for the write side).

## Read side of the ref story — `list_tasks` + t-66

`list_tasks` is deliberately **read-only**. Making the _write_ verbs (`create_task`,
`plan_feature`, `create_feature`, `next_task`) return the human ref (`number` / slug)
alongside the id is a separate, complementary change — **t-66** on
[f-refs](./planning/f-refs.md). Together they close the loop: t-66 lets the agent
_report_ the ref it just created; `list_tasks` lets it _read_ the refs already there.
Both exist so the human and Claude Code name the same task by the same `t-N`.

## `get_task` (`lib/projects/capabilities/get-task.ts`)

`list_tasks` _identifies_ a task; **`get_task` returns its body** — the detail an
agent needs to actually build it: `description`, `doneWhen`, effective `status`,
`kind`, `phaseId`, `filesScope`, `prUrl`, the `feature { id, slug, title }`, and the dependency
graph (`blockedBy` / `blocks`, each neighbour with its `t-N` + readiness). A thin
projection over `getTaskDetail` ([`lib/projects/task-detail.ts`](../../lib/projects/task-detail.ts)),
the same funnel-scoped read the web task-sheet renders — so a non-member, unknown, or
**cross-project** task is `not_found` (no id-swap). `taskId` is required; `projectId`
is optional (derived via `resolveTaskAccess` when omitted, like `start_task`). The
free-text body ⇒ `processesPii` (masked in provenance); the assignee is a raw id
(no PII). This closes the "hand me a task by `t-N` and I'll work it" loop — its
absence is what blocked reading `t-65` over MCP.

## Discovery chain

The full chain, once **read parity** landed (f-mcp-project-scope §31 t-70 added the
project / feature / journal reads that bracket this one):

```
list_projects   → discover a projectId (the entry point)
get_project     → its header + structure counts
list_phases     → find a feature id/slug
get_feature     → read the feature's spec
list_tasks      → that feature's tasks, or the project's open bugs
get_task        → read the one you'll work (description, done-when, deps)
→ act: start_task / complete_task / set_pr, or next_task for a recommendation

list_events     → the project journal (decisions / notes / lifecycle), at any point
```

Every read is membership-scoped (deny ≡ `not_found`) and **project-scope-aware**: on
a project-scoped MCP key the `projectId` is ambient (see
[mcp-project-scope.md](./mcp-project-scope.md)). The capability pattern (class ↔ seed
parity, MCP exposure, registration) is the same as every other Hub verb — see
[idea-capture.md](./idea-capture.md) for the worked reference.
