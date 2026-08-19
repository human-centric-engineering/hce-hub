/**
 * Shared task-progress actions — Start and Complete (f-status-model §20 t-1).
 *
 * Under the new status model you claim **features, not tasks**: a task is *born*
 * `claimed` (owned by the feature owner) when the feature is planned. These are
 * the two hand transitions that move it forward — **Start** (`claimed → active`)
 * and **Complete** (`active → merged`) — replacing the retired `claim_task`
 * pull. `f-github-sync` will later automate Complete on PR-merge; until then both
 * are drivable from the task sheet so the flow is fully exercisable in the Hub.
 *
 * Pull-not-push, still soft (§5): Start never hard-locks — it credits the doer
 * (`claimedByUserId → caller`), opens a `TaskClaim` as the *active-work* record
 * (the soft-collision + history source now that task-claiming is gone), and
 * returns **soft file-overlap warnings** against other open (active) claims for
 * the human to weigh. Both are lenient/idempotent (a no-op when already there),
 * so a double-click or an out-of-band `f-github-sync` complete can't error.
 *
 * Membership is the [[f-access]] funnel's (`resolveTaskAccess`): a non-member, or
 * a task in a project the caller can't see, is `NotFoundError` (→ 404, never
 * 403). An optional `expectedProjectId` scopes the task to a specific project so
 * the consumer route can reject a cross-project id-swap (matching the read).
 */
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TaskStatus } from '@prisma/client';
import { resolveTaskAccess, resolveFeatureAccess, canAccessProject } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { detectFileOverlapWarnings, type CollisionWarning } from '@/lib/projects/collision';

export interface TaskActionResult {
  taskId: string;
  /** The task's project-wide `t-N` ref (f-refs); `null` until assigned. Lets a caller
   * name the task it just acted on without a second read (t-66). */
  number: number | null;
  /** The task's stored status after the action. */
  status: TaskStatus;
  /** Soft warnings — advisory, never a block (Start only). */
  warnings: CollisionWarning[];
}

/** The outcome of a feature-level "reassign remaining" (f-task-assignment §22 t2). */
export interface FeatureReassignResult {
  featureId: string;
  /** How many (unmerged) tasks were reassigned. */
  reassigned: number;
  /** Soft handoff heads-ups, one per active task taken from a different worker. */
  warnings: CollisionWarning[];
}

/** Resolve + project-scope a task, or throw the funnel's 404. */
async function resolveScoped(userId: string, taskId: string, expectedProjectId?: string) {
  const access = await resolveTaskAccess(userId, taskId);
  if (!access.ok) throw new NotFoundError(`Task ${taskId} not found`);
  const task = access.task;
  if (expectedProjectId && task.projectId !== expectedProjectId) {
    throw new NotFoundError(`Task ${taskId} not found`);
  }
  return task;
}

/** The transaction client `executeTransaction` hands its callback (reused, not re-derived). */
type Tx = Parameters<Parameters<typeof executeTransaction>[0]>[0];

/** The minimal task shape one (re)assignment operates on. */
interface AssignableTask {
  taskId: string;
  featureId: string;
  projectId: string;
  status: TaskStatus;
  claimedByUserId: string | null;
}

/**
 * Apply one (re)assignment inside `tx` — the shared core of `assignTask` (one
 * task) and `reassignFeatureTasks` (a feature's unmerged tasks), so they can't
 * drift (f-task-assignment §22 t1/t2).
 *
 * Points the task at `assigneeUserId` and syncs the claim to them (as a born task
 * is), so the claimer-based surfaces already show the new person. Handing off
 * **active** work to a *different* person resets it `active → claimed` (they start
 * fresh) and releases the displaced worker's open claim, returning a soft
 * heads-up; re-assigning active work to the person already on it leaves their
 * in-progress work untouched. Journals `task_assigned`. **Callers must exclude
 * merged tasks** — finished work credits its doer, never reassigned.
 *
 * A **null `assigneeUserId` releases** the task back to the unassigned pool (§32
 * t-89): both user fields clear, so it routes to the Board's Unassigned lane. An
 * `active` task stands down to `claimed` and its open claim closes — an active task
 * with nobody on it is incoherent, and the closure matters beyond tidiness: the soft
 * *collision* detector keys off open claims, so a released task left holding one
 * would keep warning the next person off its own files.
 */
