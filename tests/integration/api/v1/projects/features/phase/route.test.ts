/**
 * Integration: file a feature under a phase (f-phases §22 t3)
 *
 * PATCH /api/v1/projects/:id/features/:key/phase
 * @see app/api/v1/projects/[id]/features/[key]/phase/route.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/phases-service', () => ({ assignFeatureToPhase: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { assignFeatureToPhase } from '@/lib/projects/phases-service';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { PATCH } from '@/app/api/v1/projects/[id]/features/[key]/phase/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const assignMock = assignFeatureToPhase as ReturnType<typeof vi.fn>;

const VALID_ID = 'cmjbv4i3x00003wsloputgwul';
const FEATURE_ID = 'cmjbv4i3x00003wsloputgwbb';
const url = `http://localhost/api/v1/projects/${VALID_ID}/features/${FEATURE_ID}/phase`;
const params = { params: Promise.resolve({ id: VALID_ID, key: FEATURE_ID }) };
const patch = (body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => vi.clearAllMocks());

describe('PATCH /api/v1/projects/:id/features/:key/phase', () => {
  it('401s the signed-out caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await PATCH(patch({ phaseId: 'ph1' }), params)).status).toBe(401);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('400s a body missing phaseId (must be a string or null)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    expect((await PATCH(patch({}), params)).status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('files a feature under a phase, scoped to the URL project', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    assignMock.mockResolvedValue({ featureId: FEATURE_ID, phaseId: 'ph1' });
    const res = await PATCH(patch({ phaseId: 'ph1' }), params);
    expect(res.status).toBe(200);
    expect(assignMock).toHaveBeenCalledWith(expect.any(String), FEATURE_ID, 'ph1', VALID_ID);
  });

  it('unfiles with phaseId null', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    assignMock.mockResolvedValue({ featureId: FEATURE_ID, phaseId: null });
    const res = await PATCH(patch({ phaseId: null }), params);
    expect(res.status).toBe(200);
    expect(assignMock).toHaveBeenCalledWith(expect.any(String), FEATURE_ID, null, VALID_ID);
  });

  it('400s a phase from another project (service ValidationError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    assignMock.mockRejectedValue(new ValidationError('wrong project'));
    expect((await PATCH(patch({ phaseId: 'other' }), params)).status).toBe(400);
  });

  it('404s a non-member / unknown feature (service NotFoundError)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    assignMock.mockRejectedValue(new NotFoundError('nope'));
    expect((await PATCH(patch({ phaseId: 'ph1' }), params)).status).toBe(404);
  });

  it('400s a non-JSON body', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const req = new NextRequest(url, {
      method: 'PATCH',
      body: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    expect((await PATCH(req, params)).status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
