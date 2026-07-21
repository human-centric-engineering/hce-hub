/**
 * Tests for `lib/projects/capabilities/claim-feature.ts` — the thin MCP/chat
 * wrapper over the shared `claimFeature` service. Pins the no-user guard, the
 * delegation (result passed through), and the NotFoundError → not_found mapping
 * (no enumeration). The claim logic itself is covered by claim-feature-service.test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/claim-feature-service', () => ({ claimFeature: vi.fn() }));

const { claimFeature } = await import('@/lib/projects/claim-feature-service');
const { NotFoundError } = await import('@/lib/api/errors');
const { ClaimFeatureCapability } = await import('@/lib/projects/capabilities/claim-feature');

const claim = claimFeature as ReturnType<typeof vi.fn>;

const cap = new ClaimFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

describe('claim_feature capability', () => {
  it('errors no_user_context for a null-user run (no service call)', async () => {
    const r = await cap.execute({ featureId: 'f1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(claim).not.toHaveBeenCalled();
  });

  it('delegates to claimFeature and passes the result through', async () => {
    claim.mockResolvedValue({ featureId: 'f1', claimed: true, warnings: [] });
    const r = await cap.execute({ featureId: 'f1' }, ctx());
    expect(claim).toHaveBeenCalledWith(USER, 'f1');
    expect(r).toEqual({ success: true, data: { featureId: 'f1', claimed: true, warnings: [] } });
  });

  it('maps a NotFoundError from the funnel to not_found (no enumeration)', async () => {
    claim.mockRejectedValue(new NotFoundError('Feature f1 not found'));
    const r = await cap.execute({ featureId: 'f1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('rethrows a non-NotFoundError (unexpected failure surfaces)', async () => {
    claim.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ featureId: 'f1' }, ctx())).rejects.toThrow('db down');
  });
});
