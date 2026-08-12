/**
 * Tests for `lib/projects/capabilities/get-project.ts` — the project-header read over
 * MCP (f-mcp-project-scope §31 t-70). Pins the no-user guard, the project_required
 * guard, the funnel 404 map (deny ≡ not_found via getAccessibleProject), the structure
 * counts, and the projection (isLead derivation, no PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    phase: { count: vi.fn() },
    feature: { count: vi.fn() },
    task: { count: vi.fn() },
    idea: { count: vi.fn() },
  },
}));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { GetProjectCapability } = await import('@/lib/projects/capabilities/get-project');

const getProject = getAccessibleProject as ReturnType<typeof vi.fn>;
const cap = new GetProjectCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.phase.count).mockResolvedValue(4);
  vi.mocked(prisma.feature.count).mockResolvedValue(31);
  vi.mocked(prisma.task.count).mockResolvedValue(70);
  vi.mocked(prisma.idea.count).mockResolvedValue(2);
});

describe('get_project', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({}, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getProject).not.toHaveBeenCalled();
  });

  it('errors project_required when no projectId is ambient or passed', async () => {
    const r = await cap.execute({}, ctx());
    expect(r.error?.code).toBe('project_required');
    expect(getProject).not.toHaveBeenCalled();
  });

  it('maps a getAccessibleProject NotFoundError to not_found (non-member / unknown)', async () => {
    getProject.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('returns the header + structure counts, with isLead derived', async () => {
    getProject.mockResolvedValue(project());
    const r = await cap.execute({ projectId: 'p1' }, ctx('u1'));
    expect(getProject).toHaveBeenCalledWith('u1', 'p1');
    expect(r.data).toEqual({
      id: 'p1',
      slug: 'hce-hub',
      name: 'HCE Hub',
      status: 'active',
      hostPlatform: 'sunrise',
      repoUrls: ['git@github.com:x/hce-hub.git'],
      isLead: true,
      counts: { phases: 4, features: 31, tasks: 70, openIdeas: 2 },
    });
  });

  it('derives isLead=false when the caller is not the project lead', async () => {
    getProject.mockResolvedValue(project({ leadUserId: 'someone-else' }));
    const r = await cap.execute({ projectId: 'p1' }, ctx('u1'));
    expect(r.data?.isLead).toBe(false);
  });

  it('counts tasks through the feature relation and only open ideas', async () => {
    getProject.mockResolvedValue(project());
    await cap.execute({ projectId: 'p1' }, ctx('u1'));
    expect(prisma.task.count).toHaveBeenCalledWith({ where: { feature: { projectId: 'p1' } } });
    expect(prisma.idea.count).toHaveBeenCalledWith({ where: { projectId: 'p1', status: 'open' } });
  });
});
