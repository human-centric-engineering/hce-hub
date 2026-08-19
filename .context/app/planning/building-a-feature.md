---
name: building-a-feature
description: The operational rhythm for building an HCE Hub feature — plan-first → per-task gate loop → close-out. Read this before starting a feature.
parent: plan.md
---

# Building an HCE Hub feature — the flow

> **Who this is for:** anyone (and any AI agent) picking up a feature from the
> [board](./plan.md#features-epic-v1). [`plan.md`](./plan.md) gives the _structure_ — the
> levels (task / feature / phase), the flat feature list, the status vocabulary, how to
> claim, the dependency spine. **This doc is the _execution rhythm_** that goes with it:
> claim + plan first → build each task through the gate loop → close out and reconcile the
> board. The per-feature _authoring_ convention (how to write a good `<feature>.md`) is
> [`feature-plan-authoring-guide.md`](./feature-plan-authoring-guide.md); **this** doc is
> the rhythm that plan then executes.
>
> _No worked example exists yet — HCE Hub is greenfield. The first feature you build
> (`f-fork`, then `f-data-model` / `f-theme`) **establishes** the worked example the next
> feature copies. Until then, follow the template in
> [`feature-plan-authoring-guide.md`](./feature-plan-authoring-guide.md#template-copy-this)._

## The loop, at a glance

**Claim + plan first → build each task through the gate loop → close out the feature.**
Never skip the plan. Never push to `main`. Fix review findings before merging. When a
feature merges, reconcile the board so the next person sees the truth. With two builders
(Simon + John) the board is a live coordination surface — a claim nobody can see doesn't
stop two owners starting the same feature.

## 1. Claim + plan first (don't jump to code)

1. **Claim it on the board.** In [`plan.md`](./plan.md), put your name in the feature's
   **Owner** cell and set **Status → `in flight`**. One owner per feature.
2. **Write the feature's detailed plan** at `.context/app/planning/<feature>.md`, following
   [`feature-plan-authoring-guide.md`](./feature-plan-authoring-guide.md) (its §§1–7 are the
   authoring discipline; §8 is the Sunrise seam discipline). The anatomy in brief:
   - **Intent** — what and why in a line or two. The binding _how_ stays in the spec —
     [`v1-requirements.md`](./v1-requirements.md) (product) and the
     [design handoff](./design_handoff_hce_hub/README.md) (UI) — plus the Sunrise
     `.context/*` docs cross-referenced per feature. Don't duplicate it; reference the
     section + decision IDs.
   - **Reconcile the spec against the current repo (required first section).** The spec and
     [`plan.md`](./plan.md)'s indicative task bullets are a _sketch_; verify every
     assumption — _especially_ "assumed landed" dependencies and named Sunrise seams —
     against the actual tree before baking it in, and record each adaptation as a decision.
     Classify each seam live/dormant and confirm the feature's tier/upstream hypotheses
     _from behaviour_ (guide §1, §8).
   - **A promoted-tasks table** — `t-N`, files-likely-to-touch, deps, **Done-when**, status,
     PR. **Size by separability of *value*, not line count** (guide §2, [planning-retro](./planning-retro.md) HB3):
     a task earns its own PR only if splitting adds a different review surface, a parallelism
     opportunity, or an integration checkpoint. Homogeneous/sequential/same-file work that's
     unconsumed until the set is complete (e.g. a multi-model schema) is **one PR even when
     large** — default to fewer, cohesive PRs. Then run the **sliver self-check** (fold a
     scaffolding-only commit into its dependent) and mark the split candidates (endpoint +
     consuming UI; pure transform + LLM/IO; "reuse existing X") to re-check at build.
   - **Per-task "Done when"** that lists the gates as completion criteria, plus any standing
     repo step this feature is known to need (e.g. a hand-written FK's drift probe +
     erasure hook; stripping a spurious generated-migration `DROP INDEX`) (guide §3–4).
   - **The test strategy, up front.** vitest runs on `happy-dom` with **no live DB**: unit
     tests mock `@/lib/db/client` and forward `executeTransaction` to a `tx` mock; prove an
     end-to-end chain with a small stateful in-memory fake; use `smoke:*` scripts for
     real-DB fidelity. Never write "integration test against the dev DB" (guide §6).
3. **Present the plan to the feature owner before building** — especially task sizing and any
   genuine design/forkability decisions. Planning is collaborative; surface the choices, don't
   pre-commit.
4. **Push the claim + plan as a standalone docs PR _before_ starting any task work.** The board
   claim (Owner + `in flight` in [`plan.md`](./plan.md)) and the new `<feature>.md` go up
   together as one docs-only PR, which merges before t-1 begins. This is what makes the board a
   real coordination surface once more than one person is building. (Docs-only, so it skips
   `/security-review` and `/code-review` — see step 3 of close-out.)

## 2. Build each task — the gate loop

A **task is one PR** (~200–600 lines; cohesive, reviewable). For each:

1. **Branch off `main`** — `feat/<feature>-tN-<slug>`. **Never commit or push to `main`.**
   Use `git switch -c <name> --no-track origin/main`: PRs are **squash-merged**, so a branch
   cut from a previously-merged local branch carries duplicate commits under new SHAs, and
   plain `git checkout -b X origin/main` silently sets upstream to **main** (a bare
   `git push` then targets it).

   **Then `start_task` it in the Hub — every task you pick up, before you write code.**
   The Hub is the system of record; a task you are actively building that still reads
   `claimed` tells every other reader it is unclaimed work. This is the step most easily
   skipped, because nothing in the code enforces it and the branch works fine without it.
2. **Build to the right shape, not the expedient one.** If it needs doing properly (a real
   seam, a correct data model), do that now — don't ship a review-passing-but-wrong version
   and defer the correct one. **Extend through the seam; never fork-and-edit a platform file**
   (every Sunrise-owned file you touch becomes a merge conflict on the next upstream pull —
   see [`CUSTOMIZATION.md`](../../../CUSTOMIZATION.md) and the [`CLAUDE.md`](../../../CLAUDE.md) banner).
3. **Browser-validate FIRST, if the task's done-when asks for it** (HB6). Seed real content
   through the real write path (MCP verbs, not fixtures), run the dev server, and have the
   **owner** eyeball the surface — a checklist of what to look at and what would be wrong
   beats "have a look". Only then run the gates.

   **Why before, not after** (changed 2026-08-19, owner): a browser finding changes code,
   and changed code invalidates every gate already run. Validating last means either
   re-running `/pre-pr` and the reviews, or — if the PR is already open — spending a second
   CI run on it. Gates prove the code compiles and behaves; the browser is the only thing
   that proves the surface *reads right*, and it is the cheaper of the two to redo.

4. **Run the gates, in this order:**

   ```
   commit → /pre-pr → /security-review → /code-review → fix (new commits) ⟲
          → npm run format → push ONCE → open PR → post a review summary comment
   ```

   **`/code-review` runs BEFORE the first push** (changed 2026-08-19, owner). It reads
   `origin/main...HEAD` and never needed the PR to exist. CI bills **per push**, and
   `cancel-in-progress` only helps when pushes land close together — one branch here ran
   **five CI runs, one per review-fix push**, hours apart, every one completing and billing.
   Reviewing locally makes the review loop CI-free, so more rounds now cost less, not more.

   **Run CI's jobs locally before the first push.** `/pre-pr` does not cover all of
   them, and each miss costs a full CI cycle to discover:

   | Run | When |
   | --- | --- |
   | `npm run build` | always — the Next build catches what `tsc` doesn't |
   | `npx tsx --env-file=.env.local scripts/smoke/erasure.ts` | always — real-DB GDPR erasure |
   | `npx tsx --env-file=.env.local scripts/smoke/export.ts` | always — the ~28 subject-access queries the mocked unit suite never executes |
   | `npm run db:drift-check` | any `prisma/` change |
   | `npm run db:seed` | any `prisma/seeds/**` change (also proves change-detection fires: `(updating)`, not `(skipping)`) |

   **The smokes need `--env-file=.env.local`.** CI supplies `DATABASE_URL` and friends
   as job env, so the workflow calls them bare; run bare locally and they die on Zod
   env validation, which reads like a code failure and isn't.

   - **`/pre-pr`** — type-check, lint, format, full test suite + coverage, migration-drift.
     It also flags the `lib/app/**` import-boundary and (via `app:ci-checks`) fork-hygiene.
   - **`/security-review`** — before pushing, not after.
   - **Format before push** — `npm run format && npm run format:check`; CI's `format:check`
     is the source of truth (Markdown especially).
   - **Open the PR against HCE Hub explicitly:** `gh pr create --repo
     human-centric-engineering/hce-hub …`. **Bare `gh` targets the Sunrise upstream repo** —
     always pass `--repo`.
   - **`/code-review`** — run it to its full spec (the high-effort path is 8 finder angles +
     a verify pass). Budget a review-fix commit for algorithm-, concurrency-, or
     client/server-state-dense work (`next-task`/collision routing, the task sheet's URL
     state, the reconcile webhook's idempotency) — treat a _clean_ review there as the
     surprise. `/pre-pr` green is necessary, not sufficient.

5. **Fix confirmed findings as additional local commits** — never amend or force-push over
   the reviewed commit. The point is unchanged: the review's effect stays visible in history.
   What changed is *when* they are pushed — they accumulate locally and go up in the single
   push, so the commit-level record survives at one CI cycle instead of five.

   **What this costs, accepted knowingly:** the review rounds no longer appear as separate
   PR conversations. Recover it with **one summary comment after opening the PR** covering
   what each round found — the commits carry the detail, the comment carries the narrative.
   Document findings you accept or refute, and why.
6. **`set_pr` the task(s) as soon as the PR exists** — routine bookkeeping, not a decision
   to check in about. A PR that closes three tasks links from all three. **`complete_task`
   once it merges** (f-github-sync will automate this later).
7. **The owner merges.** A task PR is **pure code** — do **not** open a per-task docs/close-out
   PR to flip its board row (that overhead buys no coordination once the feature is claimed to one
   dev). The row flip to `done #<PR>`, decisions, and any cross-cutting carries are **batched into
   the single feature close-out PR** (§3). Do **not** track an "in-PR" status — one transition,
   nothing to forget. (The only feature-level docs PRs are the **claim** and the **close-out** —
   [planning-retro](./planning-retro.md) A7.)

Every task inherits the repo rules in [`CLAUDE.md`](../../../CLAUDE.md) and
[`CUSTOMIZATION.md`](../../../CUSTOMIZATION.md): `logger` not `console`; the `@/` alias, never
relative imports (no sibling exception); validate external input with Zod; a new model with a
`userId`/`createdBy` FK to core `User` needs an explicit `onDelete` policy _and_ a drift probe
(`lib/app/db-drift.ts`) — route account deletion through `eraseUser()`, never
`prisma.user.delete()`; rate-limiting is automatic via `proxy.ts` (don't add a handler limiter
for a plain read); app scripts go under the `app:*` namespace. The `lib/app/**` **boundary** is
enforced by ESLint + CI — no runtime `next/*` imports there, `@/` alias only.

## 3. Close out the feature

> ⚠️ **The markdown half of this section is SUPERSEDED and kept only for the pre-§19
> history.** `f-selfhost-cutover` (§19) made **the Hub its own system of record**:
> `plan.md` and the per-feature `<feature>.md` files are a **frozen historical record**,
> not a live board. Do **not** flip rows, frontmatter, or logs in them.
>
> The live equivalents are MCP verbs — `complete_task`, `ship_feature`, `record_decision`
> — which step 6 above already prescribes. What still applies below: **shipping is a
> reconciliation, not just a merge** (dependents become claimable), and **decisions and
> execution lessons must be recorded somewhere durable** — now `record_decision` and
> `planning-retro.md` respectively, plus a `.context/app/<feature>.md` describing what
> the feature *does* (not what was done to build it).
>
> Rewriting this section properly is **§35 t-83**. Until then, read it for the *intent*
> and ignore the file mechanics.

When the **last task merges**, the feature is shipped — reconcile everything so the board
tells the truth (a merge changes what's claimable):

- Flip the feature to **`shipped`** on the board (the features table + the critical-path/
  Project-status lines), and flip its **dependents** from `blocked` to **`available`**.
- In the feature's own doc, set frontmatter `status: shipped` and its `t-N` rows to `done`.
- Add a line to plan.md's **Work-completed-to-date** log (append-only, newest first).
- Record any decision that changes the plan in plan.md's **Decisions log**. **Append the
  feature's execution lessons** where the next feature will find them — the process-shaped
  lessons that would refine the conventions belong in a Hub `planning-retro.md`
  (start `.context/app/planning/planning-retro.md` at the first close-out that produces one;
  the [`feature-plan-authoring-guide`](./feature-plan-authoring-guide.md) §§1–7 are the
  distilled-lessons format to match). If you learned something the hard way, write it down so
  the next feature doesn't relearn it.

Docs-only changes (like this board reconciliation) still go on a branch + PR — never straight
to `main` — but they skip `/security-review` and `/code-review`.

## The disciplines underneath

- **Two tiers (Sunrise → app).** HCE Hub is a **leaf-app fork** — it lives entirely in the
  reserved **`/app`** tier. Build in `lib/app/*`, `prisma/schema/app.prisma` (`app_*` tables),
  `.context/app/`, and new app files anywhere (`app/`, `components/`). **Do not fill the
  `/framework` tier** (`lib/framework/`, `.context/framework/`, `framework_*`) — that's
  reserved for framework-layer forks like Daybreak; HCE Hub does not use it. Full ownership
  boundary: [`.context/app/README.md`](../README.md) and [`CUSTOMIZATION.md`](../../../CUSTOMIZATION.md).
- **Register through the seams, driven by `initApp()`.** The `lib/app/*` scaffolds Sunrise
  ships empty are the fork's extension points — capabilities, context contributors,
  knowledge-access contributors, protected routes, admin/public nav, drift probes, env,
  rate-limit tiers. Fill them; don't hunt for a startup hook to call them from (they're
  auto-wired by the core consumer in the matching runtime).
- **Fork-first informs upstream.** If a feature needs a generic capability Sunrise lacks, build
  it **correctly in the fork as its final generic shape**, prove it in situ, then **file an
  upstream Sunrise issue** (with the fork-build learnings) and add a seam-ledger row as the
  feature's _own_ Done-when — not a throwaway, and not delegated away. The plan's tier analysis
  expects **zero** such asks in v1 (two watch-items — theme sync-seam, per-project agent
  provisioning — _might_ surface one); if a build turns one up, this is the discipline.
- **Ship nothing a fork can't cleanly merge.** Prefer new files and the designed seams over
  editing platform-owned files. When a platform-file edit is genuinely unavoidable, keep it a
  one-line "keep-mine" and add a follow-up rather than rewriting Sunrise's file.

## Reference

- [`plan.md`](./plan.md) — the board, the working model, the dependency spine, how to claim.
- [`feature-plan-authoring-guide.md`](./feature-plan-authoring-guide.md) — how to author a
  `<feature>.md` (the per-feature convention; its template is the one to copy).
- [`v1-requirements.md`](./v1-requirements.md) — the product spec (binding what/why, §-referenced).
- [`design_handoff_hce_hub/README.md`](./design_handoff_hce_hub/README.md) — the binding UI design.
- [`futures.md`](./futures.md) — forward constraints; source of the parked phases and v1 scaffolding.
- [`.context/app/README.md`](../README.md) — the fork playbook + ownership boundary.
- [`CUSTOMIZATION.md`](../../../CUSTOMIZATION.md) — the leaf-fork model, seams, and merge discipline.
- [`CLAUDE.md`](../../../CLAUDE.md) — repo rules every task inherits (fork banner at the top).
