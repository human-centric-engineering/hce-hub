---
status: requirements-draft
opened: 2026-05-07
host_platform: sunrise
---

# HCE Hub — v1 Requirements

> This document describes what the HCE Hub is, why we're building it, and the shape of v1. It is intended to be the brief carried into a Claude Code session in the Sunrise repository to plan the actual build.

## 1. Context

HCE Venture Studio (Simon Holmes + John Durrant) is co-developing multiple projects at AI pace, on Agentic Sunrise (`human-centric-engineering/sunrise`). Traditional project management tools (Trello, Linear, Jira) assume a slower, more linear cadence and can't keep up — plans go stale, parallelism is hard to reason about, and code collisions multiply.

Our existing approach — markdown plans inside each repo — works for individual projects but does not scale to multi-project, multi-developer co-development.

### The bigger picture: the Hub as HCE's internal business operations platform

The long-term vision for the Hub is much larger than project coordination. It is intended to become **HCE's AI-native internal business operations platform** — a single connected space for everything we do internally: sales, development, support, marketing, finance, knowledge management, and whatever else needs a home as the studio grows.

The Hub is also a real-time demonstration of the HCE thesis. If we can build AI-native business processes for ourselves, we have both proof and product.

### What v1 covers: Module 1 — Project Coordination

This document specifies **Module 1: Project Coordination** — co-development workflow management for HCE's multi-project, multi-developer work at AI pace. It is the entry point into the platform, not the destination.

**v1's architectural job is therefore twofold:** ship a useful coordination module *and* establish the substrate (UI shell, agent architecture, knowledge base scoping, URL space, access control) that future modules will plug into without restructuring.

## 2. Thesis

Build a coordination environment — and the substrate for a wider operations platform — that gets the best out of **both** the AI/tech side **and** the human side.

- **Human-centric in operation, not just branding.** We left corporate engineering specifically to escape Jira-treadmill dynamics. The Hub must preserve agency, ownership, and the ability to work creatively and exploratorily.
- **AI-native, not Trello-with-MCP.** It should do things that couldn't have been built 12 months ago — proactive analysis, conversational planning, automatic re-planning on PR merges, per-person morning briefs. The Kanban is one surface, not the system.
- **Module-composable from day one.** v1 ships project coordination, but the UI shell, sidekick architecture, knowledge base scoping, and URL space accommodate future modules (sales, support, marketing, finance, knowledge) without restructuring. Module 2 should be a config + data-model + UI addition, not a refactor.
- **Built on Sunrise.** Sunrise already provides the orchestration engine, agent platform, RAG, MCP server, multi-LLM, scheduling, webhooks, and audit logging. The Hub is mostly Prisma models + capabilities + agents + workflows + a UI on top of that.

## 3. Human-centric principles (binding)

These principles override generic "good PM tool" instincts:

1. **Ownership lives at the feature level.** Each feature has a single owner. The Hub does not slip sub-tasks at people who don't own the feature.
2. **Pull, not push.** The system does not poke humans with assigned work. Humans ask "what should I work on?" and receive recommendations.
3. **Transparency ≠ recommendation.** Everyone sees everything that's going on. The Hub only *recommends* work that respects ownership.
4. **"All hands on deck" is a deliberate mode, not the default.** A feature owner flips a `help-wanted` flag, which makes that feature's tasks pullable by others. Boundaries don't erode silently.
5. **Exploratory ordering is a feature, not a bug.** Humans sometimes deliberately work in a "logically wrong" order — building a UI mockup before the data layer to feel out a flow, for example. The sidekick proposes ordering and dependencies; it never enforces them.
6. **The sidekick suggests; humans approve.** Any state change the sidekick wants to make passes through a `human_approval` gate. It is a planning partner, not an autopilot.

## 4. Three layers of work

The system distinguishes three layers, each with different authoring rules:

### Requirements (external, conceptual)

