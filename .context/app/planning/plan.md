---
name: HCE Hub
status: planning
host_platform: sunrise (leaf fork)
sunrise_baseline: main (existing lib/app/* seams — verified July 2026)
opened: 2026-07-10
spec: v1-requirements.md
epic: v1
---

# HCE Hub — development plan

> Build breakdown for **HCE Hub v1** (Module 1: Project Coordination) on a new **leaf fork of Sunrise**. The authoritative design is [[v1-requirements|v1-requirements.md]]; the UI design is the [[design_handoff_hce_hub/README|design handoff]]; forward-looking constraints are in [[futures]]. This is the *build breakdown* — structured to the [[plan-authoring-guide|HCE Hub plan-authoring convention]] (v2). Until the Hub exists, this markdown is the system of record; per-feature detailed plans follow the [[feature-plan-authoring-guide]].

## How to read this — the working model

- **Task = one PR.** A cohesive, reviewable change that merges in one sitting — sized by *separability of value*, not line count (a cohesive multi-model schema is one PR even when large; [[planning-retro]] HB3). Not a commit — commits sit below this plan's resolution.
- **Feature = the unit of ownership.** One owner, a coherent capability, ~2–5 tasks, explicit `depends on` edges. The atom you claim and advance. Features are a *flat list*; order emerges from dependencies.
- **Phase = an epic.** Coarse, organisational, non-gating. **This whole build is one epic: `v1`.** Later work (the futures modules, dynamic-focus consumers, bidirectional Sunrise flows) is carried as **parked** phases.
- **Intent over prescription.** Each feature captures *what/why*; the binding *how* lives in [[v1-requirements]] and the Sunrise `.context/*` docs, cross-referenced per feature. Implementation choices are made at build time by the owner + Claude, via a [[feature-plan-authoring-guide|feature plan]].
- **Order is emergent from `depends on`.** The [[v1-requirements#3. Human-centric principles (binding)|exploratory-ordering principle]] holds — the plan proposes order; it never gates.

## Project

| Field | Value |
|---|---|
| Name | **HCE Hub** — AI-native internal business operations platform; v1 = Module 1 (Project Coordination) |
| Active epic | **v1** (the whole build below) |
| Spec | [[v1-requirements]] (product) · [[design_handoff_hce_hub/README|design handoff]] (UI) · [[futures]] (forward constraints) |
| Host platform | **Leaf fork of Sunrise** (`prisma/schema/app.prisma`, `lib/app/**`, `.context/app/`, `app/(protected)` — verified against Sunrise `main`, July 2026) |
| Repo | `human-centric-engineering/hce-hub` (fork of `human-centric-engineering/sunrise`) |
| Deployment | `hub.hce.studio` — internal-only, auth-only app (public Sunrise surfaces stripped) |
| Relationship to Sunrise | [[CUSTOMIZATION|building-on-sunrise]] leaf-fork model: extend through existing seams, never fork-and-edit |
| Lead | Simon Holmes (builders: Simon + John) |
| Status | `planning` |

---

## Concept and intent

The Hub is a coordination environment for HCE's multi-project, multi-developer co-development at AI pace — **and** the substrate for a wider AI-native operations platform. v1 ships Project Coordination and establishes the module-composable shell, per-project sidekick architecture, project-scoped knowledge, URL space, and access control that future modules plug into without restructuring ([[v1-requirements#2. Thesis|§2]]).

The design centre is the **conversational sidekick** ([[v1-requirements#6. The sidekick agent|§6]]), not the Kanban. The Hub is *human-centric in operation*: ownership at the feature level, pull-not-push recommendations, transparency ≠ recommendation, deliberate `help-wanted`, exploratory ordering, and a `human_approval` gate on every sidekick state change ([[v1-requirements#3. Human-centric principles (binding)|§3]] — binding).

Almost everything is **configuration + a thin app layer on Sunrise**: Prisma models in `app.prisma`, a small set of Hub capabilities, per-project agents, a handful of workflows, and a greenfield UI. Sunrise already provides the orchestration engine, agent platform, RAG, MCP server, multi-LLM, scheduling, webhooks, cost/budget, audit, and approval gates ([[v1-requirements#9. Sunrise primitives we're using|§9]]).

---

## Relationship to Sunrise — tier & seam analysis

*(Required by the [[plan-authoring-guide#Ground the plan in verified reality|convention]]: model the tier and enumerate seams before sizing.)*

**Tier: single leaf fork.** The Hub is a **leaf** on Sunrise — not a framework tier like Daybreak. It owns `app/` routes, `components/`, `lib/` (app logic), `prisma/schema/app.prisma`, `.context/app/`, and the fork-owned `lib/app/*` scaffolds. It reserves nothing for downstream forks. Verified: `prisma/schema/app.prisma` and every `lib/app/*` seam below exist on Sunrise `main`.

**Every seam the Hub needs is an existing, fork-owned, `fork→core` seam** (the fork calls *into* a shipped Sunrise registry — cheap, no upstream work). Enumerated:

| Hub need | Existing Sunrise seam (fork→core) | Feature |
|---|---|---|
| Hub data models | `prisma/schema/app.prisma` + satellite FK to `User.id` + drift probe + erasure hook | `f-data-model` |
| Auth gate on `/projects`, `/brief` | `lib/app/protected-routes.ts` (`appProtectedRoutes`) | `f-access` |
| Per-resource membership scoping | `withAuth()` guards (per-resource, Hub-owned logic) | `f-access` |
| Hub tools (MCP-exposed) | `lib/app/capabilities.ts` → `registerAppCapability(new …)` | `f-hub-capabilities` |
| Per-turn project context in chat | `lib/app/context-contributors.ts` (`registerContextContributor`) | `f-sidekick` |
| Per-project RAG isolation | `lib/app/knowledge-access-contributors.ts` (`registerAgentAccessContributor`) | `f-sidekick` |
| Hub admin sidebar sections | `lib/app/admin-nav.ts` (`registerNavSection`) | `f-project-admin` |
| One-time boot work | `lib/app/bootstrap.ts` (`initApp`) | `f-fork` |
| Env vars, rate-limit tiers | `lib/app/env.ts`, `lib/app/rate-limit.ts` | `f-fork` |
| Brand name / logo / nav | `NEXT_PUBLIC_APP_NAME`, `components/brand/brand-mark.tsx`, `lib/app/public-nav.ts` | `f-fork` |
| Theme tokens | `app/globals.css` `@theme` (documented fork branding surface) | `f-theme` |
| GitHub PR state | built-in `call_external_api` capability + `.context/orchestration/recipes/` | `f-github-sync` |
| Inbound PR-merge trigger | inbound webhook → workflow (`.context/orchestration/inbound-triggers.md`) | `f-github-sync` |
| MCP dev access | existing Sunrise MCP server (auto-exposes registered capabilities) + `AiApiKey` scoping | `f-hub-capabilities` |
| Scheduled morning brief | `AiWorkflowSchedule` cron + `send_notification` step | `f-morning-brief` |

**Headline finding: zero core→fork seams, zero upstream gating.** Unlike Daybreak (which needed `f-seams` landed in Sunrise core *before* forking), the Hub is buildable **entirely through existing leaf-fork seams**. No Sunrise PR blocks the fork; the fork can be taken immediately. *Caveat ([[plan-authoring-guide#Ground the plan in verified reality|B17]]):* a feature may still surface a needed core seam at build (the two watch-items below) — if so, it's fork-first-informs-upstream, but none is anticipated to gate.

### Reconciliation findings (verified against Sunrise `main`, July 2026)

1. **No `AiKnowledgeCategory` model exists.** [[v1-requirements#10. Initial data model sketch|§10]]'s `Project.knowledgeCategoryId` and [[v1-requirements#9. Sunrise primitives we're using|§9]]'s "one knowledge category per project" assume a category primitive Sunrise doesn't have. Knowledge scoping is **tag/grant-based** (`KnowledgeTag` + per-document grants, resolved by `resolveAgentDocumentAccess`, widenable via the `knowledge-access-contributors` seam). **Adaptation:** project-scoped RAG = a per-project `KnowledgeTag` + a **per-project restricted sidekick agent** (decided 2026-07-10, see Decisions log). Replace `Project.knowledgeCategoryId` with `Project.knowledgeTagId` (or equivalent) + `Project.sidekickAgentId`.
2. **Theme is Tailwind-4 CSS-first.** `app/globals.css` uses `@theme { --color-* }` + `.dark` overrides (shadcn semantic tokens), not `tailwind.config.ts` (CUSTOMIZATION §2 is slightly stale on this). The Hub theme redefines these tokens; `globals.css` is a "keep-mine" fork branding surface. `f-theme` decides sync-safe placement at build (watch-item A).
3. **Sunrise's admin workflow builder is React Flow** (functional-spec §18.2) — relevant only if the Hub ever needs a workflow canvas; v1 does not.

### Two build-time watch-items (may surface a core seam — B17)

- **A · Theme sync-safety.** A full re-theme touches `app/globals.css` (platform file). Hypothesis: editing its `@theme`/`.dark` tokens is the *documented* fork branding path (a "keep-mine" merge, like the brand seam) — **no core change**. If a fully sync-safe fork-owned theme layer proves necessary, that's a small upstream ask. Resolve in `f-theme`'s reconciliation.
- **B · Per-project sidekick provisioning.** Seeding + configuring one agent per project on project creation uses existing agent APIs (the `isSystem:false` seed scaffold). Hypothesis: **no core change**. Confirm the agent-seed + knowledge-access-contributor compose per-project in `f-sidekick`.

---

## Features (epic: v1)

A flat list in rough dependency order (most-ready first). Order is *emergent from `depends on`*, not prescriptive. `~PRs` is indicative sizing. Owners are assigned at claim time (lead: Simon; builders: Simon + John).

| # | Feature | Owner | Depends on | ~PRs | Capability |
|---|---|---|---|---|---|
| 01 | `f-fork` | Simon (**shipped**) | — | 2 | Fork + brand + auth-only shell + strip public surfaces |
| 02 | `f-theme` | Simon (**shipped**) | f-fork | 1 (was 3) | HCE Hub base theme (tokens, fonts, dark mode) |
| 03 | `f-data-model` | Simon (**shipped**) | f-fork | ~1 (built as 3) | Prisma app models + scaffolding + migrations |
| 04 | `f-access` | Simon (**shipped**) | f-data-model | ~1 | Project-membership access control |
| 05 | `f-project-admin` | Simon (**in flight**) | f-access | 2 (was 4) | Project + member CRUD (in Sunrise admin shell) |
| 06 | `f-shell` | Simon (**shipped**) | f-theme, f-access | 2 (was 5) | Module-composable app shell (nav, 3-col layout) |
| 07 | `f-hub-capabilities` | Simon (**shipped**) | f-data-model, f-access | 3 | Hub tools (next/claim/create/backlog/help-wanted) + MCP |
| 08 | `f-projects` | TBD | f-shell, f-project-admin | 3 | Projects list + project view scaffold |
| 09 | `f-plan-view` | TBD | f-projects, f-hub-capabilities | 4 | Feature-level Plan view (topological ordering) |
| 10 | `f-board-view` | TBD | f-projects, f-hub-capabilities | 4 | Board (Kanban) — lanes, column routing, collisions |
| 11 | `f-task-sheet` | TBD | f-plan-view, f-hub-capabilities | 4 | Deep-linkable task detail side sheet |
| 12 | `f-sidekick` | TBD | f-hub-capabilities, f-shell | 5 | Per-project sidekick agent + chat panel + MCP |
| 13 | `f-intake` | TBD | f-sidekick, f-projects | 5 | Intake workflow + intake UI (→ human approval) |
| 14 | `f-github-sync` | TBD | f-hub-capabilities | 4 | GitHub PR integration + PR-merged reconcile |
| 15 | `f-morning-brief` | TBD | f-hub-capabilities, f-shell | 4 | Scheduled per-user morning brief + `/brief` view |

**Critical path (the spine):** `f-fork → f-data-model → f-access → f-hub-capabilities → f-sidekick → f-intake`. The UI spine `f-fork → f-theme → f-shell → f-projects → f-plan-view/f-board-view → f-task-sheet` parallelises off it once `f-access` + `f-hub-capabilities` exist. `f-github-sync` and `f-morning-brief` hang off `f-hub-capabilities` and parallelise late.

---

### 01 · `f-fork` — fork + brand + auth-only shell
*Owner:* Simon · *Status:* **shipped** · *Depends on:* — · *~2 PRs* · *Detailed plan:* [[f-fork]]

The fork's home: an internal-only, auth-only Sunrise app rebranded to HCE Hub, with the stock public surfaces stripped. (Cross-ref: [[v1-requirements#13.1 Hub UI — user-facing working surface|§13.1]] public-surface stripping; [[CUSTOMIZATION|building-on-sunrise]] §2/§6/§10.)

- **t** — Initial fork setup (repo `human-centric-engineering/hce-hub` already created): `package.json` (name/version/author/repo); `NEXT_PUBLIC_APP_NAME="HCE Hub"` + `NEXT_PUBLIC_LEGAL_NAME`; `.context/app/` docs namespace + README; document the fork↔Sunrise upstream-merge procedure (`.context/app/upstream.md`). **PRs target the fork explicitly** — `gh pr create --repo human-centric-engineering/hce-hub …` (bare `gh` targets the Sunrise upstream).
- **t** — Auth-only app: strip marketing/legal public pages ([[CUSTOMIZATION|building-on-sunrise]] §6 "auth-only") — delete unused `app/(public)/*` folders, repoint cookie-banner/error legal links, redirect `/` → the Hub home (or move it protected); remove the embed widget / public chat surfaces the Hub doesn't use.
- **t** — Brand mark: `components/brand/brand-mark.tsx` → the HCE "H" mark; `lib/app/public-nav.ts` cleared/curated for an internal app.
- **t** — Boot + boundary hygiene: `lib/app/bootstrap.ts` (`initApp`) scaffold wired; `lib/app/env.ts` for any Hub env vars; confirm the `lib/app/**` ESLint boundary + `app:ci-checks` green; smoke that the fork builds/boots signed-in.

*Done when:* fork builds/boots as an auth-only app; a signed-out visitor is bounced to login from every route; brand reads "HCE Hub"; gates green (`/pre-pr`, `/security-review`, `/code-review`).

### 02 · `f-theme` — HCE Hub base theme
*Owner:* Simon · *Status:* **shipped** · *Depends on:* f-fork · *shipped as 1 PR (#28) — sized down from the plan's 3 (HB3)* · *Detailed plan:* [[f-theme]]

The base HCE Hub theme replacing default Sunrise styling across public/auth/protected pages — the warm, low-chroma token layer from the [[design_handoff_hce_hub/README|design handoff]]. (Cross-ref: design handoff "Design system / tokens"; [[v1-requirements#13.5 Tone, feel, and anti-patterns|§13.5]].)

- **t** — **Reconcile the theme seam** (watch-item A): decide sync-safe placement — redefine `app/globals.css` `@theme`/`.dark` tokens in place ("keep-mine") vs. a fork-owned CSS layer imported after. Then land the light ("warm") token set (`--bg`, `--ink`, clay `--accent`, muted semantic status colours) mapped onto Sunrise's shadcn tokens.
- **t** — Dark ("dim") theme (`.theme-dim`, warm-dark not blue-black) + fonts: Inter Tight (400/450/500/600) + JetBrains Mono via Sunrise's font pipeline; the mono/sans metadata-vs-content pairing; radius/shadow/motion tokens (border-not-shadow separation, no celebratory motion — §13.5).
- **t** — Apply the theme to the auth pages + protected chrome + shared shadcn primitives (Button/Badge/Avatar/Sheet/Tabs/Select/Switch/Tooltip) so the Hub reads as a *sibling* to Sunrise admin (§13.5); status-pill + help-wanted + collision visual language as reusable tokens.
- **t** — **HCE "H" brand-mark** (`components/brand/brand-mark.tsx`), **deferred here from `f-fork`**: the design handoff's 26px ink square with "H" — a themed element that needs this feature's `--ink`/radius tokens, so it lands with the theme rather than as a pre-theme placeholder. Keep `BRAND.name` as the `alt`/`aria-label`. (Header already reads "HCE Hub" as text from `f-fork`; this is the visual upgrade.)

*Done when:* public/auth/protected pages render in the HCE Hub theme (warm + dim); fonts load; shadcn primitives restyled to the token set; the "H" brand-mark renders in the header/footer; gates green. *Note:* this ships the theme *foundation*; per-screen styling lands with each UI feature. *Shipped (2026-07-14, PR #28):* the whole token layer landed in **one PR** through the fork-owned `app/brand-theme.css` + `data-surface` seam — **watch-item A closed with ZERO `globals.css`/platform edit** (the plan's "keep-mine" hypothesis in t-1 above was superseded by the purpose-built seam Sunrise shipped as #355; [[f-theme]] recon). Self-hosted Inter Tight (variable) + JetBrains Mono (CSP `font-src 'self'` blocks Google Fonts). One HB2 platform touch (the brand-mark default test) → [[platform-divergences]] row 10. Consumer-surface only; `/admin` stays Sunrise-default (§13.5). **Unblocks `f-shell`** (its other dep `f-access` is shipped → fully unblocked). Browser validation surfaced a pre-existing Sunrise brand bug (hardcoded "Sunrise" tab titles) — fixed fork-side (PR #29, [[platform-divergences]] row 11) + filed [sunrise#432](https://github.com/human-centric-engineering/sunrise/issues/432).

### 03 · `f-data-model` — Prisma models + scaffolding
*Owner:* Simon · *Status:* **shipped** · *Depends on:* f-fork · *shipped as 3 PRs (#13, #16, #17) — should have been ~1 (HB3)* · *Detailed plan:* [[f-data-model]]

The Hub data model in `prisma/schema/app.prisma`, plus the additive futures scaffolding. (Cross-ref: [[v1-requirements#10. Initial data model sketch|§10]]; [[CUSTOMIZATION|building-on-sunrise]] §5 satellite-FK pattern.)

- **t** — Core coordination models: `Project` (with `knowledgeTagId` + `sidekickAgentId` per the reconciliation finding, **not** `knowledgeCategoryId`), `ProjectMember`, `Feature`, `FeatureDependency`.
- **t** — `Task`, `TaskDependency`, `TaskClaim`; task status enum (`backlog/available/claimed/in-pr/merged` — the *data* enum; the board computes *effective* status, and the plan board's own task status is the separate promotion vocabulary).
- **t** — User linkage: satellite/plain-`String` FKs to `User.id` (`leadUserId`, `ownerUserId`, `claimedByUserId`, `declaredByUserId`) — hand-written migration FKs with explicit `ON DELETE`, referencing the `@@map` table name; register **drift probes** (`lib/app/db-drift.ts`) + **erasure hooks** (`lib/privacy/erasure-hooks.ts`); apply via `db:migrate:deploy`.
- **t** — Futures scaffolding (additive, unconsumed in v1): `Sprint`, `FocusDirective` ([[futures#Dynamic focus and prioritisation|dynamic focus]]).
- **t** — Futures scaffolding: `Phase` + nullable `Feature.phaseId` ([[futures#Coarse work grouping — Phases / Epics|coarse grouping]]). No UI/capability consumes these in v1 — schema-only, so v1.x lands without a migration.

*Done when:* migrations apply clean on a fresh DB; drift-check green; a user erasure via `eraseUser()` cascades/nulls Hub rows correctly; gates green. *Shipped (2026-07-13):* Project (#13), Task (#16), futures (#17) domains; **no erasure hooks** — the hand-FK `ON DELETE` (fired by `eraseUser()`'s `tx.user.delete()`) is the GDPR mechanism, proven by `app:smoke:erasure`; the indicative 5-bullet sketch above was built as 3 PRs and should have been ~1 ([[f-data-model]] decisions log; [[planning-retro]] HB3).

### 04 · `f-access` — project-membership access control
*Owner:* Simon · *Status:* **shipped** · *Depends on:* f-data-model · *shipped as 1 PR (#20) — HB3, sized down from indicative 3* · *Detailed plan:* [[f-access]]

Per-project visibility and contribution rights: a user only sees/acts on projects they're a member of. (Cross-ref: [[v1-requirements#3. Human-centric principles (binding)|§3]], [[v1-requirements#14. Open implementation questions for the Sunrise-side conversation|§14 Q3]]; [[CUSTOMIZATION|building-on-sunrise]] §4 protected-routes, §6 self-guard.)

- **t** — Register `/projects`, `/brief` in `lib/app/protected-routes.ts` (edge redirect-to-login); protected-side `getServerSession()` self-guards on Hub pages (defence in depth).
- **t** — The membership predicate: a single `canAccessProject(user, projectId, need)` helper (roles `lead`/`member`; `read-only` reserved) that every project-scoped read/write and `withAuth` route funnels through — cross-user access returns 404 (Sunrise's ownership-scoping convention), never 403. **Shape it as one predicate** so v1.x role expansion is additive.
- **t** — Membership-scoped query helpers (list only member projects; filter features/tasks by membership) reused by every surface + capability; a test matrix over member/non-member/lead.

*Done when:* a non-member gets 404 on a project's pages, API, and capabilities; a member sees only their projects; gates green.

### 05 · `f-project-admin` — project + member CRUD
*Owner:* Simon · *Status:* **in flight** · *Depends on:* f-access · *~2 PRs (sized down from 4 — HB3 endpoint↔UI split)* · *Detailed plan:* [[f-project-admin]]

Project administration inside the existing Sunrise admin shell ([[v1-requirements#13.2 Hub admin pages — inside the existing Sunrise admin shell|§13.2]]) — create projects, manage members/roles, configure host platform, set up the project's knowledge tag + sidekick. This is what gives every downstream surface real projects to render.

- **t** — Admin nav + project list/create/edit pages via `lib/app/admin-nav.ts` (`registerNavSection`); project fields incl. `hostPlatform` (support `sunrise`; **stub** other platforms as a descriptor + knowledge-tag extension point per [[v1-requirements#7. Multi-platform support|§7]]).
- **t** — Member management: add/remove members, set role (`lead`/`member`); repo URL(s), lifecycle `status`.
- **[carried-in — `f-access`]** **Enforce the lead-has-member-row invariant at project creation.** `f-access`'s `canAccessProject` decides membership from the `ProjectMember` table alone (`Project.leadUserId` is a denormalized pointer, *not* an access source). So creating a project must **also create a `role='lead'` `ProjectMember` row** for the lead in the same transaction — otherwise the lead can't access their own project. Applies equally to any flow that reassigns `leadUserId`. (Found building [[f-access]]; recorded in its decisions log.)
- **t** — Project knowledge setup: create/attach the project's `KnowledgeTag`; wire the project KB ingestion path (accepts MD/PDF/DOCX/TXT/CSV — [[futures#v1 architectural footprint|use it well]], no new capability).
- **t** — Surface existing Sunrise agent-config + cost dashboards filtered to Hub agents (mostly existing admin — thin). *Split note ([[feature-plan-authoring-guide]] §2):* the sidekick-agent-seed-on-project-create belongs to `f-sidekick`; this feature exposes the hook, `f-sidekick` fills it.

*Done when:* an admin can create a project, add members, set host platform, and attach a knowledge tag; the project appears for members only; gates green.

### 06 · `f-shell` — module-composable app shell
*Owner:* Simon · *Status:* **shipped** · *Depends on:* f-theme, f-access · *shipped as 2 PRs (#32 skeleton, #33 navigation) — sized down from the plan's 5 (HB3 integration-checkpoint split)* · *Detailed plan:* [[f-shell]]

The biggest greenfield piece: the Hub's three-column shell and module-composable navigation, rooted at the deployment root (subdomain does the namespacing — no `/hub/` prefix). (Cross-ref: [[v1-requirements#13.1 Hub UI — user-facing working surface|§13.1]], [[v1-requirements#14. Open implementation questions for the Sunrise-side conversation|§14 Q2]]; design handoff "Shell / layout".)

- **t** — **Reconcile the routing pattern** (§14 Q2): choose the cleanest module-composable App-Router shape (route group + nested layouts vs parallel/slot layouts) so Module 2 is a *mount addition*, not a layout refactor. Land the root route group + protected layout.
- **t** — Three-column grid (`240px sidebar | 1fr main | 380px sidekick`); the sidekick column collapses to two columns when hidden; sticky sidebar/sidekick.
- **t** — Sidebar: brand block; **Hub** section (Home, Morning brief); **Modules** section (Projects active; Sales/Support/Knowledge visibly *stubbed* — the module registry expressing §2/§15 composability); project-contextual section (Board, Intake, Activity, Knowledge base) + member avatars; footer (user + Admin link).
- **t** — Topbar: clickable breadcrumbs (Hub / Projects / {project} / {sub}); a **⌘K** command-palette trigger (control now; palette wiring can be a follow-up); notification bell (no red badge — §13.5); sidekick toggle.
- **t** — The **module registry** primitive: a typed registration so nav + routing accept new modules without editing the shell; Hub Home (`/`) as a cross-module summary entry point. *Split candidate:* the module-registry primitive vs. the concrete Projects nav entry may split.

*Done when:* the shell renders with Projects live and other modules visibly stubbed; sidekick column toggles; breadcrumbs + ⌘K trigger present; adding a second module needs no shell refactor (demonstrated with a throwaway stub in tests); gates green. *Shipped (2026-07-15, PRs #32 + #33):* the `(hub)` route group + 3-col shell (route-group + nested layouts; sidekick persists in the layout), the fork-owned module registry (`lib/app/hub-modules.ts`), route-derived breadcrumbs, and Hub Home — reclaiming `/` (removed f-fork's shim; group-level in-layout auth guard; post-login lands on `/`). Account pages stay in `(protected)` with the **composable-shell guardrail** so a future uniform shell is a re-parent, not a rewrite. Three keep-mine platform touches ([[platform-divergences]] rows 3/12/13); two incidental upstream issues from the error-boundary review ([sunrise#433](https://github.com/human-centric-engineering/sunrise/issues/433)/[#434](https://github.com/human-centric-engineering/sunrise/issues/434)). **Unblocks `f-projects` §08 — which also needs `f-project-admin` §05, so §05 is next (owner's 06→05→08 order).**

### 07 · `f-hub-capabilities` — Hub tools + MCP exposure
*Owner:* Simon · *Status:* **shipped** · *Depends on:* f-data-model, f-access · *shipped as 3 PRs (#23 read+pipeline · #24 writes · #25 claim+collision)* · *Detailed plan:* [[f-hub-capabilities]]*

The Hub's read/write operations as Sunrise capabilities — the shared engine the UI, the sidekick, and Claude Code (via MCP) all call. (Cross-ref: [[v1-requirements#11. Hub-specific capabilities (registered tools)|§11]], [[v1-requirements#5. The PR is the natural unit|§5]], [[v1-requirements#14. Open implementation questions for the Sunrise-side conversation|§14 Q4/Q6]]; `.context/orchestration/capabilities.md`, `mcp.md`.)

- **t** — Read capabilities: `next-task` (highest-priority *unblocked* task in caller's owned features, or `help-wanted` on request — skips anything blocked by an unmerged PR, [[v1-requirements#5. The PR is the natural unit|§5]]); `get`-shaped reads. Each `BaseCapability` + Zod, membership-scoped via `f-access`.
- **t** — Write capabilities: `create-task` (promote a task — title/files/deps), `add-backlog`, `flag-help-wanted` — `human_approval` gate where the design requires (§3.6); audit via `AiAdminAuditLog`.
- **[acyclicity finding — RE-HOMED to `f-intake` §13 + `f-sidekick` §12 (B26).]** The dependency-cycle guard was planned to live in `create_task` here, but building t-2 showed **`create_task` structurally cannot create a cycle** — a brand-new task only gains *outgoing* edges to existing tasks, so nothing points back at it and no loop can close ([[planning-retro]] HB4 / B26). The guard's real home is the first flow that connects two *existing* items — `f-intake`'s `persist_features` and `f-sidekick`'s `propose_dependencies` — where it's now carried. `create_task` validates its deps exist + are in-scope (integrity), which is all it can meaningfully do.
- **t** — `claim-task`: mark claimed, register files-in-flight, return **soft** collision warnings from `TaskClaim` overlap ("John touched `/api/auth` 2h ago — still claim?") — never a hard lock ([[v1-requirements#5. The PR is the natural unit|§5]]).
- **t** — Register all via `lib/app/capabilities.ts` (`initAppCapabilities`); bind to the per-project sidekick agent's tool set so they're **auto-exposed over the existing Sunrise MCP server** (no separate server — §14 Q4).
- **t** — MCP dev access: provision per-developer `AiApiKey`s scoped to the Hub capabilities (§14 Q6); a `.context/app/mcp-claude-code.md` connection guide. *Split note:* the "Open in Claude Code" deep-link lives in `f-task-sheet`.

*Done when:* each capability works membership-scoped with soft-collision behaviour; callable from Claude Code via MCP with a scoped key; writes audit-logged; gates green. *Watch ([[feature-plan-authoring-guide]] §6):* `next-task`/collision logic is algorithm-dense — budget a `/code-review` fix commit.

### 08 · `f-projects` — projects list + project view scaffold
*Owner:* TBD · *Depends on:* f-shell, f-project-admin · *~3 PRs*

The user-facing project index and the project-view container the Plan/Board mount into. (Cross-ref: [[v1-requirements#13.1 Hub UI — user-facing working surface|§13.1]]; design handoff "1. Hub home / Projects".)

- **t** — Projects list: membership-scoped card grid (name, platform tag, lead avatar, description, event-count, sparkline, member stack) + a dashed "New project" affordance linking to admin create; the "Recent activity" table (sidekick-authored rows marked).
- **t** — Project-view container + Plan⇄Board **Tabs** control (view is part of the route so it's linkable); the contextual sidebar section activates.
- **t** — Data plumbing: membership-scoped project/feature/task loaders (RSC + server data) reused by Plan/Board/sheet; empty/loading states.
- **[owner intent — sample data]** Seed the **Hub's own v1 build plan as sample data** — a `prisma/seeds/app/` unit that materialises *this plan's* features/tasks/dependencies into `app_project`/`app_feature`/`app_task` rows (membership = the builders) — so the Plan/Board views render something real and drivable from day one (owner: "build the boards with this very plan as the sample data"). Dev-only/idempotent; the natural anchor for exercising the UI spine end-to-end. (Decided 2026-07-14; see Decisions log build-order entry.)

*Done when:* a member sees only their projects; opening one lands on the (default) Plan tab within the shell; gates green.

### 09 · `f-plan-view` — feature-level Plan view
*Owner:* TBD · *Depends on:* f-projects, f-hub-capabilities · *~4 PRs*

The primary planning surface: features in optimal working order, a *recommendation* never enforced (§3.5/§3.6). (Cross-ref: design handoff "2. Project — Plan view".)

- **t** — `planOrder()` topological sort (status band `shipped→in-flight→planning→blocked`, then dependency depth); the summary line (counts as toned pills + the "sorted by…" hint).
- **t** — Feature row: ordinal + mono ID + title + help-wanted pill; description; dependency chips + blocked reason; owner avatar; status pill with progress bar stacked underneath; chevron.
- **t** — Expand/collapse → inset task table (id/task/claimed-by/pr/status), one row per task, hover-highlight, opens the task sheet; shipped features recede at reduced opacity.
- **t** — Wire ordering + progress off real data/capabilities; the ordering is advisory (never blocks working out of order — §3.5).

*Done when:* the Plan view renders real features in topological order with expandable tasks; ordering is visibly advisory; gates green.

### 10 · `f-board-view` — Board (Kanban)
*Owner:* TBD · *Depends on:* f-projects, f-hub-capabilities · *~4 PRs*

What's in flight now, by person — with soft, ambient collision treatment. (Cross-ref: design handoff "3. Project — Board view"; [[v1-requirements#5. The PR is the natural unit|§5]], [[v1-requirements#13.5 Tone, feel, and anti-patterns|§13.5]].)

- **t** — Grid + sticky header; columns `Owner | Available | Claimed | In PR | Merged | Backlog` (equal widths); count chips + subtitles.
- **t** — `effectiveStatus()` column routing: an `available` task with unmerged deps routes to **Backlog** (Available = genuinely pullable); unclaimed tasks route into their **feature owner's** lane (ownership stays visible; anyone can still claim — pull-not-push).
- **[carried-in — `f-data-model` t-2 `/code-review`]** **`effectiveStatus()` must treat a `claimed` task whose `claimedByUserId` is NULL as not-actually-claimed** (route it back to Available/owner lane, not the Claimed column). After a user erasure the DB leaves `status='claimed'` with `claimedByUserId=NULL` (SET NULL retains the task, drops the claimant) — the stored enum lags reality, so effective-status must reconcile the two or an orphaned task sticks in Claimed and is never re-pullable. (Found building [[f-data-model]] t-2; recorded in its decisions log.)
- **[carried-in — `f-data-model` t-3 `/code-review`]** **Render every nullable Hub→`user` reference gracefully — never deref it.** `leadUserId`, `ownerUserId`, `claimedByUserId`, `declaredByUserId` are all nullable *from creation* **and** go NULL on erasure (SET NULL). Board lanes, owner avatars, claimer meta, and any directive surface must show a null ref as "unassigned / former member" — a `user.name` on a null ref NPEs a whole view. Applies to every read surface (`f-plan-view`, `f-board-view`, `f-task-sheet`, `f-morning-brief`), not just the Board. (Found building [[f-data-model]] t-3; recorded in its decisions log.)
- **t** — Swim lanes by person (avatar + role + owned-feature chips); task card (title, mono ref, claimer/collision/PR meta; `is-mine` clay left border; filenames *off* the card).
- **t** — Soft collision treatment: subtle marker + slow pulse from `TaskClaim` overlap; help-wanted features flagged — never a hard lock/alarm (§5, §13.5).

*Done when:* the Board renders lanes with correct effective-status routing and ambient collisions; claim is a pull action from any lane; gates green.

### 11 · `f-task-sheet` — task detail side sheet
*Owner:* TBD · *Depends on:* f-plan-view, f-hub-capabilities · *~4 PRs*

Full task detail without losing context — a deep-linkable side sheet that repositions beside the sidekick. (Cross-ref: design handoff "7. Task detail sheet".)

- **t** — Side-sheet + URL deep-link (parallel/intercepting route or `?task=` — shareable, survives refresh); slide-in over scrim; Esc/scrim close; copy-link. *Split candidate ([[feature-plan-authoring-guide]] §2):* the URL/route mechanism vs. the panel content may split.
- **t** — Layout: header (task ID + feature ref), status/claimer/PR, description, files-in-scope ("declared, not enforced" — soft, §5), two-column dependency graph (blocked-by/blocks, click-to-jump), activity timeline, sidekick-notes block.
- **t** — Action row wired to `f-hub-capabilities`: Claim (disabled + "Blocked by deps" when deps unmet), Open PR, **Open in Claude Code** (MCP deep-link), Ask sidekick.
- **t** — **Reposition beside the sidekick** (`right: 392px` when the sidekick is open) so a task and the sidekick are readable together (a specific design requirement); narrow-viewport handling; opens from Plan/Board/brief/sidekick.

*Done when:* the sheet opens from all four surfaces, deep-links, and anchors left of the open sidekick; Claim/actions work; gates green. *Watch ([[feature-plan-authoring-guide]] §6/B29):* client↔server state coordination — budget a `/code-review` fix commit.

### 12 · `f-sidekick` — per-project sidekick agent + chat panel
*Owner:* TBD · *Depends on:* f-hub-capabilities, f-shell · *~5 PRs*

The design centre: a per-project conversational sidekick, present on every project surface, same agent exposed via MCP. **One agent per project** (decided 2026-07-10). (Cross-ref: [[v1-requirements#6. The sidekick agent|§6]], [[v1-requirements#14. Open implementation questions for the Sunrise-side conversation|§14 Q5]]; `.context/orchestration/chat.md`, `knowledge.md`.)

- **t** — Per-project agent provisioning: seed a restricted sidekick `AiAgent` (the `isSystem:false` scaffold) when a project is created (fills the `f-project-admin` hook); store `Project.sidekickAgentId`; system instructions framing it as an HCE co-development planning partner.
- **t** — Project-scoped RAG: `registerAgentAccessContributor` (`lib/app/knowledge-access-contributors.ts`) unions the project's `KnowledgeTag` docs into that agent's searchable set; `invalidateAgentAccess` on membership/KB change. **Confirm per-project composition** (watch-item B).
- **t** — Per-turn project context: `registerContextContributor` (`lib/app/context-contributors.ts`) injects the project's live state (features/tasks/who's-in-flight) as a `LOCKED CONTEXT` block each turn. *Split candidate:* RAG scoping (t-2) and per-turn context (t-3) are separable seams.
- **t** — Chat panel UI (persistent 380px column): message stream, plain/list/proposal/task-context bubbles; **proposal cards render the `human_approval` gate inline** (Approve / Not now — §3.6); suggestion chips; "also available via MCP" note.
- **t** — Sidekick capabilities: `propose-dependencies` and `impact-of-change` ([[v1-requirements#11. Hub-specific capabilities (registered tools)|§11]]) as gated capabilities; `ask-sidekick` exposed via MCP so Claude Code can ask without leaving the dev session.
- **[carried-in — acyclicity guard, re-homed from `f-hub-capabilities` §07 (B26)]** `propose-dependencies` adds edges **between existing** features/tasks, so — unlike `create_task` — it genuinely **can** form a self-loop or multi-node cycle, which breaks topological `planOrder()`/`next-task` ordering. It must run a **cycle-rejecting validator** on the proposed edge set. Build the pure, reusable `assertAcyclic(edges)` (`lib/projects/dependency-graph.ts`) here **or** in `f-intake` `persist-features` (§13) — whichever lands first builds it; the other reuses it. (Originated [[f-data-model]] t-1 `/code-review`; belongs here per the B26 finding in [[f-hub-capabilities]].)
- **[carried-in — `f-hub-capabilities`]** **This feature builds the Hub's *first* agent propose → human-approve → commit flow — the reusable pattern, not a one-off.** Per the [[plan#Decisions log|decisions log]] (approval is an *agent-flow* concern), `f-hub-capabilities` shipped the write tools (`create-task`, `claim-task`, …) **deliberately ungated** — a human calling them directly is the actor and needs no gate. The §3.6 gate exists only when an **agent** initiates the change, so **the sidekick owns creating the Hub's first instance of it**: a **chat-native** approval flow that pauses on a proposal card, renders Approve / Not-now, and on approve invokes the (ungated) write capability — **mirror Sunrise's `approval-actions.ts` + `human_approval` executor** (`lib/orchestration/engine/executors/human-approval.ts`), since capability-level `requiresApproval` is a hard refuse-stop, not a resumable deferral. *(Note the surfaces differ per agent: the sidekick's is chat-proposal; `f-intake`'s is a **workflow** `human_approval` DAG step → `persist-features` — Sunrise-native, already planned in §13. Same agent-flow **principle**, different UX surface — factor out shared approve/commit logic only where it genuinely repeats, don't force one primitive.)* (Decided building [[f-hub-capabilities]]; recorded in its decisions log.)

*Done when:* each project has its own sidekick answering with project-only knowledge; proposals route through Approve/Not-now; reachable via MCP; gates green. *Watch:* the per-project-agent decision means budget/config multiplies per project — surface it in the feature plan.

### 13 · `f-intake` — intake workflow + UI
*Owner:* TBD · *Depends on:* f-sidekick, f-projects · *~5 PRs*

Requirements doc → AI-proposed feature list with dependency suggestions → human approval gate → persisted features. (Cross-ref: [[v1-requirements#4. Three layers of work|§4]], [[v1-requirements#12. Workflows|§12]]; design handoff "4. Intake".) *Split candidate ([[feature-plan-authoring-guide]] §2):* the workflow (backend) and the two-pane UI are the classic API↔UI split — promote as separate task groups.

- **t** — Intake workflow (DAG): `parse` requirements → `rag_retrieve` over the project's host-platform docs → `agent_call` drafting a build-shaped feature list with proposed dependencies + confidence → `human_approval` → persist via a Hub capability. Host-platform-aware planning context (Sunrise proper; other platforms stubbed — §7).
- **t** — Persist path: a `persist-features` capability the workflow calls on approval (creates `Feature` + `FeatureDependency` rows, membership-checked); v1 **appends** — no re-intake ([[v1-requirements#8. v1 scope|§8]]).
- **[carried-in — acyclicity guard, re-homed from `f-hub-capabilities` §07 (B26)]** `persist-features` creates a **batch of features + `FeatureDependency` edges among them** in one shot, so it genuinely **can** introduce a self-loop or multi-node cycle (which breaks topological ordering). It must validate the batch is acyclic before persisting — the pure `assertAcyclic(edges)` (`lib/projects/dependency-graph.ts`), shared with `f-sidekick`'s `propose-dependencies` (§12); whichever lands first builds it, the other reuses it. (Originated [[f-data-model]] t-1 `/code-review`; belongs here per the B26 finding in [[f-hub-capabilities]].)
- **t** — Intake UI (two-pane): left = requirements source (paste/upload); right = proposed feature cards (ID, title, confidence tag, rationale, dependency chips, per-card Approve/Edit); progress + Re-run + "Approve N".
- **t** — The approval gate as a *conversation*: the sidekick can raise a clarifying question before approval (the dashed "One question before you approve…" pattern) — the `human_approval` gate is inspectable, not just a button (§3.6).

*Done when:* pasting a requirements doc produces an editable, dependency-annotated feature list that persists on approval and appears in the Plan view; gates green.

### 14 · `f-github-sync` — GitHub PR integration + reconcile
*Owner:* TBD · *Depends on:* f-hub-capabilities · *~4 PRs*

Connect task state to GitHub PR merges. (Cross-ref: [[v1-requirements#8. v1 scope|§8]], [[v1-requirements#12. Workflows|§12]], [[v1-requirements#14. Open implementation questions for the Sunrise-side conversation|§14 Q8]]; `.context/orchestration/inbound-triggers.md`, `external-calls.md`, `recipes/`.)

- **t** — GitHub read via `call_external_api`: per-agent `customConfig` (allowlisted host, `${env:GITHUB_TOKEN}`), following the recipes cookbook; PR-URL declared by human in v1 (auto-detection deferred — §8).
- **t** — Inbound PR-merge trigger: a webhook subscription (HMAC-verified — §14 Q8) → a reconcile workflow, per `inbound-triggers.md`.
- **t** — "PR merged → reconcile" workflow: locate task by PR URL → mark merged → check downstream `TaskDependency` → notify dependent owners ("you're up next") via `send_notification`/hooks.
- **t** — Reconcile correctness: idempotent on re-delivery; unknown-PR and already-merged handled; a smoke over a real webhook payload. *Watch ([[feature-plan-authoring-guide]] §6):* dedupe/idempotency is where review pays off.

*Done when:* merging a linked PR flips the task to merged and unblocks/notifies dependents; re-delivery is idempotent; gates green.

### 15 · `f-morning-brief` — scheduled per-user brief
*Owner:* TBD · *Depends on:* f-hub-capabilities, f-shell · *~4 PRs*

The tone litmus test: a daily per-person brief that reads like a thoughtful colleague's note. (Cross-ref: [[v1-requirements#12. Workflows|§12]], [[v1-requirements#13.5 Tone, feel, and anti-patterns|§13.5]]; design handoff "5. Morning brief"; `.context/orchestration/scheduling.md`.)

- **t** — Brief-generation workflow (per-user, scheduled via `AiWorkflowSchedule` cron): gather assigned features, available pulls, things blocked on the user, overnight changes (membership-scoped, reusing `f-hub-capabilities` reads).
- **t** — Delivery: `send_notification` email **and** the `/brief` Hub view — both surfaces render the same brief ([[v1-requirements#13.1 Hub UI — user-facing working surface|§13.1]]).
- **t** — `/brief` view UI (single centred column): prose-first sections (Overnight, What you might pull, Soft collisions, Across the studio), a quiet "plan the day?" sidekick affordance — **no counts-as-pressure, no overdue, no streaks** (§13.5).
- **t** — Tone pass + per-user opt-in/frequency settings; the brief must pass the §13.5 anti-pattern checklist. *Split candidate:* the workflow (t-1/t-2) vs. the view (t-3) is an API↔UI split.

*Done when:* a scheduled brief is generated per member, delivered by email and at `/brief`, and reads as a colleague's note (passes the §13.5 checklist); gates green.

---

## Parked phases (future epics)

Carried per the Hub's `parked` status — kept out of the active view, not lost. The v1 schema already scaffolds several ([[v1-requirements#10. Initial data model sketch|§10]]).

- **Dynamic focus & prioritisation** — sprint-aligned + conversational priority directives, hold states, focus-aware briefs. Enabling schema (`Sprint`, `FocusDirective`) ships in `f-data-model`; consumers are v1.x. ([[futures#Dynamic focus and prioritisation|futures]])
- **Coarse work grouping (Phase UI)** — phase view, `assign-feature-to-phase`, phase-aware `next-task`, parked-phase suppression. Schema (`Phase` + `Feature.phaseId`) ships in `f-data-model`. ([[futures#Coarse work grouping — Phases / Epics|futures]])
- **Bidirectional Sunrise flows** — cross-fork problem propagation, OSS issue triage, upstream→fork improvement propagation, cross-project pattern recognition. The highest-compound area. ([[futures#Sunrise as a Hub project — bidirectional flow|futures]])
- **Knowledge as living substrate** — living decision log, architecture drift detection, stale-decision surfacing. `[architectural]` note: the project KB ingestion path (`f-project-admin`) should not preclude decision-as-document ingestion. ([[futures#Knowledge as living substrate|futures]])
- **Rich project context** — stakeholder/contacts/brief/scope/comms; mostly net-new tables linking to `Project`, additive. ([[futures#Rich project context|futures]])
- **Future modules** — Sales, Support, Marketing, Finance, Knowledge; **hub-wide sidekick**; non-Sunrise host platforms; Slack embed; spec-authoring-from-scratch; re-intake. Each additive on the module-composable shell + per-project-agent architecture. ([[v1-requirements#15. Out of scope for v1, but design accordingly|§15]])

---

## Open decisions & flags

- **Sidekick topology — RESOLVED (2026-07-10): one agent per project.** Per-project restricted knowledge is Sunrise's per-agent seam shape; a hub-wide sidekick is an additive later variant. Cost/ops implication (per-agent budgets multiply per project) — surface in `f-sidekick`'s plan.
- **§14 open questions — resolved by grounding:** Q1 satellite-FK to `User.id`; Q2 route-group + auth-only pattern (exact shape decided in `f-shell`); Q3 `withAuth` + protected-routes seam + membership predicate; Q4 register into existing MCP server; Q5 per-project tag + per-project agent (no category model); Q6 per-developer `AiApiKey`s; Q7 brief = email + `/brief` view; Q8 inbound-triggers HMAC.
- **Deferred to feature-build (watch-items):** theme sync-seam (`f-theme`); per-project agent provisioning composition (`f-sidekick`).
- **Assumptions to confirm with the owner:** whether project/member admin stays in the Sunrise admin shell (per §13.2 — assumed yes) or graduates to a first-class Hub surface later. *(Fork repo confirmed: `human-centric-engineering/hce-hub`.)*

---

## How features and tasks work

Follows the [[plan-authoring-guide]] (overall) and [[feature-plan-authoring-guide]] (per-feature). In brief:

- **Status vocabulary.** Features: `not started | in flight | blocked | shipped`. Tasks (promoted): `backlog | available | claimed → done` — **no in-PR state**; flip to `done` on merge.
- **Task = one PR, sized by separability of *value* — not line count.** A task earns its own PR only if splitting adds a different review surface, a parallelism opportunity, or an integration checkpoint. Homogeneous/sequential/same-file work that's unconsumed until the set is complete (a multi-model schema) is **one PR even when large** — default to **fewer, cohesive** PRs (line count is a weak signal; [[planning-retro]] HB3). The `t` bullets above are **indicative** — reshaped on promotion.
- **Definition of done includes the gates** run in order: **commit → `/pre-pr` → `/security-review` → push → open PR → `/code-review`** — the first three *before* the PR opens.
- **Exactly two feature-level docs PRs — claim and close-out.** **Claim-first docs PR** (Owner + `in flight` + `<feature>.md`, before task work) and **feature close-out docs PR** are the coordination signals that stop two builders (Simon + John) colliding on one feature. **Task PRs are pure code — no per-task close-out/docs PR** ([[planning-retro]] A7); once a feature is claimed, one dev owns every task in it.
- **Close-out batches all board bookkeeping** — every `t-N` row → `done`, the work-completed entry, decisions, and **cross-cutting deferrals get a live home** on this board (not buried in a shipped feature's doc) — in the one close-out PR.
- Every task inherits the repo rules ([[CUSTOMIZATION|building-on-sunrise]] + Sunrise `CLAUDE.md`): `@/` alias, Zod-validate external input, satellite tables (never edit `User`), drift-probe hand-FKs, `lib/app/**` boundary, `app:*` script namespace.

---

## Decisions log

Append-only, newest first.

- **2026-07-15 — Routing architecture for the whole UI spine settled in `f-shell`: route group + nested layouts; `(hub)` group; account pages stay in `(protected)` (all owner-confirmed).** `app/(hub)/layout.tsx` is the 3-col shell; the sidekick persists in the layout (layouts don't remount); modules are route subtrees + a `lib/app/hub-modules.ts` registry entry → Module 2 is a mount-addition (§14 Q2). The **composable-shell guardrail** (layout assumes no project context; nav + breadcrumbs registry/route-driven) makes a future *uniform* shell a mechanical re-parent — `(i)` is a structural subset of `(ii)`. `/` reclaimed via a group-level in-layout `getServerSession` guard (a proxy `/`-prefix would match everything); post-login lands on `/`. Every downstream UI feature (`f-projects`, boards, sheet, sidekick, brief) mounts into this.
- **2026-07-15 — Fork-mirrored platform bug → raise bug + seam-proposal upstream, fix the fork's own instance, defer the platform keep-mine (owner's standard process, applied).** `f-shell`'s new `(hub)/error.tsx` mirrored the platform route-group error boundaries and inherited their session-expiry double-fire bug. Per the owner's process (fix-in-fork + raise-issue for genuine bugs, but confirm genuine before editing core files): confirmed genuine, filed [sunrise#433](https://github.com/human-centric-engineering/sunrise/issues/433) (bug) + [#434](https://github.com/human-centric-engineering/sunrise/issues/434) (a shared `<RouteErrorBoundary>` seam proposal — we're the first fork to add a route group), corrected the fork's own `(hub)/error.tsx`, and **deliberately did NOT keep-mine the 3 platform boundaries** (minor + #434's seam may replace them → left for the upstream fix). **Lesson → [[planning-retro]] HB7.**
- **2026-07-14 — Watch-item A ("theme sync-safety") CLOSED with zero platform edit — the dedicated `data-surface` seam superseded the plan's "keep-mine `globals.css`" hypothesis ([[f-theme]]).** The plan (§80/§85, and f-theme t-1's first bullet) hypothesised the theme would need a keep-mine edit to platform `app/globals.css`. Reconciliation found Sunrise ships a purpose-built, fork-owned theming seam — `app/brand-theme.css` (empty, imported after globals) + `lib/app/surface.ts` + the `data-surface` proxy/`<SurfaceSync>` plumbing (upstream #355) — so the **entire** theme landed there with `globals.css` untouched. **Lesson → [[planning-retro]] HB5:** a plan-time watch-item that hypothesises a platform edit should first be checked against the seam catalog — Sunrise may have shipped a seam (since the plan was written) that closes it cleanly. Consumer-surface-only was owner-confirmed; `/admin` stays Sunrise-default (§13.5).
- **2026-07-14 — Incidental platform bug found by browser-validating f-theme → fork fix + upstream issue, not folded into the feature.** Validating the f-theme render, the owner found `/settings` (and the admin KB) showed a hardcoded "Sunrise" in the browser tab — `SETTINGS_TAB_TITLES`/`KNOWLEDGE_TAB_TITLES` (and the `(public)` legal-page metadata) bypass the `BRAND` seam and `useUrlTabs` writes them over the correct metadata title. Fixed fork-side as a **separate** PR (#29, [[platform-divergences]] row 11), **not** bolted onto f-theme (#28), and filed [sunrise#432](https://github.com/human-centric-engineering/sunrise/issues/432) so all forks get it. **Lesson → [[planning-retro]] HB6:** green gates prove the code is correct, not that the surface reads right — a UI/branding feature's DoD includes browser-validating the live render, and incidental platform bugs found there get their own fix PR + upstream issue.
- **2026-07-14 — Build order: usable-first, AI-last (owner steer). Overrides the critical path's default "sidekick after capabilities".** Sequence: `f-hub-capabilities` (shipped) → **UI spine** (`f-shell` → `f-projects` → `f-plan-view`/`f-board-view`), **seeded with the Hub's own build plan as sample data** so the boards are real and drivable → **MCP + GitHub sync** (start using it from here) → **then the AI layer** (`f-sidekick`, `f-morning-brief`, `f-intake`). Rationale: ship a human-usable coordination tool first, layer the agentic/AI capabilities on a working base. So **next is the UI spine, not `f-sidekick`**. The critical-path spine (§Features) still describes dependencies; this decides *order* within what's unblocked.
- **2026-07-14 — Dependency-cycle acyclicity guard re-homed (B26 / [[planning-retro]] HB4).** Planned for `create_task` in `f-hub-capabilities` §07, but `create_task` **structurally can't create a cycle** (a new leaf task gains only outgoing edges). Per B26 (don't guard a failure mode the usage can't reach), the guard moved to the flows that connect two *existing* items: `f-intake` `persist-features` (§13) and `f-sidekick` `propose-dependencies` (§12), where the shared `assertAcyclic` validator is built. `create_task` keeps dep existence/scope validation only.
- **2026-07-13 — The `human_approval` gate is an *agent-flow* concern, not a per-action property (owner-confirmed, [[f-hub-capabilities]]).** §3.6 gates a *state change an **agent** initiates* — so the **same** write capability (`create-task`, `claim-task`, …) is **ungated** when a **human** calls it directly (UI, or a dev over MCP — the caller is the actor) and **gated** when an **agent** proposes it. The gate therefore lives with **whichever agent initiates the change** — the sidekick (`f-sidekick`) now, and the intake (`f-intake`), morning-brief (`f-morning-brief`), and future-module agents later (the Hub will run many agents). **Consequence for every agent-bearing feature:** the Hub *capabilities* (`f-hub-capabilities`) are plain, reusable, audited writes with **no** approval gate; each initiating **agent** wraps them in its own propose → human-approve → commit flow (mirroring Sunrise's workflow `human_approval` executor + `approval-actions.ts`). A capability's own `requiresApproval` flag (a hard refuse-and-stop, not resumable) is reserved only for a tool that must *never* run unattended.
- **2026-07-13 — Sizing + PR-flow conventions corrected (owner feedback, 2nd over-decomposition flag).** (1) The task size gate is **separability of value, not line count** — combine homogeneous/sequential/unconsumed-until-complete work into one PR even when large; the old "~200–600 lines / <150-line" heuristics were the wrong cut ([[planning-retro]] HB3; [[feature-plan-authoring-guide]] §2). (2) **Only feature-level docs PRs exist (claim + close-out)**; task PRs are pure code and their bookkeeping batches into the feature close-out — no per-task close-out PR ([[planning-retro]] A7; [[building-a-feature]] step 5 + §3).
- **2026-07-10 — Sidekick topology: one agent per project.** Sunrise's knowledge-access-contributor seam is keyed per agent (cached per agent); with no `AiKnowledgeCategory` primitive, per-project RAG isolation is cleanest as one restricted `AiAgent` per project, seeded on project creation and scoped to the project's `KnowledgeTag`. Hub-wide sidekick is an additive later variant.
- **2026-07-10 — No `AiKnowledgeCategory`; project RAG is tag-based.** Verified against Sunrise `main`. Replace §10's `Project.knowledgeCategoryId` with `Project.knowledgeTagId` + `Project.sidekickAgentId`; scope via `KnowledgeTag` + the `knowledge-access-contributors` seam.
- **2026-07-10 — Pure leaf fork; zero upstream gating.** The Hub builds entirely through existing fork-owned `lib/app/*` seams — no core→fork seam, no Sunrise PR blocks the fork (contrast Daybreak's `f-seams`). Two build-time watch-items (theme sync-seam, per-project agent provisioning) *could* surface a small upstream ask but are hypothesised not to gate.
- **2026-07-10 — Structured to the plan-authoring convention (v2).** One epic (`v1`); flat feature list; semantic slugs; PR-sized tasks; dependency-ordered; §10's futures entities scaffolded (unconsumed) in `f-data-model`; futures items carried as parked phases.

---

## Work completed to date

Append-only, newest first.

- **2026-07-15 — `f-shell` SHIPPED (PRs #32 skeleton + #33 navigation — the module-composable app shell).** The Hub's consumer-surface frame: a new `app/(hub)` route group (route group + nested layouts) rendering the design's 3-col shell (sidebar · main+topbar · sidekick), rooted at `/`. **#32** — the routing/auth/layout architecture: the group-level in-layout `getServerSession` guard (one guard for `/`, `/projects`, `/brief`; `/` can't be edge-protected via a `startsWith` prefix), the `/`-reclaim (removed f-fork's `(public)/page.tsx` shim), post-login landing → `/`, and Hub Home. **#33** — the composability + furniture: the fork-owned module registry `lib/app/hub-modules.ts` (Projects active + Sales/Support/Knowledge stubbed; a registered stub surfaces with no shell edit — the §14 Q2 mount-addition, proven by test), the registry-driven sidebar, route-derived breadcrumbs, ⌘K trigger/bell, and the sidekick column placeholder + 2⇄3-col toggle. Sidekick persists in the layout (layouts don't remount). **Composable-shell guardrail** (layout assumes no project context; nav/breadcrumbs route-driven) keeps a future uniform shell a re-parent, not a rewrite. **Sized to 2 PRs (HB3 integration-checkpoint split) — owner-confirmed.** Three keep-mine platform touches ([[platform-divergences]] rows 3/12/13, all `/`-reclaim + landing). Two `/code-review` findings fixed as transparent follow-ups: the `(hub)/error.tsx` session-expiry double-fire and the breadcrumb `Object.prototype`-key crash. **Incidental upstream issues** from the error-boundary review: [sunrise#433](https://github.com/human-centric-engineering/sunrise/issues/433) (bug) + [#434](https://github.com/human-centric-engineering/sunrise/issues/434) (shared error-boundary seam proposal) — fork corrected its own boundary, platform ones deferred (HB7). Owner browser-validated the render. **Unblocks `f-projects` §08 — which also needs `f-project-admin` §05, so §05 is next (owner's 06→05→08 order).**
- **2026-07-14 — `f-theme` SHIPPED (PR #28, one PR — the first UI-spine feature).** The HCE Hub base theme: the warm/dim token layer landed entirely in the fork-owned `app/brand-theme.css` (unlayered, `[data-surface='consumer']` + `.dark` compound) — (a) shadcn semantic tokens remapped so every primitive restyles by inheritance, (b) the Hub-native tokens (clay `--accent`, six `--signal-*`, ink/line shades, radii/shadow/motion, `--font-ui`/`--font-mono`). Self-hosted Inter Tight (variable — covers the design's 450) + JetBrains Mono via `@font-face` (CSP `font-src 'self'` blocks Google Fonts; `next/font` would touch a platform layout). The "H" brand-mark landed (deferred from f-fork). **`globals.css`/`surface.ts`/`layout.tsx` untouched — watch-item A closed with zero theme-side platform edit** (the `data-surface` seam, upstream #355). Consumer-surface only; `/admin` stays Sunrise-default (§13.5). One HB2 platform touch (brand-mark default test) → [[platform-divergences]] row 10. `/code-review` was clean (a token layer, not algorithm-dense). **Sized to 1 PR (HB3) — owner-confirmed.** **Unblocks `f-shell`** (its other dep `f-access` is already shipped → f-shell is now fully unblocked and is the next UI-spine feature). **Also (found browser-validating this feature):** a pre-existing Sunrise brand bug — hardcoded "Sunrise" in `*_TAB_TITLES` + the `(public)` legal pages, bypassing the `BRAND` seam — fixed fork-side in PR #29 ([[platform-divergences]] row 11) and filed upstream [sunrise#432](https://github.com/human-centric-engineering/sunrise/issues/432); see Decisions log + [[planning-retro]] HB6.
- **2026-07-13 — `f-access` SHIPPED (PR #20, single cohesive PR).** The project-membership authorization funnel: `lib/projects/access.ts` — `canAccessProject(userId, projectId, need) → { ok, basis: 'lead'|'member'|null }` mirroring `adminCanViewConversation` (a non-member is reported identically to a missing project → callers 404 both, never 403 → no enumeration), plus `requireProjectAccess`/`getAccessibleProject`/`listAccessibleProjects`/`accessibleProjectIds` (the scoping primitives every consumer must use). Registered `/projects` in the `appProtectedRoutes` edge seam. `access.ts` 100% covered; the access matrix explicitly asserts non-member ≡ missing-project. **Sized to 1 PR (HB3) — the owner confirmed 1 was right.** `/code-review`'s one low finding (shared `DENY` sentinel) fixed in-branch (`Object.freeze`). HB2 step was N/A (no default test asserts the seam). **Carried to `f-project-admin` §05:** enforce the lead-has-member-row invariant at project creation. **Unblocks `f-project-admin` and `f-hub-capabilities`** (the latter's other dep, `f-data-model`, is also shipped → the critical path's next spine feature is fully unblocked).
- **2026-07-14 — `f-hub-capabilities` SHIPPED (PRs #23, #24, #25).** The Hub's coordination tools as Sunrise capabilities, all membership-scoped through the f-access funnel, seeded (`prisma/seeds/app/`) as active `AiCapability` rows + MCP-exposed, and audited: **#23** the capability pipeline + `next_task` (read; the shared `computeEffectiveStatus` carrying the null-claimant/PR-blocked findings, reused by `f-board-view`); **#24** the write tools `create_task`/`add_backlog`/`flag_help_wanted` + the shared `resolveFeatureAccess` owner/member funnel; **#25** `claim_task` + soft-collision (`lib/projects/collision.ts`, never a hard lock). Dev MCP access via `McpApiKey`/`smcp_` + `.context/app/mcp-claude-code.md`. **Reconciliations:** MCP exposure needs a seeded `McpExposedTool` (not automatic) + a `prisma/seeds/app/` fork subdir seam (B17 resolved); no `human_approval` gate (agent-flow concern → f-sidekick); the acyclicity guard **re-homed** to `f-intake`/`f-sidekick` (create_task can't cycle — B26/HB4). One HB2 test-adaptation (registry idempotency → count-agnostic, ledger row 9), made once in t-1 and count-agnostic so t-2/t-3 didn't re-break it. **Unblocks `f-sidekick` (and everything that consumes Hub tools).** **Next: the UI spine, not the sidekick** — per the owner's usable-first build order (see Decisions log).
- **2026-07-13 — `f-data-model` SHIPPED (PRs #13, #16, #17).** The whole Hub coordination + futures data model: Project/ProjectMember/Feature/FeatureDependency (#13), Task/TaskDependency/TaskClaim (#16), Sprint/FocusDirective/Phase + nullable `Feature.phaseId` (#17) — all `app_*` tables. Six hand-written satellite FKs → `"user"` with per-FK drift probes pinning the `ON DELETE` action (15 probes green); GDPR erasure is the FK `ON DELETE` (no hooks), proven end-to-end by `app:smoke:erasure`. The B13 spurious-`DROP` footgun fired every migration — the third one additionally tried to drop all five prior satellite FKs (the `--create-only` + drift-probe guard caught it). Three `/code-review` findings carried to the live board: dependency acyclicity → `f-hub-capabilities` §07; claimed/NULL-claimant + null-user-render → `f-board-view` §10. **Sizing lesson (HB3):** built as 3 PRs, should have been ~1 — homogeneous, sequential, unconsumed-until-complete schema is one PR ([[feature-plan-authoring-guide]] §2 size gate refined; the per-task close-out PRs #14/#15 were also over-overhead — [[planning-retro]] A7). **Unblocks `f-access` and `f-hub-capabilities`.**
- **2026-07-13 — `f-data-model` t-1 done (PR #13, Project-domain schema).** `Project` / `ProjectMember` / `Feature` / `FeatureDependency` (`app_*` tables) + enums; hand-written satellite FKs → `"user"` (lead/owner SET NULL, member CASCADE) with per-FK drift probes pinning the `ON DELETE` action; `app:smoke:erasure` proves the GDPR cascade end-to-end. The B13 spurious-`DROP INDEX` footgun fired and was stripped (pgvector/tsvector indexes verified surviving). `/code-review` finding (dependency self-loops/cycles) carried to `f-hub-capabilities` (PR #14). `f-data-model` stays **in flight** — t-2 (Task domain) + t-3 (futures) remain. `drift-probes.test.ts` adapted (ledger row 8). Unblocks nothing new yet (f-access waits on the whole feature).
- **2026-07-11 — `f-fork` SHIPPED (auth-only shell + brand identity).** t-1 (PR #6, `feat(f-fork): auth-only shell`) stripped the marketing surface (landing → `/dashboard` redirect, About deleted, marketing nav emptied, sitemap trimmed) and kept the legal pages; embed/chat left dormant. Close-out (this PR) set the committed `.env.example` brand (`NEXT_PUBLIC_APP_NAME="HCE Hub"`, `NEXT_PUBLIC_LEGAL_NAME="All Too Human Ltd"`). The styled "H" brand-mark was **deferred to `f-theme`** (needs theme tokens). Six platform-file edits ledgered in [[platform-divergences]]. **Lesson:** f-fork was over-decomposed into sub-PR-sized tasks — see [[planning-retro]] §B (first Hub retro entry). Unblocks `f-theme` and `f-data-model`.
- **2026-07-07 — `f-fork` identity sub-task (PR #4, `chore: HCE Hub fork branding`).** `package.json` (`name: hce-hub`, `version: 0.1.0`), `NEXT_PUBLIC_APP_NAME`, the `CLAUDE.md` fork banner, `README.md`, and `.context/app/README.md`. No platform-owned files changed. This is the identity slice of `f-fork` t-1; the feature itself is `in flight` (Simon) — remaining work is the auth-only strip + brand mark ([[f-fork]]).

---

## References

- [[v1-requirements]] — the product spec (the binding *what/why*; §-referenced per feature).
- [[design_handoff_hce_hub/README|design handoff]] — the UI design system, screens, and interactions.
- [[futures]] — forward constraints; source of the parked phases and the v1 scaffolding.
- [[plan-authoring-guide]] — the overall-plan convention this plan is authored to (v2).
- [[feature-plan-authoring-guide]] — the per-feature convention each `<feature>.md` follows.
- [[CUSTOMIZATION|building-on-sunrise]] — the leaf-fork model, seams, and merge discipline (Sunrise `main`).
- Sunrise `.context/`: `orchestration/meta/functional-specification.md` (agents/capabilities/workflows/MCP/RAG/scheduling), `capabilities.md`, `chat.md`, `knowledge.md`, `inbound-triggers.md`, `scheduling.md`, `recipes/` — the binding *how* for the platform primitives.
