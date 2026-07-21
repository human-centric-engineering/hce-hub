/**
 * Integration: claim a feature
 *
 * POST /api/v1/projects/:id/features/:key/claim
 *
 * @see app/api/v1/projects/[id]/features/[key]/claim/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/claim-feature-service', () => ({ claimFeature: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { claimFeature } from '@/lib/projects/claim-feature-service';
import { NotFoundError } from '@/lib/api/errors';
import { POST as claimPost } from '@/app/api/v1/projects/[id]/features/[key]/claim/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const claimMock = claimFeature as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const FID = 'cmjbv4i3x00013wsloputgwzz';
const req = () =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/features/${FID}/claim`, {
    method: 'POST',
  });
const params = (id = PID, key = FID) => ({ params: Promise.resolve({ id, key }) });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/projects/:id/features/:key/claim', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await claimPost(req(), params())).status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('claims for a member, project-scoped, and returns the result', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    claimMock.mockResolvedValue({ featureId: FID, claimed: true, warnings: [] });
    const res = await claimPost(req(), params());
    expect(res.status).toBe(200);
    // Scoped to the URL project (no cross-project id-swap).
    expect(claimMock).toHaveBeenCalledWith(expect.any(String), FID, PID);
    const json = await res.json();
    expect(json.data.claimed).toBe(true);
  });

  it('404s a non-member / unknown feature (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    claimMock.mockRejectedValue(new NotFoundError('Feature not found'));
    expect((await claimPost(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id or feature key before claiming', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await claimPost(req(), params('not-a-cuid'))).status).toBe(400);
    expect((await claimPost(req(), params(PID, 'not-a-cuid'))).status).toBe(400);
    expect(claimMock).not.toHaveBeenCalled();
  });
});
