/**
 * Cutover — the Hub's own build plan as structured data (f-selfhost-cutover §19 t-2).
 *
 * This is the successor to the `006-sample-plan` seed: where that seed was a dev
 * *stand-in*, this is the **real, authoritative record** of building the Hub —
 * all 19 features at their true statuses, every shipped task carrying its real
 * title, description, done-when, files-in-scope, and PR URL (pulled across from
 * the `<feature>.md` task tables — the Hub is the system of record, so the detail
 * lives here, not only in the frozen markdown). `snapshot.ts` assembles this +
 * the backdated history (`history-data.ts`) into a `ProjectTransfer`;
 * `import-plan` loads it through the shipped `importProject` (§19 t-1).
 *
 * What stays in the frozen markdown (self-hosting §7 declared non-goals): the
 * reconciliation narrative, test strategy, and open-questions workspace — the
 * *thinking*, not the record. This holds the record: features, tasks, deps,
 * decisions.
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
  /** Full detail shown in the task sheet + feature page. */
  description?: string;
  /** The task's acceptance contract (the plan tables' Done-when cell). */
  doneWhen?: string;
  /** Files-in-scope — the soft-collision hint (declared, not enforced). */
  files?: string[];
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
  /** Real tasks (shipped = merged w/ PR; born claimed → active otherwise). */
  tasks: CutoverTask[];
  /** The high-level sketch — for features not yet planned (indicative stage). */
  indicativeTasks?: string[];
  /** Definition of done (the plan's `*Done when:*`). */
  doneWhen?: string;
  /** Curated top-level cross-refs (rendered as ref-chips). */
  references?: { label: string; target: string }[];
  /** Unowned = an unclaimed feature, available to claim (owner resolves to null). */
  unowned?: boolean;
  helpWanted?: boolean;
  planningStage?: FeaturePlanningStage;
}

/** A merged task — its real PR + the detail pulled from the feature doc. */
function merged(
  title: string,
  pr: number,
  description: string,
  doneWhen: string,
  files: string[]
): CutoverTask {
  return { title, status: 'merged', description, doneWhen, files, prUrl: PR(pr) };
}

const OPENED = CUTOVER_PROJECT.createdAt;
const ref = (label: string, target: string): { label: string; target: string } => ({
  label,
  target,
});

/** Pure — the 19 features of the v1 build at their real statuses, with the full
 * per-task detail pulled across from the `<feature>.md` task tables. */
