/**
 * Integration: Project Plan view (feature tree)
 *
 * GET /api/v1/projects/:id/plan
 *
 * @see app/api/v1/projects/[id]/plan/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/plan', () => ({ getProjectPlan: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { getProjectPlan } from '@/lib/projects/plan';
import { NotFoundError } from '@/lib/api/errors';
import { GET as planGet } from '@/app/api/v1/projects/[id]/plan/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const planMock = getProjectPlan as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';
const req = () => new NextRequest(`http://localhost/api/v1/projects/${VALID_ID}/plan`);
const params = (id = VALID_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects/:id/plan', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await planGet(req(), params())).status).toBe(401);
    expect(planMock).not.toHaveBeenCalled();
  });

  it('returns the plan for a member, scoped to the session user', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    planMock.mockResolvedValue({ projectId: VALID_ID, features: [] });
    const res = await planGet(req(), params());
    expect(res.status).toBe(200);
    expect(planMock).toHaveBeenCalledWith(expect.any(String), VALID_ID);
    const json = await res.json();
    expect(json.data.projectId).toBe(VALID_ID);
  });

  it('404s a non-member / unknown id (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    planMock.mockRejectedValue(new NotFoundError('Project not found'));
    expect((await planGet(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) id before touching the loader', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await planGet(req(), params('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(planMock).not.toHaveBeenCalled();
  });
});