async function applyAssignment(
  tx: Tx,
  task: AssignableTask,
  assigneeUserId: string | null,
  actorUserId: string
): Promise<{ nextStatus: TaskStatus; warning: CollisionWarning | null }> {
  const displacedWorker =
    task.status === 'active' && task.claimedByUserId && task.claimedByUserId !== assigneeUserId
      ? task.claimedByUserId
      : null;

  // The invariant: an `active` task ends this call with a worker on it, or it is not
  // active any more. Two ways it can lose one — handed to a different person, or
  // released to nobody. The second is NOT covered by `displacedWorker`, which needs
  // a claimant to displace: an active task can already have a null one (erasure
  // nulls `claimedByUserId`), and releasing that left `active` + nobody standing —
  // an active card in the Unassigned lane, the exact state this doc calls incoherent.
  const endsWithNoWorker = task.status === 'active' && assigneeUserId === null;
  const standsDown = displacedWorker !== null || endsWithNoWorker;
  const nextStatus: TaskStatus = standsDown ? 'claimed' : task.status;

  // Whenever the task stands down, its open active-work claim closes with it —
  // a genuine handoff, or a release. Re-assigning active work to the person already
  // on it is neither, and leaves their claim alone.
  if (standsDown) {
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
  }
  await tx.task.update({
    where: { id: task.taskId },
    data: { assigneeUserId, claimedByUserId: assigneeUserId, status: nextStatus },
  });
  // Journal the (re)assignment inside the same tx (an event iff it commits).
  await recordProjectEvent(tx, {
    projectId: task.projectId,
    featureId: task.featureId,
    taskId: task.taskId,
    kind: 'task_assigned',
    actorUserId,
    metadata: { assigneeUserId, from: task.status },
  });

  // Only worth a heads-up when someone *else's* active work was displaced. Putting
  // your own task down is the release path's normal case, not a collision — and
  // "someone else" would simply be untrue there.
  const warning: CollisionWarning | null =
    displacedWorker && displacedWorker !== actorUserId
      ? {
          kind: 'already_claimed',
          userId: displacedWorker,
          taskId: task.taskId,
          // Whole clauses, not a swapped noun: interpolating "release" into
          // "…released on ___" produced "released on release."
          message:
            assigneeUserId === null
              ? 'Heads-up: someone else was actively working this task — returning it to the pool closed their claim.'
              : 'Heads-up: this task was actively being worked by someone else — their claim was released on reassignment.',
        }
      : null;
  return { nextStatus, warning };
}

/**
 * Start `taskId` (claimed → active) for `userId`: credits the doer, opens a fresh
 * active-work `TaskClaim`, and returns soft file-overlap warnings. A no-op (no
 * status change, no event) when the task is already `merged` — you can't restart
 * finished work. Throws `NotFoundError` (→ 404) for a non-member / unknown task,
 * or one outside `expectedProjectId`.
 */
