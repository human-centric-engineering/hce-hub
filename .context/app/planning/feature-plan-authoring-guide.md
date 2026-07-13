---
status: draft
opened: 2026-07-10
convention_version: 3
operationalizes: plan-authoring-guide.md (the feature tier), v1-requirements.md (§4, §5)
sibling: plan-authoring-guide.md
distilled_from: expert-led-apps/planning-retro.md §B
---

# Authoring a feature plan — the second tier

> How to write a **feature plan**: the detailed build plan for a *single feature*, one tier below the [[plan-authoring-guide|overall plan]]. Where the overall plan is the **board** (Project → Features → dependencies → *indicative* tasks), a feature plan is what the **owner** writes when they claim a feature and turn its indicative tasks into promoted, buildable work. This is the feature-level counterpart to [[plan-authoring-guide]], distilled from the [[planning-retro]] §B lessons learned building Daybreak feature-by-feature. The per-feature *execution rhythm* — the gate loop, close-out — lives in [[building-a-feature]]; **this** guide is about *authoring the plan* that rhythm then executes.

## Where this lives (an open decision)

For now this is a vault convention alongside [[plan-authoring-guide]], copied/referenced into the build repo for the building agent — the same arrangement as [[building-a-feature]] living in the Daybreak repo. Longer term it likely **splits**: the transferable authoring convention (below, §§1–7) becomes **Hub behaviour** (a sidekick that helps author a feature plan, as [[plan-authoring-guide]]'s meanings become the Hub's enforced data model), while the platform/fork disciplines (§8) migrate into the Sunrise [[building-on-sunrise]] rules. The Hub build is the first real test — decide the split when we author it.

## Why this exists

The overall plan sizes a feature as ~2–5 *indicative* tasks and names its dependencies. That is a **sketch made from the spec**. The feature plan is where the sketch meets the repo — and §B found the same failure mode over and over: **a feature plan that trusts the overall plan's (or the spec's) framing instead of re-deriving it from current repo reality ships the wrong shape.** Tasks split at build; a "pure" feature turns out to need a core seam; a borrowed precedent carries a rationale that doesn't transfer; a boot-time "upsert" is quietly destructive. This guide encodes *re-derive from reality* as the feature-plan author's core discipline, and captures the recurring shapes so each feature doesn't relearn them.

**Where it sits in the tier stack:**

| Artefact | Tier | Job |
|---|---|---|
| [[plan-authoring-guide]] → the plan | Project | The **board**: features, dependencies, indicative tasks |
| **This guide → `<feature>.md`** | Feature | The owner's **detailed build plan** for one claimed feature |
| [[building-a-feature]] | Task | The **gate loop** each task runs (build → gates → merge → close-out) |

## What a feature plan contains (the anatomy)

Six sections; the first is mandatory and comes first.

1. **Intent** — *what* and *why*, in a line or two. The binding *how* stays in the spec (cross-reference the section + decision IDs); don't duplicate it.
2. **Reconciliation with current repo reality** *(required first section — §1)*.
3. **Promoted-tasks table** — `t-N`, files-likely-to-touch, deps, **Done-when**, status, PR *(§2–4)*.
4. **Test strategy, stated up front** *(§6)*.
5. **Open questions, triaged** — resolved inline where tractable; owner-flagged only for genuine product forks *(§7)*.
6. **Upstream follow-ups / seam ledger** — *only if the feature touches the platform boundary (§8)*.

---

## 1 · Reconcile before you size — the required first section

Every feature plan opens by reconciling the (possibly stale) spec against the **actual repo**, recording each adaptation as a decision. This single habit caught the most, earliest.

- **Re-derive from the repo, not the spec.** The spec predates much of the code and the conventions shipped since; verify every assumption — *especially* "assumed landed" dependencies — against the tree before baking it in ([[planning-retro]] B2).
- **A feature's tier and upstream-issue count are *hypotheses*, re-confirmed from behaviour.** "Pure framework-tier, no upstream change" is a plan-time guess a build-time behaviour analysis can overturn — designing from *behaviour* can reveal a needed core seam. Write them as evidenced hypotheses ("*expected* pure; confirm the enforcement path touches no core method at build"), not facts ([[planning-retro]] B17).
- **Classify each named seam: live or dormant.** When the plan says the feature *instruments / observes / reuses / extends* existing infrastructure, grep the shipped receiver for production callers. A shipped seam with **no caller** (or a table with no writer) is a *latent integration this feature owns* — promote it to the anchor task, name it "first production caller", and put the load-bearing test on the wiring, not the new surface ([[planning-retro]] B27).

