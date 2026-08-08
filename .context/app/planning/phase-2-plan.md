---
name: HCE Hub — Phase 2
status: planning
host_platform: sunrise (leaf fork)
sunrise_baseline: v0.8.0 (synced 2026-08-04)
opened: 2026-08-06
spec: next-phase-brief.md
epic: phase-2 · Self-Hosting the Roadmap
---

# HCE Hub — Phase 2 · "Self-Hosting the Roadmap"

> Build breakdown for the **second phase** of HCE Hub — the self-hosting arc's
> second act (V1 made the Hub record its own _build_; this makes it **run its own
> planning**). Authoritative intent: [next-phase-brief](./next-phase-brief.md); conventions:
> [bug-handling](./bug-handling.md), [idea-inbox](./idea-inbox.md); horizon: [futures](./futures.md). Structured to the
> [HCE Hub plan-authoring convention](./plan-authoring-guide.md) and reviewed through
> [planning-retro](./planning-retro.md). **Named phase** (owner ask): _Self-Hosting the Roadmap_
> (rename freely).
>
> **This markdown is the authoring draft, not the record.** Since the
> [V1 self-hosting cutover](./plan.md), **the Hub is the system of record.** This doc exists to
> _author and review_ the breakdown before it's created in the Hub
> (`create_feature`/`plan_feature`). Once created, the Hub is authoritative and
> this file freezes into history — the same markdown→Hub move as the V1 cutover.

## How to read this — the working model (Hub-as-record)

The [plan-authoring-guide](./plan-authoring-guide.md) (convention v2) predates the self-hosting cutover;
its "claim-first **docs PR**" and `backlog|available|claimed→done` task vocab are
**superseded** here. The current model:

- **Task = one PR**, sized by **separability of value, not line count** — cohesive/
  homogeneous/sequential/unconsumed-until-complete work is one PR even when large
  ([planning-retro](./planning-retro.md) HB3). Not a commit.
- **Feature = the unit of ownership** — one owner, a coherent capability, ~2–5
  tasks, explicit `depends on`. A flat list; order emerges from dependencies.
- **Phase = an epic.** This whole breakdown is one epic: **`phase-2`**. (Meta-note:
  Phase-the-primitive is _also what feature 01 builds_ — until it ships, these
  features live in the Hub's single default phase and get assigned to `phase-2`
  once `f-phases` lands. Owner-stated bootstrap.)
- **Claim / close-out are Hub verbs, not docs PRs.** Claim = `claim_feature`
  (+ `plan_feature`) in the Hub (MCP or UI); close-out = `ship_feature`. Task
  status is the Hub's **`claimed | active | merged`** (blocked derived); feature
  status is **derived**. No "PR open" state ([planning-retro](./planning-retro.md) A5). Each task is
  one pure-code PR; its status is driven by the Hub verbs (`start_task` /
  `complete_task` / `set_pr`), reconciled automatically on merge by `f-github-sync`.
- **Gates before the PR:** every task's Done-when includes `/pre-pr` →
  `/security-review` → `/code-review`, run before/at PR ([planning-retro](./planning-retro.md) A4/B4).
- **UI features browser-validate the live render** before close-out
  ([planning-retro](./planning-retro.md) HB6) — gates prove the code, not that the surface reads right.
- **Schema-vs-design gaps are owner decisions, surfaced — not settled silently**
  ([planning-retro](./planning-retro.md) HB8). Where a feature _adds_ schema, it's called out below.
- **Bugs found mid-phase** follow [bug-handling](./bug-handling.md): a `bug`-kind Task on the
  feature it broke, `next_task`-biased, `help-wanted` as the valve.

## Phase & project

| Field | Value |
|---|---|
| Phase (epic) | **`phase-2` · Self-Hosting the Roadmap** — the Hub runs its own planning |
| Spec | [next-phase-brief](./next-phase-brief.md) (intent) · [bug-handling](./bug-handling.md) · [idea-inbox](./idea-inbox.md) · [futures](./futures.md) |
| Host platform | Leaf fork of Sunrise **v0.8.0** (`app.prisma`, `lib/app/**`, `.context/app/`, `app/(hub)`) |
| Record | The **Hub** (`chubproject` on `hub.hce.studio`) — this doc is the authoring draft |
| Lead | Simon (builders: Simon + John) · owners assigned at `claim_feature` |
| Status | `planning` |

