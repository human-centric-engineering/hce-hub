/**
 * Integration: edit a phase (f-phases §22 t3)
 *
 * PATCH /api/v1/projects/:id/phases/:phaseId
 * @see app/api/v1/projects/[id]/phases/[phaseId]/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/phases-service', () => ({ updatePhase: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { updatePhase } from '@/lib/projects/phases-service';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { Prisma } from '@prisma/client';
import { PATCH } from '@/app/api/v1/projects/[id]/phases/[phaseId]/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const updateMock = updatePhase as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';
const PHASE_ID = 'cmjbv4i3x00003wsloputgwaa';
const url = `http://localhost/api/v1/projects/${VALID_ID}/phases/${PHASE_ID}`;
const params = { params: Promise.resolve({ id: VALID_ID, phaseId: PHASE_ID }) };
const patch = (body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/v1/projects/:id/phases/:phaseId', () => {
  it('409s an exhausted write conflict rather than a generic 500', async () => {
    // A status edit runs at Serializable (§33 t-103), so Postgres SSI can abort it;
    // `withWriteConflictRetry` absorbs the usual case and this is only reached once
    // those retries are exhausted. Losing a serialization race is an expected
    // outcome of a correct concurrent write, and the caller can simply retry — an
    // opaque INTERNAL_ERROR says neither. This is the first REST surface able to
    // produce one, so there was no route precedent to copy.
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      })
    );
    const res = await PATCH(patch({ status: 'complete' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CONFLICT');
  });

  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await PATCH(patch({ name: 'x' }), params)).status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates the phase, scoped to the URL project (no cross-project id-swap)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockResolvedValue({ phaseId: PHASE_ID, updated: ['name'] });
    const res = await PATCH(patch({ name: 'Renamed', status: 'parked' }), params);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.any(String),
      PHASE_ID,
      expect.objectContaining({ name: 'Renamed', status: 'parked' }),
      VALID_ID // expectedProjectId scoping
    );
  });

  it('400s an empty patch (service nothing_to_update → ValidationError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockRejectedValue(new ValidationError('No fields to update were provided.'));
    expect((await PATCH(patch({}), params)).status).toBe(400);
  });

  it('404s an unknown / cross-project phase (service NotFoundError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    updateMock.mockRejectedValue(new NotFoundError('nope'));
    expect((await PATCH(patch({ name: 'x' }), params)).status).toBe(404);
  });

  it('400s a non-JSON body', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const req = new NextRequest(url, {
      method: 'PATCH',
      body: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    expect((await PATCH(req, params)).status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
