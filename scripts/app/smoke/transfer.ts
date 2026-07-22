/**
 * HCE Hub — project transfer round-trip smoke (f-selfhost-cutover §19 t-1).
 *
 * Proves **round-trip identity** against the real dev/CI Postgres — the property
 * the Hub-as-system-of-record's durability + dev→prod portability rest on, and
 * which mocked unit tests can only approximate: build a project graph → export →
 * delete → import → re-export, and assert the two snapshots are byte-identical
 * (ids + backdated `createdAt` preserved through the cascade-delete + re-upsert).
 *
 * Skips cleanly (exit 0) when no DB is reachable. Self-cleaning: creates only
 * `smoke-hub-transfer-*` rows and removes whatever it created on every path.
 *
 * Run with:
 *   npm run app:smoke:transfer
 */

import { prisma } from '@/lib/db/client';
import { exportProject } from '@/lib/projects/transfer/exporter';
import { importProject } from '@/lib/projects/transfer/importer';

const PREFIX = 'smoke-hub-transfer';
const stamp = Date.now();
const BACKDATED = new Date('2020-01-02T03:04:05.000Z'); // proves createdAt survives

async function dbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main(): Promise<void> {
  if (!(await dbReachable())) {
    console.log('app:smoke:transfer skipped — no database reachable.');
    return;
  }

  let userId: string | null = null;
  let projectId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: { name: `${PREFIX} user`, email: `${PREFIX}-${stamp}@example.com` },
    });
    userId = user.id;

    // A small but representative graph: two features (B depends on A), two tasks
    // in A (B depends on A), a claim, an indicative task, and two events (one
    // project-scoped decision, one feature-scoped ship with a BACKDATED date).
    const project = await prisma.project.create({
      data: {
        name: `${PREFIX} project`,
        hostPlatform: 'sunrise',
        leadUserId: user.id,
        taskCounter: 2,
      },
    });
    projectId = project.id;
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: user.id, role: 'lead' },
    });

    const featA = await prisma.feature.create({
      data: {
        projectId: project.id,
        slug: 'f-a',
        title: 'Feature A',
        status: 'shipped',
        planningStage: 'planned',
        ownerUserId: user.id,
        references: [{ label: 'ref', target: 'https://example.com' }],
      },
    });
    const featB = await prisma.feature.create({
      data: { projectId: project.id, slug: 'f-b', title: 'Feature B', ownerUserId: user.id },
    });
    await prisma.featureDependency.create({
      data: { featureId: featB.id, dependsOnFeatureId: featA.id },
    });
    await prisma.indicativeTask.create({
      data: { featureId: featB.id, order: 0, text: 'a sketch step' },
    });

    const taskA = await prisma.task.create({
      data: {
        featureId: featA.id,
        number: 1,
        title: 'Task A',
        status: 'merged',
        prUrl: 'https://pr/1',
      },
    });
    const taskB = await prisma.task.create({
      data: {
        featureId: featA.id,
        number: 2,
        title: 'Task B',
        status: 'claimed',
        claimedByUserId: user.id,
        assigneeUserId: user.id,
      },
    });
    await prisma.taskDependency.create({ data: { taskId: taskB.id, dependsOnTaskId: taskA.id } });
    await prisma.taskClaim.create({ data: { taskId: taskB.id, userId: user.id } });

    await prisma.projectEvent.create({
      data: {
        projectId: project.id,
        kind: 'decision',
        title: 'a call',
        body: 'because',
        actorUserId: user.id,
      },
    });
    await prisma.projectEvent.create({
      data: {
        projectId: project.id,
        featureId: featA.id,
        kind: 'feature_shipped',
        body: 'shipped A',
        createdAt: BACKDATED,
      },
    });

    // Export → delete (cascade) → import → re-export.
    const before = await exportProject(project.id);
    check(before.data.features.length === 2, 'exported 2 features');
    check(before.data.tasks.length === 2, 'exported 2 tasks');
    check(before.data.events.length === 2, 'exported 2 events');

    await prisma.project.delete({ where: { id: project.id } });
    check(
      (await prisma.project.findUnique({ where: { id: project.id } })) === null,
      'project + graph cascade-deleted'
    );

    const importResult = await importProject(before);
    check(importResult.project === 'created', 'import created the project');
    check(importResult.warnings.length === 0, 'no warnings (lead user resolved)');
    check(importResult.features.created === 2, 'imported 2 features');

    const after = await exportProject(project.id);
    check(
      JSON.stringify(after.data) === JSON.stringify(before.data),
      'round-trip identity — re-export byte-equals the original (ids + createdAt preserved)'
    );

    const shipEvent = after.data.events.find((e) => e.kind === 'feature_shipped');
    check(
      shipEvent?.createdAt === BACKDATED.toISOString(),
      'backdated event createdAt preserved through the round-trip'
    );

    console.log('\n✓ app:smoke:transfer passed');
  } finally {
    if (projectId)
      await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
    if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch(async (err) => {
  console.error('\n✗ app:smoke:transfer failed:', err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
