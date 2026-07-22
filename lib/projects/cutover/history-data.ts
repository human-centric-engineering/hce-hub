/**
 * Cutover — the decisions log as backdated `decision` events (f-selfhost-cutover §19 t-2).
 *
 * One entry per `.context/app/planning/plan.md` **Decisions log** row — the
 * resolved architectural/claim decisions of the build (self-hosting §1: the log
 * is a filtered view of the `ProjectEvent` stream). `snapshot.ts` stamps each
 * with its explicit `createdAt` (backdated — the whole reason the cutover is a
 * coded load, not the `now()`-stamping MCP verbs). `featureSlug` scopes an entry
 * to a feature (planning rationale); a null slug is a project/epic-level ADR.
 *
 * Bodies are concise summaries — the frozen `plan.md` remains the full archive of
 * the reasoning (self-hosting §7 "the Hub holds the outcome"). `feature_shipped`
 * events are NOT here: they derive from each shipped feature's `shippedAt`.
 *
 * Newest first (matching the log).
 */

export interface CutoverDecision {
  /** ISO timestamp (backdated to the log entry's date). */
  date: string;
  /** Feature slug when the decision concerns one feature; omit for a project ADR. */
  featureSlug?: string;
  title: string;
  body: string;
}

export function buildCutoverHistory(): CutoverDecision[] {
  return [
    {
      date: '2026-07-22T09:00:00.000Z',
      featureSlug: 'f-selfhost-cutover',
      title: 'The four remaining §19 forks resolved',
      body: '3 PRs (by surface area); faithful-not-fabricated backdated events; retire the sample seed gaplessly (import-plan reuses the sample project id in place); freeze the records — plan.md + the feature plans go obsolete, the conventions stay live.',
    },
    {
      date: '2026-07-21T20:00:00.000Z',
      featureSlug: 'f-selfhost-cutover',
      title: 'f-selfhost-cutover claimed + planned',
      body: 'The final self-hosting feature. Data in/out is an import-once command + a durable export/import round-trip, NOT a per-reset seed (a seed clobbers live post-cutover work and re-runs frozen data in prod). f-project-slugs folded in.',
    },
    {
      date: '2026-07-17T16:00:00.000Z',
      title: 'Plan-doc coverage assessment: three fields the model must keep',
      body: 'Task.doneWhen becomes first-class; open/pending decisions are NOT a journal kind (they belong to the §12 approval queue); carried cross-feature findings are written scoped to the target feature.',
    },
    {
      date: '2026-07-17T10:00:00.000Z',
      title: 'Self-hosting pivot — the Hub becomes its own system of record',
      body: 'Pause the AI layer (§12–§15); make the Hub usable to manage its own remaining delivery over MCP. One unified ProjectEvent journal; indicative vs planned tasks; a full backdated import of plan.md history. Built §17→§18→§19 the current GitHub way, then §12–§15 in the Hub.',
    },
    {
      date: '2026-07-15T09:30:00.000Z',
      featureSlug: 'f-refs',
      title: 'f-refs — a corrective feature; surface schema-vs-design gaps',
      body: 'Adds the feature slug + project-wide task number the design relied on but the schema never had. Lesson: a design element the schema lacks is a fork to surface for the owner, not a reconciliation to settle silently.',
    },
    {
      date: '2026-07-15T08:30:00.000Z',
      featureSlug: 'f-board-view',
      title: 'f-board-view claimed + planned',
      body: 'A member-lane × effective-status-column Kanban over the same seed as the Plan; a dedicated board API, server-side routing through the funnel, both carried f-data-model null-render findings discharged here.',
    },
    {
      date: '2026-07-15T08:00:00.000Z',
      featureSlug: 'f-plan-view',
      title: 'f-plan-view claimed + planned',
      body: 'The first surface to render the seed’s real dependency graph. A pure cycle-tolerant planOrder() (the acyclicity guard stays homed in the edge-creating flows); one enriched read through the funnel.',
    },
    {
      date: '2026-07-15T07:30:00.000Z',
      featureSlug: 'f-projects',
      title: 'Consumer surfaces read through the f-access funnel',
      body: 'The membership predicate stays centralized in access.ts; the consumer list scopes via accessibleProjectIds rather than hand-rolling a members filter. Detail deny ≡ 404 (anti-enumeration).',
    },
    {
      date: '2026-07-15T07:00:00.000Z',
      title: 'Green gates prove wiring, not that the surface works (HB6)',
      body: 'A blocking empty-picker bug passed mocked-fetch tests. Rule: a UI feature’s definition of done includes browser-validating the real data path.',
    },
    {
      date: '2026-07-15T06:30:00.000Z',
      featureSlug: 'f-project-admin',
      title: 'f-project-admin is admin-gated, not membership-gated',
      body: 'It is the writer of the ProjectMember rows the f-access funnel reads. The lead-has-member-row invariant (seat the lead transactionally) bridges the two surfaces.',
    },
    {
      date: '2026-07-15T06:00:00.000Z',
      featureSlug: 'f-shell',
      title: 'Routing architecture for the UI spine settled in f-shell',
      body: 'Route group + nested layouts; the (hub) group; the sidekick persists in the layout; modules are a route subtree + a registry entry (Module 2 = a mount-addition). Account pages stay in (protected).',
    },
    {
      date: '2026-07-14T18:00:00.000Z',
      featureSlug: 'f-theme',
      title: 'Theme watch-item A closed with zero platform edit',
      body: 'The dedicated data-surface seam superseded the plan’s "keep-mine globals.css" hypothesis — the whole theme landed in the fork-owned brand-theme.css. Lesson: check the seam catalog before honouring a platform-edit watch-item.',
    },
    {
      date: '2026-07-14T12:00:00.000Z',
      title: 'Build order: usable-first, AI-last',
      body: 'Ship a human-usable coordination tool first (UI spine seeded with the Hub’s own plan), then layer the agentic/AI capabilities. Overrides the critical path’s default "sidekick after capabilities".',
    },
    {
      date: '2026-07-14T11:00:00.000Z',
      title: 'Dependency-cycle acyclicity guard re-homed (B26)',
      body: 'create_task structurally can’t create a cycle (a new leaf gains only outgoing edges); the guard belongs to the flows that connect two existing items — landing in plan_feature (§18).',
    },
    {
      date: '2026-07-13T18:00:00.000Z',
      title: 'human_approval is an agent-flow concern, not a per-action property',
      body: 'The same write capability is ungated when a human calls it and gated when an agent proposes it. The gate lives with whichever agent initiates the change (the sidekick first).',
    },
    {
      date: '2026-07-13T12:00:00.000Z',
      title: 'Sizing + PR-flow conventions corrected',
      body: 'Size by separability of value, not line count — combine homogeneous/sequential/unconsumed-until-complete work. Only feature-level docs PRs (claim + close-out); task PRs are pure code.',
    },
    {
      date: '2026-07-10T11:00:00.000Z',
      title: 'Sidekick topology: one agent per project',
      body: 'Per-project restricted knowledge is Sunrise’s per-agent seam shape; a hub-wide sidekick is an additive later variant.',
    },
    {
      date: '2026-07-10T10:30:00.000Z',
      title: 'No AiKnowledgeCategory; project RAG is tag-based',
      body: 'Replace Project.knowledgeCategoryId with knowledgeTagId + sidekickAgentId; scope via KnowledgeTag + the knowledge-access-contributors seam.',
    },
    {
      date: '2026-07-10T10:00:00.000Z',
      title: 'Pure leaf fork; zero upstream gating',
      body: 'The Hub builds entirely through existing fork-owned lib/app/* seams — no core→fork seam, no Sunrise PR blocks the fork.',
    },
  ];
}
