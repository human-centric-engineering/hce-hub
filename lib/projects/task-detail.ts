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
import {
  computeEffectiveStatus,
  taskHolderId,
  type EffectiveStatus,
} from '@/lib/projects/task-status';
import { overlappingPaths } from '@/lib/projects/collision';
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
  /**
   * Whether anyone holds the neighbour (§32 t-89). Carried because a `claimed` task
   * reads "assigned" or "unassigned" depending on it, and a dependency chip that
   * guessed would contradict that same task's own row one surface over. A boolean,
   * not a `UserRef`: the chip names the task, never the person.
   */
  hasHolder: boolean;
}

/**
 * An open claim elsewhere in the project whose declared scope overlaps this
 * task's (§33-sweep t-109) — a soft signal, never a lock (§13.5).
 */
export interface TaskCollision {
  /** The overlapping task, so the sheet can link straight to it. */
  taskId: string;
  number: number | null;
  title: string;
  /** Who holds that claim; `null` if they were since erased (never dereferenced). */
  holder: UserRef | null;
  /**
   * Whether that claim is the caller's own. Self-overlap is reported rather than
   * filtered: two of your own tasks in flight over the same files is a real merge
   * conflict waiting to happen, and in a single-member project filtering it would
   * leave the feature showing nothing at all — the exact inertness t-114 fixed.
   * The sheet labels it, so it never reads as someone else being there.
   */
  isMine: boolean;
  /** Which of *this* task's declared entries the other claim also covers. */
  paths: string[];
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
  /** `bug` (a defect) vs `feature_work` vs `enhancement` (f-bug-handling §22-02, f-work-kinds §32). */
  kind: TaskKind;
  /**
   * The phase that *chose* this work, when that differs from its feature's phase
   * (f-work-kinds §32 t-80). `null` = inherit the feature's phase.
   */
  phaseId: string | null;
  /** Raw human-declared PR url — sanitized at render (see file header). */
  prUrl: string | null;
  /** Paths/globs the work is expected to touch — soft, "declared, not enforced". */
  filesScope: string[];
  /**
   * Open claims elsewhere whose scope overlaps `filesScope`. Empty when this task
   * declares no scope, when nothing overlaps, or when the reader could not act on
   * it anyway — once `merged`, and while `blocked` (see `getTaskDetail`).
   */
  collisions: TaskCollision[];
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
  // A neighbour CAN be withdrawn, unlike on every other surface — and it must show
  // as such. A withdrawn blocker no longer blocks (see `computeEffectiveStatus`), so
  // hiding it would leave a task reading ready with no visible reason it stopped
  // waiting; and a withdrawn dependent is exactly what you want to see before
  // deciding whether this task still has a purpose.
  withdrawnAt: true,
  claimedByUserId: true,
  assigneeUserId: true,
  feature: { select: { slug: true } },
  dependencies: { select: { dependsOn: { select: { status: true, withdrawnAt: true } } } },
});

// Derived from the select so the two never drift (add a field to the select and
// the type follows automatically).
type Neighbour = Prisma.TaskGetPayload<{ select: typeof NEIGHBOUR_SELECT }>;