export function buildCutoverPlan(): CutoverFeature[] {
  return [
    {
      slug: 'f-fork',
      title: 'Fork + brand + auth-only shell',
      description:
        'Fork Sunrise, apply HCE Hub branding, and stand up the auth-only shell everything else builds on.',
      status: 'shipped',
      dependsOn: [],
      createdAt: OPENED,
      shippedAt: '2026-07-11T12:00:00.000Z',
      doneWhen:
        'The fork boots as a branded, signed-in-only Sunrise app with the marketing surfaces stripped.',
      references: [
        ref('v1-requirements §13.1', 'v1-requirements#13.1'),
        ref('CUSTOMIZATION §6', 'CUSTOMIZATION'),
      ],
      tasks: [
        merged(
          'Fork branding + identity',
          4,
          'Established the HCE Hub identity — package name/version/author/repo, the NEXT_PUBLIC_APP_NAME + legal-name env, the CLAUDE.md fork banner, README, and the .context/app docs namespace.',
          'package.json + brand env read "HCE Hub"; the fork banner and .context/app namespace exist; no platform-owned files changed.',
          ['package.json', 'README.md', '.context/app/README.md', 'CLAUDE.md']
        ),
        merged(
          'Auth-only shell + strip marketing',
          6,
          'Deleted the marketing About page, redirected the public landing to the dashboard, curated the public-nav to drop marketing links while keeping the legal cluster, trimmed the sitemap, and put every route behind login.',
          'Signed-out users hit /login from every route; no marketing landing or About; /privacy and /contact still resolve; the lib/app boundary is green; gates green.',
          [
            'app/(public)/page.tsx',
            'app/(public)/about/',
            'lib/app/public-nav.ts',
            'app/sitemap.ts',
            'tests/unit/components/layouts/public-nav.test.tsx',
          ]
        ),
      ],
    },
    {
      slug: 'f-theme',
      title: 'HCE Hub base theme',
      description:
        'The warm/dim consumer token layer and fonts that give the Hub its calm, glanceable look.',
      status: 'shipped',
      dependsOn: ['f-fork'],
      createdAt: OPENED,
      shippedAt: '2026-07-14T12:00:00.000Z',
      doneWhen:
        'Consumer surfaces render warm/dim, self-hosted fonts load, shadcn primitives inherit the tokens, and the "H" brand-mark renders — with /admin unchanged.',
      references: [
        ref('design handoff — tokens', 'design_handoff_hce_hub/README'),
        ref('v1-requirements §13.5', 'v1-requirements#13.5'),
      ],
      tasks: [
        merged(
          'Warm/dim token layer + fonts + "H" brand-mark',
          28,
          'Filled the fork-owned brand-theme.css with a warm/dim token layer that remaps the shadcn semantic tokens and adds Hub-native tokens, self-hosted Inter Tight + JetBrains Mono, and rendered the "H" brand-mark — with zero platform-file edits via the data-surface seam.',
          'Consumer surfaces render warm (light) + dim (dark) with /admin unchanged; both fonts load from self with no CSP violation; primitives inherit the tokens with no component edit; the brand-mark renders with BRAND.name as its accessible name; gates green.',
          [
            'app/brand-theme.css',
            'public/fonts/',
            'components/brand/brand-mark.tsx',
            'tests/unit/components/brand/brand-mark.test.tsx',
          ]
        ),
      ],
    },
    {
      slug: 'f-data-model',
      title: 'Prisma models + scaffolding',
      description:
        'The project/feature/task domain schema (plus futures scaffolding) — the spine the whole Hub reads and writes.',
      status: 'shipped',
      dependsOn: ['f-fork'],
      createdAt: OPENED,
      shippedAt: '2026-07-13T12:00:00.000Z',
      doneWhen:
        'The coordination + futures Prisma models, migrations, and drift probes apply clean on a fresh db:reset with drift-check green.',
      references: [
        ref('v1-requirements §10', 'v1-requirements#10'),
        ref('CUSTOMIZATION §5 — satellite FK', 'CUSTOMIZATION'),
      ],
      tasks: [
        merged(
          'Project-domain schema',
          13,
          'Added Project, ProjectMember, Feature and FeatureDependency with their status enums, hand-written satellite FKs to user with GDPR-correct ON DELETE actions, drift probes, and the additive migration.',
          'Migration applies clean on a fresh db:reset; drift-check green asserting every FK + its ON DELETE; eraseUser nulls leadUserId/ownerUserId and deletes memberships; no spurious DROP INDEX; gates green.',
          ['prisma/schema/app.prisma', 'prisma/migrations/', 'lib/app/db-drift.ts']
        ),
        merged(
          'Task-domain schema',
          16,
          'Added the Task model with its data-status enum and filesScope, plus TaskDependency and TaskClaim soft-collision history, with hand-FKs, drift probes, and the additive migration.',
          'Migration applies clean; drift-check green; eraseUser nulls claimedByUserId and deletes TaskClaims; no spurious drops; gates green.',
          ['prisma/schema/app.prisma', 'prisma/migrations/', 'lib/app/db-drift.ts']
        ),
        merged(
          'Futures scaffolding',
          17,
          'Added the additive, unconsumed-in-v1 Sprint, FocusDirective and Phase models plus a nullable Feature.phaseId, with hand-FKs, drift probes, and the migration.',
          'Migration applies clean; drift-check green; no v1 code references these; no spurious drops; gates green.',
          ['prisma/schema/app.prisma', 'prisma/migrations/', 'lib/app/db-drift.ts']
        ),
      ],
    },
    {
      slug: 'f-access',
      title: 'Project-membership access control',
      description:
        'The 404-not-403 membership funnel every project-scoped read and write gates through.',
      status: 'shipped',
      dependsOn: ['f-data-model'],
      createdAt: OPENED,
      shippedAt: '2026-07-13T18:00:00.000Z',
      doneWhen:
        'Membership is the only way project data is reached; a non-member deny is indistinguishable from not-found (404, never 403).',
      references: [
        ref('v1-requirements §3', 'v1-requirements#3'),
        ref('CUSTOMIZATION §4 — protected-routes', 'CUSTOMIZATION'),
      ],
      tasks: [
        merged(
          'Membership authz funnel',
          20,
          'Built lib/projects/access.ts with canAccessProject and the membership-scoped funnel primitives every consumer routes through, and registered /projects in the fork protected-routes seam.',
          'A member sees only their projects; a non-member deny equals 404 never 403; a lead resolves basis "lead"; a project with no membership row is indistinguishable from a missing one; /projects edge-redirects to login when signed out; gates green.',
          [
            'lib/projects/access.ts',
            'lib/projects/index.ts',
            'lib/app/protected-routes.ts',
            'tests/unit/lib/projects/access.test.ts',
          ]
        ),
      ],
    },
    {
      slug: 'f-hub-capabilities',
      title: 'Hub tools + MCP exposure',
      description:
        'The agent-callable coordination tools (next_task, create/claim tools) exposed over MCP.',
      status: 'shipped',
      dependsOn: ['f-data-model', 'f-access'],
      createdAt: OPENED,
      shippedAt: '2026-07-14T18:00:00.000Z',
      doneWhen:
        'The Hub read/write operations dispatch as membership-scoped Sunrise capabilities reachable over MCP.',
      references: [
        ref('v1-requirements §11', 'v1-requirements#11'),
        ref('v1-requirements §5', 'v1-requirements#5'),
      ],
      tasks: [
        merged(
          'Read pipeline + next_task',
          23,
          'Wired the fork capability seam, mirrored the built-in seed path to seed the tools’ AiCapability + McpExposedTool rows, shipped the next_task read capability with effective-status + membership scoping, and provisioned a per-developer MCP key + guide.',
          'next_task returns the correct unblocked membership-scoped task (PR-blocked skip + null-claimant handling); dispatch works end-to-end and the tool is MCP-visible with a scoped smcp_ key; the seed is idempotent; gates green.',
          [
            'lib/app/capabilities.ts',
            'lib/projects/capabilities/next-task.ts',
            'lib/projects/task-status.ts',
            '.context/app/mcp-claude-code.md',
          ]
        ),
        merged(
          'Write tools',
          24,
          'Shipped create_task, add_backlog and flag_help_wanted, each membership-gated through the shared feature-access funnel, PII-redacting on free-text, and audit-logged, with their seed rows + MCP exposure.',
          'Each write is membership-gated and audited; create_task rejects out-of-scope or absent deps; free-text tools redact provenance so registration doesn’t throw; gates green.',
          [
            'lib/projects/capabilities/create-task.ts',
            'lib/projects/capabilities/add-backlog.ts',
            'lib/projects/capabilities/flag-help-wanted.ts',
            'lib/projects/access.ts',
          ]
        ),
        merged(
          'claim_task + soft collision',
          25,
          'Shipped claim_task, which marks a task claimed with a TaskClaim row and returns soft file-overlap collision warnings from open claims — never a hard lock.',
          'claim writes a TaskClaim and flips status; overlapping in-flight claims surface as soft warnings and never block; a released or erased claimant doesn’t wedge the task; gates green.',
          ['lib/projects/capabilities/claim-task.ts', 'lib/projects/collision.ts']
        ),
      ],
    },
    {
      slug: 'f-project-admin',
      title: 'Project + member CRUD (admin)',
      description:
        'Admin surface to create projects and manage members, with the lead-has-a-member-row invariant enforced.',
      status: 'shipped',
      dependsOn: ['f-access'],
      createdAt: OPENED,
      shippedAt: '2026-07-15T10:00:00.000Z',
      doneWhen:
        'An admin creates and manages projects, members, roles, host platform and a knowledge tag inside the Sunrise admin shell, with the lead-has-member-row invariant held.',
      references: [
        ref('v1-requirements §13.2', 'v1-requirements#13.2'),
        ref('v1-requirements §7', 'v1-requirements#7'),
      ],
      tasks: [
        merged(
          'Admin API + invariant service',
          36,
          'Built the transactional admin.ts service that creates a project with its lead member row + per-project knowledge tag atomically, manages members/roles preserving the lead invariant, plus the withAdminAuth CRUD routes with Zod + audit logging.',
          'Creating a project makes the project, lead row and knowledge tag atomically; the lead is immediately resolvable by canAccessProject; reassigning the lead moves the row; removing the current lead is refused; hostPlatform rejects unknown slugs; every write is audit-logged; gates green.',
          [
            'lib/projects/admin.ts',
            'lib/projects/host-platforms.ts',
            'lib/validations/project-admin.ts',
            'app/api/v1/admin/projects/',
          ]
        ),
        merged(
          'Admin UI + admin-nav seam',
          37,
          'Built the admin project list/create/edit pages with member management and a KB link, registered the Projects admin-nav section via the fork seam, and adapted the Sunrise admin-nav default test.',
          'An admin sees a Projects section, lists/creates a project with lead, members, platform and tag, edits members/roles/status, and reaches the KB uploader; pages fetch via the API with no direct Prisma; the HB2 default test is adapted; gates green.',
          [
            'lib/app/admin-nav.ts',
            'app/admin/projects/',
            'components/admin/projects/',
            'tests/unit/lib/app/defaults.test.ts',
          ]
        ),
      ],
    },
    {
      slug: 'f-shell',
      title: 'Module-composable app shell',
      description:
        'The three-column Hub shell — nav, topbar, and a module registry so new surfaces slot in without shell edits.',
      status: 'shipped',
      dependsOn: ['f-theme', 'f-access'],
      createdAt: OPENED,
      shippedAt: '2026-07-15T11:00:00.000Z',
      doneWhen:
        'The three-column Hub shell renders with a composable module registry, so adding a module is a mount-addition, never a shell refactor.',
      references: [
        ref('design handoff — shell', 'design_handoff_hce_hub/README'),
        ref('v1-requirements §14 Q2', 'v1-requirements#14'),
      ],
      tasks: [
        merged(
          'Shell skeleton + Hub Home',
          32,
          'Built the (hub) route group + layout with the three-column grid, the group-level session auth guard, reclaimed / from the f-fork shim, repointed post-login landing to /, and shipped Hub Home.',
          'Signed-out / redirects to /login; signed-in / renders Hub Home in the warm three-column shell; direct login lands on /; the sidekick slot toggles two-to-three columns; /admin + account pages unchanged; gates green.',
          [
            'app/(hub)/layout.tsx',
            'app/(hub)/page.tsx',
            'components/hub/hub-shell.tsx',
            'components/forms/login-form.tsx',
            'proxy.ts',
          ]
        ),
        merged(
          'Navigation + module registry',
          33,
          'Built the fork-owned hub-modules registry and the sidebar, topbar with route-derived breadcrumbs + controls, the sidekick-column placeholder, and a minimal /projects placeholder.',
          'The Modules nav renders from the registry (Projects active, others stubbed); a throwaway stub module surfaces with no shell edit; breadcrumbs derive from the route; the ⌘K trigger, bell and sidekick toggle are present; gates green.',
          [
            'lib/app/hub-modules.ts',
            'components/hub/sidebar.tsx',
            'components/hub/topbar.tsx',
            'components/hub/sidekick-column.tsx',
            'app/(hub)/projects/page.tsx',
          ]
        ),
      ],
    },
    {
      slug: 'f-projects',
      title: 'Projects list + project-view scaffold',
      description:
        'The member-facing projects list and the project view shell the Plan, Board, and Log tabs hang off.',
      status: 'shipped',
      dependsOn: ['f-shell', 'f-project-admin'],
      createdAt: OPENED,
      shippedAt: '2026-07-15T14:00:00.000Z',
      doneWhen:
        'A member sees and opens only their own projects at /projects through the access funnel, with a sample-data seed materialising the real Hub board.',
      references: [
        ref('v1-requirements §13.1', 'v1-requirements#13.1'),
        ref('design handoff — Projects', 'design_handoff_hce_hub/README'),
      ],
      tasks: [
        merged(
          'Consumer projects read API',
          40,
          'Built the membership-scoped consumer read API (GET /api/v1/projects list + /[id] detail) through the access funnel with deny-equals-404, backed by the fork consumer.ts enrich service.',
          'A member’s list returns only their projects; a non-member gets 404 never 403 on /[id]; an unknown id is indistinguishable from a non-member; counts are correct; withAuth 401s the signed-out; gates green.',
          [
            'lib/projects/consumer.ts',
            'app/api/v1/projects/route.ts',
            'app/api/v1/projects/[id]/route.ts',
            'tests/unit/lib/projects/consumer.test.ts',
          ]
        ),
        merged(
          'Projects UI + sample-data seed',
          41,
          'Replaced the placeholder with the membership-scoped project card grid + the project-view container with linkable Plan/Board tabs, and added the prod-safe sample-plan seed plus the dev-only demo-collaborators seed.',
          'A member sees only their projects as cards; opening one lands on the default Plan tab; the seeded Hub project renders with real counts; the demo-collaborators seed shows a multi-member stack on dev while the prod gate early-returns; db:seed is idempotent; gates green.',
          [
            'app/(hub)/projects/page.tsx',
            'app/(hub)/projects/[id]/page.tsx',
            'components/hub/projects/',
            'prisma/seeds/app/',
          ]
        ),
      ],
    },
    {
      slug: 'f-plan-view',
      title: 'Feature-level Plan view',
      description:
        'The project’s features in optimal working order, each expandable to its task table.',
      status: 'shipped',
      dependsOn: ['f-projects', 'f-hub-capabilities'],
      createdAt: OPENED,
      shippedAt: '2026-07-15T16:00:00.000Z',
      doneWhen:
        'A project’s features render in topological plan order, each expanding to its task table, as advisory display — never enforced.',
      references: [
        ref('v1-requirements §3.5', 'v1-requirements#3.5'),
        ref('design handoff — Plan', 'design_handoff_hce_hub/README'),
      ],
      tasks: [
        merged(
          'planOrder() + enriched plan read API',
          44,
          'Built the pure cycle-tolerant planOrder topological sort, the getProjectPlan loader (funnel-scoped, per-task effective status, per-feature progress, batched user refs), and the GET /plan endpoint.',
          'Features return in topological plan order (status band → depth), cycle-tolerant so a back-edge doesn’t loop or throw; a non-member gets 404 never 403; task effective statuses match computeEffectiveStatus; null owner/claimer don’t crash; gates green.',
          [
            'lib/projects/plan-order.ts',
            'lib/projects/plan.ts',
            'app/api/v1/projects/[id]/plan/route.ts',
            'tests/unit/lib/projects/plan.test.ts',
          ]
        ),
        merged(
          'Plan view UI',
          45,
          'Filled the container’s Plan branch with a client PlanView — a summary line, feature rows with dependency chips, owner avatars, status pills with progress bars, and expandable inset task tables showing effective status.',
          'Opening a project lands on the Plan tab rendering its real features in plan order; rows expand to their task table with correct effective-status pills; ordering is visibly advisory; null owner/claimer render as unassigned; owner browser-validates; gates green.',
          [
            'components/hub/projects/plan/',
            'components/hub/projects/project-view.tsx',
            'app/(hub)/projects/[id]/page.tsx',
          ]
        ),
      ],
    },
    {
      slug: 'f-board-view',
      title: 'Board (Kanban)',
      description:
        'Tasks routed into member lanes × effective-status columns — the who’s-on-what glance.',
      status: 'shipped',
      dependsOn: ['f-projects', 'f-hub-capabilities'],
      createdAt: OPENED,
      shippedAt: '2026-07-15T18:00:00.000Z',
      doneWhen:
        'The Board renders member swim lanes by effective-status columns with pull-not-push claiming and ambient soft-collision markers.',
      references: [
        ref('v1-requirements §5', 'v1-requirements#5'),
        ref('design handoff — Board', 'design_handoff_hce_hub/README'),
      ],
      tasks: [
        merged(
          'Board routing + collision API',
          48,
          'Built the getProjectBoard loader that routes each task to a member lane (claimer ?? owner; orphans to an Unassigned lane) and an effective-status column, computes column totals + per-task file-overlap collision flags, plus the GET /board endpoint.',
          'Tasks route to the right lane + column by effective status; a null-claimant claimed task lands in its owner’s Available and is re-pullable; an orphaned/non-member-owned task lands in Unassigned with no crash; totals match the cells; overlapping open claims flag both; a non-member gets 404; gates green.',
          [
            'lib/projects/board.ts',
            'app/api/v1/projects/[id]/board/route.ts',
            'tests/unit/lib/projects/board.test.ts',
          ]
        ),
        merged(
          'Board grid UI',
          49,
          'Filled the container’s Board branch with a BoardView — the header row, per-member swim lanes plus the dashed Unassigned lane, and task cards with claimer avatars, ambient collision markers, sanitized PR links and is-mine highlighting.',
          'Opening a project on view=board renders member lanes by status columns; a claimed task sits in its claimer’s Claimed column, an unclaimed one in its owner’s lane; deps-blocked → Backlog; is-mine highlighted; a collision shows the marker; null refs render unassigned; owner browser-validates; gates green.',
          ['components/hub/projects/board/', 'components/hub/projects/project-view.tsx']
        ),
      ],
    },
    {
      slug: 'f-task-sheet',
      title: 'Task detail side sheet',
      description:
        'A deep-linkable sheet for one task — its detail, dependency graph, and claim action.',
      status: 'shipped',
      dependsOn: ['f-plan-view', 'f-hub-capabilities'],
      createdAt: OPENED,
      shippedAt: '2026-07-16T14:00:00.000Z',
      doneWhen:
        'A deep-linkable task side sheet opens from Plan or Board, repositions left of the sidekick, and wires the ungated write actions.',
      references: [
        ref('v1-requirements §5', 'v1-requirements#5'),
        ref('design handoff — task sheet', 'design_handoff_hce_hub/README'),
      ],
      tasks: [
        merged(
          'One-task detail read',
          55,
          'Built getTaskDetail + GET /tasks/[taskId] returning one task’s full detail (effective status, real files + description, sanitized PR, blocked-by/blocks edges) through the funnel, with cross-project id-swap guarded.',
          'A member gets one task’s full detail with effective status, real files/description and dep edges; a non-member, unknown or cross-project id gives 404 never 403; a null claimer doesn’t deref; gates green.',
          [
            'lib/projects/task-detail.ts',
            'app/api/v1/projects/[id]/tasks/[taskId]/route.ts',
            'tests/unit/lib/projects/task-detail.test.ts',
          ]
        ),
        merged(
          'Sheet shell + deep-link + reposition',
          56,
          'Built the client TaskSheetHost reading ?task= (open/close/Esc/scrim/copy-link, skeleton→content fetch), repositioned the sheet beside the sidekick via a fork SidekickContext, wired the Plan-row + Board-card open triggers, and fixed the Board sticky-header overflow.',
          'Opening a task deep-links ?task= that survives refresh and is shareable; Esc/scrim/copy-link work; the sheet anchors left of the open sidekick; owner browser-validates the deep-link + reposition; gates green.',
          [
            'components/hub/projects/task-sheet/',
            'components/hub/hub-shell.tsx',
            'components/hub/projects/plan/task-row.tsx',
            'components/hub/projects/board/task-card.tsx',
          ]
        ),
        merged(
          'Content + claim actions',
          57,
          'Filled the sheet body with description, files-in-scope, a two-column dependency graph and the action row wired to the shared claimTask service via POST claim (soft warnings, disabled on blocked deps), plus the dialog/disclosure a11y pass.',
          'The sheet renders real description, files and deps; Claim claims via the API and surfaces soft warnings never a lock; blocked-by-deps disables Claim; PR links are sanitized; dialog role + labelled controls + focus-return; owner browser-validates a real claim; gates green.',
          [
            'lib/projects/claim-task-service.ts',
            'app/api/v1/projects/[id]/tasks/[taskId]/claim/route.ts',
            'components/hub/projects/task-sheet/',
            'components/hub/projects/plan/feature-row.tsx',
          ]
        ),
      ],
    },
    {
      slug: 'f-refs',
      title: 'Human refs (feature slug + task number)',
      description:
        'Feature slugs (f-mcp) and project-wide task numbers (t-N) — the human handles the design and studio language rely on.',
      status: 'shipped',
      dependsOn: ['f-data-model', 'f-plan-view', 'f-board-view'],
      createdAt: '2026-07-15T09:00:00.000Z',
      shippedAt: '2026-07-15T20:00:00.000Z',
      doneWhen:
        'Authored feature slugs + stable project-wide task numbers are in the schema, backfilled, assigned at creation, and rendered across Plan and Board.',
      references: [
        ref('design — data refs', 'design_handoff_hce_hub/README'),
        ref('f-data-model', 'f-data-model'),
      ],
      tasks: [
        merged(
          'Schema + counter + seed backfill',
          51,
          'Added Feature.slug (per-project unique), Task.number and Project.taskCounter with an additive migration, assigned numbers via the atomic project-counter bump in create_task/add_backlog, and backfilled the seed.',
          'Migration applies clean + drift-check green; a created task gets the next project number (two concurrent creates get distinct numbers via the atomic counter); the seed populates slugs, numbers and the counter; eraseUser still cascades; gates green.',
          [
            'prisma/schema/app.prisma',
            'prisma/migrations/',
            'lib/projects/capabilities/create-task.ts',
            'lib/projects/capabilities/add-backlog.ts',
          ]
        ),
        merged(
          'Read + UI ref retrofit',
          52,
          'Threaded slug + number through the /plan and /board loaders and DTOs, and updated the Plan/Board UI so feature rows + dep chips show slugs and task rows/cards show the stable t-number, with null fallbacks.',
          'Plan feature rows show the slug and dep-chips show slugs; task rows show the stable t-number; Board cards show slug · t-number; a null slug/number renders the fallback; owner browser-validates both surfaces; gates green.',
          [
            'lib/projects/plan.ts',
            'lib/projects/board.ts',
            'components/hub/projects/plan/',
            'components/hub/projects/board/',
          ]
        ),
      ],
    },
    {
      slug: 'f-journal',
      title: 'Project event / journal stream',
      description:
        'One append-only ProjectEvent stream — the Hub’s own consumer-facing event source that every "log" surface is a view of.',
      status: 'shipped',
      dependsOn: ['f-data-model', 'f-hub-capabilities'],
      createdAt: '2026-07-17T09:00:00.000Z',
      shippedAt: '2026-07-17T18:00:00.000Z',
      doneWhen:
        'One append-only ProjectEvent stream carries auto-events + authored entries, with the task-sheet timeline and a project Log tab reading it.',
      references: [
        ref('self-hosting §1', 'self-hosting#1'),
        ref('f-task-sheet §11', 'f-task-sheet'),
      ],
      tasks: [
        merged(
          'ProjectEvent substrate + transactional writer',
          61,
          'Added the ProjectEvent model (full ProjectEventKind enum) with a satellite-FK migration, and built the shared transactional recordProjectEvent writer emitting auto-events inside the existing create_task/add_backlog/flag_help_wanted/claimTask transactions.',
          'Migration applies clean + drift-check green; a real create/backlog/help-wanted/claim writes a correctly-scoped event in the same transaction (rolled back if the write fails); createdAt is honoured when supplied for §19 backdating; an erased actor SET-NULLs and the event is retained; gates green.',
          [
            'prisma/schema/app.prisma',
            'prisma/migrations/',
            'lib/projects/project-event.ts',
            'lib/projects/claim-task-service.ts',
          ]
        ),
        merged(
          'Authored verbs (record_decision / add_note)',
          62,
          'Built record_decision + add_note writing feature- or project-scoped decision/note events through a shared scope funnel, PII-redacting the free-text body, with seed rows, MCP exposure and class↔seed parity.',
          'A member can record_decision or add_note over MCP, feature- or project-scoped; a non-member gets not_found; the free-text body is redacted on the provenance row; the seed rows make the tools MCP-callable with parity green; gates green.',
          [
            'lib/projects/capabilities/record-decision.ts',
            'lib/projects/capabilities/add-note.ts',
            'lib/app/capabilities.ts',
            'prisma/seeds/app/008-record-decision.ts',
          ]
        ),
        merged(
          'Reads + Log UI + §11 timeline',
          63,
          'Built getProjectEvents + GET /events through the funnel, wired the task-sheet activity timeline to the taskId-scoped read, and added a ?view=log project tab with Decisions + Work-completed filters.',
          'The task sheet shows a real activity timeline with an honest empty state; the Log tab lists events with Decisions + Work filters; a non-member or cross-project id gives 404; a null actor renders "former member"; owner browser-validates claim→event→timeline; gates green.',
          [
            'lib/projects/journal.ts',
            'app/api/v1/projects/[id]/events/route.ts',
            'components/hub/projects/task-sheet/task-sheet.tsx',
            'components/hub/projects/log/',
          ]
        ),
      ],
    },
    {
      slug: 'f-feature-planning',
      title: 'Feature lifecycle + indicative vs planned tasks',
      description:
        'Claim features, not tasks: indicative sketches vs planned Task rows, the lifecycle verbs, and the feature page.',
      status: 'shipped',
      dependsOn: ['f-journal', 'f-plan-view'],
      createdAt: '2026-07-17T10:00:00.000Z',
      shippedAt: '2026-07-21T18:00:00.000Z',
      doneWhen:
        'You claim features, not tasks; indicative sketches become planned tasks at plan time via lifecycle verbs, with a feature page and a cycle guard.',
      references: [ref('self-hosting §2–§4', 'self-hosting#2'), ref('f-journal', 'f-journal')],
      tasks: [
        merged(
          'Schema (fields + IndicativeTask + assignee)',
          66,
          'Added Feature.doneWhen/references/planningStage (+ the FeaturePlanningStage enum), the IndicativeTask model, and Task.assigneeUserId (satellite FK SET NULL) + Task.doneWhen via one additive migration with a drift probe.',
          'Migration applies clean + drift-check green (the probe asserts the FK + its ON DELETE); eraseUser SET-NULLs assigneeUserId; the enum + models generate; no spurious drops; gates green.',
          [
            'prisma/schema/app.prisma',
            'prisma/migrations/',
            'lib/app/db-drift.ts',
            'tests/unit/lib/db/drift-probes.test.ts',
          ]
        ),
        merged(
          'Lifecycle verbs + assertAcyclic',
          66,
          'Built the pure assertAcyclic cycle guard and create_feature/claim_feature/plan_feature/ship_feature (plan_feature creating numbered owner-assigned tasks, validating the batch acyclic, replacing the indicative list, flipping planningStage), each journalled, and resolved the §09 progress→effective-status carry.',
          'A member can author→claim→plan→ship a feature entirely over MCP, each step journalled; plan_feature creates numbered owner-assigned tasks with doneWhen + replaces the sketch + flips planningStage; a cyclic batch is rejected; ship soft-warns never blocks; progress reads by effective status; gates green.',
          [
            'lib/projects/dependency-graph.ts',
            'lib/projects/capabilities/create-feature.ts',
            'lib/projects/capabilities/plan-feature.ts',
            'lib/projects/capabilities/ship-feature.ts',
            'lib/projects/plan.ts',
          ]
        ),
        merged(
          'Indicative/planned Plan + feature page',
          67,
          'Extended getProjectPlan + the Plan rows to render indicative sketches vs planned tasks distinctly, and built getFeatureDetail + GET features/[key] plus a dedicated feature page (description, done-when, refs, tasks, feature-scoped journal).',
          'The Plan shows indicative vs planned at a glance; a feature’s slug/title opens its page at /projects/id/features/slug with honest empty states, no null-owner deref, tasks opening the sheet; a non-member/cross-project/unknown slug gives 404; owner browser-validates the page + a shared link; gates green.',
          [
            'lib/projects/feature-detail.ts',
            'app/api/v1/projects/[id]/features/[key]/route.ts',
            'app/(hub)/projects/[id]/features/[slug]/page.tsx',
            'components/hub/projects/feature-view/',
          ]
        ),
        merged(
          'Claim a feature in the UI',
          72,
          'Extracted a shared claimFeature service, added a consumer POST features/[key]/claim route and a ClaimFeatureButton on the feature page + Plan row, shown only on an unowned unshipped feature.',
          'An unowned feature shows a Claim button; Claim sets owner=caller + status in_flight, journals feature_claimed and refreshes; the funnel gives 404 not 403 and cross-project id-swap is rejected; the capability + route share one service; owner browser-validates the claim; gates green.',
          [
            'lib/projects/claim-feature-service.ts',
            'app/api/v1/projects/[id]/features/[key]/claim/route.ts',
            'components/hub/projects/feature-view/claim-feature-button.tsx',
            'components/hub/projects/plan/feature-row.tsx',
          ]
        ),
      ],
    },
    // §19 — in flight: t-1 merged (#75), t-2 merged (#77), t-3 claimed (next up).
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
        'Importing plan.md makes this build a live Hub project with backdated history, retiring the sample seed and adding durable project-slug URLs.',
      references: [
        ref('self-hosting §5', 'self-hosting#5'),
        ref('lib/orchestration/backup', 'self-hosting'),
      ],
      tasks: [
        merged(
          'Project transfer mechanism (export/import)',
          75,
          'Built lib/projects/transfer — a versioned Zod snapshot of one project’s full graph (preserving ids + createdAt), an upsert importProject → ImportResult that never fabricates users, thin export/import CLIs, and a real-DB round-trip smoke.',
          'export writes a versioned JSON of the whole graph; import upserts it and round-trips identically (ids + createdAt preserved); an unresolved member is a warning not a fabricated user; a version mismatch is rejected; a real-DB smoke proves fidelity; gates green.',
          [
            'lib/projects/transfer/',
            'scripts/app/project-export.ts',
            'scripts/app/project-import.ts',
            'tests/unit/lib/projects/transfer/',
          ]
        ),
        {
          title: 'Backdated cutover load + retire the sample seed',
          status: 'merged',
          prUrl: PR(77),
          description:
            'Move the sample-plan builder into a cutover module enriched with the real per-task detail + a backdated-events builder, add an import-plan one-shot that upgrades the seeded project in place seating the lead, retire the 006/007 seeds, and document the dev loop.',
          doneWhen:
            'import-plan yields this build as a live project (19 features, shipped tasks merged with PR URLs, backdated decisions + work-completed timelines); it upgrades the seeded project in place; re-running is idempotent; 006/007 no longer seed; gates green.',
          files: ['lib/projects/cutover/', 'scripts/app/import-plan.ts', 'prisma/seeds/app/'],
        },
        {
          title: 'Project slugs (f-project-slugs, folded in)',
          status: 'claimed',
          description:
            'Add Project.slug (globally unique) with an additive migration + a name-derived backfill, author slugs in createProject/updateProject stable + name-independent, and resolve slug-or-cuid → the canonical id in the detail route while sub-routes stay cuid-only.',
          doneWhen:
            '/projects/hce-hub opens the project (slug resolved server-side; /plan and /board load); a cuid URL still works; an unknown slug gives 404; a rename doesn’t break the link; migration + drift green; gates green.',
          files: [
            'prisma/schema/app.prisma',
            'lib/projects/admin.ts',
            'app/api/v1/projects/[id]/route.ts',
            'app/(hub)/projects/[id]/page.tsx',
          ],
        },
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
      doneWhen:
        'Each project has a sidekick you can chat with about its plan, answering with project-only knowledge.',
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
