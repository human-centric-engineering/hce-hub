/**
 * Tests for `lib/projects/capabilities/create-phase.ts` (f-phases §22 t1). The
 * MCP face of the shared `createPhase()` core — so this pins the thin wrapper:
 * no_user_context, the NotFoundError → not_found mapping (no enumeration),
 * pass-through of the args, and free-text provenance redaction. The core logic
 * is exercised in phases-service.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '@/lib/api/errors';

vi.mock('@/lib/projects/phases-service', () => ({ createPhase: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { idea: { findFirst: vi.fn() } } }));

const { createPhase } = await import('@/lib/projects/phases-service');
const { prisma } = await import('@/lib/db/client');
const { CreatePhaseCapability } = await import('@/lib/projects/capabilities/create-phase');

const create = createPhase as ReturnType<typeof vi.fn>;
const ideaFindFirst = prisma.idea.findFirst as ReturnType<typeof vi.fn>;
const cap = new CreatePhaseCapability();
const ctx = (userId: string | null = 'user-1') => ({ userId, agentId: 'a1' });

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ phaseId: 'ph1', ordinal: 0 });
});

describe('create_phase', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ projectId: 'p1', name: 'Alpha' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a phase and returns the service result', async () => {
    const r = await cap.execute(
      { projectId: 'p1', name: 'Alpha', description: 'notes', status: 'active', ordinal: 2 },
      ctx()
    );
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ phaseId: 'ph1', ordinal: 0 });
    expect(create).toHaveBeenCalledWith('user-1', 'p1', {
      name: 'Alpha',
      description: 'notes',
      status: 'active',
      ordinal: 2,
    });
  });

  it('maps a non-member (service NotFoundError) to not_found', async () => {
    create.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1', name: 'Alpha' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('rethrows unexpected errors', async () => {
    create.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ projectId: 'p1', name: 'Alpha' }, ctx())).rejects.toThrow('db down');
  });

  it('passes fromIdeaId through to the service when the idea is open', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'open' });
    const r = await cap.execute(
      { projectId: 'p1', name: 'Ideas Wave', fromIdeaId: 'idea-1' },
      ctx()
    );
    expect(r.success).toBe(true);
    expect(ideaFindFirst).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1' },
      select: { status: true },
    });
    expect(create).toHaveBeenCalledWith(
      'user-1',
      'p1',
      expect.objectContaining({ fromIdeaId: 'idea-1' })
    );
  });

  it('rejects promotion of an unknown / already-triaged idea before calling the service', async () => {
    ideaFindFirst.mockResolvedValueOnce(null);
    expect(
      (await cap.execute({ projectId: 'p1', name: 'X', fromIdeaId: 'ghost' }, ctx())).error?.code
    ).toBe('invalid_idea');

    ideaFindFirst.mockResolvedValueOnce({ status: 'promoted' });
    expect(
      (await cap.execute({ projectId: 'p1', name: 'X', fromIdeaId: 'idea-2' }, ctx())).error?.code
    ).toBe('idea_not_open');

    expect(create).not.toHaveBeenCalled();
  });

  it('masks free-text name/description in provenance, keeps ids', () => {
    const out = cap.redactProvenance(
      { projectId: 'p1', name: 'secret name', description: 'secret desc', status: 'parked' },
      { success: true, data: { phaseId: 'ph1', ordinal: 0 } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.projectId).toBe('p1');
    expect(a.status).toBe('parked');
    expect(String(a.name)).not.toContain('secret name');
    expect(String(a.description)).not.toContain('secret desc');
  });

  it('passes through absent status/description in provenance', () => {
    const out = cap.redactProvenance(
      { projectId: 'p1', name: 'Alpha' },
      { success: true, data: { phaseId: 'ph1', ordinal: 0 } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.status).toBeNull(); // status ?? null fallback
    expect(a.description).toBeUndefined(); // non-string passthrough
  });
});
