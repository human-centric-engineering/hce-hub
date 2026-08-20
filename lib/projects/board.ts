/**
 * Project Board read (f-board-view, feature 10).
 *
 * The **task-centric** read the Board (Kanban) renders — the same features/tasks
 * as the Plan view (§09), but grouped into a 2-D matrix: **member swim lanes**
 * (rows) × **effective-status columns** (Claimed · Active · Merged). All the
 * routing is done here (server-side, like §09's `planOrder`) so the client just
 * renders a grid and the load-bearing logic is testable at the boundary.
 *
 * Routing rules (v1-requirements §5, pull-not-push; statuses per f-status-model §20):
 *   - **lane** = the task's **holder** (`taskHolderId`, f-task-assignment §22 t2):
 *     the **assignee** while the task is open, the **doer** (claimant) once merged
 *     (a born task routes to its assignee — the feature owner by default, but an
 *     `enhancement` is born with none); a null or non-member holder → the terminal
 *     **Unassigned** lane (carried f-data-model t-3 — never deref), which is where
 *     unclaimed work waits to be pulled (§32 t-89).
 *   - **column** = the task's *effective* status (`computeEffectiveStatus`, so
 *     Plan and Board never diverge); a deps-blocked task (effective `blocked`)
 *     folds into the **Claimed** column with the blocked treatment (it's a
 *     claimed task that can't start yet — no column of its own).
 *   - **collision** = a soft, ambient flag when the task's open (active-work)
 *     claim overlaps another open claim's file scope (`filesOverlap`); never a
 *     lock (§13.5). **A blocked card can never carry one**, and needs no rule
 *     to suppress it: the marker is computed purely from open claims, and
 *     `startTask` — the only writer of a `TaskClaim` — sets the task `active`
 *     in the same transaction, while `applyAssignment` (standing down) and
 *     `completeTask` both close the claim as the task leaves `active`. So an
 *     open claim implies `active`, and `blocked` only ever arises from
 *     `claimed`. The **task sheet** is the surface that needed the owner's
 *     blocked rule (2026-08-20), because it deliberately does *not* require the
 *     task to hold a claim of its own.
 *
 * Membership is the [[f-access]] funnel's: the load goes through
 * `getAccessibleProject`, so a non-member or unknown id is a 404, never a 403.
 */
import type { ProjectRole, TaskKind } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import {
  computeEffectiveStatus,
  taskHolderId,
  type EffectiveStatus,
} from '@/lib/projects/task-status';
import { filesOverlap } from '@/lib/projects/collision';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