Born outside the Hub — in conversations like the one that produced this doc, in Claude web, in brain-dumps, in client briefs. Capability-agnostic: "we want X to do Y."

### Features (Hub-internal, build-aware)

Derived by the Hub during *intake*. The Intake Agent ingests the requirements, draws on knowledge of the project's host platform (Sunrise architecture, Laravel patterns, etc.), and proposes a build-shaped feature list with suggested dependencies. The owner edits and approves.

Each feature has: owner, status, dependencies on other features, host-platform context, optional `help-wanted` flag.

### Tasks (PR-sized work units)

Declared by the feature owner when they're ready to share state with the team. The owner does their thinking in the repo (markdown, Claude Code) and *promotes* tasks to the Hub when they're ready to be visible work.

The promotion gesture is the agency control. Nothing the team sees is implicit; everything is something the owner explicitly committed to.

Each task has: title, files-likely-to-touch, dependencies on other tasks, status, claimed-by, PR link.

## 5. The PR is the natural unit

The Hub's task unit is "a thing that becomes one small PR." Implications:

- Smaller, frequent PRs make security/code/test review more effective. The Hub's recommendations should naturally encourage this.
- PR-to-PR dependencies are real (task B can't merge until task A's branch lands). `next-task` recommendations skip anything blocked by an un-merged PR.
- CI delay is a real constraint. If you've just pushed and CI is running, the next pull should be parallel work, not stacked dependencies. The Hub helps avoid queues of blocked PRs.
- Collision avoidance is **soft** ("John started something touching `/api/auth` two hours ago — still want to claim this?"). Never hard locks.

## 6. The sidekick agent

The conversational sidekick is the design centre, not an add-on. In Sunrise terms it's an agent with:

- **System instructions** framing it as a planning partner for HCE co-development.
- **Knowledge base** scoped per project: requirements doc, decisions log, host-platform docs, team conventions.
- **Capabilities** that read and write the Hub data model.
- **Available everywhere it's useful**: web chat in the Hub, MCP from Claude Code (so you can ask it without leaving your dev session), and (later) embedded in Slack via Sunrise's existing widget pattern.

Use cases:
- "We want to add this idea — what changes in the current plan?"
- "What can be done in parallel right now?"
- "Where in this codebase would this requirement actually land?"
- "Suggest dependencies for this feature."

Any state change it proposes passes through a `human_approval` gate before being applied.

## 7. Multi-platform support

Each project has a `hostPlatform` attribute (`sunrise`, `laravel-forge`, `nextjs-other`, `none`, etc.) and an attached knowledge category for that platform's docs. The Intake Agent uses different planning context depending on platform — proposes Laravel-shaped features for Wayframer (John's current PHP/Laravel/Forge project for a client), Sunrise-shaped features for Sunrise projects.

**For v1: support `sunrise` properly. Stub the architecture so other platforms are an extension point (knowledge category + platform descriptor record), but do not build them out yet.**

## 8. v1 scope

In:

- Project + feature + task data model (Prisma)
- Sidekick agent (web chat + MCP) with project-scoped RAG
- Intake workflow: requirements doc → draft feature list with dependency suggestions → human approval gate
- MCP capabilities for Claude Code: `next-task`, `claim-task`, `create-task`, `add-backlog`, `flag-help-wanted`, `ask-sidekick`
- GitHub PR-state integration via `call_external_api` capability and webhook subscriptions for PR merge events
- "PR merged" workflow: reconcile task state, unblock dependents
- Per-person morning brief — scheduled workflow producing a summary (assigned features, available pulls, anything blocked on you, overnight changes). Initial delivery channel: email or Hub view.
- Web UI: Kanban / dashboard view (swim lanes by person, status columns, collision indicators), project intake screen, sidekick chat surface

Out (deferred to v1.x or later):

