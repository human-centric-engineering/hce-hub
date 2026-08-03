/**
 * Integration: link a task to its PR
 *
 * POST /api/v1/projects/:id/tasks/:taskId/set-pr
 *
 * @see app/api/v1/projects/[id]/tasks/[taskId]/set-pr/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/task-actions', () => ({ setTaskPr: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { setTaskPr } from '@/lib/projects/task-actions';
import { NotFoundError } from '@/lib/api/errors';
import { POST as setPrPost } from '@/app/api/v1/projects/[id]/tasks/[taskId]/set-pr/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const setPrMock = setTaskPr as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TID = 'cmjbv4i3x00013wsloputgwzz';
const PR = 'https://github.com/org/repo/pull/42';
const req = (body: unknown = { prUrl: PR }) =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/tasks/${TID}/set-pr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id = PID, taskId = TID) => ({ params: Promise.resolve({ id, taskId }) });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/projects/:id/tasks/:taskId/set-pr', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await setPrPost(req(), params())).status).toBe(401);
    expect(setPrMock).not.toHaveBeenCalled();
  });

  it('links the PR for a member, project-scoped, and returns the (unchanged) status', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    setPrMock.mockResolvedValue({ taskId: TID, status: 'claimed', warnings: [] });
    const res = await setPrPost(req(), params());
    expect(res.status).toBe(200);
    // Scoped to the URL project (no cross-project id-swap); the validated URL is forwarded.
    expect(setPrMock).toHaveBeenCalledWith(expect.any(String), TID, PR, PID);
    const json = await res.json();
    expect(json.data.status).toBe('claimed');
  });

  it('400s a missing/invalid PR URL before touching the core', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await setPrPost(req({}), params())).status).toBe(400);
    expect((await setPrPost(req({ prUrl: 'not a url' }), params())).status).toBe(400);
    expect((await setPrPost(req({ prUrl: 'javascript:alert(1)' }), params())).status).toBe(400);
    expect(setPrMock).not.toHaveBeenCalled();
  });

  it('404s a non-member / unknown task (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    setPrMock.mockRejectedValue(new NotFoundError('Task not found'));
    expect((await setPrPost(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id or task id before linking', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await setPrPost(req(), params('not-a-cuid'))).status).toBe(400);
    expect((await setPrPost(req(), params(PID, 'not-a-cuid'))).status).toBe(400);
    expect(setPrMock).not.toHaveBeenCalled();
  });
});
