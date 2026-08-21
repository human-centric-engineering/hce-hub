/**
 * Integration: project revision (change cursor)
 *
 * GET /api/v1/projects/:id/revision
 *
 * The conditional-GET half is what earns its keep here: this route is polled by
 * every open tab, so the 304 path is the common case, not an optimisation. A
 * regression that always answered 200 would still look correct to a user and
 * would still refresh their surfaces — it would just do it constantly.
 *
 * @see app/api/v1/projects/[id]/revision/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/revision', () => ({ getProjectRevision: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { getProjectRevision } from '@/lib/projects/revision';
import { NotFoundError } from '@/lib/api/errors';
import { GET as revisionGet } from '@/app/api/v1/projects/[id]/revision/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const revisionMock = getProjectRevision as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const TOKEN = 'W/"9RJhFRE0Xr3nCwEsAzOfyPMlNRw"';

const req = (headers?: Record<string, string>) =>
  new NextRequest(`http://localhost/api/v1/projects/${PID}/revision`, { headers });
const params = (id = PID) => ({ params: Promise.resolve({ id }) });

const revision = { projectId: PID, revision: TOKEN, changedAt: '2026-08-21T10:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  revisionMock.mockResolvedValue(revision);
});

describe('GET /api/v1/projects/:id/revision', () => {
  it('401s the signed-out caller without reading the project', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await revisionGet(req(), params())).status).toBe(401);
    expect(revisionMock).not.toHaveBeenCalled();
  });

  it('returns the token to a member, and repeats it as the ETag', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await revisionGet(req(), params());

    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe(TOKEN);
    expect(revisionMock).toHaveBeenCalledWith(expect.any(String), PID);

    const json = await res.json();
    // The header and the body must name the same state — a poller may follow
    // either, and they are the same string precisely so it cannot matter which.
    expect(json.data).toEqual(revision);
    expect(json.data.revision).toBe(res.headers.get('ETag'));
  });

  it('304s a poller that already holds the current token', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await revisionGet(req({ 'If-None-Match': TOKEN }), params());

    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe(TOKEN);
    // 304 is "nothing new", so it carries no body to parse.
    expect(await res.text()).toBe('');
  });

  it('200s a poller holding a stale token', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await revisionGet(req({ 'If-None-Match': 'W/"something-older"' }), params());

    expect(res.status).toBe(200);
    expect((await res.json()).data.revision).toBe(TOKEN);
  });

  it('404s a non-member — never 403, which would confirm the project exists', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    revisionMock.mockRejectedValue(new NotFoundError(`Project ${PID} not found`));

    expect((await revisionGet(req(), params())).status).toBe(404);
  });

  it('404s an unknown id identically, conditional request or not', async () => {
    // A 304 for a project you cannot see would be an existence oracle: the caller
    // learns their guessed token matched. Access is resolved before any
    // conditional handling, so both shapes answer the same way.
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    revisionMock.mockRejectedValue(new NotFoundError('Project not found'));

    const plain = await revisionGet(req(), params());
    const conditional = await revisionGet(req({ 'If-None-Match': TOKEN }), params());

    expect(plain.status).toBe(404);
    expect(conditional.status).toBe(404);
  });
});
