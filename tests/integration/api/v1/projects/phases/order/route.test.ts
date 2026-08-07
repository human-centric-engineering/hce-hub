/**
 * Integration: reorder a project's phases (f-phases §22 t3)
 *
 * PUT /api/v1/projects/:id/phases/order
 * @see app/api/v1/projects/[id]/phases/order/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/phases-service', () => ({ reorderPhases: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { reorderPhases } from '@/lib/projects/phases-service';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { PUT } from '@/app/api/v1/projects/[id]/phases/order/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const reorderMock = reorderPhases as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';
const url = `http://localhost/api/v1/projects/${VALID_ID}/phases/order`;
const params = { params: Promise.resolve({ id: VALID_ID }) };
const put = (body: unknown) =>
  new NextRequest(url, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => vi.clearAllMocks());

describe('PUT /api/v1/projects/:id/phases/order', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await PUT(put({ phaseIds: ['a'] }), params)).status).toBe(401);
    expect(reorderMock).not.toHaveBeenCalled();
  });

  it('400s a missing/empty phaseIds array', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await PUT(put({}), params)).status).toBe(400);
    expect((await PUT(put({ phaseIds: [] }), params)).status).toBe(400);
    expect(reorderMock).not.toHaveBeenCalled();
  });

  it('reorders and returns the count', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    reorderMock.mockResolvedValue({ projectId: VALID_ID, count: 3 });
    const res = await PUT(put({ phaseIds: ['c', 'a', 'b'] }), params);
    expect(res.status).toBe(200);
    expect(reorderMock).toHaveBeenCalledWith(expect.any(String), VALID_ID, ['c', 'a', 'b']);
  });

  it('400s an incomplete list (service ValidationError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    reorderMock.mockRejectedValue(new ValidationError('incomplete'));
    expect((await PUT(put({ phaseIds: ['a'] }), params)).status).toBe(400);
  });

  it('404s a non-member (service NotFoundError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    reorderMock.mockRejectedValue(new NotFoundError('nope'));
    expect((await PUT(put({ phaseIds: ['a'] }), params)).status).toBe(404);
  });
});
