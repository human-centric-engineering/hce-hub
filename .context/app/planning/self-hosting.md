---
name: self-hosting
status: design
owner: Simon
opened: 2026-07-17
plan: .context/app/planning/plan.md
spec: .context/app/planning/v1-requirements.md
---

# Self-hosting — the Hub becomes its own system of record

> **The pivot.** Pause the AI-layer build (§12–§15) and make the Hub the **system of
> record for its own remaining delivery**: instead of a GitHub *claim* docs-PR and a
> *close-out* docs-PR per feature, we make **MCP calls to the Hub**. `plan.md` +
> `<feature>.md` freeze into history; the Hub's data becomes authoritative. This is the
> perfect dogfood of the core: we manage §12–§15 *in* the Hub.

Owner-confirmed design decisions (2026-07-17): **(1)** one unified journal stream (not
separate logs); **(2)** indicative tasks are a lightweight list on the feature, planned
tasks are the real `Task` rows; **(3)** full import of `plan.md` history so the Hub opens
populated. This doc is the design; per-feature plans follow at claim time.

## Why now (and the bootstrapping order)

The current GitHub flow (two docs-PRs + `plan.md` as record) was right for the greenfield
build, but it's overhead now that the coordination surfaces (Plan, Board, task sheet, the
capabilities, MCP) exist. The remaining delivery is the natural test: drive it through the
Hub. **Chicken-and-egg caveat:** we can't dogfood the Hub to *build* the self-hosting
features, so **f-journal + f-feature-planning + the cutover are built through the current
GitHub flow**; **from the cutover onward, §12–§15 are managed in the Hub.**

Relationship to the AI layer: this is the **human/MCP layer**; the AI features later
*automate* it — §13 intake = AI feature-planning (`plan_feature` proposed by an agent),
§12 sidekick = the propose→approve→commit wrapper (the §3.6 gate). Building the plain,
audited verbs now is exactly the usable-first / AI-last order (Decisions log 2026-07-14).

---

## 1 · The journal — one stream, many views (thread 5)

The `plan.md` **Decisions log**, **Work completed to date**, the f-task-sheet **activity
timeline** (deferred from §11), the f-projects **"recent activity"** table, and the
morning-brief **"overnight"** section are **not four models — they are filtered views over
one append-only project journal.** Reading what's actually in the two logs confirms it:
the decisions log is *already* a mix of **feature-scoped** entries ("f-refs claimed +
planned") and **project/epic-scoped** ADRs ("human_approval is an agent-flow concern",
"usable-first build order"); work-completed entries are **feature close-out narratives**.

**New fork-owned model `ProjectEvent`** — the Hub's own consumer-facing event source (the
reason §11 deferred its timeline: `AiAdminAuditLog` is admin-only). Sketch:

```prisma
model ProjectEvent {
  id           String   @id @default(cuid())
  projectId    String
  featureId    String?  // scope: null ⇒ project/epic-level
  taskId       String?  // scope: null ⇒ feature- or project-level
  kind         ProjectEventKind
  actorUserId  String?  // hand-FK → "user" · SET NULL (human actor)
  actorAgentId String?  // Sunrise AiAgent id (agent actor); no FK
  title        String?  // authored kinds (decision / note / ship narrative)
  body         String?  @db.Text  // markdown
  metadata     Json?    // kind-specific: { fromStatus, toStatus } | { prUrl } | { category }
  createdAt    DateTime @default(now())  // seed sets it explicitly to backdate the import
  @@index([projectId, createdAt])
  @@index([featureId])
  @@index([taskId])
  @@map("app_project_event")
}

enum ProjectEventKind {
  feature_claimed  feature_planned  feature_shipped  feature_blocked  feature_unblocked
  task_created  task_claimed  task_pr_linked  task_merged  help_wanted  member_added
  decision  note   // authored narrative
}
```

Two families in one stream:
- **Auto-events** the capabilities emit on state changes (`feature_claimed`, `feature_planned`,
  `task_created`, `task_pr_linked`, `task_merged`, `feature_shipped`, …) — cheap; they *are*
  the activity timeline.
