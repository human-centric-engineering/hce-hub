/**
 * Integration: project journal events
 *
 * GET /api/v1/projects/:id/events
 *
 * @see app/api/v1/projects/[id]/events/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/journal', () => ({ getProjectEvents: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { getProjectEvents } from '@/lib/projects/journal';
import { NotFoundError } from '@/lib/api/errors';
import { GET as eventsGet } from '@/app/api/v1/projects/[id]/events/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const eventsMock = getProjectEvents as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const req = (qs = '') => new NextRequest(`http://localhost/api/v1/projects/${PID}/events${qs}`);
const params = (id = PID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects/:id/events', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await eventsGet(req(), params())).status).toBe(401);
    expect(eventsMock).not.toHaveBeenCalled();
  });

  it('returns events for a member (no filters → all)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    eventsMock.mockResolvedValue([{ id: 'e1', kind: 'decision' }]);
    const res = await eventsGet(req(), params());
    expect(res.status).toBe(200);
    expect(eventsMock).toHaveBeenCalledWith(expect.any(String), PID, {
      taskId: undefined,
      featureId: undefined,
      kinds: undefined,
    });
    const json = await res.json();
    expect(json.data).toEqual([{ id: 'e1', kind: 'decision' }]);
  });

  it('passes taskId + featureId filters through', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    eventsMock.mockResolvedValue([]);
    await eventsGet(req('?taskId=t1&featureId=f1'), params());
    expect(eventsMock).toHaveBeenCalledWith(expect.any(String), PID, {
      taskId: 't1',
      featureId: 'f1',
      kinds: undefined,
    });
  });

  it('parses a kinds list and drops unrecognised values (lenient filter)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    eventsMock.mockResolvedValue([]);
    await eventsGet(req('?kinds=decision,bogus,feature_shipped'), params());
    expect(eventsMock).toHaveBeenCalledWith(expect.any(String), PID, {
      taskId: undefined,
      featureId: undefined,
      kinds: ['decision', 'feature_shipped'],
    });
  });

  it('404s a non-member / unknown project (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    eventsMock.mockRejectedValue(new NotFoundError('Project not found'));
    expect((await eventsGet(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id before touching the loader', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await eventsGet(req(), params('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(eventsMock).not.toHaveBeenCalled();
  });
});
