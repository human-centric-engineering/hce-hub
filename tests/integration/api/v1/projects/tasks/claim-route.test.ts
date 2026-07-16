/**
 * Integration: claim a task
 *
 * POST /api/v1/projects/:id/tasks/:taskId/claim
 *
 * @see app/api/v1/projects/[id]/tasks/[taskId]/claim/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/claim-task-service', () => ({ claimTask: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { claimTask } from '@/lib/projects/claim-task-service';
import { NotFoundError } from '@/lib/api/errors';
import { POST as claimPost } from '@/app/api/v1/projects/[id]/tasks/[taskId]/claim/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const claimMock = claimTask as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TID = 'cmjbv4i3x00013wsloputgxyz';
const req = () =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/tasks/${TID}/claim`, { method: 'POST' });
const params = (id = PID, taskId = TID) => ({ params: Promise.resolve({ id, taskId }) });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/projects/:id/tasks/:taskId/claim', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await claimPost(req(), params())).status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('claims for a member, scoped to the session user + project, returning warnings', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    claimMock.mockResolvedValue({ taskId: TID, claimed: true, warnings: [] });
    const res = await claimPost(req(), params());
    expect(res.status).toBe(200);
    // (userId, taskId, projectId) — the project scopes the task.
    expect(claimMock).toHaveBeenCalledWith(expect.any(String), TID, PID);
    const json = await res.json();
    expect(json.data.claimed).toBe(true);
  });

  it('404s a non-member / unknown / cross-project task (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    claimMock.mockRejectedValue(new NotFoundError('Task not found'));
    expect((await claimPost(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) task id before touching the service', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await claimPost(req(), params(PID, 'not-a-cuid'));
    expect(res.status).toBe(400);
    expect(claimMock).not.toHaveBeenCalled();
  });
});
