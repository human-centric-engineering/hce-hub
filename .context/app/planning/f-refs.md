---
name: f-refs
feature: 16 / f-refs
status: in flight        # not started | in flight | blocked | shipped
owner: Simon
opened: 2026-07-15
plan: .context/app/planning/plan.md
spec: .context/app/planning/v1-requirements.md
---

# f-refs — human references (feature slug + task number)

*Feature 16 on [[plan]]. A **corrective** feature: it closes a schema gap that originated in [[f-data-model]] (§03) and was papered over in [[f-plan-view]] (§09). Binding design: `design/data.jsx` (`feature.id = 'f-data'`, `task.id = 't-6'`) + the design handoff Plan/Board card refs (`f-sidekick · t-6`). **Extends** [[f-data-model]]; **retrofits** [[f-plan-view]] (§09) + [[f-board-view]] (§10). **Blocks the §10 close-out** (the board should ship with real refs).*

## Intent

The design and the studio's working language lean on two human-readable identifiers the schema never modelled:

- a **feature slug** — a short, scannable, authored key (`f-mcp`, `f-pr`) shown on feature rows, card refs, and dependency chips;
- a **task number** — a **project-wide, stable, sequential** integer (`t-1 … t-17`, like an issue number `PROJ-123`) you can say out loud and that survives reordering.

f-refs adds both to the schema, backfills the seed, assigns numbers at task creation, and renders the real refs across the Plan (§09) and Board (§10) surfaces.

**Why this exists (the honest provenance).** [[f-data-model]] modelled `Feature`/`Task` with cuid surrogate `id`s (the Sunrise convention) and no human key — the spec's §10 sketch used `id` generically, so no slug/number column was added. When the design's `f-slug · t-N` met that reality in [[f-plan-view]] t-2, it was **resolved unilaterally** as "the title carries identity" and filed as reconciliation bullet #5 — a **product/design decision made silently instead of surfaced.** The owner caught it. (Corollary bug: the `t-N` the Plan view *does* render is per-feature positional (`index+1`), which is *also* wrong — it's ephemeral, not the stable project-wide number the design intends.) **Retro lesson → [[planning-retro]]: a design element the schema lacks is a fork to surface for the owner's decision, not a reconciliation to settle in a feature doc.**

## Reconciliation with current repo reality   (required — done first)

Verified against `main`, 2026-07-15 (recon over `prisma/schema/app.prisma` `Feature`/`Task`/`Project`, `lib/projects/capabilities/{create-task,add-backlog}.ts`, `lib/projects/{plan,board}.ts`, `components/hub/projects/{plan,board}/**`, `prisma/seeds/app/006-sample-plan.ts`, `v1-requirements.md` §10). Each finding is a decision.

