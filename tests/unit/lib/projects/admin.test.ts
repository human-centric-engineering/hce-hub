/**
 * Unit: project-admin service (f-project-admin).
 *
 * The load-bearing assertions are the **lead-has-member-row invariant** carried
 * from f-access — proven at the wiring over a `tx` mock (no live DB, B9):
 *   - createProject seats a role='lead' member row + a knowledge tag atomically
 *   - updateProject reassigns the lead row and demotes the outgoing lead
 *   - removeMember refuses to strip the current lead
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({
  logAdminAction: vi.fn(),
  computeChanges: vi.fn(() => null),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    projectMember: {
      create: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    knowledgeTag: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const {
  createProject,
  updateProject,
  archiveProject,
  addMember,
  removeMember,
  getProjectDetail,
  listProjects,
} = await import('@/lib/projects/admin');

const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const projFindUnique = prisma.project.findUnique as ReturnType<typeof vi.fn>;
const projUpdate = prisma.project.update as ReturnType<typeof vi.fn>;
const memberCreate = prisma.projectMember.create as ReturnType<typeof vi.fn>;
const memberDeleteMany = prisma.projectMember.deleteMany as ReturnType<typeof vi.fn>;
const projFindMany = prisma.project.findMany as ReturnType<typeof vi.fn>;
const projCount = prisma.project.count as ReturnType<typeof vi.fn>;
const knowledgeTagFindUnique = prisma.knowledgeTag.findUnique as ReturnType<typeof vi.fn>;

/** A tx double whose calls we can inspect; executeTransaction forwards to it. */
function makeTx() {
  return {
    project: {
      create: vi.fn().mockResolvedValue({ id: 'p1', name: 'Hub' }),
      update: vi.fn().mockResolvedValue({ id: 'p1', name: 'Hub', knowledgeTagId: 'tag1' }),
    },
    knowledgeTag: { create: vi.fn().mockResolvedValue({ id: 'tag1' }) },
    projectMember: {
      create: vi.fn().mockResolvedValue({ id: 'm1' }),
      upsert: vi.fn().mockResolvedValue({ id: 'm2' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const actor = { userId: 'admin_1', clientIp: '127.0.0.1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createProject — the invariant', () => {
  it('seats the lead as role=lead + creates & attaches a knowledge tag, all in one tx', async () => {
    userFindUnique.mockResolvedValue({ id: 'lead_1' });
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    runTx.mockImplementation((cb: (t: unknown) => Promise<unknown>) => cb(tx));

    await createProject({ name: 'Hub', hostPlatform: 'sunrise', leadUserId: 'lead_1' }, actor);

    // The knowledge tag is created with the per-project slug and attached.
    expect(tx.knowledgeTag.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'project-p1' }) })
    );
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { knowledgeTagId: 'tag1' } })
    );
    // The invariant: a role='lead' member row for the lead.
    expect(tx.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { projectId: 'p1', userId: 'lead_1', role: 'lead' },
      })
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.create' }));
  });

  it('rejects a non-existent lead before opening a transaction', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(
      createProject({ name: 'Hub', hostPlatform: 'sunrise', leadUserId: 'ghost' }, actor)
    ).rejects.toThrow(/user not found/i);
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('updateProject — lead reassignment', () => {
  it('moves the lead row to the new lead and demotes the outgoing lead', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub', leadUserId: 'old_lead' });
    userFindUnique.mockResolvedValue({ id: 'new_lead' });
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    runTx.mockImplementation((cb: (t: unknown) => Promise<unknown>) => cb(tx));

    await updateProject('p1', { leadUserId: 'new_lead' }, actor);

    expect(tx.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_userId: { projectId: 'p1', userId: 'new_lead' } },
        create: { projectId: 'p1', userId: 'new_lead', role: 'lead' },
        update: { role: 'lead' },
      })
    );
    expect(tx.projectMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', userId: 'old_lead' },
        data: { role: 'member' },
      })
    );
  });

  it('updates scalars without a transaction when the lead is unchanged', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub', leadUserId: 'lead_1' });
    projUpdate.mockResolvedValue({ id: 'p1', name: 'Renamed', leadUserId: 'lead_1' });

    await updateProject('p1', { name: 'Renamed' }, actor);

    expect(runTx).not.toHaveBeenCalled();
    expect(projUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { name: 'Renamed' } })
    );
  });

  it('404s an unknown project', async () => {
    projFindUnique.mockResolvedValue(null);
    await expect(updateProject('nope', { name: 'X' }, actor)).rejects.toThrow(/not found/i);
  });
});

describe('archiveProject', () => {
  it('sets status=archived and is idempotent', async () => {
    projFindUnique.mockResolvedValueOnce({ id: 'p1', name: 'Hub', status: 'active' });
    projUpdate.mockResolvedValue({ id: 'p1', name: 'Hub', status: 'archived' });
    await archiveProject('p1', actor);
    expect(projUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'archived' } });

    vi.clearAllMocks();
    projFindUnique.mockResolvedValueOnce({ id: 'p1', name: 'Hub', status: 'archived' });
    await archiveProject('p1', actor);
    expect(projUpdate).not.toHaveBeenCalled();
  });
});