export async function startTask(
  userId: string,
  taskId: string,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  // Can't restart finished work — a lenient no-op, never an error.
  if (task.status === 'merged') {
    return { taskId: task.taskId, number: task.number, status: 'merged', warnings: [] };
  }

  const warnings: CollisionWarning[] = [];

  // Heads-up when the task is owned/held by someone else (born claimed by the
  // feature owner; a different member starting it is taking over the active work).
  if (task.claimedByUserId && task.claimedByUserId !== userId) {
    warnings.push({
      kind: 'already_claimed',
      userId: task.claimedByUserId,
      taskId: task.taskId,
      message: 'Heads-up: this task is currently held by someone else.',
    });
  }

  // Soft file-collision: other open (active) claims in the project whose scope
  // overlaps this task's declared scope. Skipped when this task declares none.
  if (task.filesScope.length > 0) {
    const otherOpenClaims = await prisma.taskClaim.findMany({
      where: {
        releasedAt: null,
        userId: { not: userId },
        taskId: { not: task.taskId },
        task: { feature: { projectId: task.projectId } },
      },
      select: {
        userId: true,
        claimedAt: true,
        task: { select: { id: true, title: true, filesScope: true } },
      },
    });
    warnings.push(
      ...detectFileOverlapWarnings(
        task.filesScope,
        otherOpenClaims.map((c) => ({
          userId: c.userId,
          claimedAt: c.claimedAt,
          taskId: c.task.id,
          taskTitle: c.task.title,
          filesScope: c.task.filesScope,
        }))
      )
    );
  }

  await executeTransaction(async (tx) => {
    // Release any prior open claim (records the handoff), then open a fresh
    // active-work claim for the caller and point the task at them.
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.taskClaim.create({ data: { taskId: task.taskId, userId } });
    await tx.task.update({
      where: { id: task.taskId },
      data: { status: 'active', claimedByUserId: userId },
    });
    // Reuse `task_claimed` for "actively taken" (no new ProjectEventKind).
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_claimed',
      actorUserId: userId,
      metadata: { from: task.status, previousClaimant: task.claimedByUserId },
    });
  });

  logAdminAction({
    userId,
    action: 'task.start',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { warningCount: warnings.length, from: task.status },
  });

  return { taskId: task.taskId, number: task.number, status: 'active', warnings };
}

/**
 * Assign `taskId` to `assigneeUserId` (f-task-assignment §f-ta t1) — the missing
 * verb that re-sets the dormant `assigneeUserId` (born = feature owner, never
 * re-set until now). Self = "take/claim it", another = "reassign", **`null` =
 * "put it back"** — one verb.
 *
 * **Any project member may (re)assign or release** (call 2 — open/trusting; the
 * caller's membership is the `resolveTaskAccess` funnel's, deny ≡ 404). A *named*
 * **assignee** must be a member of the task's project (else `ValidationError`);
 * a null one has nobody to check. Decoupled from feature ownership (call 4):
 * never touches `Feature.ownerUserId`.
 *
 * Semantics:
 * - **Merged is a no-op** — completed work credits its doer (`claimedByUserId`);
 *   you don't reassign finished tasks (call 3 rider).
 * - **Active hands off cleanly** (call 1a): reassigning an active task to a
 *   *different* person releases the displaced worker's open `TaskClaim`, resets
 *   `active → claimed` so the new assignee starts fresh, and returns a soft
 *   heads-up. Re-assigning an active task to the person already working it is a
 *   no-op on status/claim — it can't knock the active worker back to `claimed`.
 * - **Release (`null`) is that same handoff, to nobody** (§32 t-89): both user
 *   fields clear and the task lands in the Unassigned lane. An *active* task
 *   released resets to `claimed` and its open claim closes — an active task with
 *   no worker would be incoherent, and would go on tripping the collision
 *   detector for whoever came next.
 * - `claimedByUserId` is synced to the new assignee in the `claimed` state (as a
 *   born task is), so the existing claimer-based plan/board display already shows
 *   the new person; the richer status-aware display is t2.
 *
 * Journals a `task_assigned` `ProjectEvent` (the handoff trail — who moved whose
 * work, and when; a release records a null `assigneeUserId`) inside the same tx,
 * and audit-logs it. An optional `expectedProjectId` rejects a cross-project
 * id-swap.
 */
