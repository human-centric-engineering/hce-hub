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
import { Prisma, type TaskKind } from '@prisma/client';
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
  /** The task's acceptance contract (markdown); `null` until authored. */
  doneWhen: string | null;
  /** Effective status (drives the pill + the Start/Complete/Blocked action state). */
  status: EffectiveStatus;
  /** `bug` (a defect, marked distinctly) vs `feature_work` (f-bug-handling §22-02). */
  kind: TaskKind;
  /** Raw human-declared PR url — sanitized at render (see file header). */
  prUrl: string | null;
  /** Paths/globs the work is expected to touch — soft, "declared, not enforced". */
  filesScope: string[];
  /** `null` when unclaimed or the claimant was erased. The doer, once merged. */
  claimer: UserRef | null;
  /**
   * The GitHub merger mapped to a Hub user (f-github-identity §23) — **additive**,
   * distinct from `claimer` (the doer). `null` when the PR wasn't merged by a
   * linked Hub user (external / not connected), or that user was later erased.
   */
  mergedBy: UserRef | null;
  /**
   * Who the task is **assigned to** (f-task-assignment §22 t2) — the person the
   * assignee picker shows + reassigns. `null` when unassigned or the assignee was
   * erased. Defaults to the feature owner at plan time.
   */
  assignee: UserRef | null;
  /** True when the caller is the claimant (the `is-mine` / "· you" treatment). */
  isMine: boolean;
  /**
   * The assignee picker's options (f-task-assignment §22 t2): the project's members
   * in membership order (erased users dropped), plus the current assignee if they've
   * since left the project (so the picker renders the current value — see
   * `buildPickerOptions`). Any member may be assigned (call 2, open/trusting).
   */
  members: UserRef[];
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
 * The assignee picker's options (f-task-assignment §22 t2): the project's members
 * in membership order (erased users dropped), plus — if the task's **current
 * assignee** isn't among them (they've left the project but still hold the task) —
 * that assignee appended, so the picker renders the current value instead of
 * "Unassigned" while the Plan/Board show their name. New assignments are still
 * membership-checked in the core; re-picking the current assignee is a no-op.
 */
function buildPickerOptions(
  members: { userId: string }[],
  users: Map<string, UserRef>,
  assigneeUserId: string | null
): UserRef[] {
  const options = members.map((m) => users.get(m.userId)).filter((u): u is UserRef => u != null);
  if (assigneeUserId && !options.some((u) => u.id === assigneeUserId)) {
    const assignee = users.get(assigneeUserId);
    if (assignee) options.push(assignee);
  }
  return options;
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
  // caller belongs to) is not found here, closing the cross-project id-swap. The
  // project's members are the assignee picker's options; loaded in parallel.
  const [task, members] = await Promise.all([
    prisma.task.findFirst({
      where: { id: taskId, feature: { projectId } },
      select: {
        id: true,
        number: true,
        title: true,
        description: true,
        doneWhen: true,
        status: true,
        kind: true,
        prUrl: true,
        filesScope: true,
        claimedByUserId: true,
        assigneeUserId: true,
        mergedByUserId: true,
        feature: { select: { id: true, slug: true, title: true, ownerUserId: true } },
        dependencies: { select: { dependsOn: { select: NEIGHBOUR_SELECT } } },
        dependents: { select: { task: { select: NEIGHBOUR_SELECT } } },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { addedAt: 'asc' },
      select: { userId: true },
    }),
  ]);
  if (!task) throw new NotFoundError(`Task ${taskId} not found`);

  // One batched identity lookup for the claimer + assignee + feature owner + every
  // member (the picker's options).
  const users = await fetchUsers([
    ...(task.claimedByUserId ? [task.claimedByUserId] : []),
    ...(task.assigneeUserId ? [task.assigneeUserId] : []),
    ...(task.mergedByUserId ? [task.mergedByUserId] : []),
    ...(task.feature.ownerUserId ? [task.feature.ownerUserId] : []),
    ...members.map((m) => m.userId),
  ]);

  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    doneWhen: task.doneWhen,
    status: computeEffectiveStatus(
      task,
      task.dependencies.map((d) => d.dependsOn)
    ),
    kind: task.kind,
    prUrl: task.prUrl,
    filesScope: task.filesScope,
    claimer: task.claimedByUserId ? (users.get(task.claimedByUserId) ?? null) : null,
    assignee: task.assigneeUserId ? (users.get(task.assigneeUserId) ?? null) : null,
    mergedBy: task.mergedByUserId ? (users.get(task.mergedByUserId) ?? null) : null,
    isMine: task.claimedByUserId === userId,
    members: buildPickerOptions(members, users, task.assigneeUserId),
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
