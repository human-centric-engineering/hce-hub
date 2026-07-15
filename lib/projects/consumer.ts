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
import { accessibleProjectIds, getAccessibleProject } from '@/lib/projects/access';
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
  name: string;
  hostPlatform: string;
  status: Project['status'];
  createdAt: Date;
  memberCount: number;
  featureCount: number;
  lead: UserRef | null;
}

/** The project-view header (`GET /api/v1/projects/:id`). */
export interface ProjectView {
  id: string;
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
 * One project's view header for a member. Routes through `getAccessibleProject`,
 * so a non-member or unknown id throws `NotFoundError` (→ 404, never 403).
 */
export async function getProjectForUser(userId: string, projectId: string): Promise<ProjectView> {
  const project = await getAccessibleProject(userId, projectId);

  const [members, featureCount, taskCount] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId }, orderBy: { addedAt: 'asc' } }),
    prisma.feature.count({ where: { projectId } }),
    prisma.task.count({ where: { feature: { projectId } } }),
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
  };
}
