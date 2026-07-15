/**
 * Project administration service (f-project-admin, feature 05).
 *
 * The **admin** write/read surface for projects and their members — distinct
 * from the membership authorization funnel in `access.ts`. `access.ts` gates
 * what an ordinary *member* may reach (the consumer surface); **this** module
 * is what an *admin* uses to create and shape projects (every caller is already
 * `withAdminAuth`-gated). It is the **writer** of the `ProjectMember` rows that
 * `access.ts` later reads.
 *
 * The load-bearing correctness is the **lead-has-member-row invariant** carried
 * from f-access: `canAccessProject` decides membership from `ProjectMember`
 * alone, so a project's lead must always hold a `role='lead'` `ProjectMember`
 * row. `createProject` seats it transactionally (alongside the per-project
 * knowledge tag); `updateProject` moves it on lead reassignment; `removeMember`
 * refuses to strip the current lead. `ProjectMember.userId` / `Project.leadUserId`
 * are hand-FKs to `"user"` with no Prisma relation, so member/lead identities
 * are enriched by a separate `user` lookup and rendered gracefully when null.
 */

import { Prisma, type ProjectRole, type Project } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError, ConflictError } from '@/lib/api/errors';
import { logAdminAction, computeChanges } from '@/lib/orchestration/audit/admin-audit-logger';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';
import type { CreateProjectInput, UpdateProjectInput } from '@/lib/validations/project-admin';

/** The admin performing the action — carried into the audit log. */
export interface AdminActor {
  userId: string;
  clientIp?: string | null;
}

export type { UserRef };

export interface ProjectMemberView {
  userId: string;
  role: ProjectRole;
  addedAt: Date;
  /** `null` if the user row is gone (erased between reads / mid-cascade). */
  user: UserRef | null;
}

export interface ProjectListItem {
  id: string;
  name: string;
  hostPlatform: string;
  status: Project['status'];
  createdAt: Date;
  memberCount: number;
  lead: UserRef | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  hostPlatform: string;
  status: Project['status'];
  repoUrls: string[];
  leadUserId: string | null;
  knowledgeTagId: string | null;
  sidekickAgentId: string | null;
  createdAt: Date;
  lead: UserRef | null;
  members: ProjectMemberView[];
  knowledgeTag: { id: string; slug: string; name: string } | null;
}

// ─── User enrichment (hand-FK → "user", no Prisma relation) ──────────────────
// `fetchUsers` is shared with the consumer service — see `lib/projects/user-refs.ts`.

/** Throw a clean 404 (not a raw FK error) if the referenced user is missing. */
async function requireUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User not found');
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listProjects(query: {
  page: number;
  limit: number;
  q?: string;
}): Promise<{ items: ProjectListItem[]; total: number; page: number; limit: number }> {
  const { page, limit, q } = query;
  const where: Prisma.ProjectWhereInput = q ? { name: { contains: q, mode: 'insensitive' } } : {};

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        hostPlatform: true,
        status: true,
        createdAt: true,
        leadUserId: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const users = await fetchUsers(rows.map((r) => r.leadUserId).filter((v): v is string => !!v));

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    hostPlatform: r.hostPlatform,
    status: r.status,
    createdAt: r.createdAt,
    memberCount: r._count.members,
    lead: r.leadUserId ? (users.get(r.leadUserId) ?? null) : null,
  }));

  return { items, total, page, limit };
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { members: { orderBy: { addedAt: 'asc' } } },
  });
  if (!project) throw new NotFoundError(`Project ${id} not found`);

  const memberIds = project.members.map((m) => m.userId);
  const users = await fetchUsers(
    project.leadUserId ? [...memberIds, project.leadUserId] : memberIds
  );

  const knowledgeTag = project.knowledgeTagId
    ? await prisma.knowledgeTag.findUnique({
        where: { id: project.knowledgeTagId },
        select: { id: true, slug: true, name: true },
      })
    : null;

  return {
    id: project.id,
    name: project.name,
    hostPlatform: project.hostPlatform,
    status: project.status,
    repoUrls: project.repoUrls,
    leadUserId: project.leadUserId,
    knowledgeTagId: project.knowledgeTagId,
    sidekickAgentId: project.sidekickAgentId,
    createdAt: project.createdAt,
    lead: project.leadUserId ? (users.get(project.leadUserId) ?? null) : null,
    members: project.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      addedAt: m.addedAt,
      user: users.get(m.userId) ?? null,
    })),
    knowledgeTag,
  };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Create a project and, in one transaction, (a) seat its lead as a `role='lead'`
 * `ProjectMember` row (the invariant), and (b) create + attach a per-project
 * `KnowledgeTag` (`Project.knowledgeTagId`). Atomic: a failure at any step
 * leaves no half-built project.
 */