function toRef(n: Neighbour): TaskDetailRef {
  const status = computeEffectiveStatus(
    n,
    n.dependencies.map((d) => d.dependsOn)
  );
  return {
    id: n.id,
    number: n.number,
    title: n.title,
    featureSlug: n.feature.slug,
    status,
    // The same holder rule every other surface uses, so the chip can't disagree
    // with the row it points at. Status-dependent, hence computed after it.
    hasHolder: taskHolderId(status, n.claimedByUserId, n.assigneeUserId) !== null,
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
  const [task, members, openClaims] = await Promise.all([
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
        phaseId: true,
        prUrl: true,
        filesScope: true,
        claimedByUserId: true,
        assigneeUserId: true,
        mergedByUserId: true,
        // NOT filtered out here, unlike the Plan / Board / feature page: the sheet and
        // `get_task` are how you inspect a withdrawn task, and you cannot restore work
        // you can no longer open.
        withdrawnAt: true,
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
    // Every *other* open (active-work) claim in the project — the soft-collision
    // source, matching the Board's. Deliberately not scoped to claims held by
    // someone else, and deliberately not conditional on *this* task holding a
    // claim: the sheet is the surface you read **before** starting, which is the
    // whole point of surfacing this here (§33-sweep t-109). `start_task`'s
    // advisory return excludes your own claims because it answers a different
    // question — "is someone already here?" — at the moment you take over.
    prisma.taskClaim.findMany({
      // `filesScope.isEmpty: false` is not just an optimisation — a claim whose
      // task declares no scope can never overlap anything, so returning it only
      // to discard it makes every `get_task` (which projects `collisions` away
      // entirely) pay for rows that cannot matter.
      where: {
        releasedAt: null,
        taskId: { not: taskId },
        task: { feature: { projectId }, filesScope: { isEmpty: false } },
      },
      orderBy: { claimedAt: 'asc' },
      select: {
        userId: true,
        task: { select: { id: true, number: true, title: true, filesScope: true } },
      },
    }),
  ]);
  if (!task) throw new NotFoundError(`Task ${taskId} not found`);

  const status = computeEffectiveStatus(
    task,
    task.dependencies.map((d) => d.dependsOn)
  );

  // Which claims actually overlap — pure, so no identity lookup is spent on
  // claims that turn out not to collide.
  //
  // Silent unless the reader can actually act on it (owner, 2026-08-20):
  //   - **merged** — the work has landed; "someone else is in these files" is
  //     no longer anything to coordinate.
  //   - **blocked** — an unmerged dependency already stops this task, and that
  //     is both the stronger signal and the one rendered right below. A second
  //     warning saying "be careful of these files" adds nothing to "you cannot
  //     start yet", and the dependency is often the very task it names.
  //
  // `active` is deliberately NOT suppressed even when dependencies are unmerged:
  // `computeEffectiveStatus` keeps a started task `active` regardless of deps, so
  // someone who pushed past the block is exactly who needs telling to sequence,
  // batch, or coordinate. This suppresses the reader's OWN warning only — a
  // blocked task still holds a claim, so it goes on warning everybody else.
  const overlaps =
    status === 'merged' || status === 'blocked' || task.filesScope.length === 0
      ? []
      : // Deduped by task, not by claim row. `startTask` releases open claims and
        // creates the new one in one transaction, but under READ COMMITTED two
        // concurrent starts can each miss the other's INSERT and leave two open
        // claims on one task — which is why `board.ts`'s pairwise pass carries its
        // own `a.id === b.id` guard. Without this the sheet would render the same
        // task twice under a duplicate React key (`/code-review`).
        [
          ...new Map(
            openClaims.flatMap((claim) => {
              const paths = overlappingPaths(task.filesScope, claim.task.filesScope);
              return paths.length > 0 ? [[claim.task.id, { claim, paths }] as const] : [];
            })
          ).values(),
        ];

  // One batched identity lookup for the claimer + assignee + feature owner + every
  // member (the picker's options).
  const users = await fetchUsers([
    ...(task.claimedByUserId ? [task.claimedByUserId] : []),
    ...(task.assigneeUserId ? [task.assigneeUserId] : []),
    ...(task.mergedByUserId ? [task.mergedByUserId] : []),
    ...(task.feature.ownerUserId ? [task.feature.ownerUserId] : []),
    ...members.map((m) => m.userId),
    ...overlaps.map((o) => o.claim.userId),
  ]);

  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    doneWhen: task.doneWhen,
    status,
    kind: task.kind,
    phaseId: task.phaseId,
    prUrl: task.prUrl,
    filesScope: task.filesScope,
    collisions: overlaps.map(({ claim, paths }) => ({
      taskId: claim.task.id,
      number: claim.task.number,
      title: claim.task.title,
      holder: users.get(claim.userId) ?? null,
      isMine: claim.userId === userId,
      paths,
    })),
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