- **Authored entries** written via MCP (`decision`, `note`, and the close-out narrative that
  rides on the `feature_shipped` event's `body`).

Every surface is then a query, not a table:

| Surface | Query | Attaches at |
|---|---|---|
| **Work completed** | `feature_shipped` / `task_merged` events | feature → aggregated to project |
| **Decisions log** | `decision` events; `featureId` set ⇒ planning rationale, `featureId` null ⇒ architectural/workflow ADR | **feature *and* project** |
| **Task-sheet activity** (discharges §11) | all events for `taskId` (+ its feature) | task |
| **Recent activity / morning brief** | project events, recent / since-last | project |

So the answer to "project, epic, feature, or task?" is **all of them, via one scoped
stream.** Epic = `Phase` today (one epic `v1`), so epic-scope ≈ project-scope for now; the
scope extends to `phaseId` when Phases activate.

## 2 · Feature-planning model (threads 2, 3, 4)

Additions to **`Feature`**:
- **`doneWhen String? @db.Text`** — the definition of done / desired completed state (your
  `*Done when:*` lines). First-class; shown in the feature detail.
- **`description`** — *already in the schema* (`@db.Text`), just under-used. Populate it as
  human-readable markdown (the design shows a description line).
- **`references`** — cross-refs for plan/build (the `[[v1-requirements#…]]` / design links).
  Start as `Json?` (a list of `{ label, target }`) rendered as ref-chips; promote to rows
  only if it needs querying.
- **`planningStage FeaturePlanningStage @default(indicative)`** (`indicative | planned`) —
  **orthogonal to `status`.** This is the at-a-glance "planned & ready" vs "still high-level"
  signal.

**Indicative tasks** = a lightweight ordered list on the feature (the high-level sketch —
your `- t —` bullets); **not** claimable, no number, no PR. New model:

```prisma
model IndicativeTask {
  id        String @id @default(cuid())
  featureId String
  order     Int
  text      String @db.Text
  @@index([featureId])
  @@map("app_indicative_task")
}
```

**Planned tasks** = the real `Task` rows, created at **plan time** (assignee defaults to the
feature owner). The sketch rarely survives planning 1:1, so **planning *replaces* the
indicative list with real tasks** rather than promoting rows in place. Addition to **`Task`**:
- **`assigneeUserId String?`** (hand-FK → `"user"`, SET NULL) — "this is yours to do",
  defaulting to the feature owner at creation, freely reassignable. Kept **distinct** from the
  pull-`claim` ("I'm actively on it now") — the Board already routes by `claimer ?? owner`, so
  the assignee is the softer ownership signal.

**Status vocabulary reconciliation.** `FeatureStatus` (`planning | in_flight | blocked |
shipped`) is the ownership/progress axis; `planningStage` is the depth axis. A feature can be
`planning`+`indicative` (backlog sketch), `in_flight`+`indicative` (claimed, not yet planned),
`in_flight`+`planned` (claimed & tasks defined), etc. `TaskStatus` keeps
`backlog|available|claimed|in_pr|merged` (note: the plan prose's "no in-PR state" is stale —
the schema has `in_pr`, and `link_pr` uses it).

## 3 · The capability set (the MCP verbs that replace the PR flow)

All membership-scoped through the [[f-access]] funnel, audited, **MCP-exposed** (seeded
`AiCapability` + `McpExposedTool`), and each **emits its ProjectEvent(s)**. Human-initiated =
ungated; an **agent**-initiated call is wrapped by that agent's approval flow (Decisions log
2026-07-13).

**Feature lifecycle** (new):
- `create_feature(projectId, { title, slug?, description?, doneWhen?, references?, indicativeTasks?, dependsOn? })` —
  author one feature at `planningStage: indicative` (the high-level sketch). **The manual
  precursor to §13 intake** (which later batches this from a requirements doc). Needed
  because, pre-intake, this is the *only* interactive way to get a feature into a project —
  the Hub's own plan arrives via the C import seed, but **other real projects (Lelanea, …)
  author their features through this verb**. Emits a `feature_created` event.
- `claim_feature(featureId)` — owner = caller, `status → in_flight`; emit `feature_claimed`.
  *(The missing feature-level claim — today only tasks can be claimed.)*
- `plan_feature(featureId, { doneWhen?, description?, tasks: [{ title, files?, deps? }] })` —
  create the real `Task` rows (assignee = owner, `number` via the `taskCounter` bump — [[f-refs]]
  invariant), `planningStage → planned`; emit `feature_planned` + `task_created`×N.
- `ship_feature(featureId, summary)` — `status → shipped`; emit `feature_shipped` (body =
  summary, the close-out narrative). Soft-warns if tasks aren't all merged (done-when is
  human-judged, never a hard block — §5).

