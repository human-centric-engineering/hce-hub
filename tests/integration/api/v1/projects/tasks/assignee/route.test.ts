/**
 * Integration: (re)assign a task
 *
 * PATCH /api/v1/projects/:id/tasks/:taskId/assignee
 *
 * @see app/api/v1/projects/[id]/tasks/[taskId]/assignee/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/task-actions', () => ({ assignTask: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { assignTask } from '@/lib/projects/task-actions';
import { NotFoundError } from '@/lib/api/errors';
import { PATCH as assigneePatch } from '@/app/api/v1/projects/[id]/tasks/[taskId]/assignee/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const assignMock = assignTask as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TID = 'cmjbv4i3x00013wsloputgwzz';
const ASSIGNEE = 'cmskm4qf4000104kwyzajd4oc';
const req = (body: unknown = { assigneeUserId: ASSIGNEE }) =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/tasks/${TID}/assignee`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id = PID, taskId = TID) => ({ params: Promise.resolve({ id, taskId }) });

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/v1/projects/:id/tasks/:taskId/assignee', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await assigneePatch(req(), params())).status).toBe(401);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('assigns for a member, project-scoped, and returns the result', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    assignMock.mockResolvedValue({ taskId: TID, status: 'claimed', warnings: [] });
    const res = await assigneePatch(req(), params());
    expect(res.status).toBe(200);
    // Scoped to the URL project (no cross-project id-swap); the validated body is forwarded.
    expect(assignMock).toHaveBeenCalledWith(expect.any(String), TID, ASSIGNEE, PID);
    const json = await res.json();
    expect(json.data.status).toBe('claimed');
  });

  it('400s a missing/invalid assignee id before touching the core', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await assigneePatch(req({}), params())).status).toBe(400);
    expect((await assigneePatch(req({ assigneeUserId: 'not-a-cuid' }), params())).status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('404s a non-member / unknown task (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    assignMock.mockRejectedValue(new NotFoundError('Task not found'));
    expect((await assigneePatch(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id or task id before assigning', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await assigneePatch(req(), params('not-a-cuid'))).status).toBe(400);
    expect((await assigneePatch(req(), params(PID, 'not-a-cuid'))).status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
