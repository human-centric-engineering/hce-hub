/**
 * Project-revision smoke script (f-realtime §36 t-125).
 *
 * Proves what the unit tests structurally cannot: that the revision SQL is
 * *correct against a real database*. `tests/unit/lib/projects/revision.test.ts`
 * mocks `$queryRaw`, so it can check that every counted table reaches the query
 * and that the fold behaves — but not that a fragment's join actually resolves,
 * that its WHERE really scopes to one project, or that a column exists at all. A
 * typo'd join would pass every unit test and quietly contribute a constant.
 *
 * So this drives a real mutation through **each** counted table against the live
 * dev/CI Postgres and asserts the token moved, plus the three cases that catch a
 * subtly wrong cursor:
 *
 *   * a **negative control** — no mutation must leave the token identical. Without
 *     it, a token that changed on every read (a stray `now()`) would pass every
 *     other assertion in this file.
 *   * a **dependency swap** — delete one edge, create another, same count. Only
 *     the edge table's own `createdAt` sees this; the parent feature's
 *     `updatedAt` does not move, because `update_feature` skips `feature.update`
 *     entirely when nothing but `dependsOn` changed.
 *   * **cross-project isolation** — a change to another project must NOT move this
 *     one's token, which is what an unscoped fragment would break.
 *
 * **It catches a break, but does not localise one.** Confirmed by breaking
 * `app_task_claim`'s WHERE so the fragment counted every claim in the database:
 * the run failed, but at the *first* assertion rather than the claim one, because
 * an unscoped fragment's `MAX` swamps every project's own timestamps and nothing
 * moves the token after that. So a red run means a fragment is wrong — read the
 * SQL, not just the line that failed.
 *
 * Skips cleanly (exit 0) when no database is reachable, so it is safe to invoke
 * anywhere.
 *
 * Self-cleaning: creates two `smoke-test-revision-*` projects and deletes them on
 * every path (Project cascades to features, tasks, edges, claims, ideas, phases,
 * events and directives). Never touches seed data.
 *
 * Run with:
 *   npm run smoke:project-revision
 *   npx tsx --env-file=.env.local scripts/smoke/project-revision.ts
 */

import { prisma } from '@/lib/db/client';
import { getProjectRevision, COUNTED_REVISION_TABLES } from '@/lib/projects/revision';

const PREFIX = 'smoke-test-revision';
const stamp = Date.now();

/** Tables this run actually exercised — diffed against the manifest at the end. */
const exercised = new Set<string>();

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

