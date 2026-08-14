/**
 * Project tasks read (f-task-reads §30 t-67).
 *
 * The list that lets a coding agent **see the work** over MCP — not just the single
 * `next_task` pick. Given a project (and optionally one feature, and/or a status /
 * kind filter), return its tasks projected to the refs an agent needs to identify
 * and name one: `{ id, number (t-N), title, feature ref, effective status, kind,
 * assignee, prUrl }`. The concrete motivating need is "the open bugs on this
 * project" — one call with `kind: 'bug'`.
 *
 * Membership is the [[f-access]] funnel's, not re-implemented here: the load goes
 * through `getAccessibleProject`, so a **non-member or unknown id is a 404, never a
 * 403** (anti-enumeration). A `featureId` is an in-project filter, not a second
 * scope — a feature outside the accessible project simply matches nothing.
 *
 * Effective status is the **shared** `computeEffectiveStatus` (so this and the
 * Plan / Board never diverge — a deps-blocked `claimed` task reads `blocked`). The
 * status filter is applied *after* that computation, because `blocked` is derived,
 * not stored. `assigneeUserId` is returned raw (an opaque id, not a resolved
 * identity) — enough for an agent to tell assigned / unassigned / mine, with no
 * PII lookup.
 */
import type { TaskKind } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/projects/task-status';

/** A task projected to just the refs an agent needs to identify / act on it. */
export interface TaskRef {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  featureId: string;
  /** The feature's authored slug (`f-mcp`); `null` until authored. */
  featureSlug: string | null;
  featureTitle: string;
  /** Effective status (`claimed` | `active` | `blocked` | `merged`) — the shared computation. */
  status: EffectiveStatus;
  /** `bug` (a defect) vs `feature_work` vs `enhancement` (f-bug-handling §22-02, f-work-kinds §32). */
  kind: TaskKind;
  /**
   * The phase that *chose* this work, when that differs from its feature's phase
   * (f-work-kinds §32 t-80). `null` = inherit the feature's phase.
   */
  phaseId: string | null;
  /** Who the task is assigned to (raw id; `null` when unassigned / erased). */
  assigneeUserId: string | null;
  prUrl: string | null;
}

/** Optional narrowing for the tasks read. */
export interface ListTasksFilter {
  /** Restrict to one feature in the project. */
  featureId?: string;
  /** Restrict to one effective status (`blocked` included — it's computed). */
  status?: EffectiveStatus;
  /** Restrict to one task kind (e.g. `bug` for the open-bugs read). */
  kind?: TaskKind;
}

/** The tasks payload — the project's tasks (filtered), each projected to a `TaskRef`. */
export interface ProjectTasksDTO {
  projectId: string;
  tasks: TaskRef[];
}

/**
 * Read `projectId`'s tasks for `userId`, optionally narrowed by feature / status /
 * kind. Throws `NotFoundError` (→ 404) for a non-member / unknown project. Ordered
 * by feature then task creation (stable, oldest-first).
 */
export async function getProjectTasks(
  userId: string,
  projectId: string,
  filter: ListTasksFilter = {}
): Promise<ProjectTasksDTO> {
  const project = await getAccessibleProject(userId, projectId);

  const rows = await prisma.task.findMany({
    where: {
      feature: { projectId: project.id },
      ...(filter.featureId ? { featureId: filter.featureId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
    },
    orderBy: [{ feature: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      number: true,
      title: true,
      featureId: true,
      status: true,
      kind: true,
      phaseId: true,
      prUrl: true,
      assigneeUserId: true,
      feature: { select: { slug: true, title: true } },
      dependencies: { select: { dependsOn: { select: { status: true } } } },
    },
  });

  const tasks: TaskRef[] = rows
    .map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      featureId: t.featureId,
      featureSlug: t.feature.slug,
      featureTitle: t.feature.title,
      status: computeEffectiveStatus(
        t,
        t.dependencies.map((d) => d.dependsOn)
      ),
      kind: t.kind,
      phaseId: t.phaseId,
      assigneeUserId: t.assigneeUserId,
      prUrl: t.prUrl,
    }))
    // Effective status is derived (`blocked` isn't stored), so filter post-compute.
    .filter((t) => (filter.status ? t.status === filter.status : true));

  return { projectId: project.id, tasks };
}
