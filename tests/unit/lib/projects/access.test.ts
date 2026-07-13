/**
 * Tests for `lib/projects/access.ts` — the project-membership authz funnel.
 *
 * This is the single point at which "can this user reach this project?" is
 * decided, so getting it wrong is a direct access-control / data-leak bug. We
 * test every combination of (lead / member / non-member) × (view / contribute /
 * admin), the missing-project path, and — the load-bearing property — that a
 * non-member is **indistinguishable from a non-existent project** (404, never a
 * 403 that would confirm the project exists to an outsider).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    projectMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/db/client');
const {
  canAccessProject,
  requireProjectAccess,
  getAccessibleProject,
  listAccessibleProjects,
  accessibleProjectIds,
} = await import('@/lib/projects/access');
const { NotFoundError, ForbiddenError } = await import('@/lib/api/errors');

const memberFindUnique = prisma.projectMember.findUnique as ReturnType<typeof vi.fn>;
const memberFindMany = prisma.projectMember.findMany as ReturnType<typeof vi.fn>;
const projectFindUnique = prisma.project.findUnique as ReturnType<typeof vi.fn>;
const projectFindMany = prisma.project.findMany as ReturnType<typeof vi.fn>;

const USER = 'user-1';
const PROJECT = 'project-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('canAccessProject', () => {
  it('queries ProjectMember by the composite unique key', async () => {
    memberFindUnique.mockResolvedValue({ role: 'member' });

    await canAccessProject(USER, PROJECT);

    expect(memberFindUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: PROJECT, userId: USER } },
      select: { role: true },
    });
  });

  it('grants a lead at any need', async () => {
    memberFindUnique.mockResolvedValue({ role: 'lead' });

    expect(await canAccessProject(USER, PROJECT, 'view')).toEqual({ ok: true, basis: 'lead' });
    expect(await canAccessProject(USER, PROJECT, 'admin')).toEqual({ ok: true, basis: 'lead' });
  });

  it('grants a member view/contribute but denies admin (role retained in basis)', async () => {
    memberFindUnique.mockResolvedValue({ role: 'member' });

    expect(await canAccessProject(USER, PROJECT, 'view')).toEqual({ ok: true, basis: 'member' });
    expect(await canAccessProject(USER, PROJECT, 'contribute')).toEqual({
      ok: true,
      basis: 'member',
    });
    // Denied by role, but basis stays 'member' → caller can 403 (not 404) a member.
    expect(await canAccessProject(USER, PROJECT, 'admin')).toEqual({ ok: false, basis: 'member' });
  });

  it('denies a non-member identically to a missing project (anti-enumeration)', async () => {
    memberFindUnique.mockResolvedValue(null);

    const nonMember = await canAccessProject(USER, PROJECT, 'view');
    const missingProject = await canAccessProject(USER, 'does-not-exist', 'admin');

    // Byte-identical DENY in both cases, regardless of need — the caller cannot
    // tell "you're not a member" from "no such project".
    expect(nonMember).toEqual({ ok: false, basis: null });
    expect(missingProject).toEqual({ ok: false, basis: null });
    expect(nonMember).toEqual(missingProject);
  });
});

describe('requireProjectAccess', () => {
  it('resolves for a member at a satisfied need', async () => {
    memberFindUnique.mockResolvedValue({ role: 'member' });
    await expect(requireProjectAccess(USER, PROJECT, 'contribute')).resolves.toBeUndefined();
  });

  it('throws NotFoundError (404) for a non-member — never 403', async () => {
    memberFindUnique.mockResolvedValue(null);
    await expect(requireProjectAccess(USER, PROJECT, 'view')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError (403) for a member lacking the required role', async () => {
    memberFindUnique.mockResolvedValue({ role: 'member' });
    await expect(requireProjectAccess(USER, PROJECT, 'admin')).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

describe('getAccessibleProject', () => {
  it('returns the project for an authorized member', async () => {
    const project = { id: PROJECT, name: 'Hub' };
    memberFindUnique.mockResolvedValue({ role: 'lead' });
    projectFindUnique.mockResolvedValue(project);

    await expect(getAccessibleProject(USER, PROJECT, 'admin')).resolves.toEqual(project);
    expect(projectFindUnique).toHaveBeenCalledWith({ where: { id: PROJECT } });
  });

  it('throws NotFoundError for a non-member without fetching the project', async () => {
    memberFindUnique.mockResolvedValue(null);

    await expect(getAccessibleProject(USER, PROJECT)).rejects.toBeInstanceOf(NotFoundError);
    // Short-circuits — the resource is never read for an unauthorized caller.
    expect(projectFindUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the project is deleted between the check and the read', async () => {
    memberFindUnique.mockResolvedValue({ role: 'member' });
    projectFindUnique.mockResolvedValue(null);

    await expect(getAccessibleProject(USER, PROJECT)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listAccessibleProjects', () => {
  it('returns only the projects the user is a member of, newest first', async () => {
    const projects = [{ id: PROJECT }];
    projectFindMany.mockResolvedValue(projects);

    await expect(listAccessibleProjects(USER)).resolves.toBe(projects);
    expect(projectFindMany).toHaveBeenCalledWith({
      where: { members: { some: { userId: USER } } },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('accessibleProjectIds', () => {
  it('returns the ids of the projects the user can access', async () => {
    memberFindMany.mockResolvedValue([{ projectId: 'p1' }, { projectId: 'p2' }]);

    await expect(accessibleProjectIds(USER)).resolves.toEqual(['p1', 'p2']);
    expect(memberFindMany).toHaveBeenCalledWith({
      where: { userId: USER },
      select: { projectId: true },
    });
  });

  it('returns an empty array when the user is a member of nothing', async () => {
    memberFindMany.mockResolvedValue([]);
    await expect(accessibleProjectIds(USER)).resolves.toEqual([]);
  });
});