/**
 * `updatedAt` is TIMESTAMP(3), so a mutation landing in the same millisecond as
 * the token it should invalidate would be invisible. Irrelevant in production —
 * the poll interval is seconds — but a real flake source in a script that reads,
 * writes and re-reads as fast as the database will go.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

async function main(): Promise<void> {
  if (!(await dbReachable())) {
    console.log(
      'smoke:project-revision skipped — no database reachable (DATABASE_URL unset or DB down).'
    );
    return;
  }

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) {
    console.log('smoke:project-revision skipped — no user in the database to act as a member.');
    return;
  }

  let projectId: string | null = null;
  let otherProjectId: string | null = null;

  try {
    const project = await prisma.project.create({
      data: {
        name: `${PREFIX}-${stamp}`,
        hostPlatform: 'sunrise',
        members: { create: { userId: user.id, role: 'lead' } },
      },
    });
    projectId = project.id;

    const other = await prisma.project.create({
      data: {
        name: `${PREFIX}-other-${stamp}`,
        hostPlatform: 'sunrise',
        members: { create: { userId: user.id, role: 'lead' } },
      },
    });
    otherProjectId = other.id;

    const rev = async (id: string = projectId as string): Promise<string> =>
      (await getProjectRevision(user.id, id)).revision;

    /** Assert `mutate` moves the token, and record which table it covered. */
    async function moves(table: string, what: string, mutate: () => Promise<void>): Promise<void> {
      const before = await rev();
      await tick();
      await mutate();
      const after = await rev();
      check(before !== after, `${table} — ${what}`);
      exercised.add(table);
    }

    console.log('\nnegative control');
    const a = await rev();
    await tick();
    check(a === (await rev()), 'an unchanged project returns an identical token');

    console.log('\nevery counted table moves the token');

    await moves('app_project', 'renaming the project', async () => {
      await prisma.project.update({ where: { id: projectId! }, data: { name: `${PREFIX}-r` } });
    });

    await moves('app_project_member', 'changing a member’s role', async () => {
      await prisma.projectMember.updateMany({
        where: { projectId: projectId!, userId: user.id },
        data: { role: 'member' },
      });
      // Put it back — later reads go through this membership.
      await prisma.projectMember.updateMany({
        where: { projectId: projectId!, userId: user.id },
        data: { role: 'lead' },
      });
    });

    let phaseId = '';
    await moves('app_phase', 'creating a phase', async () => {
      phaseId = (
        await prisma.phase.create({ data: { projectId: projectId!, ordinal: 0, name: 'Smoke' } })
      ).id;
    });

    let featureId = '';
    let otherFeatureId = '';
    let thirdFeatureId = '';
    await moves('app_feature', 'creating a feature', async () => {
      featureId = (
        await prisma.feature.create({ data: { projectId: projectId!, title: 'Smoke feature' } })
      ).id;
      otherFeatureId = (
        await prisma.feature.create({ data: { projectId: projectId!, title: 'Smoke feature 2' } })
      ).id;
      thirdFeatureId = (
        await prisma.feature.create({ data: { projectId: projectId!, title: 'Smoke feature 3' } })
      ).id;
    });

    await moves('app_feature', 'editing a feature’s title (updatedAt, not a new row)', async () => {
      await prisma.feature.update({ where: { id: featureId }, data: { title: 'Smoke renamed' } });
    });

    await moves('app_indicative_task', 'sketching an indicative task', async () => {
      await prisma.indicativeTask.create({ data: { featureId, order: 0, text: 'a sketch' } });
    });

    await moves('app_feature_dependency', 'adding a dependency edge', async () => {
      await prisma.featureDependency.create({
        data: { featureId, dependsOnFeatureId: otherFeatureId },
      });
    });

    await moves(
      'app_feature_dependency',
      'SWAPPING the edge — same row count, parent untouched',
      async () => {
        await prisma.$transaction(async (tx) => {
          await tx.featureDependency.deleteMany({ where: { featureId } });
          await tx.featureDependency.create({
            data: { featureId, dependsOnFeatureId: thirdFeatureId },
          });
        });
      }
    );

    let taskId = '';
    let otherTaskId = '';
    let thirdTaskId = '';
    await moves('app_task', 'creating a task', async () => {
      taskId = (await prisma.task.create({ data: { featureId, title: 'Smoke task' } })).id;
      otherTaskId = (await prisma.task.create({ data: { featureId, title: 'Smoke task 2' } })).id;
      thirdTaskId = (await prisma.task.create({ data: { featureId, title: 'Smoke task 3' } })).id;
    });

    await moves('app_task', 'starting the task (a status edit)', async () => {
      await prisma.task.update({ where: { id: taskId }, data: { status: 'active' } });
    });

    await moves('app_task_dependency', 'adding a task edge', async () => {
      await prisma.taskDependency.create({ data: { taskId, dependsOnTaskId: otherTaskId } });
    });

    await moves('app_task_dependency', 'SWAPPING the task edge — same row count', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.taskDependency.deleteMany({ where: { taskId } });
        await tx.taskDependency.create({ data: { taskId, dependsOnTaskId: thirdTaskId } });
      });
    });

    let claimId = '';
    await moves('app_task_claim', 'claiming the task', async () => {
      claimId = (await prisma.taskClaim.create({ data: { taskId, userId: user.id } })).id;
    });

    await moves('app_task_claim', 'releasing the claim (an edit, not a new row)', async () => {
      await prisma.taskClaim.update({ where: { id: claimId }, data: { releasedAt: new Date() } });
    });

    let ideaId = '';
    await moves('app_idea', 'jotting an idea', async () => {
      ideaId = (await prisma.idea.create({ data: { projectId: projectId!, text: 'a jot' } })).id;
    });

    await moves('app_idea', 'dropping the idea (an edit update_idea makes)', async () => {
      await prisma.idea.update({ where: { id: ideaId }, data: { status: 'dropped' } });
    });

    await moves('app_project_event', 'journalling a note', async () => {
      await prisma.projectEvent.create({
        data: { projectId: projectId!, kind: 'note', body: 'smoke' },
      });
    });

    await moves('app_focus_directive', 'declaring a focus directive', async () => {
      await prisma.focusDirective.create({
        data: { projectId: projectId!, intent: 'smoke' },
      });
    });

    console.log('\ndeletes, which no timestamp can see');

    await moves('app_phase', 'deleting the phase (only the count moves)', async () => {
      await prisma.phase.delete({ where: { id: phaseId } });
    });

    await moves('app_task_dependency', 'deleting the last task edge', async () => {
      await prisma.taskDependency.deleteMany({ where: { taskId } });
    });

    console.log('\nscoping');

    // BOTH tokens are captured before the mutation. The second assertion used to
    // compare this project's token to the OTHER project's, which passes
    // unconditionally — two projects never share a row count, so it held even when
    // the other project's token had not moved at all. A check that cannot fail is
    // worse than no check, because it reads like one (`/code-review`).
    const mine = await rev();
    const theirs = await rev(otherProjectId);
    await tick();
    await prisma.feature.create({
      data: { projectId: otherProjectId, title: 'a change somewhere else entirely' },
    });
    check(mine === (await rev()), 'another project’s change does NOT move this project’s token');
    check(theirs !== (await rev(otherProjectId)), 'and DOES move that project’s own token');

    console.log('\ncoverage');
    const missed = COUNTED_REVISION_TABLES.filter((t) => !exercised.has(t));
    check(
      missed.length === 0,
      `every counted table was exercised${missed.length ? ` — missed ${missed.join(', ')}` : ''}`
    );

    console.log(`\n✓ smoke:project-revision passed (${COUNTED_REVISION_TABLES.length} tables).`);
  } finally {
    for (const id of [projectId, otherProjectId]) {
      if (id) await prisma.project.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch(async (err) => {
  console.error('\n✗ smoke:project-revision failed:', err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
