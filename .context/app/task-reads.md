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
  status, kind, assigneeUserId, prUrl }
```

- **Narrowing.** `featureId` → one feature's tasks; `kind: 'bug'` → the open-bugs read
  (the concrete need that motivated the feature); `status` → one effective status.
  Filters compose.
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

## Discovery chain

`list_phases` (find a feature id/slug) → `list_tasks` (that feature's tasks, or the
project's open bugs) → act (`start_task` / `complete_task` / `set_pr`, or `next_task`
for a recommendation). The capability pattern (class ↔ seed parity, MCP exposure,
registration) is the same as every other Hub verb — see
[idea-capture.md](./idea-capture.md) for the worked reference.
