/**
 * Project Board read (f-board-view, feature 10).
 *
 * The **task-centric** read the Board (Kanban) renders — the same features/tasks
 * as the Plan view (§09), but grouped into a 2-D matrix: **member swim lanes**
 * (rows) × **effective-status columns** (Available · Claimed · In PR · Merged ·
 * Backlog). All the routing is done here (server-side, like §09's `planOrder`) so
 * the client just renders a grid and the load-bearing logic is testable at the
 * boundary.
 *
 * Routing rules (v1-requirements §5, pull-not-push):
 *   - **lane** = the task's effective claimer, else its feature's owner
 *     ("unclaimed routes to the owner's lane"); a null/non-member target →
 *     the terminal **Unassigned** lane (carried f-data-model t-3 — never deref).
 *   - **column** = the task's *effective* status (`computeEffectiveStatus`, so
 *     Plan and Board never diverge); a deps-blocked `available` → the Backlog
 *     column ("Available means genuinely pullable"). A null-claimant `claimed`
 *     is effectively unclaimed → routes to the owner lane's Available column
 *     (carried f-data-model t-2).
 *   - **collision** = a soft, ambient flag when the task's open claim overlaps
 *     another open claim's file scope (`filesOverlap`); never a lock (§13.5).
 *
 * Membership is the [[f-access]] funnel's: the load goes through
 * `getAccessibleProject`, so a non-member or unknown id is a 404, never a 403.
 */
import type { ProjectRole } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/projects/task-status';
import { filesOverlap } from '@/lib/projects/collision';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

/** The board's status columns, in display order. Effective `blocked` folds into `backlog`. */
export const BOARD_COLUMNS = ['available', 'claimed', 'in_pr', 'merged', 'backlog'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** A task card on the board. */
export interface BoardTaskCard {
  id: string;
  title: string;
  featureId: string;
  featureTitle: string;
  /** Effective status (drives the column; kept for the card pill). */
  status: EffectiveStatus;
  column: BoardColumn;
  prUrl: string | null;
  /** `null` when unclaimed or the claimant was erased. */
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
  ownedFeatures: { id: string; title: string }[];
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
      select: { id: true, title: true, ownerUserId: true },
    }),
    prisma.task.findMany({
      where: { feature: { projectId } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        featureId: true,
        status: true,
        prUrl: true,
        claimedByUserId: true,
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

  // Batched identities for member lanes + claimers.
  const users = await fetchUsers([
    ...members.map((m) => m.userId),
    ...tasks.flatMap((t) => (t.claimedByUserId ? [t.claimedByUserId] : [])),
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
    const column: BoardColumn = effective === 'blocked' ? 'backlog' : effective;
    // Lane = the claimer (credit the doer, in any status), else the feature owner.
    // A null claimant (unclaimed, or erased → carried f-data-model t-2) falls to
    // the owner; effective status handles the *column* (a null-claimant `claimed`
    // lands in the owner lane's Available column, not Claimed).
    const target = t.claimedByUserId ?? feature.ownerUserId;
    const laneKey = target && memberIds.has(target) ? target : UNASSIGNED;

    cardsByLane.get(laneKey)!.push({
      id: t.id,
      title: t.title,
      featureId: t.featureId,
      featureTitle: feature.title,
      status: effective,
      column,
      prUrl: t.prUrl,
      claimer: t.claimedByUserId ? (users.get(t.claimedByUserId) ?? null) : null,
      isMine: t.claimedByUserId === userId,
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
          .map((f) => ({ id: f.id, title: f.title })),
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
    available: 0,
    claimed: 0,
    in_pr: 0,
    merged: 0,
    backlog: 0,
  };
  for (const lane of lanes) for (const card of lane.tasks) columnTotals[card.column]++;

  return { projectId, lanes, columnTotals };
}