- PR link auto-detection from GitHub (declared by human in v1)
- Slack/embed integration
- Spec authoring chat-from-scratch in the Hub (intake takes an existing requirements doc)
- Re-intake (re-derive entire feature list when requirements change). v1 *appends* — new requirements become new features.
- Non-Sunrise host platforms (architecture stubbed, not built)
- Hard claim locks (soft collision warnings only)
- Drive-style document storage
- Finance / business profile / Ordinary Mastery calendar integration

## 9. Sunrise primitives we're using

| Hub need | Sunrise primitive |
|---|---|
| Conversational sidekick | Agent (system instructions + capabilities + knowledge base) |
| Intake flow | Workflow DAG with `human_approval` step |
| Project context for sidekick | Knowledge base + RAG, scoped per project via `knowledgeCategories` |
| MCP capabilities for Claude Code | MCP server + registered capabilities |
| GitHub state | `call_external_api` capability + webhook subscriptions |
| "PR merged → reconcile" automation | Workflow triggered by webhook |
| Morning brief | Cron-scheduled workflow → email/notify |
| Cost / budget | Built-in (per-agent monthly budgets, fallback chains) |
| Multi-LLM with fallback | Built-in |
| Audit log | Built-in (`AiAdminAuditLog`) |
| Approval gates | Built-in (`human_approval` step) |

The build is mostly: data model + a small set of Hub-specific capabilities + agent / workflow configuration + UI.

## 10. Initial data model sketch

For the Sunrise-side Claude to refine. Indicative, not prescriptive:

- **Project** — id, name, hostPlatform, knowledgeCategoryId (for project-scoped RAG), repo URL(s), leadUserId, createdAt
- **ProjectMember** — projectId, userId, role (`lead` / `member` for v1; `read-only` later), addedAt — controls per-project visibility and contribution rights; lets external devs be granted access to specific projects only without admin privileges
- **Feature** — id, projectId, title, description, ownerUserId, status (`planning` / `in-flight` / `blocked` / `shipped`), helpWanted (bool), createdAt
- **FeatureDependency** — featureId, dependsOnFeatureId
- **Task** — id, featureId, title, filesScope (string[]), status (`backlog` / `available` / `claimed` / `in-pr` / `merged`), claimedByUserId (nullable), prUrl (nullable), createdAt
- **TaskDependency** — taskId, dependsOnTaskId
- **TaskClaim** — taskId, userId, claimedAt, releasedAt (nullable) — for "John started something touching X an hour ago" warnings

Existing Sunrise models (`AiAgent`, `AiWorkflow`, `AiKnowledgeCategory`, `AiCostLog`, `AiAdminAuditLog` etc.) are reused as-is.

## 11. Hub-specific capabilities (registered tools)

To be built and registered in Sunrise's capability registry:

- `next-task` — returns highest-priority unblocked task in caller's owned features (or in `help-wanted` features if caller asks)
- `claim-task` — marks task in-progress, registers files-in-flight, returns soft warnings if overlap
- `create-task` — owner promotes a planned task into the Hub (declares title, files, deps)
- `add-backlog` — drop a thought against a feature without context-switching
- `flag-help-wanted` — owner toggles help-wanted on a feature
- `propose-dependencies` — sidekick proposes feature/task dependency edges (passes through approval)
- `impact-of-change` — sidekick analyses how a proposed new requirement affects current plan
- `ask-sidekick` — generic sidekick chat capability available from Claude Code via MCP

## 12. Workflows

- **Intake** — input: requirements doc. Steps: parse → RAG over host-platform docs → draft feature list with proposed dependencies → human approval → persist features. Owner can iterate within the workflow before approving.
- **PR merged → reconcile** — webhook triggered. Steps: locate task by PR URL → mark merged → check downstream deps → notify dependent owners ("you're up next").
- **Impact of change** — input: proposed new requirement. Steps: load current state → analyse against feature graph → produce impact summary and proposed edits → human approval if applying.
- **Morning brief** (scheduled, per-user, daily) — gather: assigned features, available pulls, things blocked on user, overnight changes. Render and dispatch.

