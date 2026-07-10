---
status: futures-thinking
parent: v1-requirements.md
opened: 2026-05-09
---

# HCE Hub — Futures

This is the looser companion to [[v1-requirements|v1 requirements]]. It captures Hub possibilities that are out of v1 scope but worth thinking about now — because some are natural v1.x enhancements, some require architectural support in v1 to be possible later, and some are clearly future modules. Together they sketch what HCE's AI-native business operations platform could become.

This doc is meant to evolve. Add ideas freely, let them mature, promote them upward when they're ready.

**Status labels used below:**

- `[v1.x]` — natural enhancement once v1 is shipped and stable. Build on Module 1 substrate.
- `[architectural]` — must be designed for in v1 so it isn't precluded later, even if not built.
- `[Module N]` — clearly belongs in a future Hub module (Sales, Support, Marketing, Finance, etc.).
- `[idea]` — surfaced but needs more shaping before it's actionable.

---

## Sunrise as a Hub project — bidirectional flow

The most compound-interest area. Sunrise is itself a project in the Hub, which means every fork built on it becomes part of a feedback loop. The more projects HCE builds on Sunrise, the more valuable Sunrise gets, and the more efficiently each fork inherits improvements.

### Cross-fork problem propagation `[v1.x]`

When working on a Sunrise fork, you find a problem or improvement in the underlying Sunrise template. Push it into the Hub via MCP from Claude Code, or directly through the UI. An agent checks whether the issue is already solved in the fork (since the fork has likely diverged), and either:
- Recommends how to apply the fork's fix back into Sunrise, or
- If just the problem is described, suggests an action via a coding agent
- For obvious solutions, creates a branch with the fix on Sunrise, ready for human approval

The sidekick / morning brief informs Sunrise admins that there's something to look at. Nothing pushed at humans; everything surfaced for pull.

*Why it matters:* Captures the "we already fixed this in Wayframer" insight that would otherwise live in someone's head. Makes Sunrise compound from every fork's experience.

### OSS issue triage on Sunrise `[v1.x]`

Sunrise is open-source. Public issues open on GitHub. An agent triages incoming issues, opens corresponding features/tasks on the Sunrise project in the Hub, and where appropriate suggests fixes or creates a solution branch. Humans approve, edit, or redirect.

*Why it matters:* Open source community participation without it becoming a maintenance treadmill. Demonstrates AI-native OSS stewardship.

### Sunrise improvements propagating to forks `[v1.x]`

When a fix or feature lands on Sunrise, downstream forks may want it. Per-project owners get notified (task / sidekick / morning brief / email). For each fork, an agent assesses whether the change is relevant or important — given how that fork has diverged. If the project owner picks up the task, they have access to the original Sunrise solution as a reference point.

*Why it matters:* Solves the classic "fork drift" problem where forks fall behind their upstream. Each fork gets curated, project-aware update suggestions instead of a noisy stream of upstream commits.

