/**
 * Integration: single task detail (task sheet)
 *
 * GET /api/v1/projects/:id/tasks/:taskId
 *
 * @see app/api/v1/projects/[id]/tasks/[taskId]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/task-detail', () => ({ getTaskDetail: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { getTaskDetail } from '@/lib/projects/task-detail';
import { NotFoundError } from '@/lib/api/errors';
import { GET as taskGet } from '@/app/api/v1/projects/[id]/tasks/[taskId]/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const detailMock = getTaskDetail as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TID = 'cmjbv4i3x00013wsloputgxyz';
const req = () => new NextRequest(`http://localhost/api/v1/projects/${PID}/tasks/${TID}`);
const params = (id = PID, taskId = TID) => ({ params: Promise.resolve({ id, taskId }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects/:id/tasks/:taskId', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await taskGet(req(), params())).status).toBe(401);
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('returns the task detail for a member, scoped to the session user + project', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    detailMock.mockResolvedValue({ id: TID, title: 'T', blockedBy: [], blocks: [] });
    const res = await taskGet(req(), params());
    expect(res.status).toBe(200);
    expect(detailMock).toHaveBeenCalledWith(expect.any(String), PID, TID);
    const json = await res.json();
    expect(json.data.id).toBe(TID);
  });

  it('404s a non-member / unknown / cross-project id (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    detailMock.mockRejectedValue(new NotFoundError('Task not found'));
    expect((await taskGet(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id before touching the loader', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await taskGet(req(), params('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('400s an invalid (non-cuid) task id before touching the loader', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await taskGet(req(), params(PID, 'not-a-cuid'));
    expect(res.status).toBe(400);
    expect(detailMock).not.toHaveBeenCalled();
  });
});