## 13. Web UI surfaces

The Hub has **two distinct UI contexts**, both built into the same Sunrise codebase but mounted separately:

### 13.1 Hub UI — user-facing working surface

The Hub is deployed as a dedicated instance at **`hub.hce.studio`**. The subdomain *is* the Hub, so the operations platform sits at the root of the deployment — no `/hub/` prefix needed in paths. Scoped by project membership: a user only sees and acts on projects they belong to. This is what owners and contributors live in day-to-day, and the surface that external devs see if granted access to a specific project.

The shell is **module-composable**: top-level navigation accepts new modules over time without restructure. v1 has a single module (Project Coordination) in the nav, but the shell is not hard-wired to it.

- **`/`** — Hub home. Cross-module summary surface (currently just an entry point into Projects, but designed to expand).
- **`/projects/`** — Module 1: Project Coordination. Project list, scoped to the user's memberships.
- **`/projects/:id/`** — project view. Kanban / dashboard. Swim lanes by person. Status columns. Visible collision warnings. Help-wanted features visually flagged.
- **`/projects/:id/intake/`** — paste / upload requirements, run intake workflow, edit and approve the proposed feature list.
- **`/brief/`** — per-user morning brief, also delivered by email.
- **`/sales/`, `/support/`, `/marketing/`, etc.** — future modules, slotting in alongside Projects without restructure.
- **`/admin/`** — existing Sunrise admin (managing the Hub itself). See §13.2.
- **Sidekick chat** — persistent chat panel scoped to current project. Available across project pages. Same agent that's available via MCP from Claude Code. Architecture allows for hub-wide sidekick variants later, but v1 ships the project-scoped one only.

**The Hub fork strips Sunrise's public-facing surfaces.** Sunrise's stock template ships with a marketing landing page, public chat endpoints, and an embeddable widget — useful for most apps built on Sunrise but not for a purely internal tool. The Hub deployment removes these and roots itself as an authenticated app. HCE Studio's public marketing site lives at `hce.studio` (separate deployment); the Hub is internal-only.

### 13.2 Hub admin pages — inside the existing Sunrise admin shell

A smaller set of admin-only pages for managing the Hub itself. These live inside the existing Sunrise admin UI and inherit its shell.

