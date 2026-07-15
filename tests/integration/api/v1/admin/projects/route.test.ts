/**
 * Integration: Admin Projects (list + create)
 *
 * GET  /api/v1/admin/projects
 * POST /api/v1/admin/projects
 *
 * @see app/api/v1/admin/projects/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/admin', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import { listProjects, createProject } from '@/lib/projects/admin';
import { GET, POST } from '@/app/api/v1/admin/projects/route';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const listMock = listProjects as ReturnType<typeof vi.fn>;
const createMock = createProject as ReturnType<typeof vi.fn>;

function listReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/v1/admin/projects');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}
function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/projects', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /admin/projects', () => {
  it('401s an unauthenticated caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await GET(listReq())).status).toBe(401);
  });

  it('403s a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await GET(listReq())).status).toBe(403);
  });

  it('returns a paginated list for an admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    listMock.mockResolvedValue({ items: [{ id: 'p1' }], total: 1, page: 1, limit: 20 });

    const res = await GET(listReq({ q: 'hub' }));
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ q: 'hub' }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.meta.total).toBe(1);
  });
});

describe('POST /admin/projects', () => {
  it('403s a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect(
      (await POST(postReq({ name: 'X', hostPlatform: 'sunrise', leadUserId: 'u1' }))).status
    ).toBe(403);
  });

  it('creates a project for an admin (201)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    createMock.mockResolvedValue({ id: 'p1', name: 'Hub' });

    const res = await POST(postReq({ name: 'Hub', hostPlatform: 'sunrise', leadUserId: 'lead_1' }));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Hub', leadUserId: 'lead_1' }),
      expect.objectContaining({ userId: expect.any(String) })
    );
  });

  it('400s an unknown host platform', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    const res = await POST(postReq({ name: 'Hub', hostPlatform: 'wordpress', leadUserId: 'l1' }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('400s a missing lead', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    const res = await POST(postReq({ name: 'Hub', hostPlatform: 'sunrise' }));
    expect(res.status).toBe(400);
  });
});
