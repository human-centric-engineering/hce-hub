# Task assignment

[Phase 2](./planning/phase-2-plan.md)'s task-assignment feature — the ability to
**claim or (re)assign a task**, decoupled from feature ownership. It emerged from
dogfooding [bug handling](./bug-handling.md): the only pull was `claim_feature`
(which reopens a shipped feature), a born task read "claimed" though nobody claimed
it, and there was no way to hand a teammate's work over when they went off. This
documents what shipped.

> A task is _born assigned_ to its feature's owner — that reads "assigned", not
> "claimed". Anyone can reassign it (take it yourself, or hand it to someone else
> when a dev is off sick or pulled onto something else) from the task sheet, or hand
> a feature's whole remaining workload over in one move. Merged work always keeps
> its doer's name — you don't reassign finished work.

## The model (`prisma/schema/app.prisma`)

- **`Task.assigneeUserId`** — pre-existed but was dormant (set to the feature owner
  at plan time, never re-set). This feature makes it live. Distinct from
  `claimedByUserId` (the _doer_, moved by Start): the two coincide in the common
  case and diverge only when someone other than the assignee starts a task.
- **`ProjectEventKind.task_assigned`** — every (re)assignment journals "assigned the
  task" (a small enum-add migration, `20260808173227_…`), so the handoff trail —
  who moved whose work, and when — shows in the Log / feature-activity / task-sheet
  timelines. Round-trips through the project transfer enum + the client DTO +
  `describeEvent`.

No other schema change: assignment is a state move on existing columns.

## The design calls (settled with the owner)

1. **Assignee vs claimant.** Open tasks show the **assignee** (whose work it is);
   merged tasks show the **doer** (`claimedByUserId`, for credit). `taskHolderId`
   (`lib/projects/task-status.ts`) is the one helper both read surfaces route
   through. **(1a)** Handing off an _active_ task to a different person resets it
   `active → claimed` and releases the displaced worker's claim (a clean handoff,
   with a soft heads-up); re-assigning active work to the person already on it is a
   no-op.
2. **Who may (re)assign.** **Any project member** — open and trusting for now (the
   caller's membership is the `lib/projects/access.ts` funnel's; deny ≡ 404). The
   **assignee** must be a member (else `invalid_assignee`).
3. **Feature-level reassign** touches **unmerged tasks only** — merged tasks keep
   their doer credit.
4. **Decoupled from ownership** — reassignment **never** touches
   `Feature.ownerUserId`. It moves the _tasks_, not the feature.

## The shared core (`lib/projects/task-actions.ts`)

`applyAssignment(tx, task, assigneeUserId, actorUserId)` is the per-task primitive
(handoff reset + claim release + `task_assigned` journal), so the single-task and
feature-level verbs can't drift:

- **`assignTask(userId, taskId, assigneeUserId, expectedProjectId?)`** — one task.
  Merged is a lenient no-op; validates the assignee is a member; runs one
  `applyAssignment` in a transaction; audit-logs `task.assign`.
- **`reassignFeatureTasks(userId, featureId, assigneeUserId, expectedProjectId?)`** —
  a feature's unmerged tasks, all in **one transaction** (the whole handoff lands or
  none of it does). A no-op (0 reassigned) when nothing is outstanding; audit-logs
  `feature.reassign_tasks`.

Assigning syncs `claimedByUserId` to the new assignee (as a born task is), so the
existing claimer-based surfaces already show the new person in the common case.

## Surfaces

### MCP / write

- **`assign_task { taskId, assigneeUserId, projectId? }`** (seed `021`) — take a task
  or hand it over.
- **`reassign_feature_tasks { featureId, assigneeUserId, projectId? }`** (seed `022`)
  — hand a feature's remaining work over. Both are member-tier, audited, and their
  `functionDefinition` re-syncs on the seed's update branch so MCP advertises the
  current schema.

### REST (the HTTP face of the same cores)

- **`PATCH /api/v1/projects/:id/tasks/:taskId/assignee`** `{ assigneeUserId }` — the
  task-sheet picker.
- **`PATCH /api/v1/projects/:id/features/:key/assignee`** `{ assigneeUserId }` — the
  feature-page "reassign remaining" affordance.

Both are `withAuth`, Zod-validated (`cuidSchema`), and `:id`-scoped (no
cross-project id-swap). A non-member assignee is a 400; an unknown/foreign target is
a 404.

### Read — status-aware display

- **Plan / Board** (`lib/projects/plan.ts`, `lib/projects/board.ts`) show the
  **holder** on each task: the assignee while open, the doer once merged. The Board
  **routes each task into its holder's lane** — so an open task sits in _whose work
  it is_, a merged one credits who did it, falling to the feature owner when neither
  is set. This closes the split where the Plan showed the claimer while the feature
  page showed the assignee.
- **Task sheet** (`components/hub/projects/task-sheet/`) — an open task shows the
  `AssigneePicker` (a member Select seeded with the current assignee); a merged task
  shows the doer read-only.
- **Feature page** (`components/hub/projects/feature-view/`) — a gated "Reassign
  remaining tasks" affordance (deliberate, not a stray click), shown only when the
  feature is planned with ≥1 open task. A failed write surfaces inline, never
  silent.

## Rider — the shipped-guard (t1)

`claim_feature` now **refuses a shipped feature** softly (`claimed: false`, an
`already_shipped` warning, no mutation) instead of flipping it back to `in_flight`.
Work a shipped feature's defects as `bug`-kind tasks you _start_, not a feature
re-claim — the "don't rewrite history" companion to [bug handling](./bug-handling.md).