## Relationship to Sunrise — tier & seam analysis

*(Required by the convention: model tier + enumerate seams before sizing —
[planning-retro](./planning-retro.md) A2/A3.)*

**Tier: single leaf fork** (unchanged from V1 — the Hub reserves nothing
downstream). Every seam Phase 2 needs is an existing **fork→core** seam (the fork
calls into a shipped Sunrise registry) or pure app-tier work (`app.prisma` models
+ `app/(hub)` routes + fork-owned `lib/projects/**`). Enumerated:

| Feature | Seam / surface | Direction | Core touch? |
|---|---|---|---|
| `f-phases` | `app.prisma` (Phase model **already exists**) + new capabilities via `lib/app/capabilities.ts` + `app/(hub)` UI | fork→core | none |
| `f-bug-handling` | `app.prisma` **adds `Task.kind`** + `next_task`/`feature-status` mods + `app/(hub)` UI | fork→core | none |
| `f-idea-capture` | new capabilities + `app/(hub)` UI (parked `Phase` exists) | fork→core | none |
| `f-github-identity` | new satellite table `app_user_github` (hand-FK → `user`, like `leadUserId`) + a section on the existing `/profile` + `/settings` | fork→core | **watch A** (seam) |
| `f-invite-provisioning` | native Sunrise invites (exist) + extend project-add to pre-acceptance invitees | fork→core | **watch B** (data shape) |
| `f-sunrise-project` | data seed (MCP/scripts) from `platform-divergences.md` + GitHub issues | — (data) | none |
| `f-futures-in-hub` | data authoring (`futures.md` → parked-phase features) | — (data) | none |

**Headline: zero anticipated core→fork seams**, mirroring V1 — Phase 2 is buildable
through existing leaf-fork seams. Two build-time watch-items ([planning-retro](./planning-retro.md)
B17 — tier/upstream is a build-time finding, verified at claim not asserted here):

- **Watch A · profile-section seam** (narrowed 2026-08-06, owner). The pages
  **exist** — `app/(protected)/profile/page.tsx` + `.../settings/page.tsx` (Sunrise,
  fork-visible) — and that's where the GitHub-connect section goes. The open
  question is the **injection seam**: is there a fork-owned profile/settings
  section-contributor seam (grep the catalog first — HB5), or do we add one? Since
  the pages are Sunrise-owned route-group files, a section seam is the clean path;
  if none exists it's a **small upstream ask** (a profile-section contributor),
  consistent with the leaf-fork model.
