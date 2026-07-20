import type { FeaturePlanningStage, FeatureStatus, TaskStatus } from '@prisma/client';
import { humanWhere } from '@/lib/auth/account';
import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the Hub's OWN v1 build plan as a real project (f-projects t-2).
 *
 * HCE Hub app seed — materialises *this* build plan (its 15 features, their
 * dependency graph, and representative tasks) into `app_project`/`app_feature`/
 * `app_feature_dependency`/`app_task` so the Plan/Board views render something
 * real and drivable from day one. **All environments (prod-safe):** it seats
 * only a *real* member (no fabricated users — that's the dev-only
 * `007-demo-collaborators` seed) and is idempotent via explicit stable ids.
 *
 * **Lead resolution:** the first *real* human user (`humanWhere`, excluding the
 * `007` demo accounts, ordered by creation). On a fresh DB where only the SERVICE
 * config-owner exists (the human admin is created at runtime on first sign-in,
 * *after* seeding), there's no human yet — the project is created leaderless/
 * memberless. It does **not** auto-heal (the runner hash-gates unchanged units,
 * so a plain re-`db:seed` won't re-run this): once a human exists, seat them as
 * lead + member via the admin project page (f-project-admin), or `db:reset` to
 * re-seed from scratch. The seed keeps the lead-has-member-row invariant itself
 * (it writes rows directly, bypassing the admin service).
 *
 * **Ids are cuid-shaped** (`c` + no hyphens) so the seeded project opens through
 * the `parseCuidParam`-guarded `/api/v1/projects/:id` route — a plain slug id
 * (e.g. `seed-hub-project`) fails `z.cuid()` and 400s → the card 404s on click.
 */

interface SeedTask {
  title: string;
  status: TaskStatus;
  /** Longer detail shown in the task sheet. */
  description?: string;
  /** §18 per-task acceptance contract, shown on the feature page. */
  doneWhen?: string;
}
interface SeedFeature {
  slug: string;
  title: string;
  status: FeatureStatus;
  dependsOn: string[];
  tasks: SeedTask[];
  /** Human-readable summary shown in the Plan row + on the feature page. */
  description?: string;
  /** When true, the feature is unowned (a backlog item available to claim). */
  unowned?: boolean;
  /** Flags the feature as wanting help (the "help wanted" pill). */
  helpWanted?: boolean;
  /** §18 depth axis; defaults to `planned` when the feature has tasks, else `indicative`. */
  planningStage?: FeaturePlanningStage;
  /** §18 definition of done. */
  doneWhen?: string;
  /** §18 cross-reference chips. */
  references?: { label: string; target: string }[];
  /** §18 indicative sketch (ordered) — the high-level task list before planning. */
  indicativeTasks?: string[];
}

/** Deterministic, cuid-shaped stable id (`c` + no hyphens) so seeded rows pass
 * `z.cuid()` route guards while staying idempotent across re-seeds. */
const cid = (...parts: (string | number)[]): string =>
  'c' + parts.join('').replace(/-/g, '').toLowerCase();

export const SAMPLE_PROJECT = {
  id: cid('hubproject'),
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
} as const;

/** Stable ids for the seeded features/tasks (shared with `007`). */
export const featureSeedId = (slug: string): string => cid('feat', slug);
export const taskSeedId = (slug: string, index: number): string => cid('task', slug, index);
const depSeedId = (slug: string, dep: string): string => cid('fdep', slug, dep);
const indicativeSeedId = (slug: string, index: number): string => cid('ind', slug, index);

/** Pure — the plan's features/deps/tasks. Unit-tested; `run` upserts these. */
export function buildSamplePlan(): SeedFeature[] {
  const shipped = (
    slug: string,
    title: string,
    description: string,
    dependsOn: string[],
    tasks: SeedTask[]
  ): SeedFeature => ({
    slug,
    title,
    description,
    status: 'shipped',
    dependsOn,
    tasks,
  });
  const merged = (title: string): SeedTask => ({ title, status: 'merged' });

  return [
    shipped(
      'f-fork',
      'Fork + brand + auth-only shell',
      'Fork Sunrise, apply HCE Hub branding, and stand up the auth-only shell everything else builds on.',
      [],
      [merged('Auth-only shell + brand identity')]
    ),
    shipped(
      'f-theme',
      'HCE Hub base theme',
      'The warm/dim consumer token layer and fonts that give the Hub its calm, glanceable look.',
      ['f-fork'],
      [merged('Warm/dim token layer + fonts')]
    ),
    shipped(
      'f-data-model',
      'Prisma models + scaffolding',
      'The project/feature/task domain schema (plus futures scaffolding) — the spine the whole Hub reads and writes.',
      ['f-fork'],
      [merged('Project domain schema'), merged('Task domain schema'), merged('Futures scaffolding')]
    ),
    shipped(
      'f-access',
      'Project-membership access control',
      'The 404-not-403 membership funnel every project-scoped read and write gates through.',
      ['f-data-model'],
      [merged('The membership authz funnel')]
    ),
    shipped(
      'f-project-admin',
      'Project + member CRUD (admin)',
      'Admin surface to create projects and manage members, with the lead-has-a-member-row invariant enforced.',
      ['f-access'],
      [merged('Admin API + invariant service'), merged('Admin UI + admin-nav seam')]
    ),
    shipped(
      'f-shell',
      'Module-composable app shell',
      'The three-column Hub shell — nav, topbar, and a module registry so new surfaces slot in without shell edits.',
      ['f-theme', 'f-access'],
      [merged('Shell skeleton + Hub Home'), merged('Navigation + module registry')]
    ),
    shipped(
      'f-hub-capabilities',
      'Hub tools + MCP exposure',
      'The agent-callable coordination tools (next_task, create/claim tools) exposed over MCP.',
      ['f-data-model', 'f-access'],
      [merged('Read pipeline + next_task'), merged('Write tools'), merged('claim_task + collision')]
    ),
    {
      slug: 'f-projects',
      title: 'Projects list + project-view scaffold',
      description:
        'The member-facing projects list and the project view shell the Plan, Board, and Log tabs hang off.',
      status: 'in_flight',
      dependsOn: ['f-shell', 'f-project-admin'],
      doneWhen: 'A member sees their projects and opens one; a non-member gets a 404.',
      references: [
        { label: 'v1-requirements §08', target: 'v1-requirements#08' },
        { label: 'design handoff', target: 'https://example.com/hce/design' },
      ],
      tasks: [
        {
          ...merged('Consumer projects read API'),
          description:
            'The membership-scoped list + single-project read behind the projects surface.',
          doneWhen: 'Lists only the caller’s projects; a non-member id 404s.',
        },
        {
          title: 'Projects UI + sample-data seed',
          status: 'claimed',
          description:
            'The projects grid, the project-view header/tabs, and this sample-plan seed.',
          doneWhen: 'The grid renders real projects and a card opens its project view.',
        },
      ],
    },
    {
      slug: 'f-plan-view',
      title: 'Feature-level Plan view',
      description:
        'The project’s features in optimal working order, each expandable to its task table.',
      status: 'planning',
      dependsOn: ['f-projects', 'f-hub-capabilities'],
      tasks: [
        {
          title: 'planOrder() topological sort',
          status: 'available',
          description:
            'Order features by dependency + readiness so the most-advanceable sit first.',
          doneWhen: 'A dependency always sorts before the feature that needs it.',
        },
        { title: 'Feature row + expand-to-tasks', status: 'backlog' },
      ],
    },
    {
      slug: 'f-board-view',
      title: 'Board (Kanban)',
      description:
        'Tasks routed into member lanes × effective-status columns — the who’s-on-what glance.',
      status: 'planning',
      dependsOn: ['f-projects', 'f-hub-capabilities'],
      tasks: [
        {
          title: 'Grid + effectiveStatus column routing',
          status: 'available',
          doneWhen: 'Each task lands in its member lane and effective-status column.',
        },
      ],
    },
    {
      slug: 'f-task-sheet',
      title: 'Task detail side sheet',
      description:
        'A deep-linkable sheet for one task — its detail, dependency graph, and claim action.',
      status: 'planning',
      dependsOn: ['f-plan-view', 'f-hub-capabilities'],
      doneWhen: 'A task opens in a deep-linkable sheet; a cross-project id 404s.',
      references: [{ label: 'v1-requirements §11', target: 'v1-requirements#11' }],
      indicativeTasks: [
        'One-task detail read (funnel-scoped, effective status)',
        'Deep-linkable ?task= sheet + History-API host',
        'Activity timeline over the journal',
      ],
      tasks: [],
    },
    {
      slug: 'f-sidekick',
      title: 'Per-project sidekick agent + chat',
      description:
        'A per-project assistant you can ask about the plan, wired to the project’s context.',
      status: 'planning',
      dependsOn: ['f-hub-capabilities', 'f-shell'],
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
      // Unowned + help-wanted: the canonical "available to claim" backlog sketch.
      unowned: true,
      helpWanted: true,
      dependsOn: ['f-hub-capabilities'],
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
      // Blocked + unowned: shows the blocked pill on an unclaimed feature.
      status: 'blocked',
      unowned: true,
      dependsOn: ['f-hub-capabilities', 'f-shell'],
      indicativeTasks: [
        'Brief content builder (per-user rollup)',
        'Schedule + delivery channel',
        'Brief surface in the shell',
      ],
      tasks: [],
    },
  ];
}

const unit: SeedUnit = {
  name: 'app/006-sample-plan',
  async run({ prisma, logger }) {
    const features = buildSamplePlan();
    // First *real* human — exclude the dev-only 007 demo accounts, else a demo
    // user (created at seed time, before the real dev signs up) could be picked
    // as lead on a later re-seed.
    const lead = await prisma.user.findFirst({
      where: { ...humanWhere, NOT: { email: { endsWith: '@demo.hce.local' } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const leadUserId = lead?.id ?? null;

    // Task numbers run project-wide (t-1 … t-N) in feature order; the counter
    // ends at the total so a subsequently-created task picks up at N+1 (f-refs).
    const totalTasks = features.reduce((n, f) => n + f.tasks.length, 0);

    // Project (+ keep the lead-has-member-row invariant when a human exists).
    await prisma.project.upsert({
      where: { id: SAMPLE_PROJECT.id },
      update: { leadUserId, taskCounter: totalTasks },
      create: {
        id: SAMPLE_PROJECT.id,
        name: SAMPLE_PROJECT.name,
        hostPlatform: SAMPLE_PROJECT.hostPlatform,
        status: 'active',
        leadUserId,
        taskCounter: totalTasks,
      },
    });
    if (leadUserId) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: SAMPLE_PROJECT.id, userId: leadUserId } },
        update: { role: 'lead' },
        create: { projectId: SAMPLE_PROJECT.id, userId: leadUserId, role: 'lead' },
      });
    }

    // Features, then dependency edges (features must exist first), then tasks.
    for (const f of features) {
      // Depth axis (§18): explicit, else a feature with tasks is `planned`, one
      // without is a `indicative` sketch.
      const planningStage: FeaturePlanningStage =
        f.planningStage ?? (f.tasks.length > 0 ? 'planned' : 'indicative');
      const references = f.references ?? undefined;
      // Unowned features are the "available to claim" backlog (owner = null);
      // the rest belong to the lead.
      const ownerUserId = f.unowned ? null : leadUserId;
      await prisma.feature.upsert({
        where: { id: featureSeedId(f.slug) },
        update: {
          slug: f.slug,
          title: f.title,
          description: f.description ?? null,
          status: f.status,
          planningStage,
          helpWanted: f.helpWanted ?? false,
          doneWhen: f.doneWhen ?? null,
          ...(references ? { references } : {}),
          ownerUserId,
        },
        create: {
          id: featureSeedId(f.slug),
          projectId: SAMPLE_PROJECT.id,
          slug: f.slug,
          title: f.title,
          description: f.description ?? null,
          status: f.status,
          planningStage,
          helpWanted: f.helpWanted ?? false,
          doneWhen: f.doneWhen ?? null,
          ...(references ? { references } : {}),
          ownerUserId,
        },
      });
      // The indicative sketch (§18) — upsert by stable id so re-seeds are idempotent.
      for (const [i, text] of (f.indicativeTasks ?? []).entries()) {
        await prisma.indicativeTask.upsert({
          where: { id: indicativeSeedId(f.slug, i) },
          update: { order: i, text },
          create: {
            id: indicativeSeedId(f.slug, i),
            featureId: featureSeedId(f.slug),
            order: i,
            text,
          },
        });
      }
    }
    let taskNumber = 0;
    for (const f of features) {
      for (const dep of f.dependsOn) {
        await prisma.featureDependency.upsert({
          where: { id: depSeedId(f.slug, dep) },
          update: {},
          create: {
            id: depSeedId(f.slug, dep),
            featureId: featureSeedId(f.slug),
            dependsOnFeatureId: featureSeedId(dep),
          },
        });
      }
      for (const [i, t] of f.tasks.entries()) {
        taskNumber += 1; // project-wide t-N, in feature order
        await prisma.task.upsert({
          where: { id: taskSeedId(f.slug, i) },
          update: {
            title: t.title,
            status: t.status,
            number: taskNumber,
            description: t.description ?? null,
            doneWhen: t.doneWhen ?? null,
          },
          create: {
            id: taskSeedId(f.slug, i),
            featureId: featureSeedId(f.slug),
            number: taskNumber,
            title: t.title,
            status: t.status,
            description: t.description ?? null,
            doneWhen: t.doneWhen ?? null,
          },
        });
      }
    }

    logger.info(
      `✅ Seeded sample plan "${SAMPLE_PROJECT.name}" (${features.length} features)${
        leadUserId ? '' : ' — no human user yet; lead/membership fill in on re-seed or via admin'
      }`
    );
  },
};

export default unit;
