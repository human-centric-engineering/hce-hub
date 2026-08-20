/**
 * Tests for `lib/projects/capabilities/list-phases.ts` — the project-structure
 * read (f-idea-capture §22-03 t-57). Pins the no-user guard, the funnel 404 map
 * (deny ≡ not_found via the reused `getProjectPlan`), the projection down to the
 * light ids/labels/status shape (dropping the Plan's heavy payload), and the
 * membership-scoped read forwarding the caller + projectId.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/plan', () => ({ getProjectPlan: vi.fn() }));

const { getProjectPlan } = await import('@/lib/projects/plan');
const { NotFoundError } = await import('@/lib/api/errors');
const { ListPhasesCapability } = await import('@/lib/projects/capabilities/list-phases');

const getPlan = getProjectPlan as ReturnType<typeof vi.fn>;
const cap = new ListPhasesCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

describe('list_phases', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({ projectId: 'p1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getPlan).not.toHaveBeenCalled();
  });

  it('maps the funnel NotFoundError to not_found (no enumeration)', async () => {
    getPlan.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('re-throws a non-funnel error rather than masking it as not_found', async () => {
    getPlan.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ projectId: 'p1' }, ctx())).rejects.toThrow('db down');
  });

  it('forwards the caller + projectId to the membership-scoped read', async () => {
    getPlan.mockResolvedValue({ projectId: 'p1', projectSlug: null, phases: [] });
    await cap.execute({ projectId: 'p1' }, ctx('caller'));
    expect(getPlan).toHaveBeenCalledWith('caller', 'p1');
  });

  it('projects the plan down to phases + features (ids/slugs/number/status), incl the residual band', async () => {
    getPlan.mockResolvedValue({
      projectId: 'p1',
      projectSlug: 'hce-hub',
      phases: [
        {
          id: 'ph1',
          name: 'Foundations',
          status: 'complete',
          ordinal: 0,
          // Heavy Plan fields (progress, waitingOn, deps, …) must NOT leak through.
          features: [
            {
              id: 'f1',
              number: 1,
              slug: 'f-a',
              title: 'A',
              status: 'shipped',
              progress: { merged: 2, total: 2 },
              waitingOn: [],
              dependsOn: [],
            },
          ],
        },
        {
          id: null,
          name: null,
          status: null,
          ordinal: null,
          features: [{ id: 'f2', number: 2, slug: null, title: 'B', status: 'available' }],
        },
      ],
    });

    const r = await cap.execute({ projectId: 'p1' }, ctx());

    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      projectId: 'p1',
      phases: [
        {
          id: 'ph1',
          name: 'Foundations',
          status: 'complete',
          ordinal: 0,
          features: [{ id: 'f1', number: 1, slug: 'f-a', title: 'A', status: 'shipped' }],
        },
        {
          id: null,
          name: null,
          status: null,
          ordinal: null,
          features: [{ id: 'f2', number: 2, slug: null, title: 'B', status: 'available' }],
        },
      ],
    });
  });

  describe('list_phases provenance', () => {
    it('declares processesPii and masks the phase prose on the durable row', () => {
      // §32 t-80 added each phase's authored `description` — long-form prose, not a
      // label — so the free text must not land verbatim in the audit trail.
      expect(cap.processesPii).toBe(true);
      const out = cap.redactProvenance(
        { projectId: 'p1' },
        {
          success: true,
          data: {
            projectId: 'p1',
            phases: [
              {
                id: 'ph1',
                name: 'Project flow',
                status: 'active',
                ordinal: 0,
                summary: null,
                description: 'sensitive planning prose that must not be persisted',
                startedAt: null,
                completedAt: null,
                features: [],
              },
            ],
          },
        }
      );
      expect(out.args).toEqual({ projectId: 'p1' });
      expect(out.resultPreview).not.toContain('sensitive planning prose');
      expect(out.resultPreview).toContain('1 phase band');
    });
  });
});
