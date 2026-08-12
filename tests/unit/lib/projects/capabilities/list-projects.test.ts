/**
 * Tests for `lib/projects/capabilities/list-projects.ts` — the read-chain entry point
 * (f-mcp-project-scope §31 t-70). Pins the no-user guard, the scope-aware split (a
 * scoped key sees only its own project via getAccessibleProject; an unscoped key lists
 * all via listAccessibleProjects), the funnel behaviour on a stale scope (empty list),
 * and the projection (isLead derivation, no PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({
  getAccessibleProject: vi.fn(),
  listAccessibleProjects: vi.fn(),
}));

const { getAccessibleProject, listAccessibleProjects } = await import('@/lib/projects/access');
const { NotFoundError } = await import('@/lib/api/errors');
const { ListProjectsCapability } = await import('@/lib/projects/capabilities/list-projects');

const getOne = getAccessibleProject as ReturnType<typeof vi.fn>;
const listAll = listAccessibleProjects as ReturnType<typeof vi.fn>;
const cap = new ListProjectsCapability();
const ctx = (userId: string | null = 'u1', scope?: Record<string, string>) => ({
  userId,
  agentId: 'a1',
  ...(scope ? { scope } : {}),
});

function project(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    slug: 'hce-hub',
    name: 'HCE Hub',
    status: 'active',
    hostPlatform: 'sunrise',
    repoUrls: ['git@github.com:x/hce-hub.git'],
    leadUserId: 'u1',
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('list_projects', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({}, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getOne).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it('an unscoped key lists every accessible project (isLead derived)', async () => {
    listAll.mockResolvedValue([project(), project({ id: 'p2', leadUserId: 'someone-else' })]);
    const r = await cap.execute({}, ctx('u1'));
    expect(listAll).toHaveBeenCalledWith('u1');
    expect(getOne).not.toHaveBeenCalled();
    expect(r.data?.projects).toEqual([
      {
        id: 'p1',
        slug: 'hce-hub',
        name: 'HCE Hub',
        status: 'active',
        hostPlatform: 'sunrise',
        repoUrls: ['git@github.com:x/hce-hub.git'],
        isLead: true,
      },
      {
        id: 'p2',
        slug: 'hce-hub',
        name: 'HCE Hub',
        status: 'active',
        hostPlatform: 'sunrise',
        repoUrls: ['git@github.com:x/hce-hub.git'],
        isLead: false, // leadUserId !== caller
      },
    ]);
  });

  it('a scoped key sees only its own project (via the membership funnel)', async () => {
    getOne.mockResolvedValue(project({ id: 'p-scoped' }));
    const r = await cap.execute({}, ctx('u1', { projectId: 'p-scoped' }));
    expect(getOne).toHaveBeenCalledWith('u1', 'p-scoped');
    expect(listAll).not.toHaveBeenCalled();
    expect(r.data?.projects).toHaveLength(1);
    expect(r.data?.projects[0].id).toBe('p-scoped');
  });

  it('a scoped key with a stale/foreign scope resolves to an empty list (funnel 404)', async () => {
    getOne.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({}, ctx('u1', { projectId: 'gone' }));
    expect(r.success).toBe(true);
    expect(r.data?.projects).toEqual([]);
  });

  it('re-throws a non-funnel error rather than swallowing it', async () => {
    getOne.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({}, ctx('u1', { projectId: 'p1' }))).rejects.toThrow('db down');
  });
});
