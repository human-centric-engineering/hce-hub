/**
 * Integration: capture an idea (the quick-jot affordance)
 *
 * POST /api/v1/projects/:id/ideas
 *
 * @see app/api/v1/projects/[id]/ideas/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/capture-idea-service', () => ({ captureIdea: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { captureIdea } from '@/lib/projects/capture-idea-service';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { POST as ideasPost } from '@/app/api/v1/projects/[id]/ideas/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const captureMock = captureIdea as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const req = (body: unknown = { text: 'board merged column cap' }) =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id = PID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/projects/:id/ideas', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await ideasPost(req(), params())).status).toBe(401);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('captures for a member, project-scoped, and returns the result', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    captureMock.mockResolvedValue({ featureId: 'f-new', phaseId: 'park1' });
    const res = await ideasPost(req({ text: 'an idea' }), params());
    expect(res.status).toBe(200);
    expect(captureMock).toHaveBeenCalledWith(expect.any(String), PID, 'an idea');
    const json = await res.json();
    expect(json.data.featureId).toBe('f-new');
  });

  it('400s a missing/empty idea before touching the core', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await ideasPost(req({}), params())).status).toBe(400);
    expect((await ideasPost(req({ text: '   ' }), params())).status).toBe(400);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('400s a malformed (non-JSON) body without touching the core', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const bad = new NextRequest(`http://localhost/api/v1/projects/${PID}/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    expect((await ideasPost(bad, params())).status).toBe(400);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('404s a non-member / unknown project (funnel deny)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    captureMock.mockRejectedValue(new NotFoundError('Project not found'));
    expect((await ideasPost(req(), params())).status).toBe(404);
  });

  it('400s when the project has no parked phase (ValidationError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    captureMock.mockRejectedValue(new ValidationError('no parked phase'));
    expect((await ideasPost(req(), params())).status).toBe(400);
  });

  it('400s an invalid (non-cuid) project id before capturing', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await ideasPost(req(), params('not-a-cuid'))).status).toBe(400);
    expect(captureMock).not.toHaveBeenCalled();
  });
});
