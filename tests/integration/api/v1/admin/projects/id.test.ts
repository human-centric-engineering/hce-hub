/**
 * Integration: Admin single project (GET / PATCH / DELETE)
 *
 * @see app/api/v1/admin/projects/[id]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/admin', () => ({
  getProjectDetail: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import { getProjectDetail, updateProject, archiveProject } from '@/lib/projects/admin';
import { GET, PATCH, DELETE } from '@/app/api/v1/admin/projects/[id]/route';
import { mockAdminUser, mockAuthenticatedUser } from '@/tests/helpers/auth';

const getDetail = getProjectDetail as ReturnType<typeof vi.fn>;
const update = updateProject as ReturnType<typeof vi.fn>;
const archive = archiveProject as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/projects/${VALID_ID}`, {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const params = (id = VALID_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /admin/projects/:id', () => {
  it('403s a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await GET(req('GET'), params())).status).toBe(403);
  });

  it('returns the project detail for an admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    getDetail.mockResolvedValue({ id: VALID_ID, name: 'Hub', members: [] });
    const res = await GET(req('GET'), params());
    expect(res.status).toBe(200);
    expect(getDetail).toHaveBeenCalledWith(VALID_ID);
  });

  it('400s an invalid id', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    const res = await GET(req('GET'), params('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(getDetail).not.toHaveBeenCalled();
  });
});

describe('PATCH /admin/projects/:id', () => {
  it('updates for an admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    update.mockResolvedValue({ id: VALID_ID, name: 'Renamed' });
    const res = await PATCH(req('PATCH', { name: 'Renamed' }), params());
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      VALID_ID,
      expect.objectContaining({ name: 'Renamed' }),
      expect.any(Object)
    );
  });

  it('400s an empty patch', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    const res = await PATCH(req('PATCH', {}), params());
    expect(res.status).toBe(400);
  });
});

describe('DELETE /admin/projects/:id (archive)', () => {
  it('archives for an admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    archive.mockResolvedValue({ id: VALID_ID, status: 'archived' });
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(200);
    expect(archive).toHaveBeenCalledWith(VALID_ID, expect.any(Object));
  });
});
