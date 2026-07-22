/**
 * Cutover — the Hub's own build plan as structured data (f-selfhost-cutover §19 t-2).
 *
 * This is the successor to the `006-sample-plan` seed: where that seed was a dev
 * *stand-in*, this is the **real, authoritative record** of building the Hub —
 * all 19 features at their true statuses, shipped features carrying their real
 * `merged` tasks + PR URLs, ready to be materialised into the Hub as its own
 * system of record (self-hosting §5 path C). `snapshot.ts` assembles this + the
 * backdated history (`history-data.ts`) into a `ProjectTransfer`; `import-plan`
 * loads it through the shipped `importProject` (§19 t-1).
 *
 * The frozen `.context/app/planning/plan.md` + `<feature>.md` remain the full
 * archive of the *thinking*; this holds the *outcome* (self-hosting §7). Event
 * bodies are therefore concise summaries, not the full work-completed prose.
 */

import type { FeaturePlanningStage, FeatureStatus, TaskStatus } from '@prisma/client';

/** Deterministic, cuid-shaped stable id (`c` + no hyphens) so materialised rows
 * pass the `z.cuid()` route guards while staying idempotent across re-imports.
 * Shared with `snapshot.ts` + `history-data.ts`. */
export const cid = (...parts: (string | number)[]): string =>
  'c' + parts.join('').replace(/-/g, '').toLowerCase();

export const featureId = (slug: string): string => cid('feat', slug);
export const taskId = (slug: string, index: number): string => cid('task', slug, index);
export const featureDepId = (slug: string, dep: string): string => cid('fdep', slug, dep);
export const indicativeId = (slug: string, index: number): string => cid('ind', slug, index);

/** The Hub's own project — reuses the `006` sample-project id so `import-plan`
 * *upgrades the seeded project in place* (no duplicate; the retired seed's id is
 * now owned by the real record). */
export const CUTOVER_PROJECT = {
  id: cid('hubproject'),
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
  /** The build opened (plan.md `opened`); the project's createdAt. */
  createdAt: '2026-07-10T09:00:00.000Z',
} as const;

const PR = (n: number): string => `https://github.com/human-centric-engineering/hce-hub/pull/${n}`;

export interface CutoverTask {
  title: string;
  status: TaskStatus;
  /** Set for `merged` tasks — the PR that delivered it. */
  prUrl?: string;
}
export interface CutoverFeature {
  slug: string;
  title: string;
  description: string;
  status: FeatureStatus;
  dependsOn: string[];
  /** ISO — when the feature entered the plan (owner claim / plan add). */
  createdAt: string;
  /** ISO — when it shipped (drives the `feature_shipped` event); shipped only. */
  shippedAt?: string;
  /** Real merged tasks (shipped features) or in-flight/backlog tasks. */
  tasks: CutoverTask[];
  /** The high-level sketch — for features not yet planned (indicative stage). */
  indicativeTasks?: string[];
  /** Definition of done (a subset of the plan's `*Done when:*`). */
  doneWhen?: string;
  /** Curated top-level cross-refs (rendered as ref-chips). */
  references?: { label: string; target: string }[];
  /** Unowned = a backlog item available to claim (owner resolves to null). */
  unowned?: boolean;
  helpWanted?: boolean;
  planningStage?: FeaturePlanningStage;
}

/** A shipped feature: `merged` tasks are its real PRs. */
function shipped(
  slug: string,
  title: string,
  description: string,
  dependsOn: string[],
  createdAt: string,
  shippedAt: string,
  prs: [string, number][],
  extra: Partial<CutoverFeature> = {}
): CutoverFeature {
  return {
    slug,
    title,
    description,
    status: 'shipped',
    dependsOn,
    createdAt,
    shippedAt,
    tasks: prs.map(([t, n]) => ({ title: t, status: 'merged', prUrl: PR(n) })),
    ...extra,
  };
}

const OPENED = CUTOVER_PROJECT.createdAt;

/** Pure — the 19 features of the v1 build at their real statuses. Unit-tested;
 * `snapshot.ts` turns it into a `ProjectTransfer`. */
