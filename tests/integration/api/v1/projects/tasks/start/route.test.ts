/**
 * Integration: start a task
 *
 * POST /api/v1/projects/:id/tasks/:taskId/start
 *
 * @see app/api/v1/projects/[id]/tasks/[taskId]/start/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/task-actions', () => ({ startTask: vi.fn(), completeTask: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { startTask } from '@/lib/projects/task-actions';
import { NotFoundError } from '@/lib/api/errors';
import { POST as startPost } from '@/app/api/v1/projects/[id]/tasks/[taskId]/start/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const startMock = startTask as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TID = 'cmjbv4i3x00013wsloputgwzz';
const req = () =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/tasks/${TID}/start`, { method: 'POST' });
const params = (id = PID, taskId = TID) => ({ params: Promise.resolve({ id, taskId }) });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/projects/:id/tasks/:taskId/start', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await startPost(req(), params())).status).toBe(401);
    expect(startMock).not.toHaveBeenCalled();
  });

  it('starts for a member, project-scoped, and returns the result', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    startMock.mockResolvedValue({ taskId: TID, status: 'active', warnings: [] });
    const res = await startPost(req(), params());
    expect(res.status).toBe(200);
    // Scoped to the URL project (no cross-project id-swap).
    expect(startMock).toHaveBeenCalledWith(expect.any(String), TID, PID);
    const json = await res.json();
    expect(json.data.status).toBe('active');
  });

  it('404s a non-member / unknown task (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    startMock.mockRejectedValue(new NotFoundError('Task not found'));
    expect((await startPost(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id or task id before starting', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await startPost(req(), params('not-a-cuid'))).status).toBe(400);
    expect((await startPost(req(), params(PID, 'not-a-cuid'))).status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });
});
