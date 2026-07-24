---
name: f-authoring-fidelity
feature: 21 / f-authoring-fidelity
status: in flight        # not started | in flight | blocked | shipped
owner: Simon
opened: 2026-07-23
plan: .context/app/planning/plan.md
spec: .context/app/planning/self-hosting.md
---

# f-authoring-fidelity — the MCP authoring path captures + renders the full record

*Feature 21 on [[plan]] — a **corrective** feature (the fourth dogfood-surfaced correction, after [[f-refs]] §16 and [[f-status-model]] §20). Surfaced authoring §20 into the Hub over MCP: the write verbs are **lossy**, so a feature authored over MCP comes out as skeleton tasks and you can't pull the next task's detail from the Hub — you fall back to the MD. This makes the [[f-selfhost-cutover]] §19 promise ("the Hub becomes its own system of record") only half-true: the one-time **cutover** is faithful (we pulled the detail across into `plan-data.ts`), but the **ongoing authoring path** loses it. This feature closes that gap. It is **authored INTO the Hub over MCP** (create_feature → claim_feature → plan_feature) as a re-test of §5 path B — and its own tasks land detail-thin, demonstrating exactly the gap it fixes; the MD below is the backup record until [[f-authoring-fidelity]] itself ships.*

> **This MD is a backup, not the record.** Post-§19-cutover the Hub is the system of record; this doc mirrors the Hub feature (`chubproject`) so there's a durable copy while the authoring path is still lossy. Once t-a/t-c land, the Hub carries the full detail and this doc can freeze.

## Intent

Make the authoring path **faithful** — the Hub holds and shows the full task/feature detail the MD files carried, so you never have to leave the Hub to know what to build:

- **The write verbs carry full detail.** `plan_feature`'s task spec and `create_task` gain a `description` field (they have `title` + `doneWhen`? + `filesScope` today but **no `description`** — the direct cause of §20's empty tasks); `create_task` also gains `doneWhen` (it has neither today). `create_feature` already carries a markdown `description` + `doneWhen`, so the gap is task-level only.
- **You can edit a task *or a feature* after creation.** New `update_task` and `update_feature` verbs edit an existing item's fields (owner-tier via the feature funnel) — `update_task`: `title`/`description`/`doneWhen`/`filesScope`; `update_feature`: `title`/`summary`/`description`/`doneWhen`/`references` **+ its dependency edges + unclaim/reassign owner**. Today there is **no way to amend either over MCP** — so §20's `t-36`/`t-37` were stuck description-less and §21's own deps/claim had to be reconciled by hand in the DB. `create_feature` *does* already accept `dependsOnFeatureIds` (deps *can* be set at creation), but nothing can change them afterwards. These verbs are how the record gets corrected from the Hub, never the DB.
- **The detail actually renders.** The task sheet fetches + shows `doneWhen` (set today by `plan_feature`/cutover but **never selected in `task-detail.ts` nor rendered** — invisible), and renders the task `description` as **markdown**. On the feature side, split `Feature.description` into a plain `summary` (plan row + board) and a full `description` rendered as **markdown** on the feature page (**moved here from §20 t-37** — react-markdown/remark-gfm are already deps).

*(Scope note: this is the **authoring/rendering fidelity** axis — distinct from §19's transfer/cutover/slugs *mechanics* and §20's status/readiness/identity. §20 t-37 narrows to feature-readiness + stable `Feature.number`; the description/summary split + markdown move here.)*

## Reconciliation with current repo reality   (verified 2026-07-23, against `main`)

