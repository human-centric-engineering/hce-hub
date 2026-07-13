/**
 * HCE Hub — coordination-model erasure smoke.
 *
 * Fork-owned companion to Sunrise's `scripts/smoke/erasure.ts`. Proves the
 * DB-enforced GDPR behavior of the Hub's hand-written satellite FKs → core
 * `user` (f-data-model t-1 + t-2 + t-3), which mocked unit tests cannot:
 * `eraseUser()`'s `tx.user.delete()` fires the FK `ON DELETE` actions, so —
 *   - `app_project.leadUserId`             → SET NULL (project retained)
 *   - `app_feature.ownerUserId`            → SET NULL (feature retained)
 *   - `app_task.claimedByUserId`           → SET NULL (task retained)
 *   - `app_focus_directive.declaredByUserId` → SET NULL (directive retained)
 *   - `app_project_member`                 → CASCADE  (membership removed)
 *   - `app_task_claim`                     → CASCADE  (claim history removed)
 *
 * The FK *contract* (constraint + action) is guarded continuously by
 * `npm run db:drift-check` (CI + /pre-pr); this smoke is the functional
 * end-to-end proof. Runs against the real dev/CI Postgres.
 *
 * Skips cleanly (exit 0) when no DB is reachable. Self-cleaning: creates only
 * `smoke-hub-erasure-*` rows and removes whatever it created on every path.
 *
 * Run with:
 *   npm run app:smoke:erasure
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';

const PREFIX = 'smoke-hub-erasure';
const stamp = Date.now();

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
    console.log('app:smoke:erasure skipped — no database reachable.');
    return;
  }

  let userId: string | null = null;
  let projectId: string | null = null;
  let featureId: string | null = null;
  let taskId: string | null = null;
  let directiveId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: { name: `${PREFIX} user`, email: `${PREFIX}-${stamp}@example.com` },
    });
    userId = user.id;

    // The user leads a project, owns a feature in it, is a member, claims a task
    // in it, and has a claim-history row — every Hub → user reference, one per
    // ON DELETE action under test (SET NULL: lead/owner/task claimant · CASCADE:
    // membership/claim).
    const project = await prisma.project.create({
      data: { name: `${PREFIX} project`, hostPlatform: 'sunrise', leadUserId: user.id },
    });
    projectId = project.id;

    const feature = await prisma.feature.create({
      data: { projectId: project.id, title: `${PREFIX} feature`, ownerUserId: user.id },
    });
    featureId = feature.id;

    await prisma.projectMember.create({
      data: { projectId: project.id, userId: user.id, role: 'lead' },
    });

    const task = await prisma.task.create({
      data: {
        featureId: feature.id,
        title: `${PREFIX} task`,
        status: 'claimed',
        claimedByUserId: user.id,
      },
    });
    taskId = task.id;

    await prisma.taskClaim.create({ data: { taskId: task.id, userId: user.id } });

    // ...and declares a focus directive on the project (t-3 futures scaffolding).
    const directive = await prisma.focusDirective.create({
      data: { projectId: project.id, declaredByUserId: user.id, intent: `${PREFIX} intent` },
    });
    directiveId = directive.id;

    // Erase.
    await eraseUser({
      userId: user.id,
      userEmail: user.email,
      actorUserId: user.id,
      reason: 'self_service',
    });

    check((await prisma.user.findUnique({ where: { id: user.id } })) === null, 'user row deleted');

    const projectAfter = await prisma.project.findUnique({ where: { id: project.id } });
    check(projectAfter !== null, 'project retained');
    check(projectAfter?.leadUserId === null, 'project.leadUserId nulled (SET NULL)');

    const featureAfter = await prisma.feature.findUnique({ where: { id: feature.id } });
    check(featureAfter !== null, 'feature retained');
    check(featureAfter?.ownerUserId === null, 'feature.ownerUserId nulled (SET NULL)');

    check(
      (await prisma.projectMember.count({ where: { projectId: project.id } })) === 0,
      'project membership cascade-deleted (CASCADE)'
    );

    const taskAfter = await prisma.task.findUnique({ where: { id: task.id } });
    check(taskAfter !== null, 'task retained');
    check(taskAfter?.claimedByUserId === null, 'task.claimedByUserId nulled (SET NULL)');

    check(
      (await prisma.taskClaim.count({ where: { taskId: task.id } })) === 0,
      'task claim cascade-deleted (CASCADE)'
    );

    const directiveAfter = await prisma.focusDirective.findUnique({ where: { id: directive.id } });
    check(directiveAfter !== null, 'focus directive retained');
    check(
      directiveAfter?.declaredByUserId === null,
      'focus directive.declaredByUserId nulled (SET NULL)'
    );

    console.log('\n✓ app:smoke:erasure passed');
  } finally {
    // Self-clean by tracked id (directive/task/feature before project; member+claim gone).
    if (directiveId)
      await prisma.focusDirective.deleteMany({ where: { id: directiveId } }).catch(() => undefined);
    if (taskId) await prisma.task.deleteMany({ where: { id: taskId } }).catch(() => undefined);
    if (featureId)
      await prisma.feature.deleteMany({ where: { id: featureId } }).catch(() => undefined);
    if (projectId)
      await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
    if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch(async (err) => {
  console.error('\n✗ app:smoke:erasure failed:', err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
