---
status: convention
opened: 2026-06-24
convention_version: 2
operationalizes: v1-requirements.md (§4, §5, §10)
---
	
# Authoring an HCE-Hub-style plan

> How to write a build plan in the HCE Hub model — a reusable convention and template. It **operationalizes** [[v1-requirements#4. Three layers of work|v1-requirements §4/§5]] (which defines the layers) with the sizing heuristics, authoring method, and anti-patterns we learned writing — and then *executing* — the [[plan|ConQuest]] and Daybreak (expert-led-framework) plans (the execution lessons are captured in [[planning-retro]] §A). Until the Hub exists, a plan is a markdown doc in the project repo; written to this convention, it ingests cleanly into the Hub when built.

## Why this exists

v1-requirements defines Requirements / Features / Tasks / Phase correctly, but at the definition level. In practice we found two failure modes, both from the *same words being read differently*:

1. **"PR-sized task" drifting to "commit-sized task".** §5's emphasis on "smaller, frequent PRs" reads, naively, as "as small as possible" — producing a swarm of tiny PRs whose review/coordination overhead *slowed* AI-paced development (the ConQuest lesson).
2. **A spec's internal "phases" masquerading as Hub Phases.** A design doc's build sequence (e.g. a "six-phase build order") got treated as the plan's structure, forcing features into buckets and over-steering the breakdown.

This guide pins the meanings and gives a repeatable method so neither happens again.

## The four levels, pinned

| Level | It **is** | It is **not** | Lives in |
|---|---|---|---|
| **Requirement** | The conceptual "we want X to do Y", capability-agnostic. | A unit of work. Part of the plan's structure. | The spec / brief / conversation |
| **Phase** | An **epic** — a coarse, organisational grouping that separates whole *efforts* of work, or parks future ones (`parked`). | A milestone you gate on. A dependency unit. Where ordering comes from. | The plan (often just one active phase) |
| **Feature** | The **unit of ownership** — one owner, one coherent capability, ~2–5 tasks, explicit `depends on` edges. The working atom you claim and advance. | A single PR. A bucket to fill under a phase. | The plan |
| **Task** | **One PR** — a cohesive, reviewable change that merges in one sitting (~200–600 lines is typical). | A commit. The smallest possible diff. | The plan (promoted by the owner) |

**The mental model in one line:** *commits sit below the plan's resolution; a **task** is a PR; a **feature** is an owner; a **phase** is an epic.* If you find yourself mapping a task to a commit, or a feature to a single PR, you've slipped a level.

## Sizing heuristics

- **Task = one PR.** The floor matters as much as the ceiling: a PR is a *cohesive reviewable unit*, not the smallest change that compiles. "Add one field + its test" is a commit *inside* a PR — fold it in. (This is the clarification of v1-requirements §5: smaller than a *feature*, not smaller than makes sense.)
- **Feature = ~2–5 tasks**, matching the grain the Hub's own project board uses. If a "feature" is really 1 task, it's a task — merge it up into a sibling. If it's pushing past ~6, consider splitting.
- **Put a `~PRs` figure on each feature** so its size reads at a glance without decoding the task list.
- **A task can honestly be larger than one PR occasionally** — say so explicitly (flag it), rather than pretending it's small or silently letting it balloon.
- **Indicative sizing is a hypothesis, re-checked at promotion/build.** A task's real shape often only resolves when the owner builds it, and several Daybreak features split at build along predictable seams ([[planning-retro]] B1/B16/B22/B23/B25). Mark these as split candidates: a task whose name joins two concerns with "+" (a pure transform **+** an LLM/IO call; a proposal gate **+** its evaluation); a task spanning **a new endpoint and its consuming UI** (usually two PRs); "several typed kinds under one table" (size by each kind's *enforcement machinery* — fold pure-data kinds into the spine, don't do one-PR-per-kind); and a task leaning on **"reuse existing X"** (weight-check that X is the shape you need before committing to one PR). Conversely, fold a commit-sized sliver *up* into its dependent task.

## Dependencies are the spine

- **Ordering is emergent from `depends on`, not prescribed.** Don't number features in execution order — that hides the dependency truth and freezes a sequence the work will deviate from. Give features semantic slugs, list their dependencies, and let the order fall out.
- **Dependencies are what the Hub consumes** for prioritisation and work-sharing ("what's ready to pull right now?"). Make them explicit and accurate — this is the highest-value content in the plan.
- **Name the critical path** so the spine is visible.
- **Exploratory ordering is allowed** (the [[v1-requirements#3. Human-centric principles (binding)|human-centric principle]]): the plan proposes order; the human may deliberately work "out of order". The plan never gates.

## Ground the plan in verified reality

The plan describes work that hasn't happened yet — but it must not *assume* the ground it stands on. Two failure modes from executing the Daybreak plan ([[planning-retro]] A1–A3), both cheap to prevent at authoring time:

- **Verify every "assumed done / landed upstream" dependency against actual state — with evidence.** The Daybreak plan asserted a foundational seam "already exists upstream"; it didn't, and the gap surfaced only because execution happened to start by checking it. Never assert external/upstream readiness from a spec or memo — grep the seam, check the tag/version, record what you found. Anything the plan itself doesn't build must be *verified*, not trusted.
- **When the project sits on a host platform (Sunrise), model tier ownership and seams up front.** Two things the Daybreak plan got a tier off:
  - **How many tiers, and who owns/reserves what.** If the thing you're planning is *itself* a platform that downstream projects fork, it owns its own tier *and reserves the leaf surface* for its forks — don't assume a single "this project owns everything" tier. State, per tier, which code/doc/schema surface it owns vs. reserves.
  - **Enumerate every cross-boundary seam and tag it by direction.** *Fork→core* seams (the project calls into a platform registry) are cheap and fork-owned. *Core→fork* seams (the platform must call *out* to the project) can't be pure fork-owned — they need a generic upstream mechanism and carry sequencing/merge constraints. Flag core→fork seams as coordination risks in the plan, not surprises found at implementation.

  Tier and seam classification can firm up at *build* — a feature that looked "pure, no upstream change" can turn out to need a generic core seam once you design from behaviour ([[planning-retro]] B17/B19). Write these as the plan's evidenced best hypothesis and expect features to re-confirm them.

## Plan vs spec — board vs knowledge base

Keep two artefacts, with distinct jobs (this mirrors how the Hub will work: the plan is the *board*, the spec is the project *knowledge base* the sidekick reads):

- **Spec / brief** — the Requirements *and* the binding *how*: design, schema, decisions, rationale. The source of truth for *how* to build.
- **Plan** — the Features + Tasks: *what / why / who owns it / what it depends on / rough PR shape*. Intent-level.

The plan **defers the binding *how* to the spec** and **cross-references it per feature** (e.g. "f-engine → spec §5.3, decisions F8/F11/F12"). Don't duplicate the spec into the plan — they'll drift. An agent building a feature reads *both*: the plan for the feature's intent and dependencies, the spec for the binding decisions.

## If the spec already contains "phases"

A design doc often includes a build sequence or its own "phases" (a suggested order to construct things). **Treat that as input to the dependency graph, not as the plan's structure.** Reclassify it into features + `depends on` edges. The spec's sequence is *why* `f-engine` depends on `f-map`; it is not six buckets to slot features into. Inheriting the spec's buckets is how the structure over-steers the breakdown.

## The method (recipe)

1. **Set the epic.** Usually the whole build is *one* Phase (e.g. `v1`). Park genuinely-separate or future efforts as their own `parked` phases.
2. **Ground it in verified reality.** Verify every assumed-landed/external dependency against actual state and record the evidence. If the project sits on a host platform, model the tier ownership and enumerate cross-boundary seams, tagging each by direction (flag `core→fork`). See *Ground the plan in verified reality*.
3. **Draft features from capabilities.** Read the spec for coherent capabilities; each becomes a feature with one plausible owner. Aim for the capability a person would own end-to-end.
4. **Flesh each feature:** a one-line *what/why* intent; `depends on` edges; a `~PRs` size; a list of **indicative, PR-sized** tasks.
5. **Right-size in both directions.** Merge any 1-PR "feature" up into a sibling. Split any >~6-PR feature. Re-pitch any commit-sized task bullet up to a real PR — and mark the build-time split candidates (see *Sizing heuristics*).
6. **Order by dependency** (most-ready first) and name the critical path. Don't hard-number the sequence.
7. **Cross-reference the spec** per feature (section + decision IDs) so the build agent reads both docs.
8. **Add the working scaffolding** (below): status vocabulary (no in-PR state), gates-before-PR definition-of-done, claim-first-when-multi-owner, deferrals-to-a-live-surface, decisions log, work-to-date.

## Identifiers, format & promotion

- **Features:** semantic slugs — `f-engine`, `f-slots`, `f-bootstrap`. **Tasks:** `t-N` within their feature. (Avoid `F1.2`-style numbers — they smuggle a phase/order assumption back in.)
- **Indicative vs promoted.** Task bullets in the plan are *indicative* — a sizing aid, not commitments. A task becomes **promoted** when the owner declares it with a `t-N` id, files-likely-to-touch, deps, and status. Promotion is the agency gesture (v1-requirements §4): nothing the team sees is implicit.
- **Status vocabulary.** Features: `not started | in flight | blocked | shipped`. Tasks (promoted): `backlog | available | claimed → done`. **No "PR open" state** — flip straight to `done` when the PR merges. A two-step terminal status (`in-pr → done`) goes stale because the flip is forgotten; one transition, nothing to forget ([[planning-retro]] A5).

## Definition of done, claiming & deferrals

The plan owns the working model every feature inherits — set these once, up front:

- **Gates before the PR opens, not after.** The task definition-of-done includes the standard gates (`/pre-pr`, `/security-review`, then `/code-review` on the open PR) as completion criteria — run *before* opening the PR, not prompted for afterwards ([[planning-retro]] A4). Every feature and task inherits this.
- **Claim-first as a standalone docs PR — the moment there's more than one builder.** Set Owner + `in flight` and write the feature's detailed plan, then push both as one docs-only PR *before* any task work starts ([[planning-retro]] A6). A claim nobody can see doesn't stop two owners starting the same feature. Concurrent ownership is the Hub's normal condition, so make claim-first the default. (A strictly single-owner plan may still fold the plan into t-1.)
- **Deferrals need a live, actionable home.** A cross-cutting "do this later" parked only in a shipped feature's own doc is abandoned — nobody re-reads a closed feature's plan ([[planning-retro]] B28). Promote cross-cutting follow-ups to a live board surface at close-out. The test: *will the person who actions this see it here after the feature ships, or is it a graveyard?*

## Anti-patterns checklist

- ❌ Tasks sized as commits → a swarm of tiny PRs (the ConQuest overhead lesson).
- ❌ A spec's build-phases used as Hub Phases → over-structuring, starved features.
- ❌ Indicative task bullets pitched below PR size → features *look* PR-sized and the levels blur.
- ❌ "Features" that are really one PR → tasks masquerading as features.
- ❌ Phases used to gate or sequence → phases are organisational only; *dependencies* gate.
- ❌ Numbering features in execution order → hides the dependency truth.
- ❌ Duplicating the spec's "how" into the plan → drift between board and knowledge base.
- ❌ Asserting an upstream/external dependency is "landed" from a spec or memo, unverified → a foundational gap found only at execution.
- ❌ Assuming single-tier "this project owns everything" ownership on a host platform → framing a whole tier off.
- ❌ A `core→fork` seam left implicit → the hardest design problem invisible until implementation.
- ❌ Tracking an "in-PR" task status → it goes stale when the flip to `done` is forgotten.
- ❌ Parking a cross-cutting deferral only in a shipped feature's doc → "deferred" becomes "silently not done".

## Template (copy this)

```markdown
---
name: <Project name>
status: planning
host_platform: <sunrise | …>
opened: <date>
spec: <path to the spec/brief>
epic: <active phase name, e.g. v1>
---

# <Project> — development plan

> Build breakdown for <project>. Authoritative design: [[<spec>]]. Structured to the
> HCE Hub model (see hce-hub/plan-authoring-guide.md). This markdown is the system of
> record until the Hub exists.

## How to read this — the working model
(Task = one PR; Feature = unit of ownership, ~2–5 tasks, has deps; Phase = epic.
This build is one epic: <name>. Order is emergent from dependencies.)

## Project
| Field | Value | … (name, spec, repo, lead, status) |

## Concept and intent
(2–4 paragraphs; defer the binding "how" to the spec.)

## Features (epic: <name>)
| # | Feature | Owner | Depends on | ~PRs | Capability |
|---|---------|-------|------------|------|------------|
| 01 | `f-…` | … | — | 3 | … |
…
**Critical path:** f-… → f-… → f-…

### 01 · `f-…` — <title>
*Owner:* … · *Depends on:* … · *~N PRs*
<one-line what/why>
- **t** — <PR-sized task>  (cross-ref: spec §X, decision <ID>)
- **t** — <PR-sized task>
*Done when:* <observable condition>

## Parked phases (future epics)
- **<name>** — <what; why parked>

## How features and tasks work
(status vocab — no in-PR state; gates-before-PR definition-of-done; claim-first docs PR
when multi-owner; deferrals to a live surface; PR-not-commit; indicative vs promoted;
promoted-task table format)

## Decisions log   (append-only, newest first)
## Work completed to date   (append-only)
## References
```

Promoted-task table (under a feature in flight):

```
| ID  | Task                          | Files                         | Deps | Status    | PR     |
|-----|-------------------------------|-------------------------------|------|-----------|--------|
| t-1 | GraphStore interface + impl   | lib/.../graph-store/          | —    | claimed   | #123   |
| t-2 | Availability computation      | lib/.../engine/               | t-1  | backlog   | —      |
```

## Tweaking this convention

This is a living convention — bump `convention_version` and add a dated note below when it changes. When the Hub is built, these meanings become the data model's enforced shape (Phase/Feature/Task entities, the promotion gesture, dependency edges); until then, this doc is the shared agreement that keeps every plan Hub-ingestible and stops the vocabulary drifting.

**Convention history**
- v2 (2026-07-10) — folded in the Daybreak *execution* lessons ([[planning-retro]] §A + generalisable §B): verify assumed-landed deps with evidence; model tier ownership & seam direction on a host platform; gates-before-PR definition-of-done; claim-first docs PR under concurrent ownership; drop the in-PR task status; provisional/build-time sizing splits; deferrals need a live home. Prep for authoring the HCE Hub plan.
- v1 (2026-06-24) — initial, distilled from the ConQuest and Daybreak (expert-led-framework) plans.

## References

- [[v1-requirements]] — the Hub model this operationalizes (§4 layers, §5 the PR unit, §10 Phase-as-epic + `parked`).
- [[futures]] — Phase/epic and coarse-grouping scaffolding.
- [[feature-plan-authoring-guide]] — the **second tier**: how an owner authors a single feature's detailed plan (`<feature>.md`). This guide is the board; that one is the owner's build plan.
- `hce/projects/expert-led-apps/planning-retro.md` — the execution retro these v2 lessons distil (§A overall-plan authoring; §B feature-plan authoring).
- `hce/projects/expert-led-apps/building-a-feature.md` — the per-feature execution rhythm that pairs with a plan authored to this convention.
- `hce/projects/expert-led-apps/plan.md` — worked example: one epic, flat feature list, semantic slugs, dependency-ordered.
- `hce/projects/conversational-questions/plan.md` — earlier worked example (ConQuest); source of the task-sizing lesson.
