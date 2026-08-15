/**
 * Tests for `lib/projects/capabilities/get-feature.ts` — the feature-spec read over
 * MCP (f-mcp-project-scope §31 t-70). Pins the no-user guard, the project_required
 * guard (a feature is resolved by (project, ref)), the funnel 404 map (deny ≡
 * not_found via the reused getFeatureDetail), the projection down to the agent shape
 * (raw ownerUserId, waitingOn without id, merged task roll-up), and the provenance
 * masking of the free-text spec.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** A task-creation date safely before any ship boundary the fixtures use. */
const BEFORE = new Date('2026-07-01T00:00:00Z');

vi.mock('@/lib/projects/feature-detail', () => ({ getFeatureDetail: vi.fn() }));

const { getFeatureDetail } = await import('@/lib/projects/feature-detail');
const { NotFoundError } = await import('@/lib/api/errors');
const { GetFeatureCapability } = await import('@/lib/projects/capabilities/get-feature');

const getDetail = getFeatureDetail as ReturnType<typeof vi.fn>;
const cap = new GetFeatureCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

/** A full FeatureDetail (what getFeatureDetail returns) — richer than get_feature's output. */
function detail(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    projectId: 'p1',
    projectSlug: 'hce-hub',
    projectName: 'HCE Hub',
    number: 31,
    slug: 'f-mcp-project-scope',
    title: 'MCP as a project-scoped interface',
    description: 'Bind a Claude Code session to one Hub project.',
    doneWhen: 'A scoped key omits projectId and cannot reach another project.',
    references: [],
    status: 'in_flight',
    waitingOn: [{ slug: 'f-dep', title: 'A dependency' }],
    planningStage: 'planned',
    helpWanted: false,
    owner: { id: 'u2', name: 'Bo', email: 'b@x.io', image: null },
    members: [{ id: 'u2', name: 'Bo', email: 'b@x.io', image: null }],
    dependsOn: [{ id: 'd1', slug: 'f-x', title: 'Prereq' }],
    phase: { id: 'ph1', name: 'Project flow' },
    shippedAt: null,
    tasks: [
      {
        id: 't1',
        number: 69,
        title: 'a',
        status: 'merged',
        kind: 'feature_work',
        createdAt: BEFORE,
      },
      {
        id: 't2',
        number: 70,
        title: 'b',
        status: 'active',
        kind: 'feature_work',
        createdAt: BEFORE,
      },
    ],
    indicativeTasks: [{ id: 'i1', order: 0, text: 'sketch a thing' }],
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('get_feature', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({ featureRef: 'f-mcp' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getDetail).not.toHaveBeenCalled();
  });

  it('errors project_required when no projectId is ambient or passed', async () => {
    const r = await cap.execute({ featureRef: 'f-mcp' }, ctx());
    expect(r.error?.code).toBe('project_required');
    expect(getDetail).not.toHaveBeenCalled();
  });

  it('reads via getFeatureDetail scoped to (userId, projectId, featureRef)', async () => {
    getDetail.mockResolvedValue(detail());
    await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx('caller'));
    expect(getDetail).toHaveBeenCalledWith('caller', 'p1', 'f-mcp');
  });

  it('maps a getFeatureDetail NotFoundError to not_found (cross-project / unknown feature)', async () => {
    getDetail.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('re-throws a non-funnel error rather than masking it as not_found', async () => {
    getDetail.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx())).rejects.toThrow(
      'db down'
    );
  });

  it('projects to the agent shape: raw ownerUserId, waitingOn without id, merged roll-up', async () => {
    getDetail.mockResolvedValue(detail());
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      id: 'f1',
      number: 31,
      slug: 'f-mcp-project-scope',
      title: 'MCP as a project-scoped interface',
      description: 'Bind a Claude Code session to one Hub project.',
      doneWhen: 'A scoped key omits projectId and cannot reach another project.',
      status: 'in_flight',
      planningStage: 'planned',
      helpWanted: false,
      ownerUserId: 'u2', // the owner's raw id, not the UserRef; no members leak
      phase: { id: 'ph1', name: 'Project flow' },
      dependsOn: [{ id: 'd1', slug: 'f-x', title: 'Prereq' }],
      waitingOn: [{ slug: 'f-dep', title: 'A dependency' }], // no id on a WaitingOnRef
      tasks: { total: 2, merged: 1, live: 1, blocked: 0, openFixes: 0, openSinceShip: 0 },
      indicativeTasks: [{ order: 0, text: 'sketch a thing' }],
    });
  });

  it('excludes bugs from the roll-up, matching the Plan rather than counting raw rows', async () => {
    // The defect this closed: get_feature counted every row, so §21 read 7/7 over
    // MCP while the Plan showed 5/5. An agent asking "is this done?" and a human
    // looking at the board must not get different answers.
    getDetail.mockResolvedValue(
      detail({
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'a',
            status: 'merged',
            kind: 'feature_work',
            createdAt: BEFORE,
          },
          {
            id: 't2',
            number: 2,
            title: 'b',
            status: 'merged',
            kind: 'feature_work',
            createdAt: BEFORE,
          },
          { id: 't3', number: 3, title: 'fix', status: 'claimed', kind: 'bug', createdAt: BEFORE },
        ],
      })
    );
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    expect(r.data?.tasks).toEqual({
      total: 2,
      merged: 2,
      live: 0,
      blocked: 0,
      openFixes: 1,
      openSinceShip: 0,
    });
  });

  it('keeps post-ship work off the roll-up but still reports it as live', async () => {
    const SHIPPED = new Date('2026-08-01T00:00:00Z');
    const AFTER = new Date('2026-08-09T00:00:00Z');
    getDetail.mockResolvedValue(
      detail({
        shippedAt: SHIPPED,
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'a',
            status: 'merged',
            kind: 'feature_work',
            createdAt: BEFORE,
          },
          {
            id: 't2',
            number: 2,
            title: 'improve',
            status: 'active',
            kind: 'enhancement',
            createdAt: AFTER,
          },
        ],
      })
    );
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    // Completion is sealed history: still 1/1, not 1/2.
    expect(r.data?.tasks).toEqual({
      total: 1,
      merged: 1,
      live: 1,
      blocked: 0,
      openFixes: 0,
      openSinceShip: 1,
    });
  });

  it('reports a post-ship dependency-blocked task, which every other counter hides', async () => {
    // The gap `blocked` closes: such a task is off `total` (post-ship), not
    // `active` so not `live`, and not a `bug` so not an `openFixes`. Without
    // `blocked` an agent reads "nothing outstanding" while the Plan renders a
    // blocked row — the exact agent-vs-human disagreement this roll-up fixed.
    const SHIPPED = new Date('2026-08-01T00:00:00Z');
    const AFTER = new Date('2026-08-09T00:00:00Z');
    getDetail.mockResolvedValue(
      detail({
        shippedAt: SHIPPED,
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'a',
            status: 'merged',
            kind: 'feature_work',
            createdAt: BEFORE,
          },
          {
            id: 't2',
            number: 2,
            title: 'waiting',
            status: 'blocked',
            kind: 'enhancement',
            createdAt: AFTER,
          },
        ],
      })
    );
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    expect(r.data?.tasks).toEqual({
      total: 1,
      merged: 1,
      live: 0,
      blocked: 1,
      openFixes: 0,
      openSinceShip: 1,
    });
  });

  it('reports the phase the feature is filed under, and null when unfiled', async () => {
    getDetail.mockResolvedValue(detail({ phase: null }));
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    expect(r.data?.phase).toBeNull();
  });

  it('renders a null owner as null (no UserRef leak)', async () => {
    getDetail.mockResolvedValue(detail({ owner: null }));
    const r = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    expect(r.data?.ownerUserId).toBeNull();
  });

  it('masks the free-text spec in provenance, keeping the ref', async () => {
    getDetail.mockResolvedValue(detail());
    const result = await cap.execute({ featureRef: 'f-mcp', projectId: 'p1' }, ctx());
    const redacted = cap.redactProvenance({ featureRef: 'f-mcp', projectId: 'p1' }, result);
    expect(redacted.args).toEqual({ featureRef: 'f-mcp', projectId: 'p1' });
    expect(redacted.resultPreview).not.toContain('Bind a Claude Code'); // body not persisted verbatim
    expect(redacted.resultPreview).toContain('§31'); // just the ref
  });

  it('provenance falls back to a bare label when there is no number / projectId (error result)', async () => {
    // An unresolved read (e.g. not_found) has no data.number, and the caller may
    // have omitted projectId — both fall to null / the generic "feature" label.
    const redacted = cap.redactProvenance(
      { featureRef: 'f-mcp' },
      { success: false, error: { code: 'not_found', message: 'x' } }
    );
    expect(redacted.args).toEqual({ featureRef: 'f-mcp', projectId: null });
    expect(redacted.resultPreview).not.toContain('§'); // no ref → the bare "feature" label
  });
});