## 2 · Size at the feature level — the split discipline

Indicative task bullets are a sketch. Promotion is where you commit to real PR shapes — right-size in both directions, and mark the seams a task is likely to split along at build.

- **Sizing self-check — fold commit-sized slivers up.** If a task's only real content is scaffolding + one small file, fold it into its dependent task and size by real changed surface ([[planning-retro]] B1).
- **Don't split tiny-by-purity — the size gate precedes the split list.** A conceptual seam (platform-owned vs fork-owned, pure vs impure) is a *reviewability* nicety, not a sizing reason. Before applying any split candidate below, confirm **both** resulting pieces would be real PRs; when they're each commit-sized, keep them one PR and note the seam in the PR description. Heuristic: a feature whose *entire* remaining work is **<~150 lines across ≤2 files is one task**, even across two concerns. (This is the inverse of *a separable second concern* below, which fires only when that concern is **heavy** — and a caveat on the *purity boundary* candidate, which only earns a split when each half is substantial.) ([[planning-retro]] HB1)
- **Split candidates (flag at promotion, re-check at build):**
  - **Purity boundary** — a task joining a *pure transform* with an *LLM/IO call* ("mask **+** extract") splits at that line; ship the pure half first, let the impure half consume it ([[planning-retro]] B16).
  - **Endpoint + consuming UI** — usually two PRs: the API is a self-contained, testable, security-relevant slice; the UI mounts on its reviewed contract ([[planning-retro]] B25).
  - **"Reuse existing X"** — weight-check that X is the shape you need, not merely adjacent, *before* committing to one PR ([[planning-retro]] B25).
  - **Typed kinds under one table** — size by each kind's *enforcement machinery*, not one-PR-per-kind: fold pure-data/no-consumer kinds into the spine; give each kind with distinct enforcement its own PR ([[planning-retro]] B22).
  - **A separable second concern** — if the shipped tasks already form a coherent whole and the remainder shares little code and is heavy, shed it into its own feature at close-out (the tell: a feature whose name joins two concerns with "+") ([[planning-retro]] B23).

## 3 · Every task's Done-when carries the gates and the standing steps

The Done-when is a checklist the builder and reviewer share — make completion *provably* include the gates and the known-recurring steps.

- **Gates before the PR opens.** Each task's Done-when lists `/pre-pr`, `/security-review`, then `/code-review` (green) as completion criteria — run *before* opening the PR ([[planning-retro]] B4).
- **Standing repo steps belong in Done-when, not rediscovered.** A recurring platform step (e.g. stripping the spurious pgvector/tsvector `DROP INDEX` from a generated migration, then drift-checking) is a known certainty — list it, don't relearn it per feature ([[planning-retro]] B13).
- **Filling a `lib/app/*` seam with a content/effect default → list the platform default-test adaptation in Done-when.** When a task fills a fork-owned seam that carries a *content-or-effect* default (a non-null list, a config array, a registry/probe set — not a return-void hook like `initApp`), it **will** break a Sunrise-owned "ships-empty/default" test, and that edit needs a `platform-divergences.md` row. List both as Done-when lines up front; grep `tests/**` for the seam's export at promotion to find the assertion. Don't let it surface as a late CI failure ([[planning-retro]] HB2).
- **Cross-repo deliverables are *this* feature's Done-when, not someone else's job.** If the feature builds a fork-first seam, "file the upstream issue carrying the fork-build learnings" and "add the seam-ledger row" are its own completing acts (§8) ([[planning-retro]] B7/B14).

## 4 · State data-layer correctness as requirements, not an ORM call

A feature plan that names a single ORM call ("boot-time upsert") hides the correctness bugs that surface in review. State the properties.

- **Boot-time reconcile** must state: **no-write-when-unchanged** (idempotent — don't churn `updatedAt`) and **safe-on-empty** (an empty registry must not be destructive). And: **classify the row** — operator-owned (seed once, never rewrite non-key columns) vs pure code projection (fully reconcile, propagate edits); if the table has **more than one write-source**, partition the removal/deactivate pass to the rows *this* sync owns ([[planning-retro]] B8/B10).
- **Reusing a write-service to "change X"** — trace X to its *reader/enforcer* and confirm the write alters what the reader returns. A create into an accumulate-on-read table is *not* an edit ([[planning-retro]] B30).
- **A hand-written FK to a core table** — reference the actual **`@@map`'d table name** (not the model name), and apply via `migrate deploy` (so the intentional schema-vs-DB divergence isn't read as drift) ([[planning-retro]] B11).