- **`plan_feature` task spec = `{ ref, title, doneWhen?, filesScope?, dependsOn? }` — no `description`.** `create_task` = `{ featureId, title, filesScope?, dependsOnTaskIds? }` — no `description`, no `doneWhen`. → **Decision (t-a):** add optional `description` (@db.Text-scale, ~10k) to both task specs; add `doneWhen` to `create_task`. The `Task` model already has both columns (`description`, `doneWhen @db.Text`) — this is verb-surface only, no migration. Sync seeds `002`/`012` function definitions (parity test) + provenance redaction (both are `processesPii` — mask the free-text on the durable provenance row).
- **No `update_task`/`edit_task` capability exists** (`ls lib/projects/capabilities/` — create/claim/plan/ship/next/flag/record/add only). → **Decision (t-b):** new `UpdateTaskCapability` (`update_task`) — edit `title`/`description`/`doneWhen`/`filesScope` on an existing task; **owner-tier** via `resolveFeatureAccess(…, 'owner')` on the task's feature (a member who is neither owner nor lead → `forbidden`; non-member → `not_found`). Emits no new `ProjectEventKind` (a `note`-style edit is not worth a lifecycle event; audit-log only). Seed (`0NN-update-task.ts`) + registration in `lib/app/capabilities.ts` + barrel. (Consumer route deferred — MCP-first; the sheet's inline-edit affordance is a later nicety, not v1.)
- **`task-detail.ts` selects `description` but NOT `doneWhen`; the task sheet has a description section + files + deps + activity but NO "Done when".** → **Decision (t-c):** add `doneWhen` to the `getTaskDetail` select + `TaskDetail` type + the client DTO, render a "Done when" section in `task-sheet.tsx`; render the `description` as markdown (a small shared `react-markdown` renderer, `@tailwindcss/typography` `prose`). Same renderer reused on the feature page (t-d).
- **`Feature` has a single `description @db.Text`, rendered raw** (`feature-row.tsx` plan row + `feature-view.tsx` `whitespace-pre-wrap`, no markdown) — no `summary`. **Moved from §20 t-37.** → **Decision (t-d):** additive migration `Feature.summary @db.Text?`; render `summary` (plain, one line) on the plan row + board, `description` as markdown on the feature page; `create_feature` gains an optional `summary`; re-author `cutover/plan-data.ts` to author a one-line `summary` per feature (keep the full `description`).

**Tier / seam hypotheses:** pure leaf-app, zero platform edits. New/changed fork-owned: two capability schemas (t-a), one new capability + seed + registration (t-b), the task-detail read + task-sheet render (t-c), one **additive** `Feature.summary` migration + feature-side render + cutover re-author (t-d). One migration (t-d) → `/pre-pr` drift **RUN** (B13 watch). No HB2 anticipated.

## Promoted tasks

**Sizing — recommended 3 PRs.** (t-a + t-b + t-e) the capture half (verb detail + `update_task` + `update_feature`) read together as "the MCP write surface now round-trips — you can author AND correct the record"; (t-c) the task-sheet render; (t-d) the feature-side split + migration + cutover re-author (its own review surface + the migration). The three verb tasks share one backend PR (t-e depends on t-d's `Feature.summary`, so if it can't wait it splits to its own small PR); t-c and t-d are separable render/schema work.

| ID  | Task | Deps | Done-when |
|-----|------|------|-----------|
| t-a | **Write-verb detail completeness.** `description` on `plan_feature` task spec + `create_task`; `doneWhen` on `create_task`. Sync seeds `002`/`012` (parity) + provenance redaction. | — | a task authored via `plan_feature`/`create_task` carries its `description` + `doneWhen`; class↔seed parity green; free-text masked on provenance; gates green |
| t-b | **`update_task` verb.** New `update_task` capability — edit `title`/`description`/`doneWhen`/`filesScope`; owner-tier funnel; seed + registration + barrel; audit-logged. | t-a (co-req) | an owner edits a planned task's fields over MCP; a non-owner member → `forbidden`, non-member → `not_found`; **§20 `t-36`/`t-37` backfilled over `update_task`** (no direct DB write); gates green |
| t-e | **`update_feature` verb.** New `update_feature` capability — edit `title`/`summary`/`description`/`doneWhen`/`references`, **change the dependency edges** (add/remove `FeatureDependency`, `assertAcyclic`-guarded), and **unclaim/reassign** the owner; owner-tier funnel; seed + registration + barrel; audit-logged. Can share a PR with t-b (same pattern). | t-d (needs `Feature.summary`) | an owner edits a feature's fields + deps + ownership over MCP (a cyclic edge is rejected; funnel `forbidden`/`not_found`); **§21's own deps/unclaim are re-doable over the verb, not the DB**; gates green |
| t-c | **Task-sheet faithfulness.** Fetch + render `doneWhen` (`task-detail` select + `TaskDetail` + DTO + a "Done when" section); render the task `description` as **markdown** (shared react-markdown renderer). | t-a | the sheet shows a task's Done-when + renders its description as markdown (no raw `**`); gates green |
| t-d | **Feature summary/description split + markdown (moved from §20 t-37).** Additive migration `Feature.summary @db.Text?`; render `summary` (plain) on plan row + board, `description` as markdown on the feature page; `create_feature` gains `summary`; re-author `cutover/plan-data.ts`. | §20 t-37 (feature-view rework) | plan row shows a one-line summary; feature page renders the markdown description; migration + drift green; cutover re-imports; gates green |