export async function assignTask(
  userId: string,
  taskId: string,
  assigneeUserId: string | null,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  // Can't reassign finished work — a merged task credits its doer; lenient no-op.
  if (task.status === 'merged') {
    return { taskId: task.taskId, number: task.number, status: 'merged', warnings: [] };
  }

  // A named assignee must be a member of the task's project (deny ≡ not a member).
  // A release names nobody, so there is no membership to check.
  if (assigneeUserId !== null) {
    const { basis } = await canAccessProject(assigneeUserId, task.projectId);
    if (basis === null) {
      throw new ValidationError('The assignee must be a member of this project.');
    }
  }

  // The (re)assignment itself — the shared per-task core (handoff reset + claim
  // release + journal), so this and the feature-level reassign never diverge.
  const { nextStatus, warning } = await executeTransaction((tx) =>
    applyAssignment(
      tx,
      {
        taskId: task.taskId,
        featureId: task.featureId,
        projectId: task.projectId,
        status: task.status,
        claimedByUserId: task.claimedByUserId,
      },
      assigneeUserId,
      userId
    )
  );

  logAdminAction({
    userId,
    action: 'task.assign',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { assigneeUserId, from: task.status },
  });

  return {
    taskId: task.taskId,
    number: task.number,
    status: nextStatus,
    warnings: warning ? [warning] : [],
  };
}

/**
 * Reassign a feature's **unmerged** tasks to `assigneeUserId` — the "reassign
 * remaining" move (f-task-assignment §22 t2, design call 3): a dev goes off / is
 * pulled onto something else, so hand their outstanding work on this feature to
 * someone else in one action.
 *
 * - **Unmerged only** — merged tasks are left untouched (finished work credits its
 *   doer, call 3 rider).
 * - **Never touches `Feature.ownerUserId`** — task assignment is decoupled from
 *   feature ownership (call 4); this moves the *tasks*, not the feature.
 * - Any project member may reassign (call 2); the assignee must be a member (else
 *   `ValidationError`). Each task runs through the same `applyAssignment` core as
 *   the single-task verb (handoff reset + claim release + `task_assigned` journal),
 *   all in one transaction; each active handoff adds a soft heads-up.
 *
 * A no-op (0 reassigned) when the feature has no unmerged tasks. Throws
 * `NotFoundError` (→ 404) for a non-member / unknown feature, or one outside
 * `expectedProjectId`.
 */
export async function reassignFeatureTasks(
  userId: string,
  featureId: string,
  assigneeUserId: string,
  expectedProjectId?: string
): Promise<FeatureReassignResult> {
  const access = await resolveFeatureAccess(userId, featureId, 'member');
  if (!access.ok) throw new NotFoundError(`Feature ${featureId} not found`);
  const feature = access.feature;
  // Scope to the route's project (no cross-project id-swap) when asked to.
  if (expectedProjectId && feature.projectId !== expectedProjectId) {
    throw new NotFoundError(`Feature ${featureId} not found`);
  }

  // The assignee must be a member of the feature's project (deny ≡ not a member).
  const { basis } = await canAccessProject(assigneeUserId, feature.projectId);
  if (basis === null) {
    throw new ValidationError('The assignee must be a member of this project.');
  }

  // Only the unmerged tasks move — merged work keeps its doer credit (call 3 rider).
  const unmerged = await prisma.task.findMany({
    where: { featureId, status: { not: 'merged' } },
    select: { id: true, status: true, claimedByUserId: true, assigneeUserId: true },
  });
  // Skip tasks already fully on the target (assignee *and* claim) — a genuine no-op:
  // reassigning wouldn't change anything, so it mustn't inflate the count or write a
  // spurious `task_assigned` (double-click, or the target already holds some).
  const tasks = unmerged.filter(
    (t) => t.assigneeUserId !== assigneeUserId || t.claimedByUserId !== assigneeUserId
  );
  if (tasks.length === 0) {
    return { featureId, reassigned: 0, warnings: [] };
  }

  // All the reassignments in one transaction — either the whole handoff lands or
  // none of it does (no half-moved feature).
  const warnings = await executeTransaction(async (tx) => {
    const collected: CollisionWarning[] = [];
    for (const t of tasks) {
      const { warning } = await applyAssignment(
        tx,
        {
          taskId: t.id,
          featureId,
          projectId: feature.projectId,
          status: t.status,
          claimedByUserId: t.claimedByUserId,
        },
        assigneeUserId,
        userId
      );
      if (warning) collected.push(warning);
    }
    return collected;
  });

  logAdminAction({
    userId,
    action: 'feature.reassign_tasks',
    entityType: 'app_feature',
    entityId: featureId,
    metadata: { assigneeUserId, taskCount: tasks.length },
  });

  return { featureId, reassigned: tasks.length, warnings };
}

