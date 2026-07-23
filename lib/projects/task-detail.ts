/**
 * Single-task detail read (f-task-sheet, feature 11).
 *
 * The one-task read the deep-linkable **task sheet** renders — the detail the
 * whole-graph `/plan` and `/board` reads deliberately omit: a task's
 * description, its declared file scope (§5, "declared, not enforced"), and its
 * two-way dependency graph (`blocked by` / `blocks`), each neighbour carrying
 * its own **effective** status so the sheet's dep rows read like the Plan/Board.
 *
 * Membership is the [[f-access]] funnel's: the load goes through
 * `getAccessibleProject` (a non-member or unknown project → 404, never 403), and
 * the task is then loaded **scoped to that project** (`feature.projectId`), so a
 * task id from another project the caller happens to belong to is a 404 too — no
 * cross-project id-swap. Task status is the shared `computeEffectiveStatus` (so
 * the sheet never diverges from the §09 Plan / §10 Board), and every nullable
 * `user` ref resolves to `UserRef | null` ("unassigned / former member"), never
 * dereferenced. `prUrl` is returned raw and sanitized at render (as `task-row` /
 * `task-card` do), keeping the raw-in-service / sanitize-in-component pattern.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';
import { getAccessibleProject } from '@/lib/projects/access';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/projects/task-status';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

/** A neighbour in the dependency graph (a blocker or a dependent), click-to-jump. */
export interface TaskDetailRef {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  /** The neighbour feature's authored slug (`f-mcp`); `null` until authored. */
  featureSlug: string | null;
  /** Effective status (via `computeEffectiveStatus`) — matches Plan/Board. */
  status: EffectiveStatus;
}

/** The task sheet's full payload for one task. */
export interface TaskDetail {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  description: string | null;
  /** Effective status (drives the pill + the Start/Complete/Blocked action state). */
  status: EffectiveStatus;
  /** Raw human-declared PR url — sanitized at render (see file header). */
  prUrl: string | null;
  /** Paths/globs the work is expected to touch — soft, "declared, not enforced". */
  filesScope: string[];
  /** `null` when unclaimed or the claimant was erased. */
  claimer: UserRef | null;
  /** True when the caller is the claimant (the `is-mine` / "· you" treatment). */
  isMine: boolean;
  feature: {
    id: string;
    /** Authored short key (`f-mcp`); `null` until authored. */
    slug: string | null;
    title: string;
    /** `null` when unowned or the owner was erased. */
    owner: UserRef | null;
  };
  /** Tasks this one depends on (must be merged before it's pullable). */
  blockedBy: TaskDetailRef[];
  /** Tasks that depend on this one (unblocked when it merges). */
  blocks: TaskDetailRef[];
}

/**
 * The nested select shared by both dependency directions — enough of each
 * neighbour to render its row *and* compute its own effective status (its stored
 * status + claimant + the statuses of the tasks it in turn depends on).
 */
const NEIGHBOUR_SELECT = Prisma.validator<Prisma.TaskSelect>()({
  id: true,
  number: true,
  title: true,
  status: true,
  claimedByUserId: true,
  feature: { select: { slug: true } },
  dependencies: { select: { dependsOn: { select: { status: true } } } },
});

// Derived from the select so the two never drift (add a field to the select and
// the type follows automatically).
type Neighbour = Prisma.TaskGetPayload<{ select: typeof NEIGHBOUR_SELECT }>;

function toRef(n: Neighbour): TaskDetailRef {
  return {
    id: n.id,
    number: n.number,
    title: n.title,
    featureSlug: n.feature.slug,
    status: computeEffectiveStatus(
      n,
      n.dependencies.map((d) => d.dependsOn)
    ),
  };
}

/**
 * Load one task's full detail for a member of `projectId`. Throws `NotFoundError`
 * (→ 404) for a non-member/unknown project (via `getAccessibleProject`) or a task
 * that doesn't exist / lives in another project (the `feature.projectId` scope).
 */
export async function getTaskDetail(
  userId: string,
  projectId: string,
  taskId: string
): Promise<TaskDetail> {
  // Access decides visibility (deny ≡ 404). We only need the confirmation.
  await getAccessibleProject(userId, projectId);

  // Scoped to the confirmed project — a task from another project (even one the
  // caller belongs to) is not found here, closing the cross-project id-swap.
  const task = await prisma.task.findFirst({
    where: { id: taskId, feature: { projectId } },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      status: true,
      prUrl: true,
      filesScope: true,
      claimedByUserId: true,
      feature: { select: { id: true, slug: true, title: true, ownerUserId: true } },
      dependencies: { select: { dependsOn: { select: NEIGHBOUR_SELECT } } },
      dependents: { select: { task: { select: NEIGHBOUR_SELECT } } },
    },
  });
  if (!task) throw new NotFoundError(`Task ${taskId} not found`);

  // One batched identity lookup for the claimer + the feature owner.
  const users = await fetchUsers([
    ...(task.claimedByUserId ? [task.claimedByUserId] : []),
    ...(task.feature.ownerUserId ? [task.feature.ownerUserId] : []),
  ]);

  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    status: computeEffectiveStatus(
      task,
      task.dependencies.map((d) => d.dependsOn)
    ),
    prUrl: task.prUrl,
    filesScope: task.filesScope,
    claimer: task.claimedByUserId ? (users.get(task.claimedByUserId) ?? null) : null,
    isMine: task.claimedByUserId === userId,
    feature: {
      id: task.feature.id,
      slug: task.feature.slug,
      title: task.feature.title,
      owner: task.feature.ownerUserId ? (users.get(task.feature.ownerUserId) ?? null) : null,
    },
    // `dependencies.dependsOn` = the tasks this depends on (blockers);
    // `dependents.task` = the tasks that depend on this (what it blocks).
    blockedBy: task.dependencies.map((d) => toRef(d.dependsOn)),
    blocks: task.dependents.map((d) => toRef(d.task)),
  };
}