**Task lifecycle:** `create_task` / `add_backlog` (exist), `claim_task` (exists),
`link_pr(taskId, url)` (`→ in_pr`, emit `task_pr_linked`), `complete_task(taskId)`
(`→ merged`, emit `task_merged` — later automatable by `f-github-sync`'s webhook).

**Narrative:** `record_decision({ featureId?, title, body, category? })` — a `decision`
event, feature- or project-scoped; `add_note(...)` — a `note`.

**Reads (for the dev + the sidekick):** `next_task` (exists), `get_feature`,
`project_status`, `recent_activity`.

**Dependency edges + the acyclicity guard (B26).** `plan_feature` creates **task** deps and a
manual dep-add creates **feature** deps — both connect *existing* items, so the shared
`assertAcyclic(edges)` (`lib/projects/dependency-graph.ts`) that §12/§13 were to build
**lands here** (whichever creates edges first builds it). This pulls the B26 guard forward
from the AI features to the human/MCP layer.

## 4 · UI changes

- **Plan view** — render indicative vs planned distinctly: an `indicative` feature shows its
  indicative list *muted/dashed, no status pills*; a `planned` feature shows real `Task` rows
  *solid, numbered, status/claimer*. The feature row gains a planned/indicative affordance so
  readiness reads at a glance (thread 2).
- **Feature detail** — description, done-when, reference-chips, the indicative-or-planned task
  list, and the **feature-scoped journal** (its decisions + activity). Reuses the task-sheet
  side-sheet pattern (a `?feature=` sibling of `?task=`), or a Plan expansion.
- **Task sheet** — the **activity timeline lights up** from `ProjectEvent` (discharges the §11
  deferral); sidekick-notes still await §12.
- **New surfaces** — a project **decisions log** + **work-completed / activity** view (a "Log"
  tab on the project, or on Hub Home). The morning brief + f-projects recent-activity read the
  same stream.

## 5 · How features get into the Hub — three paths

The crux (owner Q, 2026-07-17): pre-intake there's no *rich* plan generation, so features
enter three ways, and the two "imports" differ by whether history must be backdated:

1. **The Hub's own plan → a coded import seed (C).** Rich, backdated history spanning the
   whole build (decisions/ships dated over weeks). MCP verbs stamp `createdAt = now()` and
   *can't* faithfully backdate, so this one-off bulk load is a **coded seed** (like
   `006-sample-plan`) that writes rows + `ProjectEvent`s with explicit `createdAt`. This is
   why **A/B/C themselves belong in `plan.md`** (as §17–19 on the **`v1`** epic — this is
   standard discovery/dev work toward v1, not a new milestone; owner, 2026-07-17): built the
   current way, they stay in the record, and C's seed imports the *complete* story —
   self-hosting work included — before `plan.md` freezes.
2. **Other active projects → the MCP verbs (`create_feature` + `plan_feature`).** No rich plan
   doc, current-state only, **no backdating needed** — so these are authored *through the real
   verbs* (a great dogfood), not a seed. Minimal: project shell + a handful of features at
   their current stage.
3. **Future: §13 intake** — automates path 2 in bulk (requirements doc → AI-proposed feature
   graph → approve → `create_feature`×N). The verbs built here are what it drives.

### The C import seed materialises

- **Features** — the 15 (+ A/B/C) rows with `description`, `doneWhen`, `references`,
  `indicativeTasks` (from the `- t —` bullets), `status`, `owner`, `planningStage`,
  `FeatureDependency` edges.
- **Shipped features' tasks** — from each `<feature>.md` task table → `Task` rows marked
  `merged` with their PR URLs, numbered via the counter.
- **Decisions log** → `decision` events (feature-scoped where the entry names a feature, else
  project-scoped), `createdAt` backdated to the entry date.
- **Work completed** → `feature_shipped` events carrying the close-out narrative as `body`.

After import: `plan.md`/`<feature>.md` **frozen** (optionally auto-exported from the Hub for
git history); the MCP dev loop documented in [[mcp-claude-code]]. From here, every
claim/plan/ship/decision is an MCP call.

## 6 · Feature breakdown & sequencing

Three features, built via the **current** GitHub flow, then the cutover flips the switch:

| # | Feature | What | Notes |
|---|---|---|---|
| A | **f-journal** | `ProjectEvent` model + migration; auto-event emission from the existing capabilities; `record_decision`/`add_note`; the activity-timeline read (discharges §11) + decisions/work-completed/recent-activity surfaces | The substrate everything else + the sidekick/brief read |
| B | **f-feature-planning** | `Feature` fields (doneWhen/references/planningStage) + `IndicativeTask` + `Task.assigneeUserId` + migration; `create_feature`/`claim_feature`/`plan_feature`/`ship_feature`; `assertAcyclic` (B26); Plan indicative-vs-planned UI + feature detail | Depends on f-journal (emits its events) |
| C | **f-selfhost-cutover** | the `plan.md` → Hub import **seed** (backdated history); freeze the docs flow; wire + document the MCP dev loop | Depends on A + B; the dogfood switch |

Order: **A → B → C**, then §12–§15 are delivered *in* the Hub. (A and B could interleave;
C is last.) **A/B/C are added to `plan.md` as features §17–§19 on the `v1` epic** — the epic
is *getting to v1*, which self-hosting is part of (owner, 2026-07-17); it's standard
discovery/dev work, not a new milestone. Built the current GitHub way, so C's import captures
the complete record including the self-hosting build itself. `plan.md` freezes only *after* C
runs.

## Open questions (for the owner, at claim)

- **Feature detail surface:** a `?feature=` side-sheet (mirrors §11's `?task=`) vs a richer
  Plan-row expansion. Lean side-sheet (reuses the shipped pattern).
- **`references` shape:** `Json?` list now vs `FeatureReference` rows. Lean `Json?` MVP.
- **Epic layer:** RESOLVED — stays the single `v1` epic (self-hosting is part of reaching v1,
  not a separate milestone; owner 2026-07-17). `Phase` activation is deferred until a real
  multi-epic need; epic-scope ≈ project-scope for now.
- **`ship_feature` gate:** soft-warn on unmerged tasks (recommended, §5 pull-not-push) vs a
  hard block.
- **Does `plan.md` stay as a generated export** (Hub → markdown for git history), or is it
  simply frozen at cutover? Lean: frozen now, add an exporter only if we miss it.
