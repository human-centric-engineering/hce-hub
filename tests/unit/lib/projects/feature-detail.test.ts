/**
 * Tests for `lib/projects/feature-detail.ts` — the feature-page read. Pins the
 * funnel (deny ≡ 404 via getAccessibleProject), slug-or-cuid resolution scoped to
 * the project (cross-project 404), the references JSON guard, effective task
 * status, null owner/claimer/assignee (never a deref), and the indicative sketch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { feature: { findFirst: vi.fn() } } }));
vi.mock('@/lib/projects/user-refs', () => ({ fetchUsers: vi.fn() }));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { fetchUsers } = await import('@/lib/projects/user-refs');
const { NotFoundError } = await import('@/lib/api/errors');
const { getFeatureDetail } = await import('@/lib/projects/feature-detail');

const access = getAccessibleProject as ReturnType<typeof vi.fn>;
const featureFindFirst = prisma.feature.findFirst as ReturnType<typeof vi.fn>;
const users = fetchUsers as ReturnType<typeof vi.fn>;

const USER = 'user-1';

const featureRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  slug: 'f-mcp',
  title: 'MCP server',
  description: 'Expose tools',
  doneWhen: 'tools/list works',
  references: [{ label: 'spec', target: 'https://x.io' }],
  status: 'in_flight',
  planningStage: 'planned',
  helpWanted: false,
  ownerUserId: null,
  dependencies: [],
  tasks: [],
  indicativeTasks: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ id: 'p1', name: 'HCE Hub' });
  users.mockResolvedValue(new Map());
});

describe('getFeatureDetail funnel', () => {
  it('propagates the funnel 404 (non-member/unknown project) and never queries', async () => {
    access.mockRejectedValue(new NotFoundError('Project p1 not found'));
    await expect(getFeatureDetail(USER, 'p1', 'f-mcp')).rejects.toBeInstanceOf(NotFoundError);
    expect(featureFindFirst).not.toHaveBeenCalled();
  });

  it('404s an unknown feature / one in another project', async () => {
    featureFindFirst.mockResolvedValue(null);
    await expect(getFeatureDetail(USER, 'p1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolves by slug OR cuid, scoped to the confirmed project', async () => {
    featureFindFirst.mockResolvedValue(featureRow());
    await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(featureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', OR: [{ slug: 'f-mcp' }, { id: 'f-mcp' }] },
      })
    );
  });
});

describe('getFeatureDetail mapping', () => {
  it('returns the header, project name, references, and indicative sketch', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        planningStage: 'indicative',
        indicativeTasks: [{ id: 'i1', order: 0, text: 'draft schema' }],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.projectName).toBe('HCE Hub');
    expect(detail.slug).toBe('f-mcp');
    expect(detail.planningStage).toBe('indicative');
    expect(detail.references).toEqual([{ label: 'spec', target: 'https://x.io' }]);
    expect(detail.indicativeTasks).toEqual([{ id: 'i1', order: 0, text: 'draft schema' }]);
    expect(detail.owner).toBeNull();
  });

  it('drops malformed reference entries (JSON guard)', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        references: [
          { label: 'ok', target: 'https://x.io' },
          { label: 'no target' },
          'not an object',
          { label: 42, target: 'x' },
        ],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.references).toEqual([{ label: 'ok', target: 'https://x.io' }]);
  });

  it('treats a non-array references value as empty', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ references: null }));
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.references).toEqual([]);
  });

  it('computes effective task status and resolves claimer + assignee, null-safe', async () => {
    users.mockResolvedValue(
      new Map([
        ['owner-1', { id: 'owner-1', name: 'Ada', email: 'a@x.io', image: null }],
        ['claim-1', { id: 'claim-1', name: 'Bo', email: 'b@x.io', image: null }],
      ])
    );
    featureFindFirst.mockResolvedValue(
      featureRow({
        ownerUserId: 'owner-1',
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'blocked task',
            status: 'available',
            doneWhen: 'ok',
            prUrl: null,
            claimedByUserId: null,
            assigneeUserId: 'gone', // erased → not in the users map → null
            dependencies: [{ dependsOn: { status: 'available' } }], // unmerged dep → blocked
          },
          {
            id: 't2',
            number: 2,
            title: 'claimed task',
            status: 'claimed',
            doneWhen: null,
            prUrl: null,
            claimedByUserId: 'claim-1',
            assigneeUserId: null,
            dependencies: [],
          },
        ],
      })
    );

    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.owner).toEqual({ id: 'owner-1', name: 'Ada', email: 'a@x.io', image: null });
    expect(detail.tasks[0].status).toBe('blocked'); // dep not merged
    expect(detail.tasks[0].assignee).toBeNull(); // erased assignee never derefs
    expect(detail.tasks[1].status).toBe('claimed');
    expect(detail.tasks[1].claimer?.name).toBe('Bo');
  });
});