export function buildCutoverPlan(): CutoverFeature[] {
  return [
    shipped(
      'f-fork',
      'Fork + brand + auth-only shell',
      'Fork Sunrise, apply HCE Hub branding, and stand up the auth-only shell everything else builds on.',
      [],
      OPENED,
      '2026-07-11T12:00:00.000Z',
      [
        ['Fork branding + identity', 4],
        ['Auth-only shell + brand identity', 6],
      ]
    ),
    shipped(
      'f-theme',
      'HCE Hub base theme',
      'The warm/dim consumer token layer and fonts that give the Hub its calm, glanceable look.',
      ['f-fork'],
      OPENED,
      '2026-07-14T12:00:00.000Z',
      [['Warm/dim token layer + fonts + "H" brand-mark', 28]]
    ),
    shipped(
      'f-data-model',
      'Prisma models + scaffolding',
      'The project/feature/task domain schema (plus futures scaffolding) — the spine the whole Hub reads and writes.',
      ['f-fork'],
      OPENED,
      '2026-07-13T12:00:00.000Z',
      [
        ['Project domain schema', 13],
        ['Task domain schema', 16],
        ['Futures scaffolding', 17],
      ]
    ),
    shipped(
      'f-access',
      'Project-membership access control',
      'The 404-not-403 membership funnel every project-scoped read and write gates through.',
      ['f-data-model'],
      OPENED,
      '2026-07-13T18:00:00.000Z',
      [['Membership authz funnel', 20]]
    ),
    shipped(
      'f-hub-capabilities',
      'Hub tools + MCP exposure',
      'The agent-callable coordination tools (next_task, create/claim tools) exposed over MCP.',
      ['f-data-model', 'f-access'],
      OPENED,
      '2026-07-14T18:00:00.000Z',
      [
        ['Read pipeline + next_task', 23],
        ['Write tools', 24],
        ['claim_task + soft collision', 25],
      ]
    ),
    shipped(
      'f-project-admin',
      'Project + member CRUD (admin)',
      'Admin surface to create projects and manage members, with the lead-has-a-member-row invariant enforced.',
      ['f-access'],
      OPENED,
      '2026-07-15T10:00:00.000Z',
      [
        ['Admin API + invariant service', 36],
        ['Admin UI + admin-nav seam', 37],
      ]
    ),
    shipped(
      'f-shell',
      'Module-composable app shell',
      'The three-column Hub shell — nav, topbar, and a module registry so new surfaces slot in without shell edits.',
      ['f-theme', 'f-access'],
      OPENED,
      '2026-07-15T11:00:00.000Z',
      [
        ['Shell skeleton + Hub Home', 32],
        ['Navigation + module registry', 33],
      ]
    ),
    shipped(
      'f-projects',
      'Projects list + project-view scaffold',
      'The member-facing projects list and the project view shell the Plan, Board, and Log tabs hang off.',
      ['f-shell', 'f-project-admin'],
      OPENED,
      '2026-07-15T14:00:00.000Z',
      [
        ['Consumer projects read API', 40],
        ['Projects UI + sample-data seed', 41],
      ],
      {
        doneWhen: 'A member sees their projects and opens one; a non-member gets a 404.',
        references: [{ label: 'v1-requirements §08', target: 'v1-requirements#08' }],
      }
    ),
    shipped(
      'f-plan-view',
      'Feature-level Plan view',
      'The project’s features in optimal working order, each expandable to its task table.',
      ['f-projects', 'f-hub-capabilities'],
      OPENED,
      '2026-07-15T16:00:00.000Z',
      [
        ['planOrder() + enriched plan read API', 44],
        ['Plan view UI', 45],
      ]
    ),
    shipped(
      'f-board-view',
      'Board (Kanban)',
      'Tasks routed into member lanes × effective-status columns — the who’s-on-what glance.',
      ['f-projects', 'f-hub-capabilities'],
      OPENED,
      '2026-07-15T18:00:00.000Z',
      [
        ['Board routing + collision API', 48],
        ['Board grid UI', 49],
      ]
    ),
    shipped(
      'f-task-sheet',
      'Task detail side sheet',
      'A deep-linkable sheet for one task — its detail, dependency graph, and claim action.',
      ['f-plan-view', 'f-hub-capabilities'],
      OPENED,
      '2026-07-16T14:00:00.000Z',
      [
        ['One-task detail read', 55],
        ['Sheet shell + deep-link + reposition', 56],
        ['Content + claim actions', 57],
      ],
      { doneWhen: 'A task opens in a deep-linkable sheet; a cross-project id 404s.' }
    ),
    shipped(
      'f-refs',
      'Human refs (feature slug + task number)',
      'Feature slugs (f-mcp) and project-wide task numbers (t-N) — the human handles the design and studio language rely on.',
      ['f-data-model', 'f-plan-view', 'f-board-view'],
      '2026-07-15T09:00:00.000Z',
      '2026-07-15T20:00:00.000Z',
      [
        ['Schema + counter + seed backfill', 51],
        ['Read + UI ref retrofit', 52],
      ]
    ),
    shipped(
      'f-journal',
      'Project event / journal stream',
      'One append-only ProjectEvent stream — the Hub’s own consumer-facing event source that every "log" surface is a view of.',
      ['f-data-model', 'f-hub-capabilities'],
      '2026-07-17T09:00:00.000Z',
      '2026-07-17T18:00:00.000Z',
      [
        ['ProjectEvent substrate + transactional writer', 61],
        ['Authored verbs (record_decision / add_note)', 62],
        ['Reads + Log UI + §11 timeline', 63],
      ],
      {
        doneWhen:
          'Every Hub state change lands a scoped ProjectEvent; the timelines are live views over the stream.',
        references: [
          { label: 'self-hosting §1', target: 'self-hosting#1' },
          { label: 'f-journal plan', target: 'f-journal' },
        ],
      }
    ),
    shipped(
      'f-feature-planning',
      'Feature lifecycle + indicative vs planned tasks',
      'Claim features, not tasks: indicative sketches vs planned Task rows, the lifecycle verbs, and the feature page.',
      ['f-journal', 'f-plan-view'],
      '2026-07-17T10:00:00.000Z',
      '2026-07-21T18:00:00.000Z',
      [
        ['Schema + lifecycle verbs + assertAcyclic', 66],
        ['Indicative/planned Plan + feature page', 67],
        ['Claim a feature in the UI', 72],
      ],
      {
        doneWhen:
          'A feature can be authored, claimed, planned, and shipped over MCP (claim also from the UI); a cyclic dep is rejected.',
        references: [{ label: 'self-hosting §2–§4', target: 'self-hosting#2' }],
      }
    ),
    // §19 — in flight: t-1 merged (#75), t-2 in progress, t-3 backlog.
    {
      slug: 'f-selfhost-cutover',
      title: 'Import plan.md → Hub; the Hub becomes its own system of record',
      description:
        'The dogfood switch: a durable export/import round-trip + a backdated cutover load that materialises this build into the Hub, then the docs-PR flow retires.',
      status: 'in_flight',
      planningStage: 'planned',
      dependsOn: ['f-feature-planning', 'f-projects'],
      createdAt: '2026-07-21T20:00:00.000Z',
      doneWhen:
        'Opening the Hub shows this build as a live, complete project; export→import round-trips; the docs-PR flow is retired.',
      references: [{ label: 'self-hosting §5', target: 'self-hosting#5' }],
      tasks: [
        { title: 'Project transfer mechanism (export/import)', status: 'merged', prUrl: PR(75) },
        { title: 'Backdated cutover load + retire the sample seed', status: 'claimed' },
        { title: 'Project slugs (f-project-slugs, folded in)', status: 'backlog' },
      ],
    },
    // §12–§15 — the AI layer, delivered *in* the Hub after the cutover; unclaimed.
    {
      slug: 'f-sidekick',
      title: 'Per-project sidekick agent + chat',
      description:
        'A per-project assistant you can ask about the plan, wired to the project’s context and knowledge.',
      status: 'planning',
      dependsOn: ['f-hub-capabilities', 'f-shell'],
      createdAt: OPENED,
      unowned: true,
      doneWhen: 'Each project has a sidekick you can chat with about its plan.',
      indicativeTasks: [
        'Per-project agent config + binding',
        'Streaming chat surface in the shell',
        'Sidekick context read (plan + board snapshot)',
      ],
      tasks: [],
    },
    {
      slug: 'f-intake',
      title: 'Intake workflow + UI',
      description: 'Turn a raw idea into a structured, triaged feature ready to sit on the plan.',
      status: 'planning',
      dependsOn: ['f-sidekick', 'f-projects'],
      createdAt: OPENED,
      unowned: true,
      indicativeTasks: [
        'Intake capability (idea → structured feature)',
        'Triage workflow (dedupe, route, size)',
        'Intake UI + review queue',
      ],
      tasks: [],
    },
    {
      slug: 'f-github-sync',
      title: 'GitHub PR integration + reconcile',
      description:
        'Link tasks to their PRs and reconcile merge state back onto the board — an unclaimed backlog item.',
      status: 'planning',
      dependsOn: ['f-hub-capabilities'],
      createdAt: OPENED,
      unowned: true,
      helpWanted: true,
      indicativeTasks: [
        'link_pr / complete_task capabilities',
        'Webhook receiver + merge reconcile',
        'PR status on the task sheet + board',
      ],
      tasks: [],
    },
    {
      slug: 'f-morning-brief',
      title: 'Scheduled per-user brief',
      description:
        'A scheduled per-user digest of what advanced and what needs attention — blocked pending scheduling.',
      status: 'blocked',
      dependsOn: ['f-hub-capabilities', 'f-shell'],
      createdAt: OPENED,
      unowned: true,
      indicativeTasks: [
        'Brief content builder (per-user rollup)',
        'Schedule + delivery channel',
        'Brief surface in the shell',
      ],
      tasks: [],
    },
  ];
}