export async function createProject(
  input: CreateProjectInput,
  actor: AdminActor
): Promise<Project> {
  await requireUserExists(input.leadUserId);

  const project = await executeTransaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: input.name,
        hostPlatform: input.hostPlatform,
        leadUserId: input.leadUserId,
        repoUrls: input.repoUrls ?? [],
        status: input.status ?? 'planning',
      },
    });

    const tag = await tx.knowledgeTag.create({
      data: {
        slug: `project-${created.id}`,
        name: created.name,
        description: `Project knowledge base for "${created.name}"`,
      },
    });

    const withTag = await tx.project.update({
      where: { id: created.id },
      data: { knowledgeTagId: tag.id },
    });

    // The invariant: the lead also holds a role='lead' membership row.
    await tx.projectMember.create({
      data: { projectId: created.id, userId: input.leadUserId, role: 'lead' },
    });

    return withTag;
  });

  logAdminAction({
    userId: actor.userId,
    action: 'project.create',
    entityType: 'app_project',
    entityId: project.id,
    entityName: project.name,
    metadata: { hostPlatform: project.hostPlatform, leadUserId: input.leadUserId },
    clientIp: actor.clientIp,
  });

  return project;
}

/**
 * Update project scalars and/or reassign the lead. Reassigning `leadUserId`
 * moves the `role='lead'` member row to the new lead (creating or promoting it)
 * and demotes the outgoing lead to `member` — never silently dropping their
 * access — all in one transaction so the invariant holds throughout.
 */
export async function updateProject(
  id: string,
  patch: UpdateProjectInput,
  actor: AdminActor
): Promise<Project> {
  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) throw new NotFoundError(`Project ${id} not found`);

  const reassigning = patch.leadUserId !== undefined && patch.leadUserId !== current.leadUserId;
  if (reassigning) await requireUserExists(patch.leadUserId as string);

  const data: Prisma.ProjectUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.hostPlatform !== undefined) data.hostPlatform = patch.hostPlatform;
  if (patch.repoUrls !== undefined) data.repoUrls = patch.repoUrls;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.leadUserId !== undefined) data.leadUserId = patch.leadUserId;

  const updated = reassigning
    ? await executeTransaction(async (tx) => {
        const u = await tx.project.update({ where: { id }, data });
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: patch.leadUserId as string } },
          create: { projectId: id, userId: patch.leadUserId as string, role: 'lead' },
          update: { role: 'lead' },
        });
        if (current.leadUserId && current.leadUserId !== patch.leadUserId) {
          await tx.projectMember.updateMany({
            where: { projectId: id, userId: current.leadUserId },
            data: { role: 'member' },
          });
        }
        return u;
      })
    : await prisma.project.update({ where: { id }, data });

  logAdminAction({
    userId: actor.userId,
    action: 'project.update',
    entityType: 'app_project',
    entityId: id,
    entityName: updated.name,
    changes: computeChanges(current, updated, { ignoreKeys: ['createdAt'] }),
    clientIp: actor.clientIp,
  });

  return updated;
}

/** Archive a project (soft delete — reversible). Idempotent. */
export async function archiveProject(id: string, actor: AdminActor): Promise<Project> {
  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) throw new NotFoundError(`Project ${id} not found`);
  if (current.status === 'archived') return current;

  const updated = await prisma.project.update({ where: { id }, data: { status: 'archived' } });

  logAdminAction({
    userId: actor.userId,
    action: 'project.archive',
    entityType: 'app_project',
    entityId: id,
    entityName: updated.name,
    clientIp: actor.clientIp,
  });

  return updated;
}

/** Add a member (always `role='member'` in v1; the lead is set via `leadUserId`). */
export async function addMember(
  projectId: string,
  userId: string,
  actor: AdminActor
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new NotFoundError(`Project ${projectId} not found`);
  await requireUserExists(userId);

  try {
    const member = await prisma.projectMember.create({
      data: { projectId, userId, role: 'member' },
    });
    logAdminAction({
      userId: actor.userId,
      action: 'project.member_add',
      entityType: 'app_project_member',
      entityId: member.id,
      entityName: project.name,
      metadata: { projectId, userId },
      clientIp: actor.clientIp,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('User is already a member of this project');
    }
    throw err;
  }
}

/**
 * Remove a member. **Refuses to strip the current lead's row** — that would
 * revoke the lead's own access (they're resolved from `ProjectMember`, not
 * `leadUserId`); reassign the lead first.
 */
export async function removeMember(
  projectId: string,
  userId: string,
  actor: AdminActor
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, leadUserId: true },
  });
  if (!project) throw new NotFoundError(`Project ${projectId} not found`);
  if (project.leadUserId === userId) {
    throw new ConflictError('Cannot remove the project lead; reassign the lead first');
  }

  const { count } = await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  if (count === 0) throw new NotFoundError('Membership not found');

  logAdminAction({
    userId: actor.userId,
    action: 'project.member_remove',
    entityType: 'app_project_member',
    entityName: project.name,
    metadata: { projectId, userId },
    clientIp: actor.clientIp,
  });
}
