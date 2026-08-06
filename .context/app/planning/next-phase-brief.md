---
status: phase-brief
opened: 2026-08-06
parent: v1-requirements.md
---

# HCE Hub — next phase: the Hub runs its own planning

> The brief for the phase after V1. Companion to [[v1-requirements]] (what V1 is)
> and [[futures]] (the long horizon). Sits at v1-requirements' altitude — the
> "what and why" of this phase — not the task-level plan. Detailed task
> breakdowns are done per feature at claim time (pressure-tested before
> `plan_feature`, per the sizing discipline).

## The frame

**This phase is the self-hosting arc's second act.** V1's self-hosting made the
Hub record its own _build_. This phase makes the Hub **run its own planning**:
hold its roadmap, capture new ideas as they occur, and manage Sunrise as a real
project. Same dogfooding move, one level up.

**Not the AI features.** The V2 AI trio — `f-sidekick` (12), `f-intake` (13),
`f-morning-brief` (15) — comes **after** this phase (owner decision, 2026-08-05).
None of the parts below need AI in their base form; AI _enhances_ the later layer
(mining parked ideas, auto-triaging Sunrise issues) but the substrate is
deterministic. If a specific feature turns out to need AI, we pull it forward and
say so.

## The keystone: Phases

`Phase` is the primitive that makes the three threads **one coherent thing**
rather than three. The scaffolding already exists in the schema (dormant since
V1); this phase activates it. Crucially, `Phase` is **per-project**, so each
project reads its phases in its own semantics — no collision:

| Project        | What a phase means      |
| -------------- | ----------------------- |
| HCE Hub        | an **epic** / work band |
| Sunrise        | a **release** band      |
| (any, `parked`) | an **idea park**        |

That per-project reading is why one small primitive serves epics, releases, and
idea capture at once — and why we don't need a dedicated Release model yet (see
[Decisions](#decisions-locked)).

## The shape — 2 code features + 2 onboarding efforts

Sequenced by dependency; `f-phases` is the keystone everything else stands on.

### 1. `f-phases` — activate the scaffolding _(code · keystone)_

Make `Phase` real: verbs to create / assign / reorder / update phases; phase
grouping on the plan + board; parked-phase suppression (hidden until opened); a
phase view. Everything below depends on this.

_Per-feature open questions (settle at claim time):_ does "assign feature → phase"
extend `update_feature` (it already patches feature fields) or warrant its own
verb? How much of the plan/board UI regroups vs. adds a phase lens?

### 2. `f-idea-capture` — the parking gesture _(code · depends on `f-phases`)_

Low-friction capture of a tweak or a futures-level idea **without leaving the
current work**: an MCP jot (the path that matters most when heads-down in Claude
Code) and a quick UI "jot" affordance → a lightweight stub in a **parked phase**,
plus a promote-to-real-feature flow. The `add_backlog` gesture the claim-model
pivot removed, returning at _idea_ altitude. Full concept:
[[futures#Frictionless idea capture — the parking gesture `[v1.x]`]].

_Open design fork (settle at claim time):_ do cross-project, futures-level ideas
live in a per-project parked phase, or a lighter **studio-wide idea inbox** above
any single project?

### 3. Onboard Sunrise as a Hub project _(mostly data · depends on `f-phases`)_

Sunrise becomes the **second** Hub project — the first real exercise of the
multi-project machinery, and the foundation for the
[[futures#Sunrise as a Hub project — bidirectional flow|bidirectional-flow]]
futures. Seeded from the [`platform-divergences.md`](../platform-divergences.md)
ledger + the open upstream issues. Releases are **phases** (`v0.8.0` = adopted,
`v0.9.0` = upcoming); the **adoption workload and the divergence ledger are
modelled as tasks/features under each release-phase**. Retroactively capturing the
v0.8.0 sync this way is our first real dataset — and it's the part that actually
manages the merge-reconcile chore (see [Decisions](#decisions-locked)). Small code
only if issue/release niceties earn it; the base is a data seed.

### 4. Recreate `futures.md` in the Hub _(data · depends on `f-phases` + `f-idea-capture`)_

Author the futures doc into **parked-phase features/ideas** in the HCE Hub
project — the same markdown→Hub move as the chubproject cutover and the planned
onboarding of John's projects. Turns the futures doc from a static file into
Hub-resident, browseable, promotable roadmap data the (later) sidekick can mine.

**Sequencing:** `f-phases` → then `f-idea-capture` and Sunrise-onboarding (largely
parallel) → then futures-in-Hub (wants the parking gesture first).

## Decisions locked

- **Roadmap home = the HCE Hub project** (chubproject). The Hub's futures are
  features of the Hub; parked phases hold what isn't current; broader
  module/studio-level futures get their own parked phases there for now, splitting
  into a dedicated studio project later only if it earns it.
- **AI features come after this phase** (unless a specific part needs AI — none of
  the base versions do).
- **Phase-as-release now; dedicated `Release`/`Divergence` models deferred.** The
  2026-08-06 design experiment concluded the merge-reconcile value lives in
  modelling the _adoption workload + divergence ledger as tasks_ (which
  phase-as-release supports for free and reversibly), not in a release _entity_.
  The genuinely-additive model depends on a shape only one sync has sampled, so
  it's deferred until ~2–3 syncs stabilise the adoption checklist (or a second
  fork makes cross-fork release-impact real). Captured:
  [[futures#Dedicated release + divergence modelling `[architectural]`]].

## Explicitly not this phase

- The V2 AI trio (`f-sidekick`, `f-intake`, `f-morning-brief`) — next.
- Dedicated `Release` / `Divergence` / adoption-checklist models — deferred as above.
- Onboarding John's other real dev projects — related markdown→Hub work, but its
  own effort once the parking/phases substrate exists.
- A studio-wide idea inbox as a distinct surface — a live design fork inside
  `f-idea-capture`, not a committed scope.
