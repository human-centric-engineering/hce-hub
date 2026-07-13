---
name: f-data-model
feature: 03 / f-data-model
status: in flight        # not started | in flight | blocked | shipped
owner: Simon
opened: 2026-07-13
plan: .context/app/planning/plan.md
spec: .context/app/planning/v1-requirements.md
---

# f-data-model — Prisma models + scaffolding

*Feature 03 on [[plan]]. Binding design: [[v1-requirements]] §10 (data model sketch), [[futures]] (dynamic-focus + coarse-grouping scaffolding); [[CUSTOMIZATION|building-on-sunrise]] §5 (satellite-FK pattern), §9 (migration sync).*

## Intent

The Hub's coordination data model — Project / ProjectMember / Feature / Task and their edges — plus the additive **futures scaffolding** (Sprint, FocusDirective, Phase) that later v1.x work consumes without a migration. This is the spine every downstream feature (`f-access`, `f-hub-capabilities`, `f-sidekick`, the UI) reads and writes. Schema + migrations + drift probes only — no capability, API, or UI consumes it here.

## Reconciliation with current repo reality   (required — done first)

Verified against `main` after f-fork shipped, 2026-07-13. Each finding is a decision.

- **`app.prisma` is NOT the empty fork-reserved file the docs imply — vanilla Sunrise ships three app-tier models in it.** `git log prisma/schema/app.prisma` shows `ContactSubmission`, `FeatureFlag`, `AuthBootstrap` arrived via **upstream** commits (`db1c3e9b` multi-file schema folder, `0c9ad007` #278). Their tables are unprefixed (`contact_submission`, `feature_flag`, `auth_bootstrap`). → **Decision:** add Hub models to `app.prisma` alongside them (the documented convention — CLAUDE.md banner, README). My additions sit in their own hunks (end of file) and don't touch Sunrise's model blocks, so the only merge risk is an append-point conflict if a future Sunrise release also appends a model — a trivial "keep both". *Considered and rejected:* a dedicated `prisma/schema/hub.prisma` (the multi-file folder — generator/datasource live in `base.prisma` — would load it, giving zero append-conflict risk). Rejected to follow the written convention + KISS; the append risk is low and cheap. Flag if merges prove otherwise.
- **Table + migration prefix `app_*` (the fork convention), even though Sunrise's own app-tier tables aren't prefixed.** CLAUDE.md/README: "app_… migrations touching only app_* tables." → Hub tables `@@map("app_project")`, `app_feature`, … to namespace against any future Sunrise table; migrations named `app_*` (e.g. `app_add_coordination_models`) for human triage in the interleaved history ([[CUSTOMIZATION|building-on-sunrise]] §9). *(Easily changed to `hub_` if preferred — resolved to `app_` per the doc.)*
- **`User` is `@@map("user")` (in `auth.prisma`).** Hand-written satellite FKs reference the **`@@map` name** `"user"("id")`, not the model name ([[planning-retro]] B11). **Never add a Prisma `@relation` to `User`** (that needs a field *on* `User` — the fork-and-edit trap, [[CUSTOMIZATION|building-on-sunrise]] §5). Every Hub→User reference is a plain `String`/`String?` column + a hand-written migration FK.
- **Erasure is covered by the FK `ON DELETE` — no erasure hooks needed in v1.** `eraseUser()` (`lib/privacy/erase-user.ts`) runs `tx.user.delete()`, which **fires the DB referential actions**; so a hand-FK with `ON DELETE CASCADE`/`SET NULL` erases/nulls Hub rows automatically. → **Decision:** *do not* register `registerErasureCleanupHook`s (the plan's t-3 over-specified them). Hooks are only for residual PII the cascade can't reach; the v1 sketch denormalizes no user identity (no names/emails copied into Hub rows). **Revisit only if a Hub table later stores denormalized user PII.**
- **`ON DELETE` policy per User reference** (GDPR — personal data cascades, retained shared work nulls):
  - **`ON DELETE CASCADE`** (the row *is* the user's participation): `app_project_member.userId`, `app_task_claim.userId`.
  - **`ON DELETE SET NULL`** (retain the shared work/audit, drop the person — column nullable): `app_project.leadUserId`, `app_feature.ownerUserId`, `app_task.claimedByUserId`, `app_focus_directive.declaredByUserId`. (Precedent: Sunrise's own `FeatureFlag.createdBy` is an un-FK'd nullable string — retained-config shape.)
  - Each hand-FK gets a **drift probe** (`lib/app/db-drift.ts`) pinning the constraint **and its `ON DELETE` action**, so a future `migrate dev` can't silently drop the FK or flip the GDPR action ([[CUSTOMIZATION|building-on-sunrise]] §5, [[planning-retro]] B11).
- **`Project.knowledgeCategoryId` → `Project.knowledgeTagId` + `Project.sidekickAgentId` (both nullable `String`, no FK).** No `AiKnowledgeCategory` primitive exists (plan Decisions log, 2026-07-10). These reference Sunrise's `knowledge_tag` / `ai_agent` config tables but are **set by later features** (`f-project-admin` creates the tag; `f-sidekick` seeds the agent). → **Decision:** define them now as nullable `String` with **no hand-FK** — app-layer integrity, avoiding coupling f-data-model to Sunrise config-table names + two extra drift probes for rarely-deleted config. (A dangling id on config deletion is handled by re-provisioning, not referential integrity.)
- **Migration hygiene (standing steps, [[planning-retro]] B13/B11):** author with `db:migrate:dev -- --create-only` and **inspect the generated SQL for spurious `DROP INDEX`/`DROP … ` on Sunrise's Prisma-unmodelled objects** (pgvector HNSW, tsvector GIN) — `migrate dev` diffs the whole schema against the shadow DB and can emit drops for objects it can't model. Strip any, then `db:migrate:dev`. The hand-FK lines are added to the generated SQL by hand; CI/prod apply via `db:migrate:deploy`.

**Tier / seam hypotheses (confirmed):** pure leaf-app. Owns `prisma/schema/app.prisma` (additions), `lib/app/db-drift.ts` (fill), new `app_*` migrations. **Zero core→fork seams, zero upstream asks.** No platform-file edits → **no `platform-divergences.md` rows** (adding models to `app.prisma` and filling `db-drift.ts` are designed fork uses, not divergences).

## Promoted tasks

**Sizing (applying the v2 size gate — [[feature-plan-authoring-guide]] §2 / [[planning-retro]] HB1):** the plan sketched **5** tasks. Folded to **3**. The two futures tasks (Sprint/FocusDirective, Phase) were commit-sized pure-schema additions split by *concept* → **folded into one** futures PR (B1 + the tiny-by-purity gate). The coordination model stays **two** PRs — but only because each half clears the gate as a *real* PR (a distinct domain, 3–4 models + hand-FKs + drift probes + a migration, >150 lines), not by purity; the split concentrates focused review on the FK/erasure/migration machinery where it pays ([[planning-retro]] B8/B11/B15).

| ID  | Task | Files | Deps | Done-when | Status | PR |
|-----|------|-------|------|-----------|--------|----|
| t-1 | **Project-domain schema** — `Project` (incl. `status` enum `planning\|active\|archived`, `hostPlatform`, `leadUserId`, `knowledgeTagId?`, `sidekickAgentId?`, repo URL), `ProjectMember` (`role` enum `lead\|member`), `Feature` (`status` enum `planning\|in-flight\|blocked\|shipped`, `helpWanted`, `ownerUserId`), `FeatureDependency`. Hand-FKs to `"user"` (leadUserId SET NULL, member.userId CASCADE, ownerUserId SET NULL) + `app_project`/`app_feature` self/child FKs; drift probes for each; `app_add_project_domain` migration. | `prisma/schema/app.prisma`, `prisma/migrations/*_app_add_project_domain/`, `lib/app/db-drift.ts` | — | migration applies clean on a fresh `db:reset`; `db:drift-check` green (probes assert every FK + its `ON DELETE`); erasing a user via `eraseUser()` nulls `leadUserId`/`ownerUserId` and deletes their memberships (smoke); generated SQL inspected for spurious `DROP INDEX` (B13); gates green | available | — |
| t-2 | **Task-domain schema** — `Task` (`status` enum `backlog\|available\|claimed\|in_pr\|merged` — the *data* enum; effective status is computed later by `f-board-view`, [[v1-requirements#5|§5]]), `filesScope String[]`, `claimedByUserId?`, `prUrl?`; `TaskDependency`; `TaskClaim` (`claimedAt`, `releasedAt?` — soft-collision history). Hand-FKs: `task.featureId`→`app_feature`, `task.claimedByUserId`→`"user"` SET NULL, `taskDependency` self, `taskClaim.taskId`→`app_task`, `taskClaim.userId`→`"user"` CASCADE; drift probes; `app_add_task_domain` migration. | `prisma/schema/app.prisma`, `prisma/migrations/*_app_add_task_domain/`, `lib/app/db-drift.ts` | t-1 | migration applies clean; drift-check green; erasing a user nulls `claimedByUserId` and deletes their `TaskClaim`s (smoke); no spurious drops; gates green | backlog | — |
| t-3 | **Futures scaffolding** (additive, unconsumed in v1 — [[futures]]) — `Sprint` (`status`, `planMarkdown?`), `FocusDirective` (`projectId`, `sprintId?`, `declaredByUserId`, `intent`, `deadline?`, `reason?`, `status`), `Phase` (`projectId`, `ordinal`, `status` incl. `parked`) + nullable **`Feature.phaseId`** column. Hand-FKs (`focusDirective.projectId`/`phase.projectId`→`app_project`, `focusDirective.declaredByUserId`→`"user"` SET NULL, `sprintId`, `feature.phaseId`→`app_phase`); drift probes; `app_add_futures_scaffolding` migration. | `prisma/schema/app.prisma`, `prisma/migrations/*_app_add_futures_scaffolding/`, `lib/app/db-drift.ts` | t-1 | migration applies clean; drift-check green; **no v1 code references these** (schema-only — the whole point); no spurious drops; gates green | backlog | — |

*Standing steps in every Done-when:* author migrations `--create-only` → inspect+strip spurious `DROP INDEX` (B13) → add hand-FK SQL referencing `"user"`/`app_*` `@@map` names → `db:migrate:dev`; `db:drift-check`; then `/pre-pr` → `/security-review` → `/code-review` before the PR opens (`gh pr create --repo human-centric-engineering/hce-hub`).

## Test strategy

Schema/migration correctness is **not** vitest-shaped (vitest = happy-dom, **no live DB** — never "integration test against the dev DB", [[planning-retro]] B9). Prove it where it's real:
- **`db:migrate:deploy` on a fresh DB + `db:drift-check`** are the primary gates — the drift probes *are* the executable assertion that each hand-FK and its `ON DELETE` exist (they run in `/pre-pr` and CI).
- **A `smoke:*`-style erasure check** (real dev DB): create a user + a Project (lead), Feature (owner), ProjectMember, Task (claimed), TaskClaim → `eraseUser()` → assert memberships/claims are **deleted** and `leadUserId`/`ownerUserId`/`claimedByUserId` are **null**. This is the load-bearing behavioural test (the FK `ON DELETE` is the GDPR mechanism); extend the existing erasure smoke rather than a new harness if one exists.
- **Unit tests:** minimal — schema has no logic to unit-test. Any pure helper (e.g. a status-band constant) imports its specific module, not a DB-bound barrel (B12).

## Open questions

- **Resolved inline:** schema file → `app.prisma` (convention; hub.prisma rejected). Table/migration prefix → `app_*` (doc). `knowledgeTagId`/`sidekickAgentId` → nullable `String`, no FK. Erasure → FK `ON DELETE` only, no hooks. `leadUserId`/`ownerUserId` → SET NULL (a project/feature may be temporarily person-less; reassigned by admin). Futures → one PR. Task `status` → 5-value data enum per §10 (effective status computed later).
- **Needs the owner:** none — every choice has a defensible default from the spec, the shipped code, or the disciplines ([[planning-retro]] B20). *(If you'd prefer `hub_` table prefix or a dedicated `hub.prisma`, both are trivial pre-t-1 swaps — say so and I'll adjust.)*

## Upstream follow-ups / seam ledger

**None.** Pure leaf-app schema work through `app.prisma` + the fork-owned `db-drift.ts` scaffold. No core→fork seam, no upstream issue, no platform-file edit.

## Decisions log   (append-only, newest first)

- **2026-07-13 — Sized to 3 PRs (from the plan's 5) via the v2 gate.** Folded the two futures tasks into one (commit-sized, split-by-concept); kept coordination as two *real*-PR domain slices (Project, Task) for focused FK/migration review. See Sizing note.
- **2026-07-13 — Erasure via FK `ON DELETE`, no hooks (v1).** `eraseUser()` deletes the user row → DB referential actions fire; no denormalized PII → no `registerErasureCleanupHook` needed. Refines the plan's t-3.
- **2026-07-13 — Hub models live in `app.prisma` (shared with Sunrise's app-tier models), `app_*`-prefixed.** `app.prisma` ships non-empty upstream; additions are hunk-isolated, append-conflict risk low. `hub.prisma` considered, rejected for convention + KISS.
