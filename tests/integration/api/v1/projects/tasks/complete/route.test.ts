/**
 * Integration: complete a task
 *
 * POST /api/v1/projects/:id/tasks/:taskId/complete
 *
 * @see app/api/v1/projects/[id]/tasks/[taskId]/complete/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/task-actions', () => ({ startTask: vi.fn(), completeTask: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { completeTask } from '@/lib/projects/task-actions';
import { NotFoundError } from '@/lib/api/errors';
import { POST as completePost } from '@/app/api/v1/projects/[id]/tasks/[taskId]/complete/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const completeMock = completeTask as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TID = 'cmjbv4i3x00013wsloputgwzz';
const req = () =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/tasks/${TID}/complete`, {
    method: 'POST',
  });
const params = (id = PID, taskId = TID) => ({ params: Promise.resolve({ id, taskId }) });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/projects/:id/tasks/:taskId/complete', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await completePost(req(), params())).status).toBe(401);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('completes for a member, project-scoped, and returns the result', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    completeMock.mockResolvedValue({ taskId: TID, status: 'merged', warnings: [] });
    const res = await completePost(req(), params());
    expect(res.status).toBe(200);
    expect(completeMock).toHaveBeenCalledWith(expect.any(String), TID, PID);
    const json = await res.json();
    expect(json.data.status).toBe('merged');
  });

  it('404s a non-member / unknown task (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    completeMock.mockRejectedValue(new NotFoundError('Task not found'));
    expect((await completePost(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id or task id before completing', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await completePost(req(), params('not-a-cuid'))).status).toBe(400);
    expect((await completePost(req(), params(PID, 'not-a-cuid'))).status).toBe(400);
    expect(completeMock).not.toHaveBeenCalled();
  });
});