## 5 · Borrowed shapes: re-derive the rationale, don't copy it

"Mirror `X`" is the most dangerous instruction in a plan — the shape transfers, the *reasoning* may not.

- **A precedent** — separate the mechanism you're borrowing (the shape) from the justification the precedent gives for it, and re-derive the justification in the new domain before committing it to the plan ([[planning-retro]] B18).
- **A primitive** — read its validators and serialisers and ask what they assume about input *shape* (string vs object, size caps, one-vs-many anchor), not just its type signature. A green type-check on a copied primitive proves the shapes *compile*, not that its silent assumptions hold ([[planning-retro]] B24).
- **A guard** — identify the exact failure state it detects and confirm the new usage can actually *reach* it. A drift-guard on query-vs-stored vectors is dead code over same-run node-to-node vectors ([[planning-retro]] B26).

## 6 · Test strategy up front, and budget the review-fix commit

State the test approach *in the plan*, matched to the repo's real harness.

- **vitest runs on happy-dom with no live DB.** Unit tests mock `@/lib/db/client` and forward `executeTransaction` to a `tx` mock; prove an end-to-end chain with a small stateful in-memory fake; use `smoke:*` scripts for real-DB fidelity. Never write "integration test against the dev DB" ([[planning-retro]] B9).
- **Mixed pure + DB-bound barrel** — pure/unit tests import the *specific module* (`.../schema`, `.../validate`), not the domain barrel, or they silently drag in the DB client ([[planning-retro]] B12).
- **Algorithm-, concurrency-, or client/server-state-dense work** — `/code-review` is where it pays for itself: budget a review-fix commit and treat a *clean* review as the surprise. `/pre-pr` green is necessary, not sufficient — these bugs are invisible to type-check and happy-path mocks ([[planning-retro]] B15/B24/B29).

## 7 · Resolve open questions inline

- **Triage as you write.** If a question has a clear default derivable from the spec, the shipped code, or the disciplines ("ship-nothing-a-fork-deletes", keep-it-simple), **resolve it inline with a one-line rationale**. Reserve a flagged "needs the owner" list for genuine product-scope forks — decisions where guessing risks the wrong build ([[planning-retro]] B20).
- **Default a "family of X" (agents, judges, personas) to mechanism-only** — ship the binding + role/seat vocabulary + surface + a documented role→capability reference; treat "seed a default family" as a separate, owner-gated, droppable task, not a promoted one ([[planning-retro]] B21).

## 8 · When building on a host platform (Sunrise) — the seam disciplines

*Platform/fork-specific — applies to any project on Sunrise, the Hub included. These are the disciplines likely to migrate into the [[building-on-sunrise]] rules once the split (see top) is made.*

- **A `core→fork` seam** (the platform must call *out* to the fork) — design the generic mechanism and record its build-time/merge constraints as **open questions to resolve before coding**, and **specify the failure-isolation contract**: what happens when the fork side throws, and how the host degrades ([[planning-retro]] B3/B6).
- **Extending platform-owned central config** (e.g. `eslint.config.mjs`, CI) with no seam — call for building the seam **fork-first**: a minimal generic hook in the platform file that delegates to a fork-owned file. Direct edits pass review but are merge-hostile ([[planning-retro]] B5).
- **The fork-carried core seam is a sanctioned escape hatch** when no seam exists and the alternative is a worse contortion — *if and only if* it is **generic** (no framework vocabulary in core — the boundary vocab-scan stays green), **behaviour-neutral at rest** (the empty/absent state reproduces prior behaviour), and **ledgered** with the delete-when-it-lands action ([[planning-retro]] B19).
- **Fork-first informs upstream.** Build the capability correctly in the fork as its final generic shape, prove it in situ, then **file the upstream issue with the fork-build learnings** and **add a row to the seam ledger** (`upstream-asks`: seam file · upstream issue · owning feature · delete-when-it-lands action · status) — both are this feature's own Done-when ([[planning-retro]] B7/B14).

## The method (recipe)