*Requirements seed:* the manual version of this loop — release cadence, version-batching, and the fork-sync-and-reconcile process this feature would automate — is written up in [[release-and-sync-strategy]] (in the Sunrise project folder). That doc is the de-facto spec for what this item and [[#Cross-fork problem propagation `[v1.x]`|cross-fork problem propagation]] should implement.

### Monitoring-triggered task creation `[v1.x]`

If a deployed project has monitoring (errors, performance, alerts), captured signals are triaged and high-priority tasks open automatically on the project. A coding agent suggests fixes. The owner sees them in the morning brief or via the sidekick.

*Why it matters:* Closes the loop between production behaviour and the development plan. Operations becomes part of the same coordination surface as build work.

### Cross-project pattern recognition `[v1.x]`

Agent notices that two Hub projects solve similar problems differently. "Lelanea and Wayframer both implemented X, differently — worth comparing?" Sometimes the right answer is "promote this pattern into Sunrise." Sometimes it's "Wayframer's approach is cleaner, consider porting." Sometimes it's "they're different for good reasons, leave alone."

*Why it matters:* Pattern recognition is one of the things AI does well that humans struggle to do across multiple parallel projects. Closes the loop between Sunrise and its forks at a higher level than individual fixes.

---

## Dynamic focus and prioritisation

The Hub shouldn't treat all projects and features as equal at all times. Real teams have shifting focus — a launch week, a dependency on an external party, a decision to deprioritise something. The Hub should reflect that, both formally (sprint goals) and conversationally ("we're pushing Lelanea this week, trying to launch XYZ by Friday"). Done well, this makes recommendations actually useful; done badly it becomes corporate dashboard theatre.

The principle: focus is **declared** (by humans, formally or in conversation) and the Hub **applies it as bias** to recommendations. Bias, not exclusivity — a critical Wayframer issue still surfaces even if you said you're pushing Lelanea.

### Sprint-aligned prioritisation `[architectural]`

Sprint plans live in the Hub. Sprint goals shape `next-task` recommendations to favour features that advance sprint goals over features that don't. End of sprint, the priority bias resets and the new sprint's goals take over.

*Why it matters:* What teams typically struggle with is sprint commitments meeting daily reality. The Hub naturally aligns the two by making the daily "what's next" recommendation aware of the sprint's stated focus.

*Architectural implication for v1:* Project entities need a status concept and a way to carry sprint/goal signals. Sprint entities (or at least sprint-scoped focus directives) need somewhere to live in the schema. Worth flagging to the Sunrise-side build conversation.

### Conversational priority directives `[v1.x]`

Either dev says to the sidekick: "We're pushing Lelanea this week, trying to launch XYZ by Friday." Sidekick parses and captures as a time-bounded priority directive (project: Lelanea, intent: launch XYZ, deadline: Friday), and applies it as a bias on `next-task` recommendations. The directive is visible and editable — not opaque.

Cross-team coordination: if Simon declares the directive but John hasn't been told, John sees it in his morning brief or sidekick chat. Coordination via the system, not a separate Slack message.

*Why it matters:* Most prioritisation actually happens conversationally. Capturing it lightly, applying it as bias, surfacing it to the team — small thing, compounds into "the Hub knows what we're up to."

### Project hold states `[v1.x]`

"Wayframer is on hold for now, we're waiting for go-ahead from Angus." Sidekick captures the state change and the reason. `next-task` stops recommending Wayframer work; the project remains visible with the hold reason; if a critical issue arises, it still surfaces (bias, not erasure).

When the hold lifts — either via conversation ("Angus gave the go-ahead") or via a watched signal (e.g. an inbound email matching a configured trigger) — the project re-enters normal recommendation flow, and the morning brief notes the change.

*Why it matters:* Holds are usually opaque (someone forgets a project is paused, or someone forgets it isn't). Making hold reasons explicit and visible reduces dropped state.

### Time-bounded focus and gentle reminders `[v1.x]`

Directives have natural expiries: "by Friday", "this sprint", "until Angus gets back to us." When the deadline approaches, the sidekick may surface it gently: "you mentioned the Lelanea push by Friday — looks like XYZ shipped, anything else to land before close?" Or: "the Wayframer hold was three weeks ago — still waiting on Angus, or worth a nudge?"

*Why it matters:* Focus declarations are decisions worth tracking. Gentle reminders prevent quiet drift without becoming nags.

### Focus-aware morning briefs `[v1.x]`

The morning brief reflects current focus. Lelanea push on → brief leads with Lelanea status, blockers, what's available to pick up. Wayframer on hold → brief mentions it briefly with the reason. Closes the loop between conversational direction and the proactive surfaces.

*Why it matters:* The brief is where stated focus and actual reality meet. Done well, it's a daily moment of alignment.

### Multi-person focus mapping `[v1.x]`

Simon declares his focus; John declares his. The Hub respects both. `next-task` recommendations to Simon weight Simon's focus, John's recommendations weight John's. Help-wanted routing considers each person's current focus before suggesting they pick up someone else's task.

*Why it matters:* Two-person studio means two parallel priority streams that occasionally synchronise. Letting the Hub model both keeps recommendations honest.

### Implicit-vs-stated drift surfacing `[idea]`

Sidekick notices when stated focus doesn't match actual action. "You mentioned pushing Lelanea on Monday — looks like you've been on Sunrise gaps instead. All good, or has the priority changed?" Phrased as inquiry, not accusation.

*Why it matters:* People often only realise their declared priorities have shifted when something forces the reflection. The sidekick is well-placed to be that gentle force, *if* it stays curious rather than judgmental.

### Connections to other futures items

Focus history feeds:

- **Sprint retro auto-draft** — the retro is much richer when "we said we'd push Lelanea this week" is part of the source material
- **Quarterly planning input** — declared focus across sprints shows actual priorities vs. stated quarterly goals
- **Cross-pollination with content** — "we pushed Lelanea hard last week to hit the Friday demo" is content-able as both a working-in-public post and an essay anchor

---

## Coarse work grouping — Phases / Epics

Projects accumulate features. Without a grouping layer above features, a long-running project's feature list becomes a flat soup — releases blur, "future enhancements" share a list with "shipping next week", and onboarding context disappears. **Phase** is the epic layer above Feature: release boundary, milestone, or parking lot for ideas that aren't current.

Distinct from [[#Dynamic focus and prioritisation|focus/prioritisation]] above (which is temporal and conversational — sprint goals, "we're pushing Lelanea this week", hold states), Phase is *organisational and persistent*. The three layers compose: Phase tells you which release-band a feature belongs to; Sprint tells you which week of work; FocusDirective tells you the in-conversation push. All three feed `next-task`.

The schema for Phase + nullable `Feature.phaseId` is **scaffolded in v1** (see [[v1-requirements#10. Initial data model sketch]]) so v1.x can consume it without a migration. Same pattern v1 already uses for Sprint and FocusDirective.

### Phase as a Hub primitive `[v1.x]`

The phase view: features grouped by phase, scoped to the user's project memberships. `active` phases shown by default; `complete` collapsed; `parked` available but hidden until explicitly opened. Drag/promote a feature into a phase from the project view.

*Why it matters:* gives a long-running project visible structure that survives the feature soup. Cheap UI work that compounds heavily as the studio's project count grows.

### Phase-aware `next-task` bias `[v1.x]`

The `next-task` recommendation favours features in the project's `active` phase over features in `upcoming` phases, and skips `parked` phases entirely (unless the caller asks explicitly with `--include-parked`). Bias, not exclusivity — a critical fix in a `parked`-phase feature still surfaces when explicitly requested.

*Why it matters:* matches the human-centric "recommendations follow declared focus" pattern that already shapes Sprint and FocusDirective. Phase is the longest-lived focus signal of the three.

### Future-work parking `[v1.x]`

The `parked` status turns Phase into a structured ideas pool. "Things we want to do in six months" lives in a parked phase: visible, browseable, not polluting active views, easily promoted to `upcoming` when their moment comes. The sidekick can mine parked phases for "anything in here that's connected to what we're doing now?"

*Why it matters:* HCE generates more ideas than it ships. Without a structured park, ideas live in brain-dumps and decay; with one, they remain reachable and the sidekick can surface them when adjacent work brings them back into relevance.

### Cross-project phase visibility `[Module N]`

Once the Hub holds multiple projects, the phase view aggregates across them. "What phase is each project in? Where do active phases overlap with my focus?" Useful for John + Simon syncing without ceremony.

*Why it matters:* answers "what's the studio actually working on this month?" at a glance, without anyone writing a status report.

### Connections to other futures items

- **[[#Sprint retro auto-draft `[v1.x]`|Sprint retro auto-draft]]** — phase progress within the sprint is part of the source material; "we advanced P3 from in-flight to shipped" is a real retro line.
- **[[#Quarterly planning input `[v1.x]`|Quarterly planning input]]** — phases-completed-per-quarter is a coarser-grained version of the brain-dump archaeology, well-suited to retrospective summary.
- **[[#Onboarding brief for new contributors `[v1.x]`|Onboarding brief for new contributors]]** — phase view gives a new dev the project's arc in one screen.

### Precursor today

The [[plan|Conversational Questionnaire project plan]] already uses informal `P0..P9` naming for phases — the doc shape this entry describes formalising. When v1.x ships Phase UI, those informal phases become `Phase` rows.

---

## Knowledge as living substrate

The Hub gets smarter the longer it runs because every interaction becomes part of the knowledge base. This is where the platform compounds.

### Living decision log `[architectural]`

Every PR description, sidekick conversation, intake decision auto-captured as a searchable decision in the project's knowledge base. Six months later, "why did we choose X over Y?" gets a real, sourced answer instead of a Slack archaeology expedition.

*Why it matters:* This is the single highest-compound feature. It's also why §15 of v1 requirements should ensure the knowledge base architecture supports decision-as-document ingestion from day one. **Worth verifying explicitly during the Sunrise-side build conversation.**

### Architecture drift detection `[v1.x]`

Sidekick periodically reads the project codebase and maintains an up-to-date architecture description in the project's knowledge base. Flags drift: "your published architecture says X, the code now does Y." Optionally auto-PRs an updated diagram or doc.

*Why it matters:* Architecture docs that don't lie. A common cause of project rot eliminated.

### Stale-decision surfacing `[v1.x]`

Decisions made 6 months ago that the code has since contradicted are quietly flagged for revisit, not nagged. The sidekick mentions them when relevant context arises.

*Why it matters:* Captures the "wait, didn't we decide we wouldn't do X?" moment that everyone forgets until it bites.

---

## Rich project context

A project in v1 is a fairly thin thing — name, host platform, repo, members, features, tasks. Enough for co-development coordination, not enough to be a complete picture of the project as a piece of the business.

Real projects accumulate context: who the client / partner / customer is, what we agreed to deliver, the original brief, source materials they provided, communication history, budget and resource allocation, scope decisions made along the way. As HCE takes on more client and partner work, the Hub benefits from holding all of this — not as a CRM bolted on, but as a richer view of each project that the sidekick, agents, and humans can all draw from.

Most of this is `[Module N]` material. Some is light enough to land as `[v1.x]` enhancements via the project knowledge base. None of it requires changes to v1 functionality, but the concept is worth holding now so it shapes module thinking later.

### Stakeholder entity `[Module N]`

The external party — client, partner, customer, joint venturer. Carries name, type, engagement context, relationship status. Linked to one or more projects.

*Why it matters:* The Project entity in v1 is internally-shaped. Real projects have an external "for whom" that should be a first-class concept once HCE has more than one or two engagements running.

### Contacts `[Module N]`

People on the stakeholder side. Name, role, email, relationship history. Linked to communication history and decisions.

*Why it matters:* The "who do I talk to about X" question is currently answered by Simon's memory. Making it Hub-resident scales the studio without adding overhead.

### Brief and scope `[v1.x]`

The original ask — what was agreed, what's in scope, what's explicitly out of scope. Lives in the project knowledge base initially, then graduates to a structured artefact when scope changes need to be tracked formally.

*Why it matters:* Everything downstream — proposals, status briefs, retrospectives, scope-change conversations — needs the brief as a reference point. Currently lives in someone's email or Drive; should live with the project.

### Engagement context and history `[v1.x]`

How did this project come about? Discovery conversation, the path to "yes", the constraints that shaped scope, the decisions about what was in or out and why. Ingested into the project KB.

*Why it matters:* Six months in, "why did we agree to that" questions are common. Capturing the engagement context preserves the reasoning, not just the outcome.

### Source materials `[v1.x]`

References the stakeholder provided — existing systems, design files, prior attempts, regulatory docs, brand guidelines, sample data, anything that informs the build. Ingested into the project KB.

*Why it matters:* Source materials usually land in someone's email or Drive and stay there. Hub-resident and RAG-indexed, the sidekick can answer "does the brand guideline say anything about X?" without anyone re-reading the PDF.

### Communication history `[Module N]`

Emails, calls, Slack threads, conversations where decisions were made. Linked to contacts. Ingested to the extent that's useful for the sidekick to answer "what did we tell them about X?" or "when did we last check in?"

*Why it matters:* Decision provenance often hides in old email threads. Surfacing it makes the project legible to anyone joining mid-flight, and gives the sidekick a real handle on client-facing context.

### Resources, budget, and commitments `[Module N]`

Time allocation, budget envelope, who's funding what, billing arrangements, commitments made about delivery dates. Connects to a future Finance module.

*Why it matters:* Decisions about additional scope, surge requests, deadline negotiations all need a real picture of what was committed, against what budget, on what timeline.

### Project narrative `[v1.x]`

The human-readable story of the project — woven from brief, decisions, communications, retrospectives. Useful for onboarding new contributors, drafting status briefs to clients, producing case studies, anchoring sales conversations ("here's how we worked with X").

*Why it matters:* Most of HCE's future positioning will rest on saying "we did this, here's how, here's what worked." The narrative emerges from the data if the data is captured.

### Connections to other futures items

Rich project context is a foundation for several existing items:

- **Customer 360** — depends on Stakeholder + Contacts + communication history as first-class entities
- **Auto-derived weekly status briefs** — qualitatively better when brief and scope are known, not inferred
- **Discovery → intake handoff** — produces the initial brief and engagement context for a new project
- **Capability matching for new opportunities** — past briefs become reference material
- **Onboarding brief for new contributors** — pulls from project narrative + engagement context
- **Living decision log** — engagement context *is* a kind of decision history; the architecture is the same

### v1 architectural footprint

Light. The project knowledge base already exists in v1, so brief / engagement context / source materials / project narrative can be ingested without schema changes. Stakeholder / Contacts / Communication / Resources are net-new tables that link to Project but don't modify it. v1's existing `Project.knowledgeCategoryId` is the only architectural surface that matters here, and it's already there.

The one thing worth being deliberate about during the v1 build: the project KB ingestion path should be flexible enough to accept varied content types (markdown briefs, PDFs, prior emails, design files). Sunrise's RAG already supports MD / PDF / EPUB / DOCX / TXT / CSV, so this is more a *use it well* note than an *add capability* one.

---

## Sales and pre-sales `[Module N]`

A future Sales module on `/sales/`. Tightly integrated with Project Coordination — discovery becomes intake, won deals become projects.

### Discovery → intake handoff

Sales calls / discovery emails fed to an agent that extracts requirements and produces a candidate intake doc — ready to feed straight into Project Coordination if the deal closes. The Mark Lister conversation literally becomes a draft project brief.

*Why it matters:* No re-keying between sales and delivery. The deal's context lands in the project's knowledge base from day one.

### Proposal generation, capability-aware

Given prospect requirements + Sunrise's current capability map + past project velocity, agent drafts realistic feature list and effort estimate. Includes "we've solved this shape of problem before" references with traceable provenance.

*Why it matters:* Faster, more honest proposals. Each one gets better as the studio's history accumulates.

### Capability matching for new opportunities

When an opportunity arrives, agent identifies which Sunrise capabilities + which past patterns apply. Tells you fast whether you can deliver, where the risk is, what's adjacent that you might learn from.

*Why it matters:* Turns the studio's history into pre-sales leverage. Particularly valuable as the project portfolio grows.

---

## Client communication

Distinct from Sales. Lives somewhere between Project Coordination and a future Support module.

### Auto-derived weekly status briefs `[v1.x]`

Per client project, weekly: agent generates a client-readable update from Hub state — what shipped, what's next, what we need from you. Editable before sending.

*Why it matters:* Saves an hour per client per week on something Simon would otherwise either skip or do reluctantly. Externalises HCE's transparency ethic — clients see how you work, automatically.

### Inbound triage with project context `[Module N]`

Client email / Slack arrives → agent identifies which project, summarises with full context for whoever needs to respond. Or answers FAQ-shaped questions itself with citations to past decisions.

*Why it matters:* Communication doesn't drop because someone's deep in code. Context-rich routing instead of "I'll get to it later."

---

## Talent / external collaborators

The project-membership concept in v1 already supports external devs. These are extensions for when the network grows.

### Onboarding brief for new contributors `[v1.x]`

External dev joins a project. Agent generates a personalised brief: what to read, current state, conventions, who to ask about what. Pulled from project knowledge base + decision log.

*Why it matters:* Onboarding is one of the most expensive tedious tasks in any team. Automating it (well) is a clear AI-native demonstration. Pairs naturally with project-membership.

### Capability picture-of-the-team `[idea]`

As collaborators come and go, agent maintains an emerging map of who's done what, what they're good at, what they want more of. Quietly informs `next-task` recommendations and "all hands" routing.

*Why it matters:* Skills/preferences are usually tribal knowledge. Making them legible (without making them performative) helps distribute work better.

---

## Process meta

Things the Hub does about its own operation.

### Sprint retro auto-draft `[v1.x]`

End of sprint: agent reads all sprint activity (Hub state, brain dumps, PR descriptions, sidekick conversations) and drafts the retrospective for human editing. Owner edits, approves, posts.

*Why it matters:* High-frequency, high-tedium, high-value, and very visibly AI-native. Strong demonstration candidate.

### Quarterly planning input `[v1.x]`

Agent summarises the quarter's actual activity vs. stated goals, surfaces drift, prepares input for the next planning conversation. Extension of the existing brain-dump-analysis skill across the whole studio rather than just daily notes.

*Why it matters:* Quarterly planning at HCE currently relies on Simon's memory + brain-dump archaeology. Hub state makes it sourced and complete.

### Bottleneck detection `[v1.x]`

Agent watches PR cycle times, review delays, intake throughput, surfaces patterns ("PRs touching auth seem slower — worth a look?"). Information for conversation, not metrics for accountability.

*Why it matters:* Process improvement based on actual signal rather than vibes. Crucially, it must follow the human-centric principle — surfaces patterns, doesn't generate scorecards.

### Norm extraction `[idea]`

Agent observes how decisions get made over time, surfaces emerging conventions, asks "should we codify this?" Increasingly useful as the team grows.

*Why it matters:* Captures the implicit conventions that usually only emerge by hiring and observing churn. Lets HCE codify itself faster.

---

## Marketing / content `[v1.x → Module N]`

Simon-flavoured. Existing brain-dump skill extends naturally.

### Cross-pollination between project work and content `[v1.x]`

"You're drafting an essay on coordination — last week you made a decision on Lelanea that touches the same theme. Use it?" The Hub becomes a content engine because every project decision is a potential anchor.

*Why it matters:* Solves Simon's persistent "not enough telling" problem by making the doing into telling-source-material.

### Living content radar `[v1.x]`

Existing brain-dump skill, but operating across all Hub state — PR descriptions, intake conversations, decision logs, retros. Far richer source material than just daily notes.

*Why it matters:* Existing skill is already valuable. Hub-aware version is qualitatively different.

### Distribution sequencing `[Module N]`

When an essay publishes, agent proposes follow-ups using past content + current project examples. Schedules across channels.

*Why it matters:* Marketing module material. Closes the loop between content production and distribution.

---

## Cross-module — Module 2+ territory

Capabilities that only become possible once the Hub has multiple modules.

### Customer 360 `[Module N]`

Once Sales + Support + Project modules exist: a client contacts you, agent assembles everything across the Hub (project state, sales history, support tickets, open invoices, last conversation) into a single brief.

*Why it matters:* Classic cross-module use case. Each module provides a slice; the agent composes them.

### Inter-project resource visibility `[Module N]`

Who's where, what's blocked, where could surge help, given everyone's current commitments. The "all hands" mode at studio scale rather than project scale.

*Why it matters:* As the studio grows beyond Simon + John, allocating attention across projects becomes a real problem. Hub already has the data; just needs the cross-project view.

### Revenue-aware prioritisation `[Module N]`

When paid work appears, agent helps assess impact on current commitments, surfaces tradeoffs explicitly. Requires Finance module.

*Why it matters:* Decisions about taking on paid work currently happen on gut feel. Surfacing the actual tradeoffs makes them more honest.

---

## Thesis-shaped demonstrations

A few of the above aren't just features — they're concrete demonstrations of the HCE thesis (AI-native business operations designed around humans). Worth calling out because these are the ones that should anchor any storytelling about the Hub:

1. **Living decision log + cross-project pattern recognition** — the Hub gets smarter the longer it runs. Compound interest on knowledge. Hard to do with traditional tooling.
2. **Sprint retro auto-draft** — visible AI-native time saving on a tedious-but-important ritual. Shows up in every sprint.
3. **Capability matching for new opportunities** — turns the studio's whole history into pre-sales leverage.
4. **Auto-derived client briefs** — externalises HCE's transparency-first ethic; clients *see* how you work, automatically.

Together they tell a coherent story: **AI-native business is one where the act of working creates compounding intelligence about how the work is done.**

That's the prototype the whitepaper is gesturing at.

---

## How this doc evolves

Promotion path for ideas:

- `[idea]` → `[architectural]` once they're shaped enough to need v1 design support
- `[v1.x]` → migrated into v1 requirements §15 footnotes or queued as a v1.1 feature once v1 ships
- `[Module N]` → spun out into their own module-specific docs when those modules become real projects in the Hub itself

Adding ideas freely is encouraged. Half-formed thoughts welcome — that's the point of a futures doc.