*Standing steps in each Done-when:* vitest strategy below; `commit → /pre-pr → /security-review → push → open PR → /code-review`; `gh pr create --repo human-centric-engineering/hce-hub`. One migration (t-d) → drift **RUN**. **Task numbers are the Hub's** (`Task.number`, e.g. `t-NN`) — the `t-a…t-d` here are placeholders until the Hub assigns them at plan time.

## Test strategy

vitest = happy-dom, no live DB ([[planning-retro]] B9): mock `@/lib/db/client`/`tx`; capabilities via their execute() (funnel deny, field validation, redaction); components via `@testing-library/react`; the migration proven by `db:drift-check` + `app:project:import-plan` re-run.

- **t-a:** `plan_feature`/`create_task` persist `description`/`doneWhen`; parity green; redaction masks free text.
- **t-b:** `update_task` edits each field; owner-tier (`forbidden`/`not_found`); no-op on unknown task; audit-logged.
- **t-c:** task-detail returns `doneWhen`; the sheet renders it + markdown description (a bold/list round-trips to HTML, not raw `**`).
- **t-d:** `Feature.summary` migration + drift; plan row shows summary, feature page renders markdown; cutover re-authors + re-imports.

## Open questions

- **Resolved inline:** verb-surface-only for t-a (columns exist, no migration); `update_task` owner-tier + no new event kind (t-b); doneWhen render + markdown (t-c); `Feature.summary` additive + moved-from-§20 (t-d).
- **For the owner (at claim review):**
  1. **`update_task` is MCP-first (no consumer route / inline sheet-edit in v1).** Recommended — the Hub is authored by repo sessions over MCP; a human inline-editor is a later nicety. (Alternative: add the route + a sheet edit affordance now — more surface, defers the fix.)
  2. **Sizing: 3 PRs** — (t-a+t-b) verb surface · (t-c) task render · (t-d) feature split + migration. Confirm, or split t-a/t-b.

## Decisions log   (append-only, newest first)

- **2026-07-23 — Added t-e `update_feature` (owner-surfaced).** Reconciling §21 itself (wiring its deps, unclaiming it) had to be manual DB edits — there is no way to edit a feature after creation over MCP. `create_feature` *does* accept `dependsOnFeatureIds` (deps can be set at creation; §21's authoring just omitted them), but nothing can change them, the description/summary, or ownership afterwards. Added **t-e `update_feature`** (edit fields + dependency edges + unclaim/reassign) as the feature-level sibling of t-b `update_task`, so both round-trip over MCP. Captured in the Hub as a note on §21 (eventId `cmrxtkjr7…`). Feature-status-model refinements also surfaced the same day (plan-view auto-expand should prefer the *active-work* feature; a claimed-but-idle-dep-blocked feature should read blocked) — folded into **§20 t-37**, not here.
- **2026-07-23 — Claimed + planned (owner Simon), authored into the Hub over MCP.** A corrective feature surfaced authoring §20 over MCP: the task-level write verbs (`plan_feature`/`create_task`) carry no `description`, so MCP-authored features come out as skeletons and the Hub can't yet serve as the pull-the-next-task record (we fell back to the MD for §20 t-36's detail). §19's *cutover* is faithful (detail pulled across into `plan-data.ts`); the *ongoing authoring path* is the gap → its own feature, not a §19 task (matches the f-refs/f-status-model "dogfood correction = new feature" pattern; keeps §19 = mechanics, §20 = status). **Owner decisions:** new feature (not a §19 task); the description/summary split + markdown rendering **move here from §20 t-37** (which narrows to feature-readiness + stable `Feature.number`); authored + tracked in the Hub with this MD as backup while the path is still lossy. 4 tasks: verb detail (t-a) · `update_task` (t-b) · task-sheet render (t-c) · feature summary/markdown (t-d).
