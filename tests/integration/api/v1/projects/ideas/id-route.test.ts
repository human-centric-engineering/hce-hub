/**
 * Integration: edit / drop / restore an idea
 *
 * PATCH /api/v1/projects/:id/ideas/:ideaId
 *
 * @see app/api/v1/projects/[id]/ideas/[ideaId]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/update-idea-service', () => ({ updateIdea: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { updateIdea } from '@/lib/projects/update-idea-service';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { PATCH as ideaPatch } from '@/app/api/v1/projects/[id]/ideas/[ideaId]/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const updateMock = updateIdea as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const IID = 'cmjbv4i3x00013wslabcd1234';
const req = (body: unknown = { status: 'dropped' }) =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/ideas/${IID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id = PID, ideaId = IID) => ({ params: Promise.resolve({ id, ideaId }) });

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/v1/projects/:id/ideas/:ideaId', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await ideaPatch(req(), params())).status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates for a member and returns the new status; scopes by the URL project', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockResolvedValue({ ideaId: IID, projectId: PID, status: 'dropped' });
    const res = await ideaPatch(req({ status: 'dropped' }), params());
    expect(res.status).toBe(200);
    // The URL project is forwarded as the nesting guard (4th arg).
    expect(updateMock).toHaveBeenCalledWith(expect.any(String), IID, { status: 'dropped' }, PID);
    const json = await res.json();
    expect(json.data.status).toBe('dropped');
  });

  it('400s an empty patch (neither text nor status) before touching the core', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await ideaPatch(req({}), params())).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('400s a malformed (non-JSON) body without touching the core', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const bad = new NextRequest(`http://localhost/api/v1/projects/${PID}/ideas/${IID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    expect((await ideaPatch(bad, params())).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('404s a non-member / unknown idea (funnel deny)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockRejectedValue(new NotFoundError('Idea not found'));
    expect((await ideaPatch(req(), params())).status).toBe(404);
  });

  it('400s a promoted (terminal) idea (ValidationError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockRejectedValue(new ValidationError('already promoted'));
    expect((await ideaPatch(req(), params())).status).toBe(400);
  });

  it('400s an invalid (non-cuid) idea id before updating', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await ideaPatch(req(), params(PID, 'not-a-cuid'))).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
