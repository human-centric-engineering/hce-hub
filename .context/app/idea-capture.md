# Idea capture

[Phase 2](./planning/phase-2-plan.md)'s parking gesture. An **idea is a first-class
`Idea` inbox item that lives _outside_ the plan** — not a feature, not a task. At
capture time we don't yet know what it is; triage promotes it into whatever it turns
out to be (a feature, a task, a new phase, or a bug), or drops it. This documents
what shipped; the architecture pivot that got here (why _not_ a feature filed in a
parked phase) is recorded in the project journal.

> You're mid-work and a thought lands — "the board should remember my last filter".
> You jot it (from the project header, or `capture_idea` in Claude Code) and it goes
> into the project's **inbox**, untyped. Later you triage: edit it as it evolves,
> drop it (archived, reversible), or — from Claude Code — **promote** it into a
> feature/task/phase/bug, which shapes the raw jot into structured work and marks
> the idea done.

## The model (`prisma/schema/app.prisma`)

- **`model Idea`** (`app_idea`): `{ projectId, text, status, createdByUserId, createdAt }`
  plus triage-outcome fields `{ promotedKind, promotedRefId, triagedAt }`. It has **no
  owner, no phase, no structure** — a jot is just text. `createdByUserId` is a hand-FK
  to `user` with `ON DELETE SET NULL` (a raw-SQL constraint, like `app_feature.ownerUserId`),
  so erasure de-attributes but retains the idea; a drift probe in
  [`lib/app/db-drift.ts`](../../lib/app/db-drift.ts) pins the `SET NULL`.
- **`enum IdeaStatus { open promoted dropped }`** — `open` in the inbox → `promoted`
  (became a feature/task/phase/bug) or `dropped` (archived, reversible; **never
  deleted**).
- **`enum IdeaOutcome { feature task phase bug }`** — what a promoted idea became,
  recorded on `promotedKind` (+ `promotedRefId` = the created entity's id; a `bug`'s
  ref is its task id).

**GDPR**: `app_idea` is `'exported'` in [`lib/app/data-export.ts`](../../lib/app/data-export.ts)
— a subject's own jots are their personal data. Ideas are **not** journalled (capture
is pre-commitment); they're admin-audited only. The _real_ `feature_created` /
`task_created` event fires when an idea is promoted.

## Capture — two write faces, one core

`captureIdea(userId, projectId, text)` ([`lib/projects/capture-idea-service.ts`](../../lib/projects/capture-idea-service.ts))
is the shared core (membership funnel → create an `open` idea → audit). Two faces:

- **`capture_idea`** MCP capability — jot from Claude Code (the free-text is masked in
  the durable provenance row).
- **`POST /api/v1/projects/:id/ideas`** — the quick-jot popover in the project header
  (`JotIdeaButton`), so you can capture from any tab. `⌘↵` submits.

## The inbox UI (`?view=ideas`)

The **Ideas** tab is a list _separate_ from the Plan/Board (ideas aren't committed
work), server-fetched like them so mutations `router.refresh()` cleanly.

- **`getProjectIdeas`** ([`lib/projects/ideas.ts`](../../lib/projects/ideas.ts)) →
  `GET /api/v1/projects/:id/ideas`: the actionable ideas (`open` + `dropped`;
  `promoted` excluded — they're features now), authors resolved to `UserRef | null`.
- **`IdeasView`** — two toggled bands: **Inbox** (open) and **Dropped** (the archive),
  with counts. **`IdeaRow`** carries the low-structure human ops: **edit** the jot
  inline, **drop**, **restore** — each a `PATCH …/ideas/:ideaId` + refresh, failures
  surfaced inline (never a toast — this codebase has no toast lib).

## Lifecycle — `update_idea`

`updateIdea(userId, ideaId, patch, expectedProjectId?)`
([`lib/projects/update-idea-service.ts`](../../lib/projects/update-idea-service.ts))
backs both the `update_idea` capability and the `PATCH` route. It edits `text` and/or
moves `status` between `open` and `dropped` (`promoted` is fromIdeaId-only, never set
here). The write is guarded on `status != promoted` (an `updateMany` + count check),
so a concurrent promotion can't be clobbered; dropping stamps `triagedAt`, restoring
clears it.

## Promotion — `fromIdeaId`, capability-mediated

Promotion is **not** a web button and **not** a bespoke endpoint. It's an optional
**`fromIdeaId`** on the existing create verbs — `create_feature`, `create_task`
(`kind: 'bug'` for a bug), `create_phase` — which, in the same transaction as the
create, marks the idea `promoted` and links it (`resolveIdeaOnPromotion` in
[`lib/projects/idea-promotion.ts`](../../lib/projects/idea-promotion.ts), guarded on
`status: 'open'` so an idea can't be double-promoted).

Two reasons it lives at the capability layer:

1. **Authoring is capability-based, not HTTP.** Claude Code (over MCP) and in-process
   agents (the future sidekick) both dispatch the _same_ capability through one
   `capabilityDispatcher` — so `fromIdeaId` serves both. There are deliberately no
   HTTP create routes for features/tasks; a REST promote endpoint would be a redundant
   third door.
2. **A raw jot needs shaping.** "board merged column cap" has none of the structure a
   feature needs (title, done-when, phase). Promotion wants judgement — talk it through
   — which is an agent's job, not a form's. So the web inbox has **no Promote button**;
   promotion is done from **Claude Code today**, and a **seeded sidekick conversation
   later** (deferred to `f-sidekick`, in the AI-capabilities phase).

See [`phases.md`](./phases.md) for the parked-phase concept the pivot moved _away_ from
using as the idea store.