/**
 * How a task's PR merge is attributed (f-github-identity §23 t-76). **Additive** —
 * the merger is distinct from the doer (`claimedByUserId`), which `completeTask`
 * never overwrites; passed only by the f-github-sync webhook path, never a human
 * Complete.
 */
export interface MergeAttribution {
  /** The GitHub merger mapped to a Hub user, or `null` when they're unlinked/external. */
  userId: string | null;
  /** The merger's raw GitHub login — kept in the journal trail even when unmapped. */
  githubLogin: string;
}

/**
 * Should this merge **adopt** the merger as the task's doer (§32 t-89, owner call)?
 *
 * Only when there is no doer to overwrite. A task that nobody claimed can now reach
 * a merged PR — an `enhancement` is born unassigned, and any task can be released —
 * and the alternative to crediting the merger is a merged task attributed to nobody.
 * Owner's call: a real name beats a blank, and this is an edge case; if unclaimed
 * merges turn out to be common the mechanism can change then.
 *
 * The "additive, never the doer" rule (f-github-sync §14) is intact: it exists so a
 * webhook can't overwrite the person who *did* the work. Here there is nobody to
 * overwrite, so the rule has nothing to protect.
 */
function adoptsMergerAsDoer(
  claimedByUserId: string | null,
  mergedBy?: MergeAttribution
): mergedBy is MergeAttribution & { userId: string } {
  return claimedByUserId === null && mergedBy?.userId != null;
}

/**
 * Complete `taskId` (→ merged) for `userId`: closes the open active-work claim and
 * journals the merge. Lenient — advances from `claimed` or `active`, and a no-op
 * when already `merged`. Throws `NotFoundError` (→ 404) for a non-member / unknown
 * task, or one outside `expectedProjectId`.
 *
 * `mergedBy` (f-github-sync only) records **who merged the PR** on `Task.mergedByUserId`
 * + the `task_merged` event — additive attribution that never overwrites the doer
 * (`actorUserId` stays `userId`, the claimant). Omitted for a human Complete.
 *
 * The one case where the merger also becomes the doer is an **unclaimed** task: see
 * `adoptsMergerAsDoer`. The journal records `doerAdopted: true` there, so the trail
 * distinguishes credit that was earned from credit that was inferred.
 */
