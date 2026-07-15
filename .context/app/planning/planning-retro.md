---
name: planning-retro
description: Feedback from executing the Daybreak plan, split by which plan-authoring agent it targets (overall-plan vs feature-plan)
parent: plan.md
---

# Planning-process feedback (retro)

**Purpose.** This is _not_ a project decisions log (that lives in
[[plan#Decisions log|plan.md]]). It is **feedback about the plan-_authoring_
process itself**, discovered while _executing_ the plan — to fold back into the
agent instructions that generate plans.

It is split by **which authoring agent** the lesson targets:

- **§A — Overall-plan authoring** — the agent that produces the whole-project
  breakdown ([[plan|plan.md]]: Project → Features → indicative tasks, the
  dependency graph, the working model, the decisions/work logs). **This is the
  priority section** — the overall-plan process is being baked into the **HCE
  Hub** (an internal tool built on Sunrise), so lessons here have the widest reuse.
- **§B — Feature-plan authoring** — the agent that produces a single feature's
  detailed build plan (e.g. [[f-bootstrap|f-bootstrap.md]]: reconciliation section,
  promoted tasks, per-task done-when, open questions, upstream follow-ups).

**How to use.** Append-only, newest at top, under the right section. Each entry is
**Discovery** (what execution revealed) → **Impact** (what it cost/risked) →
**Feedback** (the specific change to that agent's instructions). Some lessons touch
both levels; each is filed at its primary home with a cross-reference. Mark an entry
`folded-in` once the corresponding instructions are updated.

---

## §A — Overall-plan authoring (priority — feeds HCE Hub)

### A1 · Verify "assumed done / landed upstream" dependencies against reality before baking them in

- **Discovery.** plan.md asserted `f-seams` "has already been done in Sunrise and
  exists in this repo," and "assume the nine open Sunrise issues are cleared." In fact
  `f-seams` was **absent** at the v0.4.1 baseline — we had to file Sunrise #372 and pull
  it in via the v0.5.0 merge before any framework work could start.
- **Impact.** A foundational dependency (feature 01) was asserted from the spec/memo, not
  verified. Caught only because execution happened to start by validating it; building on
  the assumption would have failed downstream.
- **Feedback.** The overall-plan agent must **verify every external / "assumed landed
  upstream" dependency against actual state** (grep the seam, check the version/tag) and
  record the evidence — never assert upstream/external readiness from a spec or memo alone.
  Encode "verify, then state, with evidence" for any dependency the plan itself doesn't build.
  _Status: open._

### A2 · Model N-tier ownership when the project is itself a platform/framework that gets forked

- **Discovery.** The spec and the first plan draft framed Daybreak as a _leaf app_ on
  Sunrise (using `.context/app/`, `lib/app/*`). It is actually a **framework with its own
  forks** — it must reserve the leaf surface and own a separate tier (`.context/framework/`,
  `lib/framework/`).
- **Impact.** Whole-plan framing (Relationship-to-Sunrise, placement, doc/code/schema
  namespaces) was one tier off, producing a mid-execution correction that moved all docs and
  reshaped a seam design.
- **Feedback.** When the thing being planned is **itself a platform/framework that downstream
  projects fork**, the overall-plan agent should model the **full N-tier ownership up front** —
  which code/doc/schema surface each tier owns vs. reserves for its forks — rather than
  assuming a single "this fork owns everything" tier. Add an explicit "how many tiers, who
  owns/reserves what" step. **Directly relevant to the Hub**, which is itself built on Sunrise.
  _Status: open._

### A3 · Enumerate cross-boundary seams and classify each by direction; flag core→fork ones

- **Discovery.** The `f-seams` seams are **fork→core** (the fork calls _into_ a core registry —
  trivially fork-owned). The boot hook is **core→fork** (core must call _out_ to the fork) — a
  distinction the plan never drew. core→fork seams cannot be pure fork-owned; they need a
  generic upstream mechanism and carry build-time/merge constraints.
- **Impact.** The hardest design problem in `f-bootstrap` was **invisible at plan level** and
  surfaced only when the feature was designed, needing a whole conversation to resolve.
- **Feedback.** The overall-plan agent should **enumerate every cross-boundary seam** (in the
  Relationship section) and **tag each by direction**. Flag **core→fork** seams as
  sequencing/coordination risks — they imply upstream work, which the Hub-coordinated
  upstream→downstream flow needs surfaced early, not discovered at implementation. Cross-ref
  [B3] (the feature agent then designs the mechanism). _Status: open._

### A4 · Encode "gates before PR" into the working model's definition-of-done

- **Discovery.** t-1's PR was opened **before** running `/pre-pr` and `/code-review`; the human
  had to prompt for them. Some gates (full test suite, DB migration-drift) belong _before_
  opening the PR.
- **Impact.** A PR was opened in an unvalidated state; the process didn't require the gates.
- **Feedback.** The overall-plan agent owns the "How features and tasks work" / working-model
  section — it should **define the task definition-of-done to include the standard gates run
  BEFORE opening the PR**, so every feature and task inherits it. (An execution-workflow rule;
  the working model is its natural home. The feature agent mirrors it per-task — see [B4].)
  _Status: open._

### A5 · Don't track an "in-PR" task status — go straight to `done` on merge

- **Discovery.** t-1's task was flagged `in-pr` while PR #6 was open, then **stayed `in-pr`
  after the PR merged** — nobody flipped it to done (forgotten): the exact failure mode of a
  two-step terminal status.
- **Impact.** Wastes a second doc commit to flip `in-pr → done`, and — more often — the status
  goes stale because the flip is forgotten. A downside of tracking progress via GitHub PRs on a
  Markdown board, accepted for now.
- **Feedback.** The overall-plan agent owns the task status vocabulary in the working model. It
  should **omit any "PR open" state**: a promoted task goes `backlog | available | claimed → done`,
  flipped to `done` when the PR merges. One transition, nothing to forget. _Status: folded-in for
  plan.md's vocab; still open for the Hub's plan-authoring instructions._

### A6 · With a shared board + multiple owners, claim + plan is a standalone docs PR _before_ task work

- **Discovery.** `f-module-core` (single owner) folded its plan doc into t-1's PR — fine when one
  person builds. Planning `f-map` with **John about to build features in parallel**, the human called
  that the claim (board Owner + `in flight`) and the plan must go up **together as a docs PR before any
  task starts**, so the claim is _visible_ and two owners can't unknowingly start the same feature.
- **Impact.** Folding the claim into t-1 means the board doesn't show the feature as taken until the
  first _code_ PR lands — a real collision window once >1 person builds. A board nobody can see isn't a
  coordination surface.
- **Feedback.** The working model should make **claim-first a standalone docs PR** the default the
  moment the plan has **more than one builder**: set Owner + `in flight`, write `<feature>.md`, push
  both as one docs-only PR (skips security/code-review), merge, _then_ start t-1. For a strictly
  single-owner plan, folding into t-1 is still acceptable — the trigger is concurrent ownership, which
  is exactly the HCE Hub's normal condition. Cross-ref [A5] (board as the low-friction system of
  record) and [[building-a-feature]] step 1. _Status: folded-in for plan.md + building-a-feature.md;
  open for the Hub's plan-authoring instructions._

### A7 · Only feature-level docs PRs (claim + close-out) — task PRs are pure code; no per-task close-out PR

- **Discovery.** `f-data-model` t-1 spawned **two** extra docs PRs after its code PR (#13): one carrying a `/code-review` finding to another feature (#14), one closing out t-1's board bookkeeping (#15). The owner corrected the model: *"We don't need task close-out PRs, only feature close-out PRs. It's unnecessary overhead. The claim and close-out PRs for features are to minimise the risk of multiple devs working on the same feature at the same time. Once a feature is claimed the same dev works on all tasks within it."*
- **Impact.** Per-task docs PRs multiply ceremony for no coordination gain — the claim/close-out PRs exist to signal *feature* ownership (stop two devs colliding on one feature); once claimed, one dev owns every task, so intra-feature board updates coordinate nothing and don't need their own PR.
- **Feedback.** The working model has exactly **two** feature-level docs PRs: the **claim** PR (Owner + `in flight` + `<feature>.md`, before task work — [A6]) and the **close-out** PR (feature → `shipped` + *all* deferred board bookkeeping batched: every `t-N` row → `done`, the work-completed entry, decisions-log entries, and cross-cutting carries — [B28]). **Each task is one pure-code PR**; its board row is flipped at feature close-out, **not** in a per-task docs PR. Cross-ref [A5] (no in-PR status), [A6] (claim-first), [[building-a-feature]] §3 (close-out). _Status: **folded-in** — [[building-a-feature]] step 5 + §3; open for the Hub's plan-authoring instructions._

---

## §B — Feature-plan authoring

> **Provenance.** Entries `B1`–`B30` below are from executing the **Daybreak** plan.
> Entries prefixed **`HB`** are from executing the **HCE Hub** plan (this fork) — the
> first real test of these conventions, as [[feature-plan-authoring-guide]] anticipated.

### HB8 · When the design depends on something the schema lacks, that's a fork to **surface** for the owner's decision — not a reconciliation to settle silently in a feature doc (HCE Hub · f-plan-view → f-refs)

- **Discovery.** The design (`design/data.jsx`, the Plan/Board card refs) treats a feature's **slug** (`f-mcp`) and a **task number** (`t-6`, project-wide) as first-class identifiers. `f-data-model` (§03) had modelled `Feature`/`Task` with cuid surrogate `id`s and **no** human-slug or task-number column (the spec's §10 sketch used `id` generically, so none was added). Building `f-plan-view` (§09), I hit that mismatch — and **resolved it unilaterally**: "no slug in schema → the title carries identity," filed as reconciliation bullet #5 and carried into §10. It *was* written down, but as a settled decision buried among a dozen reconciliations, not put to the owner. Two features later the owner caught it — *"they should definitely be in the schema. When/why were they dropped?"* — and it cost a whole corrective feature (`f-refs` §16: a migration + write-path + retrofit across two shipped surfaces). (Corollary bug: even the `t-N` §09 *did* render was per-feature **positional** — ephemeral — not the stable project-wide number the design intends.)
- **Impact.** A consequential product/design decision (drop a core identifier) got made silently under the "reconciliation" banner. Reconciliation is meant to *adapt the plan to verified platform reality* (what exists, what a seam is) — **not** to quietly decide away a design requirement the schema doesn't yet support. The difference: "the platform has no `AiKnowledgeCategory`, so scope RAG by tag" is a genuine reconciliation (the design intent is *met* differently); "the design wants slugs the schema lacks, so drop them" **removes design intent** and should be an owner call. Doing it silently deferred the cost (schema-fix-after-two-features is far more expensive than adding the column in §03 or flagging it in §09) and eroded the "surface real forks for the owner's nod" contract.
- **Feedback.** At build, sort every reconciliation into one of two buckets before writing it down: **(a) intent-preserving adaptation** (met differently via a real platform constraint/seam) → decide it, record it, move on; **(b) intent-removing gap** (the design/spec wants X, the schema/platform has no X, and you're about to *drop* X or fake it) → **stop and surface it as a decision** (schema addition? derive it? drop it?), don't settle it in a feature doc. The tell for bucket (b): you're writing "since there's no … we'll use …/drop …" about something the *design* shows as present. When in bucket (b), a one-line "the design uses feature slugs + task numbers the schema doesn't have — add them, or drop them?" at claim time is cheap; the silent drop is not. _Status: **applied** — `f-refs` §16 added `Feature.slug` + `Task.number` + `Project.taskCounter` and retrofitted §09/§10; recorded in [[f-refs]] + the plan's decisions log._

### HB7 · When a fork *mirrors* a platform file and inherits its bug, fix the fork's own copy + raise the bug **and** (if it's duplication-driven) a seam proposal upstream — but confirm the bug is genuine before keep-mine-editing the platform copies (HCE Hub · f-shell)

- **Discovery.** `f-shell`'s new `app/(hub)/error.tsx` was written to *mirror* the platform route-group error boundaries (`(protected)`/`(public)`/`admin` `error.tsx`) for consistency. `/code-review` then found the mirrored file carried a real bug present in **all four**: `isSessionExpired` is set inside the logging `useEffect`'s async `checkSession()` **and** listed in its deps, so a session-expiry re-fires the effect → a duplicate `logger.error` + Sentry event. The fork was the **first to add a route group**, so it was also the first to feel the ~90-line-near-duplicate `error.tsx` friction — a seam signal.
- **Impact.** Positive: caught before shipping the new boundary buggy, and it surfaced a platform bug + a composability gap that affect every fork. But it posed a process question — the bug lives in *platform* files the fork would otherwise never touch, and a keep-mine fix to three of them is real merge surface. The owner's steer resolved it: *"if it should definitely be fixed, fix in fork + raise the issue — but make sure it's genuine before editing core files."*
- **Feedback.** For a bug in a platform file the fork **mirrored** (not one it needs to change for the feature): (1) **confirm it's genuinely a bug**, not intentional, from the fork-app perspective — the gate before any core edit; (2) **fix the fork's own copy** (no ambiguity — you own it) so the new file ships correct and becomes the *reference* implementation the issue points to; (3) **raise the upstream bug** (referencing that reference); (4) if the bug is **duplication-driven** — the same code copied N times — also **raise a seam proposal** so it's fixed once (here [sunrise#434](https://github.com/human-centric-engineering/sunrise/issues/434), a shared `<RouteErrorBoundary>`); (5) **defer keep-mine-editing the platform copies** when a seam proposal may refactor them away or the bug is minor — let the upstream fix land. This *narrows* [[#HB6]]'s "incidental platform bug → own fix PR + upstream issue": when the bug is in a *mirrored* platform file and duplication is the root, the fork fixes only its own instance and the upstream fix (ideally the seam) handles the rest. *Corollary (the other direction of HB6):* `/code-review` caught this **latent** bug (and the breadcrumb `Object.prototype`-key crash) that browser-validation never would — the two checks are complementary, not redundant. _Status: **applied** — `(hub)/error.tsx` corrected; sunrise#433 (bug) + #434 (seam) filed; 3 platform boundaries deferred; recorded in [[f-shell]] + the plan's decisions log._

### HB6 · A UI/branding feature's DoD includes browser-validating the live render — green gates prove the code is correct, not that the surface reads right; an incidental platform bug found there gets its own fix PR + upstream issue (HCE Hub · f-theme)

- **Discovery.** `f-theme` (#28) passed every gate — type-check, lint, format, full suite (20,237), `/security-review`, `/code-review` — twice. Then the owner opened `/settings` in a browser to check the theme and found the browser tab still read **"… - Sunrise"** while every other surface read "HCE Hub". Root cause was a **pre-existing Sunrise bug unrelated to the theme**: `SETTINGS_TAB_TITLES`/`KNOWLEDGE_TAB_TITLES` hardcode "Sunrise" and `useUrlTabs` writes them to `document.title`, *overriding* the (correct, `BRAND`-templated) page metadata — plus the `(public)` legal-page metadata hardcodes it too. **No automated gate could catch it:** the code is type-correct, lint-clean, and no test asserted the literal; only rendering the actual page revealed it.
- **Impact.** Positive — caught before it mattered, and it exposed a whole class of `BRAND`-seam-bypassing strings the fork now owns clean. But it only surfaced because a human looked at the rendered page; a headless "gates green → ship" flow would have shipped a mis-branded tab title. The fix was handled as a **separate** PR (#29) — *not* folded into the theme PR (#28), which stayed a clean token-layer change — with a `[[platform-divergences]]` keep-mine row (11) **and** an upstream issue ([sunrise#432](https://github.com/human-centric-engineering/sunrise/issues/432)) so every fork gets it. (A downstream cost of two concurrent branches each appending a numbered ledger row: they both claimed "row 10" and collided on merge — a trivial renumber to 11, but worth knowing numbered-ledger rows conflict by construction when branches run in parallel.)
- **Feedback.** For a **theme / branding / any user-visible-surface feature**, add an explicit Done-when line: **"browser-validate the live render — light + dim, the key pages — before close-out."** Gates are necessary, not sufficient: they verify the code, not the rendered result (brand strings, contrast, layout, font load, a client `document.title` clobbering server metadata). And when that validation turns up an **incidental platform bug** (one not caused by the feature), **fix it as its own PR + file the upstream issue** — don't bolt it onto the feature PR (keeps the feature diff clean and the bug's provenance honest). _Status: **applied** — f-theme close-out; a "browser-validate the render" Done-when line is now standing for every UI-spine feature (`f-shell`/`f-projects`/boards/sheet/sidekick/brief). Candidate for [[feature-plan-authoring-guide]] §3 (a UI-feature DoD addendum)._

### HB5 · Check the seam catalog before honouring a plan-time "this might need a platform edit" watch-item — a purpose-built fork-owned seam may close it with zero platform touch (HCE Hub · f-theme)

- **Discovery.** `f-theme`'s plan carried **watch-item A** ("theme sync-safety"): a full re-theme was hypothesised to need a *keep-mine* edit to the platform `app/globals.css` (`@theme`/`.dark` tokens), flagged as a *possible* small upstream ask. Reconciliation against the actual tree found Sunrise had shipped a **purpose-built, fork-owned theming seam** — `app/brand-theme.css` (ships empty, imported after `globals.css`) + `lib/app/surface.ts` + the `data-surface` proxy/`<SurfaceSync>` plumbing (upstream #355) — designed for exactly this. The **entire** theme landed in that fork-owned file with `globals.css` **untouched**: no keep-mine, no platform edit, no upstream ask. The watch-item's hypothesis was strictly more expensive than reality.
- **Impact.** Positive, and larger than it looks: the "keep-mine `globals.css`" path would have created a **permanent merge-conflict surface** on every upstream sync (the whole point of the seam is to avoid exactly that). The plan's hypothesis was reasonable *when written* — but the seam catalog had moved on (Sunrise added #355 after the plan was drafted). The recon's job was to notice.
- **Feedback.** A plan-time watch-item that hypothesises *"this may require editing a platform file"* is a **prompt to search the seam catalog first**, not a licence to make the edit. The reconciliation's opening move should be: *"is there now a fork-owned seam that does this cleanly?"* — grep `lib/app/*`, the fork-owned `app/*` scaffolds (`brand-theme.css`), and `.context/*/` for the capability, and check recent upstream releases. Platform is a living dependency: a seam the plan couldn't assume may exist by build time. Generalises the leaf-fork golden rule ("extend through the seams") into a **recon step**: never accept a hypothesised platform edit without first proving no seam covers it. _Status: **applied** — watch-item A closed with zero platform edit; recorded in [[f-theme]] + the plan's decisions log. The theme model ("fill `brand-theme.css`, never touch `globals.css`") is the template for any future re-theming._

### HB4 · A planned guard can protect a failure mode the feature's own usage can't reach — verify the trigger exists at build (B26 in the Hub) (HCE Hub · f-hub-capabilities)

- **Discovery.** `f-hub-capabilities` t-2's plan had `create_task` build + call a dependency-cycle validator (`assertAcyclic`), carried from an `f-data-model` `/code-review` finding. Building it, the trigger evaporated: `create_task` creates a **new** task whose edges are **outgoing-only** (it depends on existing tasks), so nothing points back at it and it can neither self-loop (its id doesn't exist when the caller forms the request) nor close a multi-node cycle. The guard would have run a project-wide edge query on every create to prove an invariant that always holds.
- **Impact.** Positive — caught at build, not shipped as dead code + a wasted query. But the plan (and the carried finding's "`create-task` enforces acyclicity here") had to be reconciled: the guard was **re-homed** to the flows that connect two *existing* items (`persist-features`, `propose-dependencies`), where cycles genuinely can form. The tell was in the finding all along — "edge **creation**" was read as "any capability that writes an edge", when only *edges among existing nodes* can cycle.
- **Feedback.** This is [[#B26 · A safety guard copied from a sibling by analogy may protect against a failure mode the new usage structurally can't have — check the triggering condition exists before building it|B26]]'s first HCE Hub instance: when a plan carries a guard/validator into a task, **identify the exact state it detects and confirm this task's data-flow can reach it** before building. For a graph guard specifically, ask "does this operation create an edge whose endpoints *both already exist*?" — if not (a new leaf node), it can't cycle. Re-home the guard to the operation that can. _Status: **applied** — validator dropped from `f-hub-capabilities` t-2, re-homed to `f-intake`/`f-sidekick`; recorded in both plans' decisions logs._

### HB3 · Size by separability of value, not line count — homogeneous, sequential, unconsumed-until-complete work is one PR even when large (HCE Hub · f-data-model)

- **Discovery.** `f-data-model` shipped as **three** task PRs — Project domain (#13), Task domain (#16), futures scaffolding (#17). The owner flagged all three as too small: *"each felt too small for a PR … it could arguably all have been done in one PR."* This is the **second** over-decomposition flag (HB1 was `f-fork`). The three tasks were the *same mechanical recipe* three times (add `app_*` models → hand-strip the `migrate dev` spurious drops → add drift probes → extend the erasure smoke → extend the probe test), all pure schema, **sequential** (t-2/t-3 both depend on t-1), **same file** (`app.prisma` + one migration + `db-drift.ts`), one author, no parallelism, and **unconsumed until the whole model exists** (shipping t-1 alone delivered nothing usable).
- **Impact.** 3× the ceremony — pre-pr, security-review, code-review, db:reset-consent, PR bodies — for one cohesive unit, with the 2nd and 3rd reviews adding almost no insight the 1st didn't. Worse for *review quality*: a schema is most reviewable **whole** (you can't see Task↔Project or the full cascade/erasure topology until every model is in one diff). The gate that greenlit the split — [[feature-plan-authoring-guide]] §2's old *"<~150 lines = one task"* line — was the wrong heuristic: it weighed size and "distinct domain," missing that the split added no review, parallelism, or integration value.
- **Feedback.** The size gate is **separability of value, not line count.** A task earns its own PR only when splitting *adds* a different review surface, a parallelism opportunity, or an integration checkpoint (land it, see it work, then build on it). Homogeneous/sequential/same-file/unconsumed-until-complete work → **one PR, even a large one**; line count is a weak signal (a cohesive 600-line schema reviews fine whole). Balance against grab-bag PRs, but **default to fewer, cohesive** PRs. Generalises [[#HB1 · Don't split a feature into tasks by conceptual seam when each piece is commit-sized — size by changed surface (HCE Hub · f-fork)|HB1]] from "don't split *tiny*-by-purity" to "don't split *cohesive-mechanical* work at all." _Status: **folded-in** — [[feature-plan-authoring-guide]] §2 (the line-count heuristic replaced by the value-separability gate); the old <150-line rule struck. **Confirmed on f-access** — planned + shipped as one PR (indicative sketch was 3); the owner endorsed the 1-PR call ("no way that should have been more than 1 PR"). The gate is working: apply it at promotion._

### HB2 · Filling a `lib/app/*` seam breaks a Sunrise "ships-empty" default test — make adapting it a Done-when line (HCE Hub · f-fork, f-data-model)

- **Discovery.** Three features running now, four hits: filling the **eslint** seam and the **public-nav** seam (`f-fork`) and the **db-drift** seam (`f-data-model` t-1) each falsified a Sunrise-owned "scaffold ships empty / uses the default" assertion — `defaults.test.ts` (twice), `public-nav.test.tsx`, `public-footer.test.tsx`, `drift-probes.test.ts`. Every one surfaced as a **full-suite failure in CI/pre-pr AFTER** the feature work looked finished.
- **Impact.** Each was a re-run + a reactive test edit + a [[platform-divergences]] row, discovered late instead of planned. The pattern is now systematic, not incidental. (Only **content/effect** default assertions break — a non-null list, a config array, a probe set; **return-void** seams like `initApp` / `initAppCapabilities` survive a fill untouched.)
- **Feedback.** When a task fills a `lib/app/*` seam that carries a *content-or-effect* default, the feature plan must **list "adapt the seam's Sunrise default test + add a `platform-divergences.md` row" as an explicit Done-when line** — a standing step like [B13]'s migration strip, not a surprise. At promotion, grep `tests/**` for the seam's export to find the assertion. _Status: **folded-in** — [[feature-plan-authoring-guide]] §3 (convention v3)._

### HB1 · Don't split a feature into tasks by conceptual seam when each piece is commit-sized — size by changed surface (HCE Hub · f-fork)

- **Discovery.** `f-fork` shipped as **three sub-PR-sized units**: identity (PR #4), the
  auth-only strip (#6), and brand (t-2). t-1 was already small; t-2's *entire* real content
  was a styled "H" mark + one env value — commit-sized. The tell in hindsight: during t-1's
  reconciliation the plan **split brand out as a "purely fork-owned t-2"** to keep t-1's
  platform-touching edits clean — _adding_ granularity by conceptual purity rather than
  folding the sliver up ([B1]). The owner flagged it at review ("felt like a very small PR").
- **Impact.** Three review cycles + three board round-trips for ~1–2 PRs of real content.
  And because a task can't be folded *backward* once its sibling merges, t-2 couldn't be
  combined with t-1 — it had to be handled as a close-out, converting a mis-size into extra
  ceremony rather than a clean merge.
- **Feedback.** At promotion, after applying [B1] (fold commit-sized slivers up), apply a
  **second cut**: _do not split tasks by conceptual seam_ — platform-owned vs fork-owned,
  pure vs impure — _when the resulting pieces are each commit-sized._ That purity is a
  reviewability nicety, not a sizing reason; note the seam boundary in the PR description
  instead of spending a whole PR on it. Heuristic: a feature whose **entire remaining work is
  <~150 lines across ≤2 files is one task**, even when it spans two concerns. The inverse of
  [B23] (shed a separable concern only when it's *heavy*): here the second concern was
  featherweight, so it should have stayed folded in. _Status: **folded-in** —
  [[feature-plan-authoring-guide]] §2 now carries the "don't split tiny-by-purity" size gate
  (convention v2)._

### B1 · Sizing self-check when promoting tasks: fold commit-sized slivers

- **Discovery.** `f-bootstrap.md` promoted t-1 as its own task, but t-1 turned out
  **commit-sized** (one small real file + placeholders + empty schema); its natural PR companion
  was t-2 (the boundary that _enforces_ the skeleton it creates).
- **Impact.** One PR landed too small — below the plan's _own_ "PR not commit" resolution.
  _(Not about "done work" — the other tasks were correctly sized; this is purely the sliver.)_
- **Feedback.** When promoting indicative tasks to real ones, the feature-plan agent must run a
  **sizing self-check**: if a task's only real content is scaffolding + one small file, **fold it
  into its dependent task** and size by real changed surface. _Status: **confirmed in f-module-core**
  — the sizing self-check ran at plan time and folded the spec's commit-sized registry-only task into
  its model+sync (4 indicative → 3 promoted), so the sliver never shipped. The lesson works; keep it._

### B2 · Start every feature plan with a "reconcile spec vs current repo reality" section — it worked

- **Discovery.** `f-bootstrap.md` opened with an explicit "Reconciliation with current repo
  reality" section that caught three spec-vs-reality gaps _before_ coding (fork already exists;
  docs namespace; schema prefix).
- **Impact.** Positive — surfaced corrections early instead of mid-code.
- **Feedback.** Codify "**reconcile the (possibly stale) spec against the actual repo, and record
  each adaptation as a decision**" as a **required first section of every feature plan**. The spec
  here (rev 16) predated the fork _and_ conventions Sunrise shipped later — feature plans must
  expect that gap. _Status: keep — promote to a required step._

### B3 · When a feature builds a core→fork seam, design the mechanism + spell out its constraints

- **Discovery.** Designing the boot seam required inventing the generic `initApp()` mechanism and
  discovering the build-time constraint (core can't even _name_ `@/lib/framework`, or Sunrise/
  ConQuest fail to build).
- **Impact.** Real design depth that only emerged during feature planning.
- **Feedback.** When a feature implements a seam the overall plan flagged **core→fork** ([A3]),
  the feature-plan agent must **design the generic mechanism and record its build-time/merge
  constraints as open questions** to resolve before coding — not leave "how does core reach the
  fork" implicit. _Status: open._

### B4 · Put the gates in each task's Done-when

- **Feedback.** Mirror [A4] at task granularity: each promoted task's **"Done when"** should list
  the standard gates (`/pre-pr`, then `/code-review`, green) as explicit completion criteria, so
  "task complete" provably includes them. _Status: **applied in f-module-core** — every promoted task's
  Done-when carries the gate line; keep._

### B5 · Wiring into platform-owned central config → build the seam fork-first, not direct edits

- **Discovery.** `f-bootstrap` t-2 first wired the boundary by **editing platform-owned central config
  directly** (`eslint.config.mjs`, `ci.yml`). That passed review but was the wrong shape — every such
  edit is a merge conflict on the next Sunrise pull. It was rebuilt fork-first (fork-owned
  `lib/framework/eslint.config.mjs` + a reserved leaf seam + a one-line spread in root; a generic
  `--if-present` CI hook) only after the human pushed back.
- **Impact.** Real rework late; a "review-passing but merge-hostile" implementation nearly shipped.
- **Feedback.** When a feature must extend a **platform-owned central config file** and no seam exists,
  the feature plan must **call for building the seam fork-first (its final generic shape)** — a minimal
  generic hook in the platform file that delegates to a fork-owned file — _not_ direct edits deferred
  for "later." Cross-ref [A3] (enumerate the seam) and the "fork-first informs upstream" decision.
  _Status: open._

### B6 · A core→fork seam's plan must specify resilience / failure-isolation, not just the mechanism

- **Discovery.** The `initApp()` boot seam ([B3]) was designed for _mechanism_ but not _resilience_.
  Code-review (not planning) found the unguarded `await initApp()` would let any fork boot error reject
  `instrumentation.register()` and silently disarm the dev ticker. Two isolation layers were added
  after the fact.
- **Impact.** A resilience gap in a load-bearing seam surfaced in review rather than being specified up
  front — cheap to fix here, expensive if it had shipped.
- **Feedback.** Extend [B3]: when a feature builds a **core→fork** (or any boot-time) seam, the plan
  must **specify the failure-isolation contract** — what happens when the fork side throws, and how the
  host degrades — as an explicit requirement, not an implementation detail discovered in review.
  _Status: open._

### B7 · Filing the upstream issue is the fork feature's own Done-when deliverable

- **Discovery.** `f-bootstrap` t-3 initially recorded the upstream Sunrise issue as "delegated to the
  Sunrise agent." The human corrected this: filing the issue — **with the fork-perspective learnings
  the in-fork build produced** — is the completing act of the _downstream_ feature that built the
  reference, precisely because building it fork-first is what reveals what the seam actually needs.
- **Impact.** The plan nearly dropped a cross-repo deliverable on the floor by treating it as someone
  else's job.
- **Feedback.** A feature that builds a fork-first seam ([B5]) or a core→fork mechanism ([B6]) must list
  **"file the upstream issue, carrying the fork-build learnings"** in its own Done-when. The Sunrise
  side _implements_; the fork side _files with evidence_. _Status: open._

### B8 · Boot-time reconcile: plan the write shape's correctness, don't just say "upsert"

- **Discovery.** `f-module-core` t-1's plan sketched the module sync as "boot-time upsert-by-slug."
  Code-review found the naive per-slug `upsert` **rewrites every row every boot** (churning `updatedAt`,
  destroying its "last operator edit" meaning) and that the removal pass `updateMany({ notIn: [] })`
  **mass-unregisters all rows on an empty registry**. It was rebuilt set-based (createMany +
  `isRegistered`-guarded updateManys + empty-registry no-op).
- **Impact.** A correctness bug in a boot-time write path caught in review, not planning.
- **Feedback.** The same boot-upsert shape recurs across features (`f-slots` slot registration, `f-map`
  snapshot writes). A feature plan that describes a **boot-time reconcile** must state its correctness
  properties as requirements — **no-write-when-unchanged** (idempotent, don't churn `updatedAt`) and
  **safe-on-empty** (an empty registry must not be destructive) — rather than naming a single ORM call.
  _Status: open._

### B9 · DB features: state the vitest test strategy up front (no live DB in vitest)

- **Discovery.** `f-module-core`'s plan twice said "integration test against the dev DB" (t-1, t-3), but
  the repo's vitest runs on `happy-dom` with **no live DB** — tests mock `@/lib/db/client` and forward
  `executeTransaction` to a `tx` mock; real-DB verification is via `smoke:*` scripts. Both tasks had to
  reconcile the wording to the actual house style (mocked-prisma unit + a stateful in-memory fake for
  the e2e).
- **Impact.** Repeated mid-build reconciliation of the same false assumption.
- **Feedback.** A feature plan touching DB reads/writes must **state the vitest strategy up front**:
  mocked-`@/lib/db/client` unit tests asserting the query/`tx` calls, a stateful in-memory fake where an
  end-to-end chain must be proven, and a `smoke:*` script for real-DB fidelity — never "integration test
  against the dev DB." (A B2-style repo-reality reconciliation, specific to the test layer.) _Status: open._

### B10 · Boot-reconcile: classify the row (operator-owned vs code projection) and partition the removal pass per write-source

- **Discovery.** `f-slots` t-1's plan reused `f-module-core`'s "boot-upsert" wording verbatim
  ("the same three-statement shape as module sync", seed-once). Building it surfaced that a
  `framework_slot_definition` row, unlike `framework_module`, has **no operator-owned columns** — it is a
  _pure projection of code_ — so seed-once would leave an authored edit (a changed `sensitivity`, which
  drives downstream masking) stale on the row forever; it had to become a **full reconcile** (create →
  diff-guarded update → deactivate). `/code-review` then caught two further defects the plan's generic
  boot-reconcile language didn't specify: (1) the deactivate `updateMany` wasn't **partitioned to the
  rows this sync owns** — `framework_slot_definition` has _multiple_ write-sources by design (module,
  and a reserved global/facilitation seam), so an unscoped `notIn slugs` would silently deactivate a
  global slot on every module-sync boot; and (2) the empty-set no-op keyed on the _collected set_, not
  the _source that proves registration ran_, so removing a module's **last** slot never deactivated its
  row (an empty slot set is normal here, unlike an empty _module_ registry).
- **Impact.** A design divergence (seed-once → full-reconcile) discovered in build, plus two boot-reconcile
  correctness bugs surfaced in review rather than planning — cheap here (`isActive` has no consumer until
  `f-slot-capture`), latent otherwise.
- **Feedback.** Extends [B8]. When a feature plan describes a **boot-time reconcile**, it must, in
  addition to _no-write-when-unchanged_ and _safe-on-empty_: (a) **classify the row** — operator-owned
  (seed once, never rewrite non-key columns) vs pure code projection (fully reconcile, propagating edits)
  — don't copy a sibling sync's shape without checking which it is; (b) if the table has **more than one
  write-source**, **partition the removal/deactivate pass to the rows this sync owns** (e.g. `scope
startsWith "module:"`), never a blanket `notIn`; and (c) **key the "did registration run?" guard on the
  source that proves registration ran** (registered modules), not on the derived/collected set, which can
  be legitimately empty. Recurs directly for `f-map` snapshot writes and `f-engagement`. _Status: open._

### B11 · A hand-written fork→core FK must reference the core table's `@@map` name, and apply via `migrate deploy`

- **Discovery.** `f-slots` t-2's plan (and its first migration draft) wrote the hand-FK as
  `REFERENCES "User"("id")` — copying the **Prisma model** name. The core `User` model maps to table
  **`"user"`** (`auth.prisma` `@@map("user")`), so the `ALTER TABLE … ADD CONSTRAINT` failed at apply
  with `relation "User" does not exist` — **after** the `CREATE TABLE` had already run, leaving a
  half-applied, failed migration to unwind (drop the table, `migrate resolve --rolled-back`, fix, redeploy).
  Separately, the correct apply path is `db:migrate:deploy`: `migrate dev` diffs the schema against the DB,
  sees the hand-FK (which has no `@relation` in the schema) as drift and offers to reset.
- **Impact.** A failed partial migration mid-build and a manual unwind — avoidable with one correct
  identifier and the right apply command.
- **Feedback.** When a fork-table plan specifies a **hand-written FK to a core table**, it must (a) name
  the **actual table** the target model `@@map`s to (grep the core model's `@@map`, don't assume the
  model name — Sunrise's auth tables are lowercase: `user`/`session`/`account`), and (b) say to apply
  with **`db:migrate:deploy`**, not `migrate dev`, so the intentional schema-vs-DB divergence (the FK the
  schema doesn't model) isn't read as drift. Recurs for every future framework table with a `userId`
  (`f-journey-state`'s `UserJourney`/`JourneyEvent`). _Status: open._

### B12 · When a domain barrel will mix pure + DB-bound exports, pure tests import the specific module, not the barrel

- **Discovery.** `f-map` t-1 shipped `map/index.ts` as a pure, DB-free barrel and its schema/validator tests
  imported from it. t-2 added the Prisma-bound `version-service` to the **same** barrel, so those "pure"
  tests silently began loading `@/lib/db/client` (a `PrismaClient` + `pg` Pool) at import — passing only
  because the test setup injects a placeholder `DATABASE_URL`. Code review caught the invariant erosion.
- **Impact.** A stated "pure, DB-free" guarantee was silently broken; a later env/DB-client change would fail
  the schema tests for reasons unrelated to them, and a browser consumer importing a Zod schema from the
  barrel would drag in the DB client.
- **Feedback.** A feature whose domain barrel (`lib/framework/<domain>/index.ts`) will grow to mix
  **browser-safe** exports (schemas, validators, pure predicates) with **server-only** ones (anything
  importing `@/lib/db/client`) must state the import discipline in its test-strategy section: **pure/unit
  tests import the specific module** (`.../schema`, `.../validate`), not the barrel — the f-module-core
  convention (its `registry`/`liveness` tests import the module, not the barrel). Adding a DB-bound export to
  a shared barrel is a coupling change to flag, not a silent one. Recurs for every domain barrel (modules,
  facilitation, data-slots). _Status: open._

### B13 · The `migrate dev` pgvector/tsvector DROP-INDEX strip is a certainty for every framework migration — put it in the task's Done-when

- **Discovery.** Every framework migration so far (`f-module-core` t-1, `f-slots`, `f-map` t-2) has hit
  `prisma migrate dev --create-only` emitting spurious `DROP INDEX` (+ an `ai_knowledge_chunk` `DROP DEFAULT`)
  for the pgvector/tsvector objects Prisma can't model — stripped by hand each time, then drift-checked.
- **Impact.** Not a surprise by the third feature, but each plan treated it as one; a missed strip silently
  drops a production index (the footgun `db:drift-check` and `/pre-pr` exist to catch).
- **Feedback.** Any feature-plan task that adds a `framework_` migration should list, in its **Done-when**,
  "author `--create-only`; strip the spurious pgvector/tsvector `DROP INDEX` / `DROP DEFAULT`; `db:drift-check`
  green" — a standing, expected step (see `.context/database/prisma-unmodelled-objects.md`), not a per-feature
  rediscovery, for as long as those unmodelled objects exist. Cross-ref [B8] (migration write-shape care).
  _Status: open._

### B14 · A fork-first seam that composes with an upstream issue needs a live ledger, not just plan prose

- **Discovery.** `f-journey-state` t-2 built `canRead` / `subjectScope` as a fork-first seam that must
  _delegate to Sunrise #367/#366 and delete the shim_ once that resolver lands. Under the fork-first model
  ([B5]/[B7]) that "delegate when it lands" trigger existed only as prose scattered across the feature plan
  and the decisions log — nothing an upstream-sync ([[CUSTOMIZATION]] §9) would actually _read_. On the next
  `git merge vX.Y.Z` it would be easy to pull a Sunrise that shipped #367 and never notice a fork shim now
  needs retiring, leaving two parallel scope-checks — the exact drift X2 exists to prevent.
- **Impact.** The upstream-informing half of the fork-first model was write-only: we file the issue (B7) but
  had no durable, greppable index of _which fork code is waiting on it_, so adoption is a manual re-read of
  every feature plan.
- **Feedback.** Any feature that builds a fork-first seam composing with an open Sunrise issue should add a
  row to **[[upstream-asks|`.context/framework/upstream-asks.md`]]** (seam file · upstream issue(s) ·
  owning feature · the concrete delegate-when-it-lands action · status) as a **Done-when deliverable**,
  alongside filing/​updating the upstream note (B7). The ledger is the checklist the upstream-sync step reads;
  the feature plan and Work-completed log stay the narrative. Distinguish it from a _boundary-breach_ log
  (editing a Sunrise-owned file — the banner's `keep-mine` case): this ledger is the sanctioned case where the
  fork code is clean framework-tier but its final home is upstream. Cross-ref [B5]/[B7] (fork-first informs
  upstream). _Status: open._

### B15 · The deterministic engine is where code-review pays for itself — budget for a review-fix commit per task

- **Discovery.** Every one of `f-engine`'s four tasks passed `/pre-pr` + `/security-review` clean, then
  `/code-review` found a **real correctness defect** in the changed logic: t-1 (multigraph `pathsBetween`
  double-count + a cycle-dedup separator that collided distinct cycles — a stray NUL byte in source), t-2
  (the two access "faces" `canRead`/`subjectScope` diverging), t-3 (the writer's `complete` double-incrementing
  under a stale snapshot / concurrency — the `@@unique`-on-create backstop didn't cover the update path). t-4
  was the exception (review confirmed the reachability model was sound). These were not lint or type issues —
  they were graph-algorithm and concurrency bugs that only a semantic reviewer (or production) would catch.
- **Impact.** The deterministic engine is pure logic over graphs + a single-writer transaction; its bugs are
  invisible to type-check and to mocked unit tests that assert the happy path. `/pre-pr` green is necessary,
  not sufficient. The recurring shape: a review-fix follow-up commit landed on **3 of 4** tasks.
- **Feedback.** For algorithm-dense or concurrency-bearing framework work (engine, guidance ranking,
  scheduling), **plan for `/code-review` to find something and budget the review-fix commit** — run it to full
  effort (the 8-finder + verify path), and treat a clean review as the surprise, not the default. Two concrete
  habits that paid off: (1) a real-DB **smoke** for the write path caught nothing the review didn't, but proved
  the fix end-to-end against Postgres (the `@@unique` upsert semantics a mock can't show); (2) documenting
  each **semantic interpretation** in-module ("owner to confirm" — edge combination, `state.reached`,
  reachability optimism) turned latent disagreements into reviewable decisions instead of silent assumptions.
  Cross-ref [B4] (gates in the Done-when) and [B9] (vitest-no-live-DB — which is exactly why the smoke + review
  matter for the paths mocks can't reach). _Status: open._

### B16 · A "masking + extraction" task splits cleanly at the LLM boundary — ship the pure map, defer the impure call

- **Discovery.** `f-slot-capture`'s t-3 was promoted as one task: "sensitivity masking **+ #307 typed
  extraction**." At build time the two halves turned out to sit on opposite sides of a hard seam. The
  masking + the `SLOT_DATA_TYPE → typed-value` map are **pure and synchronous** — no LLM, no DB. The #307
  prose→typed **extraction** needs the capturing agent's provider/model resolved into the capability context
  (which `CapabilityContext` doesn't carry), a cross-domain import of `runStructuredCompletion`, and a `phase`
  union (`summary|scoring`) that doesn't fit slot capture. t-3 was split mid-build into **t-3 (pure, shipped
  #44)** and **t-3b (the impure extraction, #45)**, with the shared schema map built in t-3 so t-3b was a thin add.
- **Impact.** Net positive — but the split was discovered _during_ the task, not at plan time, so the board's
  t-3 row and decision-7 prose had to be reconciled after the fact. Had the plan spotted the seam, t-3/t-3b
  would have been promoted as two rows from the start (correct sizing, no mid-flight board churn). The tell was
  visible in the plan: decision 7 already described "local-validate (no LLM) **vs** a secondary
  `runStructuredCompletion`" — two mechanisms in one task is the smell.
- **Feedback.** When a task's description joins a **pure transform** and an **LLM/IO call** with "+", treat the
  conjunction as a **split candidate** at promotion time: the pure half ships silent + testable with mocked
  units; the impure half carries provider-resolution + cross-domain wiring + its own failure-mode budget
  (best-effort, never-fail-the-write). Promote them as separate rows and let the pure one land first — the map
  it builds is exactly the seam the impure one consumes. Generalises [B1] (sizing self-check): the split axis
  here isn't _size_, it's the **purity boundary**. _Status: open._

### B17 · "Pure framework-tier / no upstream issue" is a build-time finding, not a plan-time fact — correct-behaviour-first can reveal a needed core seam

- **Discovery.** `f-module-bindings`'s plan asserted, at claim time, "fourth pure framework-tier feature —
  **no upstream issue**; the one core touch is a possible minimal Prisma back-relation (confirm at build)."
  Three of the four tasks held to that. But **t-4 (knowledge scope) inverted it.** Starting from _behaviour_
  ("a module owns a durable knowledge scope its bound agents inherit, coexisting with the operator's direct
  grants") rather than from the assumed-thin mechanism surfaced a hard constraint: the core enforcement pivot
  `AiAgentKnowledgeDocument` is `@@id([agentId, documentId])` with **no provenance**, so a module-grant and a
  direct grant of the same doc are the _same row_ — any materialised copy-down clobbers-or-leaks on unbind.
  Correct behaviour therefore _required_ composing the scope **live inside the Sunrise-owned resolver**, which
  the fork can only do by adding a **generic core seam** (`registerAgentAccessContributor`) — and that makes
  t-4 file an upstream issue (#403) and carry a core edit. The "no upstream issue" line was a plan-time
  _guess_, stated as fact, that a build-time behaviour analysis overturned.
- **Impact.** Net positive — the feature shipped the _right_ shape (live composition, no leak) instead of the
  expedient-but-wrong materialisation the "thin, fold into t-1" framing would have produced. But the plan's
  confident "pure framework-tier / no upstream issue / may fold" framing had to be **corrected in three
  places** (the feature-tier heading, the t-4 detail, the fold open-question) after the fact, and the B1
  "t-4 is the lightest, may fold" sizing bet was simply wrong — t-4 was ~t-3-sized. The tell was in the plan
  the whole time: §4.2's "no new mechanism at all" describes the _enforcement_ (reuse the resolver), which the
  plan over-read as "no new _anything_, so thin."
- **Feedback.** A feature's **tier classification and upstream-issue count are build-time outcomes, not
  plan-time commitments** — write them as hypotheses ("_expected_ pure framework-tier; confirm the enforcement
  path touches no core method at build") and re-confirm from _behaviour_, not from a spec phrase. Specifically:
  when a task claims to "reuse an existing mechanism with no new code," verify the reuse point is
  **fork-reachable** — if correct behaviour needs logic _inside_ a Sunrise-owned function (an enforcement
  resolver, a dispatch key, a cache), that's a **core seam** (fork-first-informs-upstream), and the "no
  upstream issue" claim is false. Distinguish "no new _enforcement mechanism_" (often true — reuse the
  resolver) from "no new _seam_" (separately false when the reuse can't be wired without a core edit).
  Generalises the fork-first model: the _decision_ to go fork-first-with-a-seam is frequently made at build,
  by a behaviour analysis, not at plan time. _Status: open._

### B18 · A precedent borrowed for its shape can carry a rationale that doesn't transfer — re-derive it from the new domain

- **Discovery.** `f-module-config`'s plan (and A10) named the **`AiAgentVersion`** pattern for `ModuleVersion`,
  and the plan prescribed following it faithfully — including its **create-time v1 seed** ("seed an explicit
  initial version so the pre-edit state is a first-class, restorable entry", the `INITIAL_VERSION_SUMMARY`
  precedent). t-1 built it that way. `/code-review` (3 of 8 finder angles independently) then showed the seed's
  _rationale_ doesn't survive the domain change: an **agent's** create-time config is a real human-authored
  snapshot worth preserving, but a **module's** pre-edit state is the empty `{}` boot-sync default. So the
  borrowed seed (a) **fabricated an author** — it stamped the first _editor_ on config they never wrote — and
  (b) for a schema with required fields produced a v1 that fails its own restore re-validation: a version
  presented as restorable that can never be restored. The shape transferred cleanly; the _reason for the seed_
  did not. Dropped it — the first save is simply v1.
- **Impact.** Low cost, caught pre-merge — but it was a **plan-prescribed** step (not an incidental
  implementation choice), so the feature doc's t-1 detail had to be reconciled at close-out ("no lazy seed").
  The tell was available at plan time: the plan copied "seed the initial version" from the agent precedent
  without asking _what the module's initial state actually is_ (the `{}` default, set by boot-sync, not by a
  user) — the same over-reading of a precedent that B17 flagged for "no new mechanism".
- **Feedback.** When a plan says "mirror `X`", **separate the mechanism you're borrowing (the shape) from the
  justification `X` gives for it (the rationale)** and re-derive the rationale in the new domain before
  committing it to the plan. A precedent's shape (point-in-time snapshot table, monotonic version, restore-
  forward) is portable; its edge-case decisions (seed v1 at create, who authored it, is the origin
  restorable) are contingent on _that_ domain's data and must be re-asked. Concretely for "versioned config":
  ask "what is the pre-first-edit state, who authored it, and is it a meaningful restore target?" — for
  modules the answer (empty default, no human, no) kills the seed; for agents it (real config, the creator,
  yes) justifies it. Same table shape, opposite call. _Status: open._

### B19 · The fork-carried core seam is the sanctioned escape hatch when no seam exists — mirror the #385/#403 shape, keep it generic, ledger it

- **Discovery.** f-guidance t-4b needed to inject **per-user** context through the core context-contributor
  seam, but the seam gave contributors only `(id)` (no `userId`) and cached per `(type, id)` — so per-user
  content would leak across users. The first instinct (recorded in the earlier plan decision) was "that's a
  forbidden core edit — defer to an upstream ask." That framing was **incomplete**: f-module-bindings t-4 had
  already established the opposite precedent (#53) — a _generic seam added inside a Sunrise-core file_
  (`registerAgentAccessContributor`), carried in the fork, tracked in [[upstream-asks]], with "empty registry =
  prior behaviour" and boundary CI green. So the widening was done the same way: `buildContext` /
  `ContextContributor` gained a generic `ContextRequest { userId? }` + a user-aware cache key — a minimal,
  framework-agnostic core edit.
- **Impact.** The task was initially deferred as "blocked on upstream" when it was actually buildable via an
  in-repo, sanctioned pattern — a lost cycle and a decision that had to be reversed with the user. The tell:
  the CLAUDE.md banner _itself_ sanctions this ("if you genuinely must change platform behaviour and no seam
  exists, keep the edit minimal and add a follow-up"), and a live precedent existed one feature over.
- **Feedback.** When a framework feature needs behaviour a Sunrise-core file doesn't expose, the decision is
  **not** binary "seam exists → extend / no seam → defer." There is a **third, sanctioned option**: add the
  _generic_ seam **in the core file**, carried as a fork edit, if and only if it is (a) **generic** — no
  framework vocabulary in core (the boundary vocab-scan must stay green), (b) **behaviour-neutral at rest** —
  the empty/absent state reproduces prior behaviour exactly, and (c) **ledgered** in [[upstream-asks]] with the
  delete-when-it-lands action. Reach for it when the alternative is a worse contortion (a hacky framework shim,
  or shipping a feature crippled). Don't reach for it when a registry-style seam already exists (use it) or the
  edit would drag a framework concept into core (that fails the vocab scan — find another shape). Generalises
  B5/B7 (fork-first informs upstream) and B17 (a needed core seam is a build-time finding): the seam can be the
  fork's to _carry_, not just to _request_. _Status: open._

### B20 · Resolve a plan's open design questions inline, not via a separate refinement pass

- **Discovery.** f-guidance's plan shipped with a "five open questions for Ultraplan refinement" section
  (ranking weights, synopsis determinism, scope posture, surface-route shape, confirm-first). The user asked to
  settle them **without** Ultraplan; each had a clear, defensible default that took one focused pass to decide
  and fold into the plan (documented weights, deterministic synopsis, leave-allow-on-absent, one framework
  route, no dryRun). The separate refinement tool added ceremony without adding signal for questions this
  shape.
- **Impact.** Positive once done, but the plan-authoring habit of parking every under-specified choice for a
  later "refinement pass" delayed decisions that were readily made from the spec + repo reality already in
  hand. Some genuinely need the owner's product steer; most are architecture calls with a right answer.
- **Feedback.** When authoring a feature plan, **triage open questions as you write them**: if a question has a
  clear default derivable from the spec, the shipped code, or the "ship-nothing-a-fork-deletes / keep-it-simple"
  disciplines, **resolve it inline with a one-line rationale** rather than deferring it. Reserve a flagged
  "needs the owner" list for the genuine product-scope forks (e.g. the seed-the-family-vs-mechanism call in
  [[f-facilitation-agents]]) — decisions where guessing risks the wrong build, not decisions with a
  conventional right answer. A plan that resolves its own tractable questions is build-ready; one that parks
  them all just moves the work later. _Status: open._

### B21 · A family-of-agents feature is mechanism-only by default — ship the binding + surface + role→cap reference, not seeded personas

- **Discovery.** [[f-facilitation-agents]]'s board sketch and the rev-16 spec both implied a **seeded** facilitation
  family (six `isSystem:false` agents + role→cap grants + bindings, the #303 scaffold). But the spec's own framing —
  "they are `AiAgent` rows" — makes an agent **per-deployment config** (persona, model, voice, guardrails). Seeding a
  family imposes Daybreak's persona/model choices on every fork, is demo-ish content the fork immediately re-personas,
  and drags in a seed→`ai_capability`-boot-sync ordering wrinkle. The owner chose **mechanism-only**: ship the binding
  - the `FACILITATION_ROLES` vocabulary + the surface + the documented **role→recommended-capabilities reference**, and
    let a fork create its own agents and bind them. That dropped the conditional seed task entirely, making the feature an
    honest 2 PRs instead of a padded 3.
- **Impact.** Positive. The mechanism is complete and immediately usable with nothing for a fork to delete — the
  clearest expression yet of the plan's own **"ship nothing a fork has to delete"** organising principle, applied to
  agents rather than tables. It also kept both PRs a faithful mirror of the reviewed-secure module-binding + module-surface
  pattern, which is why both semantic reviews came back clean on both tasks.
- **Feedback.** When a feature's deliverable is "a family of agents" (facilitation, emergence judges, any seeded
  persona set), **default the plan to mechanism-only**: the binding + the role/seat vocabulary + the surface + a
  documented role→capability reference. Treat "seed a default family" as a **separate, conditional, owner-gated** task
  (a product-content decision, per [[#B20 · Resolve a plan's open design questions inline, not via a separate refinement pass|B20]]'s
  "genuine product-scope fork" carve-out), not a promoted one — and if the owner declines it, drop it rather than
  carrying dead scope. Agents are config; the framework ships the machinery, the fork brings the personas. _Status: open._

### B22 · Size "typed kinds under one table" by each kind's enforcement machinery, not one-per-kind

- **Discovery.** [[f-policies]] is a `FacilitationPolicy` table with four typed kinds (auto-approval,
  relevance-gating, guard-minimums, escalation). The naïve sizing is one task per kind (4 PRs). But the
  kinds have wildly uneven build cost: **auto-approval** is a stored value with no runtime consumer (pure
  data), **relevance-gating** enforces at the facilitation surface, **guard-minimums** needs a fork-carried
  Sunrise-core seam, and **escalation** composes existing workflow/notify bridges. Cutting by _enforcement
  machinery_ instead gave a truer shape: the thin stored kind **folded into the t-1 spine** (it proves the
  typed-kind pattern end-to-end at almost no cost), the two enforced kinds each stood alone (distinct
  surfaces — a chat-route gate vs a core guard seam), and the fourth (escalation) was **deferred** as a
  conscious carve-out rather than padded in. Net: 4 indicative → **3 shipped + 1 deferred**, each PR a
  cohesive vertical slice.
- **Impact.** Positive. The build-cost cut kept the riskiest work (the core guard seam) isolated in its own
  reviewable PR, let the anchor PR ship something provable (the spine + a working kind) instead of an inert
  table, and surfaced the escalation deferral as an explicit decision at close-out (not a silent drop). The
  one-per-kind cut would have produced a dead-table anchor PR and hidden the core-seam risk among sibling
  kinds.
- **Feedback.** When a feature is "several typed kinds under one table" (policies, conditions, step types,
  event kinds), the feature-plan agent should size by asking, per kind: _what enforcement machinery does this
  kind need, and where does it live?_ Fold **pure-data / no-consumer kinds into the spine** (they prove the
  pattern cheaply); give **each kind with distinct enforcement machinery its own PR** (especially one that
  touches a different tier — a core seam, a hot path); and treat a **deferrable kind as an explicit carve-out**
  flagged at close-out, per [[#B20 · Resolve a plan's open design questions inline, not via a separate refinement pass|B20]].
  The table spine is one task; the kinds are as many tasks as their machinery is distinct — not a fixed
  one-per-kind. _Status: open._

### B23 · When a large feature grows a separable second concern, shed it into its own feature at close-out rather than carry a heavy tail

- **Discovery.** [[f-emergence]] (18) was planned as one feature spanning three concerns — escalation
  (F15), the F17 proposal gate, and evaluation wiring — and flagged at plan time as "large (~5 PRs)".
  The first three tasks (escalation + propose + approve/publish) delivered a **coherent, shippable
  whole**: the emergence _gate_. The eval thread (ex-t-4/t-5) was governance _observability_ —
  scoring/supervising conversations — that shared **no code** with the gate, and reconnaissance had
  shown it was the heaviest, most-gap-laden part (no conversation-native scorer, framework convos emit
  no eval logs, the #303 seed scaffold didn't exist). Rather than finish it as a tail of an
  already-large feature, at close-out it was **split into its own claimable feature** ([[f-eval]], 20),
  with the reconnaissance carried across intact.
- **Impact.** Positive. f-emergence closed at a clean conceptual boundary (F15 + F17, 3 PRs) instead
  of dragging on; the eval thread gets its own claim + plan pass (and its own owner) instead of
  inheriting f-emergence's scope by accident; and the board now shows two honestly-sized features
  where there was one oversized one. No work was lost — the recon moved with the split.
- **Feedback.** A feature-plan agent should treat "this feature has grown a second, separable concern"
  as a **close-out decision point**, not just a plan-time one: when the shipped tasks already form a
  coherent whole and the remaining tasks (a) share little/no code with them and (b) are heavy enough
  to warrant their own plan, **split the remainder into a new feature at close-out** rather than carry
  it. The tell is a feature whose name lists two "+"-joined concerns (here "proposal pipeline **+**
  evaluation wiring") — a candidate seam. Sibling to [[#B22 · Size "typed kinds under one table" by each kind's enforcement machinery, not one-per-kind|B22]]
  (size by the real seam) applied at the _feature_ grain, and to the deferral discipline in
  [[#B20 · Resolve a plan's open design questions inline, not via a separate refinement pass|B20]]. _Status: open._

### B24 · Copying a workflow-shaped core primitive into a new domain: the adapter must re-check what the primitive's contract silently assumes about the _shape_ of its inputs

- **Discovery.** [[f-eval]] t-2 reused Sunrise-core `runSupervisorAssessment` — built for workflow
  executions (`stepOutputs`/`inputData`/`outputData`) — over a framework _conversation_ by projecting
  turns into its shape. Type-checking passed and the tests (with the core mocked) were green, but
  `/code-review` surfaced three defects that only bite because the _input shape_ differs from what the
  core's callers usually feed it: **(1)** the core's citation validator does
  `serialiseStepOutput(stepOutput).includes(quote)`, and `serialiseStepOutput` JSON-stringifies an
  **object** (escaping newlines/quotes) but returns a **string** verbatim — so passing turn objects
  made the judge's natural prose quotes fail the substring check, silently dropping weaknesses and
  (with `minWeaknesses:1`) **downgrading the verdict**; the workflow path rarely hits this because its
  step outputs are often already strings. **(2)** `includeStepOutputs:'all'` (chosen because
  "conversations are short") removed the per-step byte cap the workflow path relies on to avoid
  overflowing the judge's context. **(3)** anchoring the one conversation-level verdict on the
  _terminal_ turn's row (a per-turn store) orphaned prior verdicts when the conversation later grew —
  re-anchored on the stable _first_ turn.
- **Impact.** Positive — all three fixed in a review-fix commit before merge — but each was invisible to
  type-check and to core-mocked unit tests. They were correctness bugs hiding in the _seam_ between the
  copied primitive and the new domain's data.
- **Feedback.** When a feature reuses a core primitive built for a different subject (workflow → here a
  conversation), the plan/build should include an explicit **"contract re-derivation" step**: read the
  primitive's validators and serialisers and ask what they assume about input _shape_ (string vs
  object, size caps, one-vs-many anchor), not just its type signature. A green type-check on a copied
  primitive is the most dangerous kind of green — it proves the shapes _compile_, not that the
  primitive's silent assumptions still hold. Corollary: don't unit-test such an adapter with the core
  fully mocked and stop there — either exercise the real primitive over representative data, or add a
  test asserting the specific contract (here: "a prose quote spanning a newline still validates").
  Sibling to [[#B18 · A precedent borrowed for its shape can carry a rationale that doesn't transfer — re-derive it from the new domain|B18]]
  (a borrowed _precedent_ can carry a rationale that doesn't transfer; this is the same hazard for a
  borrowed _primitive_). _Status: open._

### B25 · A task pairing a new endpoint with its consuming UI — or leaning on an assumed reuse — is provisionally one PR; size it at build by the machinery you'll actually write

- **Discovery.** [[f-ops-views]] promoted t-4 (binding tabs) and t-5 (journey explorer) as one task each; **both split at build** — t-4 into a/b/c (one per binding kind), t-5 into a/b (read API vs UI) — along the same _UI-over-shipped-API vs builds-one-new-endpoint_ seam the feature already used for its top-level split. t-5's split was forced by a **reuse assumption that didn't survive contact**: the plan said "reuse the workflow-builder canvas in read-only mode," but build-time recon found its node/edge types render workflow-step config (not reusable) and there is **no layout library** in the deps — so the canvas was a genuine build (own Kahn-longest-path mapper + node components + replay reducer), machinery wholly distinct from the read API it consumes. Neither half was a foldable sliver ([[#B1|B1]]).
- **Impact.** Positive — each split kept a PR reviewable and gave the UI a **reviewed, stable API contract** to mount on (the CLAUDE.md API-first rule falls out for free) — but the plan's "task = one PR" sizing was wrong for these two tasks in the same way, twice.
- **Feedback.** Two provisional-sizing smells to catch at plan time and re-check at build: **(1)** a task that spans **a new endpoint _and_ its consuming UI** is usually two PRs, not one — the API is a self-contained, testable, security-relevant slice and the UI is another; size each by its own machinery, not by the user-facing feature. **(2)** a task whose sizing leans on **"reuse existing X"** must have that reuse **weight-checked before committing to one PR** — is X actually the shape you need, or merely adjacent? (The workflow canvas was adjacent: same library, wrong node vocabulary.) Extends [[#B22 · Size "typed kinds under one table" by each kind's enforcement machinery, not one-per-kind|B22]] (size by machinery) to the **API↔UI axis**, and [[#B17 · "Pure framework-tier / no upstream issue" is a build-time finding, not a plan-time fact — correct-behaviour-first can reveal a needed core seam|B17]] (a build-time finding, not a plan-time fact) to **reuse-weight**. _Status: open._

### B26 · A safety guard copied from a sibling by analogy may protect against a failure mode the new usage structurally can't have — check the triggering condition exists before building it

- **Discovery.** [[f-overlays]]'s plan prescribed, for the pgvector similarity query, mirroring knowledge
  search's **dimension drift-guard** (`assertActiveModelMatchesStoredVectors` — fail loudly with "re-embed"
  rather than crash on a `$N::vector` cast when the active embedding model's dimension no longer matches the
  stored vectors). It's a real, load-bearing guard **in knowledge search**, because there a _fresh query
  embedding_ (from whatever model is active _now_) is compared against vectors _embedded earlier_ — the two
  can drift apart in dimension. But f-overlays' similarity is **node-to-node within one `(graphSlug, version)`
  sync run**: both vectors come from the _same_ batch, same model, same fixed `vector(1536)` — there is no
  fresh-vs-stored comparison, so **the drift the guard exists to catch is structurally impossible here.** t-2
  shipped without it (documented in the PR); the guard would have been dead code guarding an unreachable state.
- **Impact.** Small and positive — a planned mechanism _correctly dropped_ at build, saving code that would
  have implied a risk that doesn't exist (and mislead the next reader into thinking node embeddings can drift
  mid-query). But like [[#B18 · A precedent borrowed for its shape can carry a rationale that doesn't transfer — re-derive it from the new domain|B18]], it was **plan-prescribed**, so the feature doc's task row had to be
  reconciled at close-out ("no dimension drift-guard needed — same-sync-run"). The tell was available at plan
  time: the plan copied the guard from the sibling without asking _what two things the guard compares, and
  whether the new usage compares them at all._
- **Feedback.** When a plan says "mirror `X`'s guard / validation / invariant check", **identify the exact
  failure state the guard detects and confirm the new usage can actually reach it** before baking it in. A
  guard is not portable just because the surrounding mechanism (here: pgvector cosine query) is — it's
  contingent on a _failure mode_, and a different data-flow may not have that mode. Concretely: ask "what
  divergent inputs does this guard reconcile, and does my code ever hold those two inputs at once?" For
  query-vs-stored embeddings the answer is yes (guard needed); for same-run node-to-node it's no (guard is
  dead code). This is [[#B18 · A precedent borrowed for its shape can carry a rationale that doesn't transfer — re-derive it from the new domain|B18]] applied to **defensive code specifically** — the shape (a pgvector
  query) transfers; the _guard's justification_ (a drift that can occur) must be re-checked against the new
  data-flow, and here it evaporates. Same family as [[#B25 · A task pairing a new endpoint with its consuming UI — or leaning on an assumed reuse — is provisionally one PR; size it at build by the machinery you'll actually write|B25]]'s reuse-weight check, at the level of an individual guard. _Status: open._

### B27 · An "instrumentation" feature's real deliverable is often wiring a shipped-but-dormant seam an earlier feature left for it — find the unwired receiver at recon, make it the anchor

- **Discovery.** [[f-engagement]] read on the board like three additive surfaces (an event stream, a feedback
  cap, a stats page). But recon found that the load-bearing deliverable was elsewhere: **f-module-bindings (07)
  had shipped `runModuleWorkflowBindings` deliberately unwired** — its own header said _"Nothing calls this yet …
  f-engagement wires the real event later"_ — so an operator's "when X happens in this module, run workflow Y"
  was configured-but-dead across two shipped features. f-engagement's t-1 emit seam is what finally gave that
  receiver a **producer**; that's the feature's highest-value effect, not the stats UI. The same pattern sat under
  the data model: the `JourneyEvent` stream was created by f-journey-state (09) _for_ 08, already stamping
  `moduleSlug`, so 08 added no table — it lit up dormant infrastructure two features had pre-positioned.
- **Impact.** Positive once seen — recon promoted the wiring to t-1's explicit anchor (and the PR narrative could
  say "this is the first production caller"), so a reviewer understood the stakes. The risk it _avoids_ is
  treating such a feature as purely additive and under-sizing/under-testing the one integration that makes prior
  work real (the isolation test on the two-limb seam was the most important test in the feature, not the stats
  assertions). The tell at plan time: the plan's own words were "reuses `runModuleWorkflowBindings`" and "extends
  the `JourneyEvent` stream" — "reuse/extend" language pointing at infrastructure a _different_ feature shipped.
- **Feedback.** When a feature's plan describes it as **instrumenting / observing / reusing / extending** existing
  infrastructure, at recon **classify each named seam as live or dormant**: grep the shipped receiver for its
  production callers. A shipped seam with **no caller** (or a table with no writer) is a _latent integration this
  feature owns_ — promote it to the anchor task, name it "first production caller" in the plan, and put the
  load-bearing test on the wiring, not the new surface. This is the producer-side complement to the coordination
  notes this plan already writes ("whichever of 07/08 lands the shared emit point owns it") — those flag the
  seam; this says _the feature that lands the producer should treat that as its spine._ Generalises the
  [[#B14 · A fork-first seam that composes with an upstream issue needs a live ledger, not just plan prose|B14]]
  "dormant seam needs a live tracker" instinct from cross-repo seams to _intra-repo_ ones. _Status: open._

### B28 · A cross-cutting deferral parked in a feature's own doc is abandoned once that feature ships — promote it to the active board at close-out

- **Discovery.** [[f-atlas]] accrued three "own-PR-later" deferrals across its tasks (a shared read-only-canvas
  primitive at rule-of-three, a shared `stitchById` reader helper, region-container nodes). Each was dutifully
  recorded in the feature's own **Follow-ups** section — the correct home _while the feature is in flight_. But at
  close-out the feature doc becomes a **graveyard**: nobody re-reads a shipped feature's plan, so a cross-cutting
  item that outlives the feature silently becomes "not done, left behind." Simon: _"If it's not put somewhere
  useful and actionable, what you call deferred is actually just not done."_
- **Feedback.** Make it a **close-out step**: cross-cutting deferrals (things that touch other features / are their
  own PR, vs. within-feature next-task work) get **promoted to a live board surface** — here a "Cross-cutting
  follow-ups" subsection under the board — as part of the close-out reconcile, not left only in the shipping
  feature's Follow-ups. The test for a deferral's home: _"will the person who actions this see it here after this
  feature ships, or is this a graveyard?"_ Sharpens the "deferrals need an actionable home" principle from "record it where the actioner
  looks" to "and re-home it when the original location stops being looked at." _Status: open._

### B29 · In a UI-over-shipped-backend feature, the bugs cluster in client↔server state coordination — budget a review-fix commit per dialog/local-mirror task, and reset cached view-state on open/close

- **Discovery.** [[f-map-editor]] was, as the recon predicted, almost entirely UI over an already-shipped
  backend — so it wrote very little logic that _could_ be wrong in the classic sense. Yet `/code-review`
  found a real defect on **three consecutive tasks** (t-3/t-4/t-5), and every one was **client-state
  coordination**, not backend logic: (t-4) `handleRollback` optimistically set `hasDraft = false`, but the
  rollback service — unlike publish — never clears the server draft, so a reload resurrected the stale draft
  and the rollback looked silently undone; (t-4) a publish dialog whose _open_ state was owned by the child
  closed via a `published`-flash `useEffect` that a rapid second publish left stuck; (t-4 + t-5) a
  dialog/panel that **cached a result/error and never reset it on close→reopen**, so it showed a verdict for
  a since-edited canvas. The t-5 stale-result bug is the _same class_ as a t-4 finding — the pattern
  recurred within one feature.
- **The shape.** Two anti-patterns kept surfacing: **(1) a local state field mirroring server state**
  (`hasDraft`, `publishedVersion`) updated _optimistically_ from what the client _thinks_ the mutation did,
  rather than from what the server _actually_ returned — the fix is the workflow-builder's revert pattern:
  after a mutation whose server-side effect you don't fully model, **re-read fresh server state and drive the
  UI off it**. **(2) a dialog/panel caching a derived view** (`result`, `error`) that outlives the inputs it
  was computed from — the fix is to **clear it on open/close** (and at the start of a re-run), and to keep
  dialog-open state in the parent that owns the mutation so it can close on success directly.
- **Feedback.** For a UI feature that mirrors server state or caches computed views, **`/code-review` is
  where it pays for itself** — the same way [[planning-retro#B15|B15]] found for the deterministic engine, but
  the failure domain is different (state coordination, not algorithm correctness). Budget a review-fix commit
  per task that adds a dialog, a local mirror of a server field, or a cached result. And carry two standing
  checklist items into any such task: _does every local mirror of server state get reconciled from the
  server after a mutation?_ and _does every cached view-state reset when its dialog/panel closes or its
  inputs change?_ Catching these at build (not review) is cheaper; the recurrence within one feature shows
  they're systematic, not incidental. _Status: open._
- **Corroboration ([[f-admin-surfaces]] t-4, a second feature).** The pattern recurred outside f-map-editor,
  confirming it's a property of UI-over-shipped-backend features generally, not one feature. t-4's polish task
  (searchable roster pickers) wrote almost no backend logic, yet `/code-review` found two real defects, both
  **cached view-state not reset on open/close** — the exact anti-pattern (2) above: the roster hook cached its
  filtered list _and_ its load error and never reset them on form reopen, so a failed first load left the
  picker permanently stuck (reopen no-op'd on an `opened` guard), and a narrowing search stranded a
  now-hidden selection the submit still posted. The fix was B29's own prescription — a `reset()` that clears
  the cached roster/query/error and re-arms on every open, plus clearing the dependent selection when its
  source list changes. **The standing checklist item _"does every cached view-state reset when its
  dialog/panel closes or its inputs change?"_ would have caught both at build.** Adds a corollary: a **hook
  that caches a fetched list behind an open-once guard** is a cached-view-state in disguise — the guard must
  re-arm on reopen, or a transient failure bricks the surface.

### B30 · Reusing a sibling write-service by name isn't reuse of its _semantics_ — check the effect at the read side, and beware the squash-merge that races a review-fix commit

- **Discovery ([[f-governance-plus]] t-1).** The plan chose, for the new `policy` proposal subject, to apply
  approvals via `createFacilitationPolicy` — the same write-service the direct policy-admin route uses — and
  called the result "last-writer-wins." Three independent `/code-review` finders converged on the same defect:
  `createFacilitationPolicy` only ever **inserts**, `FacilitationPolicy` has **no unique-on-kind**, and every
  enforced kind **aggregates** its enabled rows (guard-floor keeps the max rank, gating denies on any, auto-approval
  takes 'none'-wins). So approving a policy proposal added a _duplicate_ enabled row while the **old** policy still
  won — the proposed change silently never took effect. The write-service was reused correctly; its **semantics at
  the read/enforcement side** were not what "change this policy" needed. The fix made `policy` target an **existing
  row by id** and apply via `updateFacilitationPolicy` (overwrite in place) — which also revealed the right
  invariant: **all three subjects change an _existing_ target, never create one** (map publishes over a graph,
  module_config snapshots over a module, policy overwrites a policy). The plan-time "reuse `createFacilitationPolicy`"
  was a reconciliation miss the recon passes didn't catch because they verified the _function exists_, not the
  _aggregation contract of its table's readers_.
- **Lesson.** When a feature reuses a write primitive to "change X," trace X to its **reader/enforcer** and confirm
  the write actually alters what the reader returns. A create into an accumulate-on-read table is not an edit. Add
  a recon check: _for every reused write-fn, who reads its rows and how do they combine multiple?_ — a
  create-vs-update decision hides there. Corollary to [[planning-retro#B26]] (a copied guard may not fit) and
  [[planning-retro#B24]] (an adapter must re-check a primitive's silent assumptions): here the silent assumption
  was on the _read_ side of the same table.
- **Process hazard (same task).** The t-1 PR (#131) **squash-merged at its _first_ commit** while the review-fix
  commit was still landing on the PR head — a GitHub PR head-sync/Actions delivery hiccup meant the branch ref had
  the fix but the PR never re-synced, and the auto-merge captured only the first commit. Result: `main` briefly had
  t-1 **without** its `/code-review` fixes (the live policy bug above). Recovered by cherry-picking the fix onto a
  fresh branch off `main` and landing it as a follow-up PR (#132). **Lesson:** after pushing a review-fix commit,
  **verify CI actually triggered on the new head SHA and that `gh pr view --json headRefOid` matches** _before_
  the PR can merge — don't trust that a push to a PR branch re-synced the PR. If a merge slips through at the wrong
  SHA, fix forward with a cherry-pick PR rather than rewriting merged history. _Status: open — worth a branch-protection/
  auto-merge review so a stale-head squash can't merge past an unpushed-to-PR-head commit._
