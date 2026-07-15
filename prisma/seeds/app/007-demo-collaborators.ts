import { SAMPLE_PROJECT } from '@/prisma/seeds/app/006-sample-plan';
import type { SeedUnit } from '@/prisma/runner';

/**
 * Dev-only demo collaborators for the sample project (f-projects t-2).
 *
 * **GATED to non-production** — it fabricates demo `user` rows so a solo dev DB
 * shows the multi-member UI (member stack, avatars) and the claimed / owned /
 * unassigned states. These fake accounts must NEVER reach prod (seeds run on
 * every `db:seed`, prod included), so this unit early-returns when
 * `NODE_ENV === 'production'`; the real board's membership is `006`'s job.
 *
 * Idempotent (stable demo-user ids). Runs after `006` so the sample features/
 * tasks it decorates already exist.
 */

const DEMO_USERS = [
  { id: 'seed-demo-ada', name: 'Ada Lovelace', email: 'ada@demo.hce.local' },
  { id: 'seed-demo-grace', name: 'Grace Hopper', email: 'grace@demo.hce.local' },
] as const;

const unit: SeedUnit = {
  name: 'app/007-demo-collaborators',
  async run({ prisma, logger }) {
    // Never fabricate users in production.
    if (process.env.NODE_ENV === 'production') {
      logger.info('⏭️  Skipping demo collaborators (NODE_ENV=production)');
      return;
    }

    for (const u of DEMO_USERS) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: {},
        create: { id: u.id, name: u.name, email: u.email, accountType: 'HUMAN' },
      });
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: SAMPLE_PROJECT.id, userId: u.id } },
        update: { role: 'member' },
        create: { projectId: SAMPLE_PROJECT.id, userId: u.id, role: 'member' },
      });
    }

    // Decorate a couple of rows so the board shows non-lead ownership + a claim.
    // (No-ops gracefully if 006's rows are absent — updateMany with 0 matches.)
    await prisma.feature.updateMany({
      where: { id: 'seed-feat-f-plan-view' },
      data: { ownerUserId: 'seed-demo-grace' },
    });
    await prisma.task.updateMany({
      where: { id: 'seed-task-f-board-view-0' },
      data: { status: 'claimed', claimedByUserId: 'seed-demo-ada' },
    });

    logger.info(
      `✅ Seeded ${DEMO_USERS.length} demo collaborators on "${SAMPLE_PROJECT.name}" (dev only)`
    );
  },
};

export default unit;