export async function completeTask(
  userId: string,
  taskId: string,
  expectedProjectId?: string,
  mergedBy?: MergeAttribution
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  // Already done — idempotent no-op for the status flip. BUT a merge webhook may
  // carry attribution for a task a human already completed manually (Complete
  // clicked before the webhook fired): backfill `mergedByUserId` so that race
  // doesn't silently lose the "who merged it" attribution. Idempotent — a
  // re-delivery writes the same merger. (No new event — the merge is already
  // journaled by the first completion.)
  // An unclaimed task adopts the merger as its doer, so merged work always carries
  // a name (§32 t-89) — applied on both the live and the backfill path.
  const adoptDoer = adoptsMergerAsDoer(task.claimedByUserId, mergedBy);

  if (task.status === 'merged') {
    // Deliberately does NOT stamp `mergedAt`. A task that is already merged with
    // no timestamp was merged before the column existed (§19 imported 34 of the
    // 47 merged rows this way), and `now()` is not when it landed — an invented
    // timestamp is worse than an honest NULL, which at least sorts as oldest.
    if (mergedBy) {
      await prisma.task.update({
        where: { id: task.taskId },
        data: {
          mergedByUserId: mergedBy.userId,
          ...(adoptDoer ? { claimedByUserId: mergedBy.userId } : {}),
        },
      });
    }
    return { taskId: task.taskId, number: task.number, status: 'merged', warnings: [] };
  }

  await executeTransaction(async (tx) => {
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.task.update({
      where: { id: task.taskId },
      // Additive: set the merger when given. The doer (claimedByUserId) is only
      // ever *filled in*, never overwritten — see `adoptsMergerAsDoer`.
      data: {
        status: 'merged',
        ...(mergedBy ? { mergedByUserId: mergedBy.userId } : {}),
        ...(adoptDoer ? { claimedByUserId: mergedBy.userId } : {}),
      },
    });
    // Stamp WHEN it landed (§33-sweep t-115) — but only if nothing stamped it
    // already. This is an `updateMany` with `mergedAt: null` in the predicate
    // rather than a value on the update above, and the guard is load-bearing:
    // the early-return at the top of this function tests `task.status` from a
    // read taken BEFORE any lock, so two concurrent completions both reach here.
    // Postgres re-evaluates an UPDATE's predicate after taking the row lock, so
    // the loser matches zero rows and the first stamp stands. Setting it inline
    // above would let the second writer move a milestone that is now rendered —
    // the §33 t-103 failure, one model over.
    await tx.task.updateMany({
      where: { id: task.taskId, mergedAt: null },
      data: { mergedAt: new Date() },
    });
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_merged',
      actorUserId: userId,
      metadata: {
        from: task.status,
        ...(mergedBy
          ? { mergedByUserId: mergedBy.userId, mergedByGithubLogin: mergedBy.githubLogin }
          : {}),
        // Credit inferred, not earned — keep the two distinguishable in the trail.
        ...(adoptDoer ? { doerAdopted: true } : {}),
      },
    });
  });

  logAdminAction({
    userId,
    action: 'task.complete',
    entityType: 'app_task',
    entityId: task.taskId,
    // Mirror the journal's attribution so the two authoritative logs agree.
    metadata: {
      from: task.status,
      ...(mergedBy
        ? { mergedByUserId: mergedBy.userId, mergedByGithubLogin: mergedBy.githubLogin }
        : {}),
    },
  });

  return { taskId: task.taskId, number: task.number, status: 'merged', warnings: [] };
}

/**
 * Link `taskId` to its pull request (`f-github-sync` §14 t-1). Sets/replaces
 * `Task.prUrl` and journals `task_pr_linked` — **no status change**: linking a PR
 * is not merging it, and the 3-state model (`claimed | active | merged`) has no
 * in-PR state. This is the "PR-URL declared by human in v1" groundwork; the §14
 * webhook later drives `completeTask` (not this) on the *merge* event, so the two
 * paths never fight over status.
 *
 * `prUrl` is expected already-validated (a member-facing http(s) URL — the
 * `set_pr` capability's Zod boundary does that; the render layer also
 * `sanitizeUrl`s it). Funnel-scoped like its siblings: a non-member, or a task in
 * a project the caller can't see, is `NotFoundError` (→ 404, never 403); an
 * optional `expectedProjectId` rejects a cross-project id-swap. Returns the
 * task's *unchanged* status so callers can confirm the no-op on the lifecycle.
 */
export async function setTaskPr(
  userId: string,
  taskId: string,
  prUrl: string,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  await executeTransaction(async (tx) => {
    await tx.task.update({ where: { id: task.taskId }, data: { prUrl } });
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_pr_linked',
      actorUserId: userId,
      metadata: { prUrl },
    });
  });

  logAdminAction({
    userId,
    action: 'task.set_pr',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { prUrl },
  });

  // No status change — return the current stored status so the no-op is explicit.
  return { taskId: task.taskId, number: task.number, status: task.status, warnings: [] };
}
