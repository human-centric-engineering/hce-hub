/**
 * Integration: project phases — list + create (f-phases §22 t3)
 *
 * GET / POST /api/v1/projects/:id/phases
 * @see app/api/v1/projects/[id]/phases/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/phases', () => ({ listProjectPhases: vi.fn() }));
vi.mock('@/lib/projects/phases-service', () => ({ createPhase: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { listProjectPhases } from '@/lib/projects/phases';
import { createPhase } from '@/lib/projects/phases-service';
import { NotFoundError } from '@/lib/api/errors';
import { GET, POST } from '@/app/api/v1/projects/[id]/phases/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const listMock = listProjectPhases as ReturnType<typeof vi.fn>;
const createMock = createPhase as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';
const url = `http://localhost/api/v1/projects/${VALID_ID}/phases`;
const params = { params: Promise.resolve({ id: VALID_ID }) };
const post = (body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects/:id/phases', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await GET(new NextRequest(url), params)).status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('returns the phases for a member', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    listMock.mockResolvedValue([
      { id: 'ph1', name: 'A', status: 'active', ordinal: 0, featureCount: 2 },
    ]);
    const res = await GET(new NextRequest(url), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.phases).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith(expect.any(String), VALID_ID);
  });

  it('404s a non-member (deny ≡ not-found)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    listMock.mockRejectedValue(new NotFoundError('nope'));
    expect((await GET(new NextRequest(url), params)).status).toBe(404);
  });
});

describe('POST /api/v1/projects/:id/phases', () => {
  beforeEach(() => vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser()));

  it('400s a missing/blank name', async () => {
    expect((await POST(post({}), params)).status).toBe(400);
    expect((await POST(post({ name: '   ' }), params)).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates a phase and returns the result', async () => {
    createMock.mockResolvedValue({ phaseId: 'ph-new', ordinal: 3 });
    const res = await POST(post({ name: 'Onboarding', status: 'upcoming' }), params);
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.any(String),
      VALID_ID,
      expect.objectContaining({ name: 'Onboarding', status: 'upcoming' })
    );
  });

  it('404s a non-member (service NotFoundError)', async () => {
    createMock.mockRejectedValue(new NotFoundError('nope'));
    expect((await POST(post({ name: 'X' }), params)).status).toBe(404);
  });
});