1. **Claim it** — Owner + `in flight` on the board.
2. **Reconcile** the spec against the repo (§1) — the required first section; record each adaptation as a decision.
3. **Classify the seams** — live/dormant, direction, fork-reachability — and re-confirm the feature's tier/upstream hypotheses *from behaviour* (§1, §8).
4. **Promote the tasks** (§2–4) — right-size (fold slivers, mark split candidates), list files-likely-to-touch + deps, and write each **Done-when** (gates + standing steps + cross-repo deliverables).
5. **State the test strategy** up front (§6).
6. **Triage open questions** (§7) — resolve the tractable inline; flag the genuine product forks.
7. **Present to the owner** before building — sizing and any real design/forkability calls. Planning is collaborative.
8. **Push claim + plan as a standalone docs PR** *before* any task work ([[building-a-feature]] step 1).

## Anti-patterns checklist

- ❌ Sizing from the overall plan's indicative bullets without re-checking against the repo.
- ❌ Asserting "pure / no upstream change / may fold" at plan time as *fact* rather than a build-confirmed hypothesis.
- ❌ Copying a precedent / primitive / guard with its rationale intact into a domain where the rationale doesn't hold.
- ❌ "Integration test against the dev DB" — there is no live DB in vitest.
- ❌ A boot-reconcile described as "upsert" with no correctness properties (idempotent, safe-on-empty, row-classified, source-partitioned).
- ❌ Parking every under-specified choice for a later "refinement pass".
- ❌ Direct edits to platform-owned central config instead of a fork-first seam.
- ❌ Treating the upstream issue / ledger row as someone else's job rather than this feature's Done-when.

## Template (copy this)

```markdown
---
name: <feature slug, e.g. f-engine>
feature: <overall-plan feature #/slug>
status: not started        # not started | in flight | blocked | shipped
owner: <name>
opened: <date>
plan: <path to the overall plan>
spec: <path to the spec/brief>
---

# <f-slug> — <title>

*Feature <#> on [[plan]]. Binding design: [[<spec>]] §X (decisions <IDs>).*

## Intent
<one or two lines: what + why. Defer the binding "how" to the spec.>

## Reconciliation with current repo reality   (required — do this first)
- <spec assumption> → <what the repo actually shows> → <adaptation, as a decision>
- Tier hypothesis: <expected tier / upstream-issue count — to confirm from behaviour at build>
- Seam classification: <each named seam: live/dormant · fork→core / core→fork · fork-reachable?>

## Promoted tasks
| ID  | Task | Files | Deps | Done-when | Status | PR |
|-----|------|-------|------|-----------|--------|----|
| t-1 | …    | …     | —    | gates green; <observable> | available | — |
| t-2 | …    | …     | t-1  | …         | backlog   | — |

## Test strategy
(vitest = happy-dom, no live DB: mocked `@/lib/db/client` + `tx`; in-memory fake for e2e
chains; `smoke:*` for real-DB fidelity. Pure tests import the specific module, not the barrel.)

## Open questions
- **Resolved inline:** <question> → <decision + one-line rationale>
- **Needs the owner:** <genuine product-scope fork>

## Upstream follow-ups / seam ledger   (only if it touches the platform boundary)
- <seam file> · <upstream issue> · <delete-when-it-lands action> · <status>

## Decisions log   (append-only, newest first)
```

## Tweaking this convention

A living draft — bump `convention_version` and add a dated note when it changes; promote `status: draft → convention` once it has authored a real build (the Hub is the first test). When the Hub is built, §§1–7 become the sidekick's feature-planning behaviour and §8 the [[building-on-sunrise]] rules (see *Where this lives*).

**Convention history**
- v3 (2026-07-13) — added the §3 standing step: filling a content/effect `lib/app/*` seam breaks a Sunrise default test — list the adaptation + ledger row in Done-when ([[planning-retro]] HB2, f-fork/f-data-model, confirmed 4× across 3 seams).
- v2 (2026-07-11) — added the §2 "don't split tiny-by-purity" size gate (a conceptual seam isn't a sizing reason; both pieces must be real PRs before a split applies). First lesson from executing the **HCE Hub** plan ([[planning-retro]] HB1, f-fork over-decomposition).
- v1 (2026-07-10) — initial draft, distilled from [[planning-retro]] §B (Daybreak, built feature-by-feature). Created as the second tier alongside [[plan-authoring-guide]] v2.

## References

- [[plan-authoring-guide]] — the overall-plan (board) convention this sits below.
- [[planning-retro]] — §B is the source of these lessons; §A feeds [[plan-authoring-guide]].
- [[building-a-feature]] — the per-feature execution rhythm this plan feeds into.
- [[v1-requirements|HCE Hub v1 requirements]] — the Project → Phase → Feature → Task model.
- [[building-on-sunrise]] — where §8's seam disciplines are destined to live.