- **Watch B · pre-acceptance membership** (narrowed 2026-08-06, owner). Invites are
  **native Sunrise** — confirmed (`auth.prisma` invitation metadata + the
  `user-created` hooks); not ours to build. The work is: today project-add only
  accepts **already-accepted** users; extend it to **invited-but-not-yet-accepted**
  ones. The single recon question is the **data shape**: does a pending invitee have
  a `User` row a `ProjectMember` can reference (then it's an add-flow filter change),
  or only an invitation record (then we need a pending-membership reconciled to
  `userId` on accept)? Confirm from behaviour at claim.

## Features (epic: `phase-2`)

Flat list, rough dependency order (most-ready first). `~PRs` is an indicative
_hypothesis_, re-checked at `plan_feature` ([plan-authoring-guide](./plan-authoring-guide.md) sizing).

| # | Feature | Depends on | ~PRs | Capability |
|---|---|---|---|---|
| 01 | `f-phases` | — | 2 | **Keystone.** Activate the Phase scaffolding: create/assign/reorder/update verbs, plan+board grouping, parked-phase suppression, phase view (incl. the board merged-column cap, inbox #6) |
| 02 | `f-bug-handling` | f-phases | 2 | Bug = `bug`-kind Task: add `Task.kind`, `next_task` bias, kind-aware "shipped · N fixes" status, the active-fixes strip, the standing Platform/Maintenance feature |
| 03 | `f-idea-capture` | f-phases | 2 | The parking gesture: capture + promote-to-phase verbs, a quick-jot UI affordance, the inbox view (parked phase / studio inbox) |
| 04 | `f-github-identity` | — | 2 | Connect a GitHub login to a Hub user (`app_user_github` satellite + connect UI); unblocks §14 merge attribution + Sunrise-project authorship |
| 05 | `f-invite-provisioning` | — | 1–2 | Extend project-add to **invited-but-not-yet-accepted** users (invites are native Sunrise) so first login isn't empty — supports onboarding John (watch B: data shape) |
| 06 | `f-sunrise-project` | f-phases (·f-github-identity) | 2 | Onboard **Sunrise as the 2nd Hub project** (data): seed from the divergence ledger + open upstream issues; phase-as-release bands |
| 07 | `f-futures-in-hub` | f-phases, f-idea-capture | 1 | Recreate `futures.md` as parked-phase features/ideas in the Hub (data) |

**Critical path (the spine):** `f-phases → f-idea-capture → f-futures-in-hub`, with
`f-phases → f-sunrise-project` alongside. `f-bug-handling` hangs off `f-phases`;
`f-github-identity` and `f-invite-provisioning` are independent and parallelise
from the start. **`f-phases` is the keystone — nothing else's structure resolves
until it lands, so it's claimed first.**

---

### 01 · `f-phases` — activate the Phase scaffolding _(keystone)_
*Depends on:* — · *~2 PRs*
Make the dormant `Phase` model real. Grounded: the `Phase` model + `Feature.phaseId`
+ `PhaseStatus{upcoming,active,complete,parked}` **already exist** (verified against
`app.prisma`) — so this is **verbs + reads + UI, no schema change**.

- **t** — Phase verbs + read integration: `create_phase` / `update_phase` /
  `reorder_phase`, and feature→phase assignment. **HB8 fork (decide at claim):**
  does assignment extend `update_feature` (already patches feature fields) or get
  its own `set_feature_phase` verb? Thread `phaseId` into the plan/board read
  funnels (`plan.ts`, `board.ts`) so features group by phase.
- **t** — Phase UI: phase grouping on the Plan (bands, `complete` collapsed,
  `parked` suppressed until opened) + a phase management view. **Fold in inbox #6**
  — the board "merged" column caps at 5/person with a per-person show-more (same
  board surface; [idea-inbox](./idea-inbox.md)).
*Done when:* an owner can create phases, assign features, and see the plan/board
grouped by phase with parked suppressed; the board merged column is capped; gates
green; **browser-validated** (HB6).

### 02 · `f-bug-handling` — bug = task-kind _(convention: [bug-handling](./bug-handling.md))_
*Depends on:* f-phases · *~2 PRs*
Implement the [bug-handling](./bug-handling.md) convention. **Adds schema** (`Task.kind`, surfaced
per HB8 — a new nullable enum defaulting to feature-work).

- **t** — The primitive + logic: `Task.kind` (`feature-work | bug`) migration
  (B13 strip); `next_task` weights `bug` up (a **bias**, not a priority field);
  `computeFeatureStatus` becomes **kind-aware** so an open bug reads "shipped · N
  fixes" and never reverts `shipped`. Seed/adopt the standing "Platform /
  Maintenance" feature convention for orphan/infra bugs.
- **t** — The active-fixes strip: a pinned, project-scoped, self-hiding band above
  the Plan/Board body, reference rows with origin breadcrumbs (`f-x · Phase N ↩`) —
  reference, don't relocate. Bug styling in the board's active column.
*Done when:* a `bug`-kind task on a shipped feature shows as an active fix without
un-shipping the feature, `next_task` leans toward it, the strip renders cross-phase
refs; gates green; **browser-validated**.

### 03 · `f-idea-capture` — the parking gesture
*Depends on:* f-phases · *~2 PRs*
Low-friction capture of a tweak or a futures-level idea without leaving the current
work; the `add_backlog` gesture returning at _idea_ altitude ([next-phase-brief](./next-phase-brief.md)).

- **t** — Capture + promote verbs: an MCP jot (`capture_idea` → a stub in a parked
  phase) and `promote_idea` (parked stub → a real feature in an active phase,
  exercising the promote-to-current-phase flow). **HB8 fork (decide at claim):**
  per-project parked phase vs a studio-wide idea inbox for cross-project ideas.
- **t** — The UI: a quick "jot" affordance (a keystroke, not a form) on Hub
  surfaces + the inbox view.
*Done when:* an idea can be jotted from Claude Code and the UI, lands in a parked
phase, and be promoted into an active phase; gates green; **browser-validated**.
*First real dataset:* the [idea-inbox](./idea-inbox.md) six items.

### 04 · `f-github-identity` — connect GitHub to Hub users
*Depends on:* — · *~2 PRs* · *(unblocks the deferred §14 attribution + f-sunrise-project authorship)*
Let a user link their GitHub login. **Adds schema** (a satellite table, HB8) —
**not** an edit to core `User` ([idea-inbox](./idea-inbox.md) #1 constraint).

- **t** — `app_user_github` satellite (`userId` hand-FK → `user`, ON DELETE
  Cascade; `githubLogin` unique) — mirror the `leadUserId` FK pattern
  ([planning-retro](./planning-retro.md) B11: reference the `@@map` table `user`, apply via
  `db:migrate:deploy`); a connect/disconnect capability + API; add to
  `HUB_SUBJECT_TABLES`/data-export (GDPR obligation).
- **t** — The connect UI: a "GitHub" section on the **existing `/profile` +
  `/settings`** (`app/(protected)/**`). **Resolve watch A at claim** (HB5 — seam
  catalog first): inject via a fork-owned profile/settings section-contributor seam
  if one exists, else add that seam (small upstream ask) rather than editing the
  Sunrise route-group pages directly.
*Done when:* a user can connect/disconnect a GitHub login from `/profile` +
`/settings`; it's exported for the data subject; gates green; **browser-validated**.
*Follow-on (optional, may defer):* wire `f-github-sync`'s reconcile actor to prefer
the mapped user when present.

### 05 · `f-invite-provisioning` — add invited (pre-acceptance) users to projects
*Depends on:* — · *~1–2 PRs (watch B — data shape)*
Invites are **native Sunrise** (they exist). Today project-add only accepts
**already-accepted** users; this extends it so you can add an
**invited-but-not-yet-accepted** user, so their first login isn't an empty Hub.
Directly supports onboarding John. **Claim opens with the watch-B recon** — the one
open question, the pending-invitee data shape — which decides the shape below and
firms up sizing ([planning-retro](./planning-retro.md) B17).

- **t** — Recon + pre-seed: how invitation resolves under `invite_only`; whether a
  `ProjectMember` can be seeded against a pending/`userId`-less identity, or needs a
  pending-membership shape; the reconcile-on-accept path.
*Done when:* an invited user, on first login, sees the project(s) they were added
to; a non-accepted invite doesn't leak access; gates green.

### 06 · `f-sunrise-project` — onboard Sunrise as the 2nd Hub project
*Depends on:* f-phases · *benefits from f-github-identity* · *~2 PRs (mostly data)*
Sunrise becomes the second Hub project — the first real multi-project exercise
(`chubproject` proved the machinery) and the foundation for the
[bidirectional-flow](./futures.md#sunrise-as-a-hub-project-bidirectional-flow)
futures. **Phase-as-release** (decided 2026-08-06 — dedicated `Release` model
deferred; [futures](./futures.md#dedicated-release-divergence-modelling-architectural)).

- **t** — Seed the project + release-phases: the Sunrise project, phases per
  release (`v0.8.0` = adopted, `v0.9.0` = upcoming), members. Includes inbox #4
  (add **Daybreak** to `hostPlatform` options — adjacent).
- **t** — Model the divergence ledger + adoption workload as **tasks/features under
  the release-phases**, retroactively capturing the v0.8.0 sync as the first
  dataset (this is the part that manages the merge-reconcile chore).
*Done when:* Sunrise exists as a Hub project with release-phases and the v0.8.0
divergence/adoption work visible as tasks; gates green.

### 07 · `f-futures-in-hub` — recreate the futures doc in the Hub
*Depends on:* f-phases, f-idea-capture · *~1 PR (data)*
Author `futures.md` into **parked-phase features/ideas** in the HCE Hub project
(roadmap home = the Hub project, decided 2026-08-05) — turning the static doc into
Hub-resident, promotable roadmap data.
*Done when:* the futures entries exist as parked-phase features the sidekick could
later mine; the source doc is cross-linked; gates green.

## Captured quick-wins ([idea-inbox](./idea-inbox.md))

Not features (task-sized — HB1). Homed as: **#6** board cap → `f-phases` t-2;
**#4** Daybreak platform → `f-sunrise-project` t-1; **#3** avatar/username menu →
**logout + a link to `/profile` (and `/settings`)** (owner, 2026-08-06 — the
existing pages) + **#5** log markdown-render → `bug`-kind tasks once
`f-bug-handling` lands (the dogfood), _or_ a quick standalone fix now (owner's open
timing call — low stakes, single-user). #3's profile link and `f-github-identity`
land on the same `/profile` surface.

## Parked phases (future epics)

- **V2 · AI layer** — `f-sidekick` (12), `f-intake` (13), `f-morning-brief` (15).
  After this phase ([next-phase-brief](./next-phase-brief.md)); intake pairs with idea-capture, the
  sidekick mines the now-Hub-resident roadmap + Sunrise project.
- **Future modules** — Sales, Support, Marketing, Finance, Knowledge ([futures](./futures.md)).
- **Dedicated release/divergence modelling** `[architectural]` — promote once ~2–3
  syncs stabilise the adoption template ([futures](./futures.md#dedicated-release-divergence-modelling-architectural)).

## Decisions log (append-only, newest first)

- **2026-08-06 · Watch-items narrowed (owner).** (A) Profile pages already exist
  (`/profile` + `/settings`); `f-github-identity` extends them via a section seam
  (add one if absent). (B) Invites are native Sunrise; `f-invite-provisioning` only
  extends project-add to pre-acceptance invitees — the sole recon is the
  pending-invitee data shape. Bug #3 (logout) gains a `/profile` link.
- **2026-08-06 · Phase named "Self-Hosting the Roadmap"** (owner ask for a name +
  number). Bootstrap: features are authored here, created in the Hub's default
  phase, then assigned to `phase-2` once `f-phases` ships.
- **2026-08-06 · Working model supersedes plan-authoring-guide v2** for claim/
  close-out (Hub verbs, not docs PRs) and status vocab (Hub's `claimed|active|
  merged`, derived feature status) — the self-hosting cutover changed the record.
  _Guide is a candidate for a v3 bump._
- **2026-08-06 · phase-as-release; dedicated Release model deferred** (design
  experiment) — [futures](./futures.md#dedicated-release-divergence-modelling-architectural).
- **2026-08-06 · Bug = task-kind, not a Feature or an Issue model** — [bug-handling](./bug-handling.md).
- **2026-08-05 · Roadmap home = the HCE Hub project; AI features after this phase.**

## References

- [next-phase-brief](./next-phase-brief.md) — the phase's intent (spec).
- [bug-handling](./bug-handling.md) · [idea-inbox](./idea-inbox.md) — companion conventions + the seed dataset.
- [plan-authoring-guide](./plan-authoring-guide.md) · [planning-retro](./planning-retro.md) — the convention + the learnings lens.
- [plan](./plan.md) — the V1 plan (worked example; the format this follows).
- [futures](./futures.md) — parked epics + the deferred release-modelling decision.