describe('member management', () => {
  it('addMember creates a role=member row', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub' });
    userFindUnique.mockResolvedValue({ id: 'u9' });
    memberCreate.mockResolvedValue({ id: 'm1' });

    await addMember('p1', 'u9', actor);

    expect(memberCreate).toHaveBeenCalledWith({
      data: { projectId: 'p1', userId: 'u9', role: 'member' },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.member_add' }));
  });

  it('addMember 409s a duplicate membership', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub' });
    userFindUnique.mockResolvedValue({ id: 'u9' });
    memberCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' })
    );

    await expect(addMember('p1', 'u9', actor)).rejects.toThrow(/already a member/i);
  });

  it('removeMember refuses to strip the current lead', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub', leadUserId: 'lead_1' });

    await expect(removeMember('p1', 'lead_1', actor)).rejects.toThrow(
      /cannot remove the project lead/i
    );
    expect(memberDeleteMany).not.toHaveBeenCalled();
  });

  it('removeMember deletes a non-lead member', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub', leadUserId: 'lead_1' });
    memberDeleteMany.mockResolvedValue({ count: 1 });

    await removeMember('p1', 'someone', actor);

    expect(memberDeleteMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', userId: 'someone' },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'project.member_remove' })
    );
  });

  it('removeMember 404s an absent membership', async () => {
    projFindUnique.mockResolvedValue({ id: 'p1', name: 'Hub', leadUserId: 'lead_1' });
    memberDeleteMany.mockResolvedValue({ count: 0 });

    await expect(removeMember('p1', 'ghost', actor)).rejects.toThrow(/membership not found/i);
  });
});

describe('getProjectDetail — null-user rendering', () => {
  it('renders a member whose user row is gone as user:null (never derefs)', async () => {
    projFindUnique.mockResolvedValue({
      id: 'p1',
      name: 'Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: 'lead_1',
      knowledgeTagId: null,
      sidekickAgentId: null,
      createdAt: new Date('2026-07-15'),
      members: [
        { userId: 'lead_1', role: 'lead', addedAt: new Date() },
        { userId: 'erased', role: 'member', addedAt: new Date() },
      ],
    });
    // Only the lead's user row still exists.
    userFindMany.mockResolvedValue([{ id: 'lead_1', name: 'Lead', email: 'l@x.io', image: null }]);

    const detail = await getProjectDetail('p1');

    expect(detail.lead?.name).toBe('Lead');
    expect(detail.members.find((m) => m.userId === 'erased')?.user).toBeNull();
  });

  it('resolves the attached knowledge tag when set', async () => {
    projFindUnique.mockResolvedValue({
      id: 'p1',
      name: 'Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: ['https://github.com/x/y'],
      leadUserId: null,
      knowledgeTagId: 'tag1',
      sidekickAgentId: null,
      createdAt: new Date('2026-07-15'),
      members: [],
    });
    userFindMany.mockResolvedValue([]);
    knowledgeTagFindUnique.mockResolvedValue({ id: 'tag1', slug: 'project-p1', name: 'Hub' });

    const detail = await getProjectDetail('p1');

    expect(detail.knowledgeTag?.slug).toBe('project-p1');
    expect(detail.lead).toBeNull(); // null leadUserId renders gracefully
  });

  it('404s an unknown project', async () => {
    projFindUnique.mockResolvedValue(null);
    await expect(getProjectDetail('nope')).rejects.toThrow(/not found/i);
  });
});

describe('listProjects', () => {
  it('scopes by q and enriches the lead, returning member counts', async () => {
    projFindMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Hub',
        hostPlatform: 'sunrise',
        status: 'active',
        createdAt: new Date('2026-07-15'),
        leadUserId: 'lead_1',
        _count: { members: 3 },
      },
    ]);
    projCount.mockResolvedValue(1);
    userFindMany.mockResolvedValue([{ id: 'lead_1', name: 'Lead', email: 'l@x.io', image: null }]);

    const result = await listProjects({ page: 1, limit: 10, q: 'hub' });

    expect(projFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: { contains: 'hub', mode: 'insensitive' } } })
    );
    expect(result.total).toBe(1);
    expect(result.items[0].memberCount).toBe(3);
    expect(result.items[0].lead?.name).toBe('Lead');
  });

  it('lists with no filter and tolerates a null lead (no user lookup)', async () => {
    projFindMany.mockResolvedValue([
      {
        id: 'p2',
        name: 'Solo',
        hostPlatform: 'none',
        status: 'planning',
        createdAt: new Date('2026-07-15'),
        leadUserId: null,
        _count: { members: 0 },
      },
    ]);
    projCount.mockResolvedValue(1);
    userFindMany.mockResolvedValue([]);

    const result = await listProjects({ page: 1, limit: 10 });

    expect(projFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result.items[0].lead).toBeNull();
    // No lead ids → the enrichment lookup is skipped entirely.
    expect(userFindMany).not.toHaveBeenCalled();
  });
});

describe('createProject — explicit status/repoUrls', () => {
  it('passes through supplied status and repo URLs', async () => {
    userFindUnique.mockResolvedValue({ id: 'lead_1' });
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    runTx.mockImplementation((cb: (t: unknown) => Promise<unknown>) => cb(tx));

    await createProject(
      {
        name: 'Hub',
        hostPlatform: 'sunrise',
        leadUserId: 'lead_1',
        status: 'active',
        repoUrls: ['https://github.com/x/y'],
      },
      actor
    );

    expect(tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active', repoUrls: ['https://github.com/x/y'] }),
      })
    );
  });
});
