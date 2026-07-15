/**
 * Integration: Admin project members (add / remove)
 *
 * @see app/api/v1/admin/projects/[id]/members/route.ts
 * @see app/api/v1/admin/projects/[id]/members/[userId]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/admin', () => ({ addMember: vi.fn(), removeMember: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { addMember, removeMember } from '@/lib/projects/admin';
import { ConflictError } from '@/lib/api/errors';
import { POST as addPost } from '@/app/api/v1/admin/projects/[id]/members/route';
import { DELETE as removeDelete } from '@/app/api/v1/admin/projects/[id]/members/[userId]/route';
import { mockAdminUser, mockAuthenticatedUser } from '@/tests/helpers/auth';

const add = addMember as ReturnType<typeof vi.fn>;
const remove = removeMember as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';

function addReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/projects/${PID}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
function delReq(): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/projects/${PID}/members/u9`, {
    method: 'DELETE',
  });
}
const addParams = { params: Promise.resolve({ id: PID }) };
const delParams = (userId: string) => ({ params: Promise.resolve({ id: PID, userId }) });

beforeEach(() => vi.clearAllMocks());

describe('POST members', () => {
  it('403s a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await addPost(addReq({ userId: 'u9' }), addParams)).status).toBe(403);
  });

  it('adds a member (201)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    add.mockResolvedValue(undefined);
    const res = await addPost(addReq({ userId: 'u9' }), addParams);
    expect(res.status).toBe(201);
    expect(add).toHaveBeenCalledWith(PID, 'u9', expect.any(Object));
  });

  it('400s a missing userId', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    expect((await addPost(addReq({}), addParams)).status).toBe(400);
  });

  it('400s an invalid project id', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    const res = await addPost(addReq({ userId: 'u9' }), { params: Promise.resolve({ id: 'bad' }) });
    expect(res.status).toBe(400);
    expect(add).not.toHaveBeenCalled();
  });
});

describe('DELETE member', () => {
  it('removes a member (200)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    remove.mockResolvedValue(undefined);
    const res = await removeDelete(delReq(), delParams('u9'));
    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(PID, 'u9', expect.any(Object));
  });

  it('surfaces the lead-guard as 409', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    remove.mockRejectedValue(
      new ConflictError('Cannot remove the project lead; reassign the lead first')
    );
    const res = await removeDelete(delReq(), delParams('lead_1'));
    expect(res.status).toBe(409);
  });

  it('400s an invalid project id', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
    const res = await removeDelete(delReq(), {
      params: Promise.resolve({ id: 'bad', userId: 'u9' }),
    });
    expect(res.status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
  });
});
