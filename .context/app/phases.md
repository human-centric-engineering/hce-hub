# Phases

[[phase-2-plan]]'s keystone. A **Phase** is a roadmap band a project reads in its
own semantics — an **epic** for a build project (HCE Hub), a **release** band for
a platform (Sunrise), an **idea park** when parked. One small primitive serves all
three because **phases are per-project**, so each project groups its features
without colliding with another's meaning.

> You open the Plan, drag "UI Spine" above "Foundations", drop a half-formed idea
> into a parked "Ideas" band so it's out of the active roadmap but not lost, and
> file three loose features into "v0.9.0" — all from the Plan tab, no MCP, the
> board re-grouping as you go.

f-phases activated the `Phase` scaffolding that shipped dormant as futures
groundwork, so there is **no migration** in the whole feature — the model,
`PhaseStatus` enum and `Feature.phaseId` FK all pre-existed. It landed in three
tasks: **t1** the write verbs, **t2** the read + Plan grouping, **t3** the
management UI + REST.

## The model (pre-existing, `prisma/schema/app.prisma`)

- **`Phase`** — `projectId`, `ordinal` (display order), `name`, `description?`,
  `status`, `startedAt?` / `completedAt?` (lifecycle timestamps), `createdAt`.
- **`PhaseStatus`** — `upcoming` · `active` · `complete` · `parked`. `parked` is
  the dormant idea-pool: visible and browseable, hidden (collapsed) from active
  views.
- **`Feature.phaseId`** — `String?`, `onDelete: SetNull` (phase membership is
  optional; deleting a phase unfiles its features, never deletes them). `Phase`
  has no user FK, so **no `SUBJECT_DATA_SOURCES` obligation**.

There is **no unique constraint on `(projectId, ordinal)`** — reorder is batch
(below), so ordinals are always rewritten as a dense `0..n-1` run and can't
collide. Lifecycle timestamps are **derived from status**, kept coherent in one
place (`phases-service`): entering `active`/`complete` stamps `startedAt` /
`completedAt` once; reopening a `complete` phase clears `completedAt`; a phase is
never left `complete` with a null start.

## Authorization — member-tier throughout

Phases are **collaborative roadmap organisation**, not per-feature authored
content, so every phase write is **member-tier** via the [[f-access]] funnel
(`canAccessProject` / `resolveFeatureAccess('member')`): any project member may
create / rename / reorder / park phases **and file any feature** into one. A
non-member — or a phase/feature in a project the caller can't see — is a **404,
never 403** (no enumeration).

Why "file any feature" is member-tier and not owner-tier: there is **one lead per
project** (`Project.leadUserId` is singular; promoting a new lead demotes the old
in `admin.ts`), so an owner/lead-only rule would strand ordinary members — they
could build the phases but not fill them. The comprehensive `update_feature` verb
keeps its **owner-tier** `phaseId` for editing a feature you own; the dedicated
member-tier assign path is for organising the roadmap.

Phase edits are structural, note-style changes: **audit-logged** (`logAdminAction`)
but they emit **no `ProjectEvent`** — there is no phase `ProjectEventKind`, and
inventing one would be an enum migration this pure-activation feature avoids
(mirrors `update_feature`).

## Surfaces

### MCP capabilities (t1)

- **`create_phase`** — add a phase (name, optional description / status / ordinal;
  appends after the last phase unless positioned).
- **`update_phase`** — rename, edit description, change status (incl. park), move
  (ordinal). Partial patch; `nothing_to_update` if empty.
- **`update_feature`** extended with **`phaseId`** — file a feature under a phase
  (same-project, owner-tier) or `null` to unfile.

Each capability class carries its `functionDefinition`; the seed (`prisma/seeds/
app/019`, `020`, `018`) carries the DB copy the MCP tool list serves, pinned equal
by a `*.parity.test.ts`. **Note:** the seed's `update` branch must re-sync
`functionDefinition` for these `isSystem` tools, or a schema change never reaches
an existing row — the trap that hid `update_feature.phaseId` on dev **and** prod
until fixed fork-wide (upstream `sunrise#545`).

### REST routes (t3) — the management UI's HTTP face

Thin `withAuth` wrappers over the service (auth + section rate-cap automatic;
Zod-validated bodies; each scoped to `:id` so no cross-project id-swap):

| Route                                      | Verb           | Does                                                        |
| ------------------------------------------ | -------------- | ----------------------------------------------------------- |
| `/api/v1/projects/:id/phases`              | `GET` / `POST` | list (with feature counts) · create                         |
| `/api/v1/projects/:id/phases/:phaseId`     | `PATCH`        | rename / status / park / ordinal                            |
| `/api/v1/projects/:id/phases/order`        | `PUT`          | **batch reorder** (`order` beats `[phaseId]` — static wins) |
| `/api/v1/projects/:id/features/:key/phase` | `PATCH`        | file the feature under a phase / unfile                     |

### Read (t2)

- **`lib/projects/phases.ts` · `listProjectPhases`** — funnel-guarded, ordinal
  order (tie → `createdAt`), with feature counts. Behind the manage dialog + the
  assign picker.
- **`lib/projects/plan.ts` · `getProjectPlan`** — enriched to return
  `phases: PlanPhaseBand[]` instead of a flat `features[]`. `groupIntoPhaseBands`
  emits every real phase in **true ordinal order** (a `parked` phase sits where
  its ordinal puts it — collapsed, not sunk to the bottom, so the Plan mirrors the
  manage dialog), then the residual **"No phase"** catch-all last (unfiled
  features; dropped when empty). A project with no phases yields a single
  header-less residual band = the pre-phases flat plan. `planOrder` still applies
  _within_ each band; a dangling `phaseId` (mid-read delete) falls to residual,
  never dropped.

### UI (t2 render + t3 management), `components/hub/projects/plan/`

- **`PhaseBand`** — a collapsible band header (name, signal-toned status chip,
  feature count). `parked` and `complete` bands collapse by default; active /
  upcoming and the residual band start open — plus any band holding the view's
  auto-expanded (active-work) feature.
- **`ManagePhasesDialog`** ("Manage phases", top-right of the Plan) — create,
  rename, set status / park, and **drag-to-reorder** (`@dnd-kit`, keyboard-
  accessible: focus the grip, Space, arrows, Space). Reorder is **optimistic** —
  the list follows the drop immediately from local order state, then `PUT`s the
  batch order and `router.refresh()`es; a failed write reverts to the server order
  and surfaces the error. The pure reorder math is `reorderedIds()`.
- **`PhasePicker`** — a compact per-feature dropdown (⬡ + current phase) on each
  Plan row to file a feature into a phase or "No phase". The current phase is the
  band the row renders in — no extra field on the feature payload.

## Why batch reorder

The manage dialog sends the **complete new phase order**; `reorderPhases` rewrites
ordinals `0..n-1` in a transaction. This is collision-free by construction (which
is why the schema needs no `@@unique(projectId, ordinal)`), idempotent, and the
natural fit for drag-and-drop — the alternative, moving one phase to a target
index and shifting its neighbours, is the exact ordinal-collision trap batch
avoids. The supplied list must be **exactly** the project's phase set (every id,
once) — a partial list would leave unlisted phases with stale, colliding ordinals.

## Not (yet) here

- **Delete a phase** — parking replaces deletion (a parked phase is hidden, not
  destroyed); no delete verb/route.
- **A dedicated `Release` / divergence model** — phase-as-release is deliberate
  for now; see the "Dedicated release + divergence modelling" entry in [[futures]].
- **GitHub-author → Hub-user mapping** for the (later) Sunrise-as-a-project
  onboarding — [[next-phase-brief]].
