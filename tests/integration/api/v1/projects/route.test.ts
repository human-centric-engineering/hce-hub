/**
 * Integration: Consumer projects list + detail
 *
 * GET /api/v1/projects
 * GET /api/v1/projects/:id
 *
 * @see app/api/v1/projects/route.ts · app/api/v1/projects/[id]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/consumer', () => ({
  listProjectsForUser: vi.fn(),
  getProjectForUser: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import { listProjectsForUser, getProjectForUser } from '@/lib/projects/consumer';
import { NotFoundError } from '@/lib/api/errors';
import { GET as listGet } from '@/app/api/v1/projects/route';
import { GET as detailGet } from '@/app/api/v1/projects/[id]/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const listMock = listProjectsForUser as ReturnType<typeof vi.fn>;
const detailMock = getProjectForUser as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';
const listReq = () => new NextRequest('http://localhost/api/v1/projects');
const detailReq = () => new NextRequest(`http://localhost/api/v1/projects/${VALID_ID}`);
const params = (id = VALID_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await listGet(listReq())).status).toBe(401);
  });

  it('returns the caller’s own projects', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    listMock.mockResolvedValue([{ id: 'p1', name: 'Hub' }]);

    const res = await listGet(listReq());
    expect(res.status).toBe(200);
    // scoped to the session user (not an arbitrary id)
    expect(listMock).toHaveBeenCalledWith(expect.any(String));
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});

describe('GET /api/v1/projects/:id', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await detailGet(detailReq(), params())).status).toBe(401);
  });

  it('returns the project view for a member', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    detailMock.mockResolvedValue({ id: VALID_ID, name: 'Hub', members: [] });
    const res = await detailGet(detailReq(), params());
    expect(res.status).toBe(200);
    expect(detailMock).toHaveBeenCalledWith(expect.any(String), VALID_ID);
  });

  it('404s a non-member / unknown id (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    detailMock.mockRejectedValue(new NotFoundError('Project not found'));
    const res = await detailGet(detailReq(), params());
    expect(res.status).toBe(404);
  });

  it('400s an invalid id', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await detailGet(detailReq(), params('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(detailMock).not.toHaveBeenCalled();
  });
});
