/**
 * Consumer project reads (f-projects, feature 08).
 *
 * The **member-facing** read surface — the mirror of the admin service
 * (`admin.ts`). Where the admin sees/manages *all* projects, this returns only
 * the projects the caller is a **member** of, routed through the [[f-access]]
 * funnel (`lib/projects/access.ts`) so membership can't be re-implemented ad hoc:
 *   - `listProjectsForUser` scopes via `accessibleProjectIds` (the funnel's
 *     child-query scoping primitive), enriched inline (`_count` + one batched
 *     `user` lookup — no N+1).
 *   - `getProjectForUser` goes through `getAccessibleProject`, so a non-member
 *     and an unknown id are **indistinguishable → both 404, never 403** (the
 *     anti-enumeration property, enforced at the API boundary).
 *
 * v1 detail returns the project header + members + feature/task **counts**; the
 * feature/task lists the Plan/Board views render are `f-plan-view`/`f-board-view`
 * (§09/§10) — not built here.
 */
import type { Project, ProjectRole } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { accessibleProjectIds, getAccessibleProjectByRef } from '@/lib/projects/access';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

export interface ProjectMemberView {
  userId: string;
  role: ProjectRole;
  /** `null` when the user was erased (rendered as "former member"). */
  user: UserRef | null;
}

/** A row in the member's projects grid (`GET /api/v1/projects`). */
export interface ProjectCard {
  id: string;
  /** Shareable human URL key (`hce-hub`); `null` until authored — links fall back to `id`. */
  slug: string | null;
  name: string;
  hostPlatform: string;
  status: Project['status'];
  createdAt: Date;
  memberCount: number;
  featureCount: number;
  lead: UserRef | null;
}

/**
 * An open `bug`-kind task, surfaced in the project-scoped active-fixes strip
 * (f-bug-handling §22-02 t2). A reference to a fix + a breadcrumb to the feature
 * (and phase) it lives in — it never pulls the origin feature forward.
 */
export interface ActiveFix {
  taskId: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  taskNumber: number | null;
  title: string;
  /** The origin feature the bug lives on (its slug drives the breadcrumb). */
  feature: { slug: string | null; title: string };
  /** The origin phase's name for the breadcrumb, or `null` if the feature is unfiled. */
  phaseName: string | null;
}

/** The project-view header (`GET /api/v1/projects/:id`). */
export interface ProjectView {
  id: string;
  /** Shareable human URL key (`hce-hub`); `null` until authored — links fall back to `id`. */
  slug: string | null;
  name: string;
  hostPlatform: string;
  status: Project['status'];
  repoUrls: string[];
  leadUserId: string | null;
  createdAt: Date;
  lead: UserRef | null;
  members: ProjectMemberView[];
  memberCount: number;
  featureCount: number;
  taskCount: number;
  /** Open bug-kind tasks across the project — the active-fixes strip; `[]` when none. */
  activeFixes: ActiveFix[];
}

/** The projects `userId` is a member of, newest first, enriched for the card grid. */
export async function listProjectsForUser(userId: string): Promise<ProjectCard[]> {
  // Scope through the funnel's `accessibleProjectIds` rather than hand-writing a
  // `members: { some: { userId } }` predicate here — the membership rule stays in
  // one place (access.ts). That costs one extra cheap indexed query over inlining
  // the predicate into the enriched findMany; on a member's low-cardinality
  // project set the avoided authz-predicate duplication is the better trade.
  const ids = await accessibleProjectIds(userId);
  if (ids.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      hostPlatform: true,
      status: true,
      createdAt: true,
      leadUserId: true,
      _count: { select: { members: true, features: true } },
    },
  });

  const users = await fetchUsers(projects.map((p) => p.leadUserId).filter((v): v is string => !!v));

  return projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    hostPlatform: p.hostPlatform,
    status: p.status,
    createdAt: p.createdAt,
    memberCount: p._count.members,
    featureCount: p._count.features,
    lead: p.leadUserId ? (users.get(p.leadUserId) ?? null) : null,
  }));
}

/**
 * One project's view header for a member, resolved by its **slug or cuid `id`**
 * (`ref`) — the shareable project URL (`/projects/hce-hub`) resolves here to the
 * canonical project, and every sub-query then keys off `project.id` (§19 t-3).
 * Routes through `getAccessibleProjectByRef`, so an unknown ref or a non-member
 * throws `NotFoundError` (→ 404, never 403).
 */
export async function getProjectForUser(userId: string, ref: string): Promise<ProjectView> {
  const project = await getAccessibleProjectByRef(userId, ref);
  const projectId = project.id; // canonical cuid — the ref may have been a slug

  const [members, featureCount, taskCount, bugTasks] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId }, orderBy: { addedAt: 'asc' } }),
    prisma.feature.count({ where: { projectId } }),
    prisma.task.count({ where: { feature: { projectId } } }),
    // Open bug-kind tasks anywhere in the project — the active-fixes strip
    // (f-bug-handling §22-02 t2). Cross-phase by design, so scoped to the project,
    // not a phase; ordered oldest-fix-first (stable t-N, then creation).
    prisma.task.findMany({
      where: { feature: { projectId }, kind: 'bug', status: { not: 'merged' } },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        number: true,
        title: true,
        feature: { select: { slug: true, title: true, phase: { select: { name: true } } } },
      },
    }),
  ]);

  const memberIds = members.map((m) => m.userId);
  // The lead already has a member row (the lead-has-member-row invariant), so
  // it's normally in `memberIds`; appending leadUserId is belt-and-suspenders if
  // that invariant is ever violated. `fetchUsers` dedupes via Set → a no-op here.
  const users = await fetchUsers(
    project.leadUserId ? [...memberIds, project.leadUserId] : memberIds
  );

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    hostPlatform: project.hostPlatform,
    status: project.status,
    repoUrls: project.repoUrls,
    leadUserId: project.leadUserId,
    createdAt: project.createdAt,
    lead: project.leadUserId ? (users.get(project.leadUserId) ?? null) : null,
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: users.get(m.userId) ?? null,
    })),
    memberCount: members.length,
    featureCount,
    taskCount,
    activeFixes: bugTasks.map((t) => ({
      taskId: t.id,
      taskNumber: t.number,
      title: t.title,
      feature: { slug: t.feature.slug, title: t.feature.title },
      phaseName: t.feature.phase?.name ?? null,
    })),
  };
}
