/**
 * Integration: single feature detail (feature page)
 *
 * GET /api/v1/projects/:id/features/:key
 *
 * @see app/api/v1/projects/[id]/features/[key]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/feature-detail', () => ({ getFeatureDetail: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { getFeatureDetail } from '@/lib/projects/feature-detail';
import { NotFoundError } from '@/lib/api/errors';
import { GET as featureGet } from '@/app/api/v1/projects/[id]/features/[key]/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const detailMock = getFeatureDetail as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const req = () => new NextRequest(`http://localhost/api/v1/projects/${PID}/features/f-mcp`);
const params = (id = PID, key = 'f-mcp') => ({ params: Promise.resolve({ id, key }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects/:id/features/:key', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await featureGet(req(), params())).status).toBe(401);
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('returns the feature detail for a member, resolved by the slug key', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    detailMock.mockResolvedValue({ id: 'f1', slug: 'f-mcp', title: 'MCP server' });
    const res = await featureGet(req(), params());
    expect(res.status).toBe(200);
    expect(detailMock).toHaveBeenCalledWith(expect.any(String), PID, 'f-mcp');
    const json = await res.json();
    expect(json.data.slug).toBe('f-mcp');
  });

  it('404s an unknown feature / non-member (deny ≡ not-found, never 403)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    detailMock.mockRejectedValue(new NotFoundError('Feature not found'));
    expect((await featureGet(req(), params())).status).toBe(404);
  });

  it('400s an invalid (non-cuid) project id before touching the loader', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await featureGet(req(), params('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('404s an empty or over-long key without touching the loader', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const long = 'x'.repeat(201);
    expect((await featureGet(req(), params(PID, long))).status).toBe(404);
    expect((await featureGet(req(), params(PID, '   '))).status).toBe(404);
    expect(detailMock).not.toHaveBeenCalled();
  });
});