- **Project administration** — create projects, manage members and roles, configure host platform, set up project-scoped knowledge base.
- **Hub agent configuration** — tune the Sidekick / Intake / Task Recommender agents (already partly covered by Sunrise's existing agent admin pages).
- **Hub AI usage and cost monitoring** — Sunrise's existing budget and cost dashboards, filtered to Hub agents.

The Hub UI (13.1) is the biggest greenfield piece in v1. The Hub admin pages (13.2) are mostly small additions inside an existing shell.

## 13.5 Tone, feel, and anti-patterns

The UI is the most visible expression of the human-centric principle. It should feel like a planning environment you think *in*, not a dashboard you're held accountable *to*.

**Feel:**
- Calm, signal-rich without nag. Information is reachable but never shouting.
- A planning environment, not a productivity tracker.
- Confident in its opinions (recommends, suggests, surfaces) without being pushy.
- The sidekick is present on every project surface — a quiet companion, not a separate destination you context-switch into.

**Density and visual language:**
- Closer to Linear's calm density than Trello's whitespace. State should be visible at a glance without clicking.
- Built on Sunrise's existing component language: Tailwind 4, shadcn/ui, and the visual primitives already used across the admin design system. The Hub UI lives outside the admin shell (see §13.1) but should feel like a sibling to Sunrise admin — same family, different room.
- Type and colour used semantically — collision warnings, blocked-by status, help-wanted features get distinct but quiet visual treatment. No traffic-light overload.

**Anti-patterns (do not include):**
- Red notification badges that demand attention.
- Streaks, task-completion counts, gamified progress, or any "productivity score" framing.
- "X overdue" guilt UX. Tasks have states (`backlog` / `available` / `claimed` / `in-pr` / `merged`), not deadlines that shame.
- Celebratory animations on task claim or completion. Acknowledgement is fine; performance is not.
- Auto-assignment cues. Recommendations are pulled, never pushed.
- Counts of "tasks waiting for you" rendered as urgency signals. Counts as information, not pressure.
- Hidden state. If the system is recommending something, the *why* should be inspectable.

**Things to emphasise visually:**
- Ownership. Whose feature is whose, at a glance, on every surface.
- Parallelism. What's safe to pick up alongside what's already in flight.
- Collision risk, softly. "John is in `/api/auth` right now" as ambient information, not a wall.
- The sidekick as a thought partner. Always one click or one MCP call away.

The morning brief is a good test of these principles: it should read like a thoughtful colleague's note, not a stand-up status report.

## 14. Open implementation questions for the Sunrise-side conversation

These need positions during the build but are not load-bearing on the requirements above:

1. How tightly coupled should the Hub's data model be to Sunrise's existing models (e.g. should `Task.claimedByUserId` reference Sunrise's user table directly, or carry its own user concept)?
2. URL space is set: deployed at `hub.hce.studio`, modules at the root (`/projects/`, future `/sales/`, etc.) — no `/hub/` prefix because the subdomain does the namespacing. The open question is the cleanest Next.js routing pattern (route groups, parallel routes, slot layouts) for a module-composable shell so adding Module 2 is a mount addition rather than a layout refactor. Also: cleanest way to strip Sunrise's stock public-facing surfaces (marketing landing, public chat, embed widget) from this fork.
3. How are non-admin user sessions handled — does better-auth already cover this cleanly, or does the Hub need additional role/permission middleware for project-membership scoping?
4. Should the Hub's MCP capabilities be a separate MCP server endpoint, or registered into the existing Sunrise MCP server?
5. What's the cleanest pattern for project-scoped RAG (one knowledge category per project, vs. category prefixed by project ID)?
6. How does Claude Code authenticate to the Hub's MCP — per-developer API keys via Sunrise's existing pattern?
7. What does the morning brief actually look like in practice — email format, frequency, opt-in/out per user?
8. PR webhook signing and verification: Sunrise's existing webhook delivery patterns vs. inbound webhook handling.

## 15. Out of scope for v1, but design accordingly

These are explicitly horizon, but the v1 architecture should not preclude them:

- **Future Hub modules** — Sales, Support, Marketing, Finance, Knowledge Management, HR/Talent. These are the long-term scope of the platform. v1 architecture must be module-composable (UI shell, URL routing, sidekick architecture, knowledge base scoping, access control) so adding Module 2 is a configuration + mount addition, not a refactor.
- **Hub-wide sidekick** — a sidekick that can answer cross-module questions ("what's the current sales pipeline and what's blocked on John in dev?"). v1 ships only project-scoped sidekick; agent and knowledge-category architecture should not preclude adding a hub-wide variant later.
- **Non-Sunrise host platforms** (Wayframer / Laravel-Forge etc.) — within the Project Coordination module.
- **Slack embed** via Sunrise widget.
- **Spec authoring conversation** in the Hub (intake takes an existing requirements doc in v1).
- **Drive-style document store / business profile / Ordinary Mastery calendar** — likely Module N material, not v1.
- **Re-intake** (full feature-list re-derivation on requirements change).
- **External productisation** of any module (e.g. Mark's presales tooling variant of Sales).

---

## Appendix: connection to wider HCE positioning

This Hub is one of the most concrete demonstrations of the HCE thesis: AI-native processes designed around humans, not the other way around. It is also a real-time response to Simon's "AI is a coordination technology" essay arc on Against the Drift — the bottleneck has moved from individual productivity to coordination, and we're building the coordination layer that fits the new shape of work. If it works for HCE, it's both proof of thesis and product.