/** The board's status columns, in display order. Effective `blocked` folds into `claimed`. */
export const BOARD_COLUMNS = ['claimed', 'active', 'merged'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** A task card on the board. */
export interface BoardTaskCard {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  featureId: string;
  /** The feature's authored slug (`f-mcp`); `null` until authored. */
  featureSlug: string | null;
  featureTitle: string;
  /** Effective status (drives the column; kept for the card pill). */
  status: EffectiveStatus;
  /** `bug` (a defect, marked distinctly) vs `feature_work` (f-bug-handling §22-02). */
  kind: TaskKind;
  column: BoardColumn;
  /** ISO instant the task merged; `null` when unmerged, or merged before we tracked it. */
  mergedAt: string | null;
  prUrl: string | null;
  /**
   * The person shown against the card (via `taskHolderId`, f-task-assignment §22
   * t2): the **assignee** while open, the **doer** (claimant) once merged — the
   * same person whose lane the card routes into. `null` when unassigned/erased.
   */
  claimer: UserRef | null;
  /** True when the caller is the claimant (the `is-mine` highlight). */
  isMine: boolean;
  /** A soft file-overlap warning against another open claim, or `null`. */
  collision: { note: string } | null;
}

/** One swim lane — a project member, or the terminal Unassigned bucket. */
export interface BoardLane {
  /** The member's userId, or `'unassigned'`. */
  key: string;
  /** `null` for the Unassigned lane or an erased member. */
  member: UserRef | null;
  /** `null` for the Unassigned lane. */
  role: ProjectRole | null;
  ownedFeatures: { id: string; slug: string | null; title: string }[];
  tasks: BoardTaskCard[];
  taskCount: number;
}

/** The Board payload — lanes (members by task count, Unassigned last) + column totals. */
export interface ProjectBoard {
  projectId: string;
  lanes: BoardLane[];
  columnTotals: Record<BoardColumn, number>;
}

const UNASSIGNED = 'unassigned';

/**
 * Load one project's Board for a member. Throws `NotFoundError` (→ 404) for a
 * non-member or unknown id, via `getAccessibleProject`.
 */
export async function getProjectBoard(userId: string, projectId: string): Promise<ProjectBoard> {
  await getAccessibleProject(userId, projectId);

  const [members, features, tasks, openClaims] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { addedAt: 'asc' },
      select: { userId: true, role: true },
    }),
    prisma.feature.findMany({
      where: { projectId },
      select: { id: true, slug: true, title: true, ownerUserId: true },
    }),
    prisma.task.findMany({
      where: { feature: { projectId } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        number: true,
        title: true,
        featureId: true,
        status: true,
        kind: true,
        prUrl: true,
        claimedByUserId: true,
        assigneeUserId: true,
        mergedAt: true,
        dependencies: { select: { dependsOn: { select: { status: true } } } },
      },
    }),
    // Open claims (with their task's file scope) — the soft-collision source.
    prisma.taskClaim.findMany({
      where: { releasedAt: null, task: { feature: { projectId } } },
      select: { userId: true, task: { select: { id: true, title: true, filesScope: true } } },
    }),
  ]);

  // Soft collisions: any two open claims on distinct tasks with overlapping file
  // scope flag both tasks (a signal, never a lock). Empty on the seed (no scope).
  const collisionByTask = new Map<string, { note: string }>();
  for (let i = 0; i < openClaims.length; i++) {
    for (let j = i + 1; j < openClaims.length; j++) {
      const a = openClaims[i].task;
      const b = openClaims[j].task;
      if (a.id === b.id) continue;
      if (filesOverlap(a.filesScope, b.filesScope)) {
        if (!collisionByTask.has(a.id))
          collisionByTask.set(a.id, { note: `Overlaps “${b.title}”` });
        if (!collisionByTask.has(b.id))
          collisionByTask.set(b.id, { note: `Overlaps “${a.title}”` });
      }
    }
  }

  // Batched identities for member lanes + task holders (assignee or claimant).
  const users = await fetchUsers([
    ...members.map((m) => m.userId),
    ...tasks.flatMap((t) => [
      ...(t.claimedByUserId ? [t.claimedByUserId] : []),
      ...(t.assigneeUserId ? [t.assigneeUserId] : []),
    ]),
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  const featureById = new Map(features.map((f) => [f.id, f]));

  // Route each task into a lane + column.
  const cardsByLane = new Map<string, BoardTaskCard[]>();
  for (const m of members) cardsByLane.set(m.userId, []);
  cardsByLane.set(UNASSIGNED, []);

  for (const t of tasks) {
    const feature = featureById.get(t.featureId);
    if (!feature) continue; // FK guarantees a feature; defensive skip
    const effective = computeEffectiveStatus(
      t,
      t.dependencies.map((d) => d.dependsOn)
    );
    // A blocked task is a claimed task that can't start yet — it shows in the
    // Claimed column with the blocked treatment, not a column of its own.
    const column: BoardColumn = effective === 'blocked' ? 'claimed' : effective;
    // Lane = the task holder (f-task-assignment §22 t2): the assignee while open,
    // the doer once merged — so an open task sits in *whose work it is*, and a
    // merged task credits who did it. A null or non-member holder lands in the
    // terminal Unassigned lane. Effective status still handles the *column* (a
    // born-claimed task lands in its holder lane's Claimed column).
    //
    // No feature-owner fallback (§32 t-89). It used to stand in for a null holder,
    // which made the Unassigned lane unreachable — it has existed since §10 and
    // nothing ever landed in it, because the create cascade always set a holder.
    // Now that an `enhancement` is born unassigned, that lane is the point. The
    // fallback also mis-attributed a task whose holder was erased or left the
    // project, showing it as the owner's work rather than as nobody's.
    const holderId = taskHolderId(effective, t.claimedByUserId, t.assigneeUserId);
    const laneKey = holderId && memberIds.has(holderId) ? holderId : UNASSIGNED;

    cardsByLane.get(laneKey)!.push({
      id: t.id,
      number: t.number,
      title: t.title,
      featureId: t.featureId,
      featureSlug: feature.slug,
      featureTitle: feature.title,
      status: effective,
      kind: t.kind,
      column,
      prUrl: t.prUrl,
      claimer: holderId ? (users.get(holderId) ?? null) : null,
      // `is-mine` follows the *holder* the card shows (the assignee while open, the
      // doer once merged) — so the card, its lane, and the highlight all agree on
      // one person, even in the someone-else-started edge (assignee ≠ claimant).
      isMine: holderId === userId,
      // When it landed — the Merged column orders newest-first on it (§33-sweep
      // t-108). `null` means merged before the column existed (§19's import), which
      // sorts oldest because it is. ISO so the DTO stays Date-free.
      mergedAt: t.mergedAt ? t.mergedAt.toISOString() : null,
      // No blocked check here: see the header — an open claim implies `active`,
      // so `collisionByTask` cannot hold a blocked task in the first place. A
      // ternary here would be dead code asserting an invariant it does not test.
      collision: collisionByTask.get(t.id) ?? null,
    });
  }

  // Member lanes, most-active first; ties keep membership order (stable sort).
  const memberLanes: BoardLane[] = members
    .map((m) => {
      const laneTasks = cardsByLane.get(m.userId)!;
      return {
        key: m.userId,
        member: users.get(m.userId) ?? null,
        role: m.role,
        ownedFeatures: features
          .filter((f) => f.ownerUserId === m.userId)
          .map((f) => ({ id: f.id, slug: f.slug, title: f.title })),
        tasks: laneTasks,
        taskCount: laneTasks.length,
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount);

  // The Unassigned lane is appended only when it caught something.
  const unassigned = cardsByLane.get(UNASSIGNED)!;
  const lanes: BoardLane[] =
    unassigned.length > 0
      ? [
          ...memberLanes,
          {
            key: UNASSIGNED,
            member: null,
            role: null,
            ownedFeatures: [],
            tasks: unassigned,
            taskCount: unassigned.length,
          },
        ]
      : memberLanes;

  const columnTotals: Record<BoardColumn, number> = {
    claimed: 0,
    active: 0,
    merged: 0,
  };
  for (const lane of lanes) for (const card of lane.tasks) columnTotals[card.column]++;

  return { projectId, lanes, columnTotals };
}
