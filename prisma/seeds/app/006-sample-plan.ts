import type { FeatureStatus, TaskStatus } from '@prisma/client';
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
 * **Lead resolution:** the first human user (`humanWhere`, ordered by creation).
 * On a fresh DB where only the SERVICE config-owner exists (the human admin is
 * created at runtime on first sign-in, *after* seeding), there's no human yet —
 * the project is still created (leadUserId null, no members) and the lead +
 * membership fill in on the next `db:seed` once a human exists, or via the admin
 * project page (f-project-admin). The seed keeps the lead-has-member-row
 * invariant itself (it writes rows directly, bypassing the admin service).
 */

interface SeedTask {
  title: string;
  status: TaskStatus;
}
interface SeedFeature {
  slug: string;
  title: string;
  status: FeatureStatus;
  dependsOn: string[];
  tasks: SeedTask[];
}

export const SAMPLE_PROJECT = {
  id: 'seed-hub-project',
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
} as const;

/** Pure — the plan's features/deps/tasks. Unit-tested; `run` upserts these. */
export function buildSamplePlan(): SeedFeature[] {
  const shipped = (
    slug: string,
    title: string,
    dependsOn: string[],
    tasks: SeedTask[]
  ): SeedFeature => ({
    slug,
    title,
    status: 'shipped',
    dependsOn,
    tasks,
  });
  const merged = (title: string): SeedTask => ({ title, status: 'merged' });

  return [
    shipped(
      'f-fork',
      'Fork + brand + auth-only shell',
      [],
      [merged('Auth-only shell + brand identity')]
    ),
    shipped('f-theme', 'HCE Hub base theme', ['f-fork'], [merged('Warm/dim token layer + fonts')]),
    shipped(
      'f-data-model',
      'Prisma models + scaffolding',
      ['f-fork'],
      [merged('Project domain schema'), merged('Task domain schema'), merged('Futures scaffolding')]
    ),
    shipped(
      'f-access',
      'Project-membership access control',
      ['f-data-model'],
      [merged('The membership authz funnel')]
    ),
    shipped(
      'f-project-admin',
      'Project + member CRUD (admin)',
      ['f-access'],
      [merged('Admin API + invariant service'), merged('Admin UI + admin-nav seam')]
    ),
    shipped(
      'f-shell',
      'Module-composable app shell',
      ['f-theme', 'f-access'],
      [merged('Shell skeleton + Hub Home'), merged('Navigation + module registry')]
    ),
    shipped(
      'f-hub-capabilities',
      'Hub tools + MCP exposure',
      ['f-data-model', 'f-access'],
      [merged('Read pipeline + next_task'), merged('Write tools'), merged('claim_task + collision')]
    ),
    {
      slug: 'f-projects',
      title: 'Projects list + project-view scaffold',
      status: 'in_flight',
      dependsOn: ['f-shell', 'f-project-admin'],
      tasks: [
        merged('Consumer projects read API'),
        { title: 'Projects UI + sample-data seed', status: 'claimed' },
      ],
    },
    {
      slug: 'f-plan-view',
      title: 'Feature-level Plan view',
      status: 'planning',
      dependsOn: ['f-projects', 'f-hub-capabilities'],
      tasks: [
        { title: 'planOrder() topological sort', status: 'available' },
        { title: 'Feature row + expand-to-tasks', status: 'backlog' },
      ],
    },
    {
      slug: 'f-board-view',
      title: 'Board (Kanban)',
      status: 'planning',
      dependsOn: ['f-projects', 'f-hub-capabilities'],
      tasks: [{ title: 'Grid + effectiveStatus column routing', status: 'available' }],
    },
    {
      slug: 'f-task-sheet',
      title: 'Task detail side sheet',
      status: 'planning',
      dependsOn: ['f-plan-view', 'f-hub-capabilities'],
      tasks: [],
    },
    {
      slug: 'f-sidekick',
      title: 'Per-project sidekick agent + chat',
      status: 'planning',
      dependsOn: ['f-hub-capabilities', 'f-shell'],
      tasks: [],
    },
    {
      slug: 'f-intake',
      title: 'Intake workflow + UI',
      status: 'planning',
      dependsOn: ['f-sidekick', 'f-projects'],
      tasks: [],
    },
    {
      slug: 'f-github-sync',
      title: 'GitHub PR integration + reconcile',
      status: 'planning',
      dependsOn: ['f-hub-capabilities'],
      tasks: [],
    },
    {
      slug: 'f-morning-brief',
      title: 'Scheduled per-user brief',
      status: 'planning',
      dependsOn: ['f-hub-capabilities', 'f-shell'],
      tasks: [],
    },
  ];
}

const unit: SeedUnit = {
  name: 'app/006-sample-plan',
  async run({ prisma, logger }) {
    const features = buildSamplePlan();
    const lead = await prisma.user.findFirst({
      where: humanWhere,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const leadUserId = lead?.id ?? null;

    // Project (+ keep the lead-has-member-row invariant when a human exists).
    await prisma.project.upsert({
      where: { id: SAMPLE_PROJECT.id },
      update: { leadUserId },
      create: {
        id: SAMPLE_PROJECT.id,
        name: SAMPLE_PROJECT.name,
        hostPlatform: SAMPLE_PROJECT.hostPlatform,
        status: 'active',
        leadUserId,
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
      await prisma.feature.upsert({
        where: { id: `seed-feat-${f.slug}` },
        update: { title: f.title, status: f.status, ownerUserId: leadUserId },
        create: {
          id: `seed-feat-${f.slug}`,
          projectId: SAMPLE_PROJECT.id,
          title: f.title,
          status: f.status,
          ownerUserId: leadUserId,
        },
      });
    }
    for (const f of features) {
      for (const dep of f.dependsOn) {
        await prisma.featureDependency.upsert({
          where: { id: `seed-fdep-${f.slug}-${dep}` },
          update: {},
          create: {
            id: `seed-fdep-${f.slug}-${dep}`,
            featureId: `seed-feat-${f.slug}`,
            dependsOnFeatureId: `seed-feat-${dep}`,
          },
        });
      }
      for (const [i, t] of f.tasks.entries()) {
        await prisma.task.upsert({
          where: { id: `seed-task-${f.slug}-${i}` },
          update: { title: t.title, status: t.status },
          create: {
            id: `seed-task-${f.slug}-${i}`,
            featureId: `seed-feat-${f.slug}`,
            title: t.title,
            status: t.status,
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