- **The schema has no human key.** `Feature` = cuid `id` + `title` (no slug); `Task` = cuid `id` + `title` (no number). → **Decision:** add `Feature.slug` + `Task.number`, plus a `Project.taskCounter` to assign numbers race-safely (below). Fork-owned `app.prisma` columns → a clean **additive migration**, no platform conflict.
- **`Feature.slug` — authored, per-project unique, short (owner-decided 2026-07-15).** Not derived from the title — the plan-authoring AI (intake, §13) writes it, deliberately shorter/more scannable than the title (`f-mcp`, not `per-developer-api-key-auth`). → **Decision:** `slug String?` **nullable** with `@@unique([projectId, slug])` (Postgres allows multiple NULLs, so pre-slug rows don't collide) + a render fallback (a short id or "—") when absent — avoids a backfill-in-migration and tolerates the reality that not every creation path sets one yet. Validated (kebab-ish, length-capped) where authored. *(Build note: revisit non-null-after-backfill once intake authors slugs on every feature.)*
- **`Task.number` — project-wide monotonic, stable (matches the design's `t-1…t-17`).** NOT per-feature positional (the §09 render's mistake). → **Decision:** `number Int?` on `Task` + `Project.taskCounter Int @default(0)`; a new task's number is assigned by **atomically incrementing the project counter in the creation transaction** (`UPDATE app_project SET "taskCounter" = "taskCounter" + 1 … RETURNING` — the row lock serializes concurrent creates), so numbers are unique by construction (no denormalized `Task.projectId` or `@@unique` needed; add a plain index if we query by it). Rendered `t-{number}`. *(Build note: the counter is the invariant; the seed sets both the task numbers and the final `taskCounter`.)*
- **Write paths must assign the number.** `create_task` already wraps its write in `executeTransaction` — assign the counter there. `add_backlog` currently uses a bare `prisma.task.create` — wrap it in the same transactional counter-bump. `claim_task` doesn't create tasks (no change). **Feature slug authoring:** in v1 only the **seed** creates features (intake §13 will author slugs later; there's no admin feature-CRUD surface today — [[f-project-admin]] is project+member CRUD), so t-1 sets slugs in the seed; no admin form change. *(Flag: a future feature-edit surface / intake sets `slug`.)*
- **Migration hygiene (carried B13 watch).** f-data-model's `prisma migrate dev` footgun emitted spurious `DROP INDEX` for the pgvector/tsvector objects it can't model. → **Decision:** author the migration `--create-only`, review the SQL, strip any spurious `DROP`, then apply; `db:drift-check` green. Additive columns only (no FK, no raw SQL).
- **Reads retrofit.** `plan.ts` `PlanFeatureView` gains `slug`; `PlanTaskView` gains `number`; dependency refs carry the depended-on feature's **slug** (not title). `board.ts` `BoardTaskCard` gains `featureSlug` + `number`; lane `ownedFeatures` carry slug. → thread through both loaders + their client DTO mirrors.
- **UI retrofit.** Plan `feature-row` renders the mono slug beside the title + dep chips show slugs; `task-row` shows `t-{number}`. Board `task-card` shows `{featureSlug} · t-{number}` (the design's ref row) + lane owned-feature chips show slugs. Fallback to a short id/"—" when slug/number null. Browser-validate (HB6).

**Tier / seam hypotheses (confirmed):** pure leaf-app. New fork-owned `app.prisma` columns + **one additive migration** (the first migration since f-data-model; `/pre-pr` drift step **RUNS**). Retrofits fork-owned `lib/projects/*` + `components/hub/projects/**`. Reused: the existing capability/seed/loader patterns. **No platform edit, no HB2, no upstream ask.**

## Promoted tasks

**Sizing — presented to the owner (see Open questions).** Owner-decided sequence: **schema-fix PR first, then retrofit.** Recommended **2 PRs**:

| ID  | Task | Files | Deps | Done-when | Status | PR |
|-----|------|-------|------|-----------|--------|----|
| t-1 | **Schema + number assignment + seed backfill.** Add `Feature.slug` (`String?`, `@@unique([projectId, slug])`), `Task.number` (`Int?`), `Project.taskCounter` (`Int @default(0)`) + additive migration (`--create-only`, drift-checked). Assign `number` via the atomic project-counter bump in `create_task` (in its existing tx) + `add_backlog` (wrap in a tx). Backfill the seed: `006`/`007` set feature slugs (their `f-*` names), project-wide task numbers, and the final `taskCounter`. | `prisma/schema/app.prisma`, `prisma/migrations/*`, `lib/projects/capabilities/{create-task,add-backlog}.ts`, `prisma/seeds/app/{006,007}*.ts`, `tests/unit/lib/projects/capabilities/*`, `tests/unit/prisma/seeds/*` | f-data-model | migration applies clean on a fresh DB + `db:drift-check` green; a created task gets the next project number (two concurrent creates get distinct numbers — counter is atomic); the seed populates slugs + numbers + counter; `eraseUser` still cascades/nulls correctly; gates green | not started | — |
| t-2 | **Retrofit the reads + UI.** Thread `slug`/`number` through `/plan` (`plan.ts` + `plan/**` DTOs/rows: feature slug, `t-{number}`, dep chips → slug) and `/board` (`board.ts` + `board/**`: card `{slug} · t-{number}`, owned-feature chips → slug). Fallback when null. | `lib/projects/{plan,board}.ts`, `components/hub/projects/plan/**`, `components/hub/projects/board/**`, their DTO `types.ts`, `tests/**` | t-1, f-plan-view, f-board-view | Plan feature rows show the slug + dep-chips show slugs; Plan task rows show the stable `t-{number}`; Board cards show `{slug} · t-{number}`; a null slug/number renders the fallback; **owner browser-validates both surfaces** (HB6); gates green | not started | — |

*Standing steps in each Done-when:* `commit → /pre-pr → /security-review → push → open PR → /code-review`; `gh pr create --repo human-centric-engineering/hce-hub`. t-1 **has a migration** → `/pre-pr` drift step runs (B13). **No** HB2 / platform edit.

## Test strategy

vitest = happy-dom, no live DB ([[planning-retro]] B9). t-1: the number-assignment is the load-bearing bit — assert `create_task`/`add_backlog` bump the counter + set `number` (mocked tx asserts the counter update precedes the create); the seed's slug/number/counter mapping is a pure-unit + idempotency check. t-2: DTOs carry slug/number; rows/cards render them; null → fallback; `serverFetch`-mocked page smokes.

## Open questions

- **Resolved inline:** slug authored + nullable + per-project-unique (recon #2, owner-decided authored); task number project-wide via `Project.taskCounter` atomic bump (recon #3); write paths (recon #4); migration `--create-only` + drift (recon #5); reads/UI retrofit (recon #6/#7).
- **For the owner to confirm (at claim review):**
  1. **Sizing: 2 PRs (schema+seed+write · then read+UI retrofit).** Recommended.
  2. **Slug/number nullable + fallback** (vs non-null with an in-migration backfill). Recommended nullable now; tighten once intake authors slugs everywhere.
  3. **Task-number mechanism: `Project.taskCounter` atomic bump** (vs denormalized `Task.projectId` + `@@unique`). Recommended the counter (simpler, race-safe, no denorm).

## Upstream follow-ups / seam ledger

**None.** Pure leaf-app `app.prisma` migration + fork-owned retrofits. (Records: this feature also captures the **process retro lesson** — surface schema-gaps-vs-design as owner decisions, don't silently reconcile — in [[planning-retro]] at close-out.)

## Decisions log   (append-only, newest first)

- **2026-07-15 — Claimed + planned (owner Simon).** Corrective feature closing the feature-slug / task-number gap. Origin: [[f-data-model]] modelled cuid ids only; [[f-plan-view]] §09 silently reconciled the design's `f-slug·t-N` to "title carries identity" (owner caught it). **Owner decisions:** slugs are **authored** (the plan-authoring AI writes them, short/scannable — not title-derived); **sequence = schema-fix PR then retrofit, before the §10 close-out.** Key reconciliations: `Feature.slug String?` per-project-unique + `Task.number Int?` project-wide via a `Project.taskCounter` atomic bump in the task-creating capabilities; fork-owned additive migration (B13 `--create-only` watch); retrofit `/plan` + `/board` reads + the plan/board UI to render real refs; seed backfills slugs/numbers/counter. **Pure leaf-app: no HB2, no platform edit, no upstream ask.** **Recommended 2 PRs.** **Blocks the §10 close-out.**
</content>
