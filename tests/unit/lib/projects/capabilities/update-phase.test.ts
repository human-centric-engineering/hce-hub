/**
 * Tests for `lib/projects/capabilities/update-phase.ts` (f-phases §22 t1). The
 * MCP face of the shared `updatePhase()` core: pins the wrapper mappings —
 * no_user_context, NotFoundError → not_found, ValidationError →
 * nothing_to_update, arg pass-through, and free-text redaction. Core logic is in
 * phases-service.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/projects/phases-service', () => ({ updatePhase: vi.fn() }));

const { updatePhase } = await import('@/lib/projects/phases-service');
const { UpdatePhaseCapability } = await import('@/lib/projects/capabilities/update-phase');

const update = updatePhase as ReturnType<typeof vi.fn>;
const cap = new UpdatePhaseCapability();
const ctx = (userId: string | null = 'user-1', scope?: Record<string, string>) => ({
  userId,
  agentId: 'a1',
  ...(scope ? { scope } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({ phaseId: 'ph1', updated: ['name'] });
});

describe('update_phase', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ phaseId: 'ph1', name: 'x' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(update).not.toHaveBeenCalled();
  });

  it('updates a phase and returns the service result', async () => {
    const r = await cap.execute({ phaseId: 'ph1', name: 'Renamed', status: 'complete' }, ctx());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ phaseId: 'ph1', updated: ['name'] });
    expect(update).toHaveBeenCalledWith(
      'user-1',
      'ph1',
      {
        name: 'Renamed',
        description: undefined,
        status: 'complete',
      },
      undefined
    );
  });

  it("forwards a project-scoped key's projectId as the cross-project guard", async () => {
    await cap.execute({ phaseId: 'ph1', name: 'x' }, ctx('user-1', { projectId: 'proj-scoped' }));
    // The scope becomes updatePhase's expectedProjectId → a phase outside the
    // key's project is not_found (hard isolation for this entity-id verb).
    expect(update).toHaveBeenCalledWith(
      'user-1',
      'ph1',
      { name: 'x', description: undefined, status: undefined },
      'proj-scoped'
    );
  });

  it('maps a non-member (service NotFoundError) to not_found', async () => {
    update.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ phaseId: 'ph1', name: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('maps an empty patch (service ValidationError) to nothing_to_update', async () => {
    update.mockRejectedValue(new ValidationError('No fields to update were provided.'));
    const r = await cap.execute({ phaseId: 'ph1' }, ctx());
    expect(r.error?.code).toBe('nothing_to_update');
  });

  it('rethrows unexpected errors', async () => {
    update.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ phaseId: 'ph1', name: 'x' }, ctx())).rejects.toThrow('db down');
  });

  it('masks free-text name/description in provenance, keeps ids', () => {
    const out = cap.redactProvenance(
      { phaseId: 'ph1', name: 'secret name', description: 'secret desc', status: 'parked' },
      { success: true, data: { phaseId: 'ph1', updated: ['name'] } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.phaseId).toBe('ph1');
    expect(a.status).toBe('parked');
    expect(String(a.name)).not.toContain('secret name');
    expect(String(a.description)).not.toContain('secret desc');
  });

  it('passes through absent name/description in provenance', () => {
    const out = cap.redactProvenance(
      { phaseId: 'ph1', status: 'active' },
      { success: true, data: { phaseId: 'ph1', updated: ['status'] } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.name).toBeUndefined(); // non-string passthrough
    expect(a.description).toBeUndefined();
  });
});
