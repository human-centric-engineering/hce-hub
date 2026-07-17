/**
 * Project journal read (f-journal §17 t-3).
 *
 * The membership-scoped read behind every "log" surface — the task-sheet
 * activity timeline (`?taskId=`), a feature's activity (`?featureId=`), and the
 * project **Log** tab (decisions / work-completed / all). One filtered query
 * over the single `ProjectEvent` stream (self-hosting §1): every view is a
 * `where` + `kind` filter, not its own table.
 *
 * Membership is the [[f-access]] funnel's `getAccessibleProject` (a non-member or
 * unknown project → 404, never 403). The `projectId` scope is applied to the
 * query, so a `taskId` / `featureId` filter from another project simply matches
 * nothing (an event always carries its own project) — no cross-project leak, and
 * nothing to re-verify. Actors, feature refs, and task refs are resolved in
 * three **batched** lookups (never per-row); a hard-deleted feature/task or an
 * erased actor resolves to `null` (the history is retained — the ref just drops).
 */
import type { ProjectEventKind } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

/** How many recent events a single read returns (newest first). */
export const PROJECT_EVENT_LIMIT = 100;

/** A lightweight feature ref for an event row (`null` if the feature was deleted). */
export interface EventFeatureRef {
  id: string;
  slug: string | null;
  title: string;
}

/** A lightweight task ref for an event row (`null` if the task was deleted). */
export interface EventTaskRef {
  id: string;
  number: number | null;
}

/** One journal event, enriched for display. */
export interface ProjectEventView {
  id: string;
  kind: ProjectEventKind;
  /** The human actor, or `null` (agent-authored, system, or erased user). */
  actor: UserRef | null;
  /** A Sunrise AiAgent id when agent-authored (f-sidekick §12); else `null`. */
  actorAgentId: string | null;
  /** The feature this event concerns, or `null` (project-level or deleted). */
  feature: EventFeatureRef | null;
  /** The task this event concerns, or `null` (feature/project-level or deleted). */
  task: EventTaskRef | null;
  /** Authored-kind heading (decision / note); `null` for auto-events. */
  title: string | null;
  /** Authored-kind markdown body; `null` for auto-events. */
  body: string | null;
  /** Kind-specific structured detail (e.g. `{ status }` / `{ helpWanted }`). */
  metadata: unknown;
  /** ISO timestamp (post-JSON safe). */
  createdAt: string;
}

export interface GetProjectEventsOptions {
  /** Scope to one task's events (the task-sheet timeline). */
  taskId?: string;
  /** Scope to one feature's events (feature-level activity). */
  featureId?: string;
  /** Restrict to these kinds (e.g. `['decision']`, `['feature_shipped','task_merged']`). */
  kinds?: ProjectEventKind[];
}

/**
 * Load a member's view of `projectId`'s journal, newest first (capped at
 * `PROJECT_EVENT_LIMIT`). Throws `NotFoundError` (→ 404) for a non-member /
 * unknown project.
 */
export async function getProjectEvents(
  userId: string,
  projectId: string,
  options: GetProjectEventsOptions = {}
): Promise<ProjectEventView[]> {
  // Access decides visibility (deny ≡ 404). We only need the confirmation.
  await getAccessibleProject(userId, projectId);

  const events = await prisma.projectEvent.findMany({
    where: {
      projectId, // scopes every filter below to the confirmed project
      ...(options.taskId ? { taskId: options.taskId } : {}),
      ...(options.featureId ? { featureId: options.featureId } : {}),
      ...(options.kinds && options.kinds.length > 0 ? { kind: { in: options.kinds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: PROJECT_EVENT_LIMIT,
  });

  // Batched enrichment — one lookup each for actors / features / tasks (no N+1).
  const actorIds = events.map((e) => e.actorUserId).filter((x): x is string => x !== null);
  const featureIds = [
    ...new Set(events.map((e) => e.featureId).filter((x): x is string => x !== null)),
  ];
  const taskIds = [...new Set(events.map((e) => e.taskId).filter((x): x is string => x !== null))];

  const [actors, features, tasks] = await Promise.all([
    fetchUsers(actorIds),
    featureIds.length
      ? prisma.feature.findMany({
          where: { id: { in: featureIds } },
          select: { id: true, slug: true, title: true },
        })
      : Promise.resolve([]),
    taskIds.length
      ? prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, number: true },
        })
      : Promise.resolve([]),
  ]);
  const featureMap = new Map(features.map((f) => [f.id, f]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    actor: e.actorUserId ? (actors.get(e.actorUserId) ?? null) : null,
    actorAgentId: e.actorAgentId,
    feature: e.featureId ? (featureMap.get(e.featureId) ?? null) : null,
    task: e.taskId ? (taskMap.get(e.taskId) ?? null) : null,
    title: e.title,
    body: e.body,
    metadata: e.metadata,
    createdAt: e.createdAt.toISOString(),
  }));
}
