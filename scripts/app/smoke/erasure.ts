/**
 * HCE Hub — coordination-model erasure smoke.
 *
 * Fork-owned companion to Sunrise's `scripts/smoke/erasure.ts`. Proves the
 * DB-enforced GDPR behavior of the Hub's hand-written satellite FKs → core
 * `user` (f-data-model t-1), which mocked unit tests cannot: `eraseUser()`'s
 * `tx.user.delete()` fires the FK `ON DELETE` actions, so —
 *   - `app_project.leadUserId`   → SET NULL (project retained, lead de-attributed)
 *   - `app_feature.ownerUserId`  → SET NULL (feature retained, owner de-attributed)
 *   - `app_project_member`       → CASCADE  (the user's membership is removed)
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

  try {
    const user = await prisma.user.create({
      data: { name: `${PREFIX} user`, email: `${PREFIX}-${stamp}@example.com` },
    });
    userId = user.id;

    // The user leads a project, owns a feature in it, and is a member — the
    // three Hub → user references, one per ON DELETE action under test.
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

    console.log('\n✓ app:smoke:erasure passed');
  } finally {
    // Self-clean by tracked id (feature before project; member already gone).
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
