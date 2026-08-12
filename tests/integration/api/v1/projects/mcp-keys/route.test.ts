/**
 * Integration: member self-service project-scoped MCP keys (f-mcp-project-scope §31 t-C).
 *
 * GET/POST  /api/v1/projects/:projectId/mcp-keys
 * DELETE    /api/v1/projects/:projectId/mcp-keys/:keyId
 * POST      /api/v1/projects/:projectId/mcp-keys/:keyId/rotate
 *
 * Pins the withAuth gate (401 signed-out), body validation (400), the funnel 404
 * (non-member ≡ not-found), cuid validation on keyId, and plaintext-once. The
 * membership/ownership/scope-forcing logic itself is covered in the service unit test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/projects/mcp-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/projects/mcp-keys')>();
  return {
    ...actual, // keep the real Zod schemas so validation runs for real
    listProjectMcpKeys: vi.fn(),
    createProjectMcpKey: vi.fn(),
    rotateProjectMcpKey: vi.fn(),
    revokeProjectMcpKey: vi.fn(),
  };
});
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import { auth } from '@/lib/auth/config';
import {
  listProjectMcpKeys,
  createProjectMcpKey,
  rotateProjectMcpKey,
  revokeProjectMcpKey,
} from '@/lib/projects/mcp-keys';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  GET as listGet,
  POST as createPost,
} from '@/app/api/v1/projects/[projectId]/mcp-keys/route';
import { DELETE as revokeDelete } from '@/app/api/v1/projects/[projectId]/mcp-keys/[keyId]/route';
import { POST as rotatePost } from '@/app/api/v1/projects/[projectId]/mcp-keys/[keyId]/rotate/route';
import { mockAuthenticatedUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const listMock = listProjectMcpKeys as ReturnType<typeof vi.fn>;
const createMock = createProjectMcpKey as ReturnType<typeof vi.fn>;
const rotateMock = rotateProjectMcpKey as ReturnType<typeof vi.fn>;
const revokeMock = revokeProjectMcpKey as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const KID = 'cmjbv4i3x00013wsloputgwzz';
const url = (p = '') => `http://localhost/api/v1/projects/${PID}/mcp-keys${p}`;
const jsonReq = (p: string, method: string, body?: unknown) =>
  new NextRequest(url(p), {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
const collParams = (projectId = PID) => ({ params: Promise.resolve({ projectId }) });
const keyParams = (projectId = PID, keyId = KID) => ({
  params: Promise.resolve({ projectId, keyId }),
});

const signedIn = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
const signedOut = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/projects/:projectId/mcp-keys', () => {
  it('401s the signed-out caller', async () => {
    signedOut();
    expect((await listGet(jsonReq('', 'GET'), collParams())).status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('lists the caller keys for the project', async () => {
    signedIn();
    listMock.mockResolvedValue([{ id: 'k1' }]);
    const res = await listGet(jsonReq('', 'GET'), collParams());
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith(expect.any(String), PID);
    expect((await res.json()).data.keys).toHaveLength(1);
  });
});

describe('POST /api/v1/projects/:projectId/mcp-keys', () => {
  it('401s the signed-out caller', async () => {
    signedOut();
    expect((await createPost(jsonReq('', 'POST', { name: 'k' }), collParams())).status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('400s a missing name (schema validation runs for real)', async () => {
    signedIn();
    expect((await createPost(jsonReq('', 'POST', {}), collParams())).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('mints a key and returns the plaintext once (201)', async () => {
    signedIn();
    createMock.mockResolvedValue({
      key: {
        id: 'k1',
        name: 'laptop',
        keyPrefix: 'smcp_abcd12',
        scopes: [],
        scope: { projectId: PID },
        expiresAt: null,
      },
      plaintext: 'smcp_secret',
    });
    const res = await createPost(jsonReq('', 'POST', { name: 'laptop' }), collParams());
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.any(String), PID, { name: 'laptop' });
    expect((await res.json()).data.plaintext).toBe('smcp_secret');
  });

  it('404s a non-member (funnel deny ≡ not-found)', async () => {
    signedIn();
    createMock.mockRejectedValue(new NotFoundError('Project not found'));
    expect((await createPost(jsonReq('', 'POST', { name: 'k' }), collParams())).status).toBe(404);
  });

  it('400s past the active-key cap (ValidationError)', async () => {
    signedIn();
    createMock.mockRejectedValue(new ValidationError('too many'));
    expect((await createPost(jsonReq('', 'POST', { name: 'k' }), collParams())).status).toBe(400);
  });
});

describe('DELETE /api/v1/projects/:projectId/mcp-keys/:keyId', () => {
  it('401s the signed-out caller', async () => {
    signedOut();
    expect((await revokeDelete(jsonReq(`/${KID}`, 'DELETE'), keyParams())).status).toBe(401);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('400s a non-cuid keyId before touching the service', async () => {
    signedIn();
    expect(
      (await revokeDelete(jsonReq('/nope', 'DELETE'), keyParams(PID, 'not-a-cuid'))).status
    ).toBe(400);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('revokes an owned key (200)', async () => {
    signedIn();
    revokeMock.mockResolvedValue({ id: KID, name: 'laptop', keyPrefix: 'smcp_abcd12' });
    const res = await revokeDelete(jsonReq(`/${KID}`, 'DELETE'), keyParams());
    expect(res.status).toBe(200);
    expect(revokeMock).toHaveBeenCalledWith(expect.any(String), PID, KID);
    expect((await res.json()).data.revoked).toBe(true);
  });

  it("404s another member's key (service NotFound)", async () => {
    signedIn();
    revokeMock.mockRejectedValue(new NotFoundError('API key not found'));
    expect((await revokeDelete(jsonReq(`/${KID}`, 'DELETE'), keyParams())).status).toBe(404);
  });
});

describe('POST /api/v1/projects/:projectId/mcp-keys/:keyId/rotate', () => {
  it('401s the signed-out caller', async () => {
    signedOut();
    expect((await rotatePost(jsonReq(`/${KID}/rotate`, 'POST', {}), keyParams())).status).toBe(401);
    expect(rotateMock).not.toHaveBeenCalled();
  });

  it('400s a non-cuid keyId', async () => {
    signedIn();
    expect(
      (await rotatePost(jsonReq('/nope/rotate', 'POST', {}), keyParams(PID, 'not-a-cuid'))).status
    ).toBe(400);
    expect(rotateMock).not.toHaveBeenCalled();
  });

  it('rotates an owned key with NO request body and returns fresh plaintext once (200)', async () => {
    signedIn();
    rotateMock.mockResolvedValue({
      key: {
        id: KID,
        name: 'laptop',
        keyPrefix: 'smcp_new012',
        scopes: [],
        scope: { projectId: PID },
        expiresAt: null,
      },
      plaintext: 'smcp_fresh',
      previousPrefix: 'smcp_old012',
    });
    // A bare POST (no body) must work — rotation takes no body.
    const res = await rotatePost(jsonReq(`/${KID}/rotate`, 'POST'), keyParams());
    expect(res.status).toBe(200);
    expect(rotateMock).toHaveBeenCalledWith(expect.any(String), PID, KID);
    expect((await res.json()).data.plaintext).toBe('smcp_fresh');
  });

  it("404s another member's key", async () => {
    signedIn();
    rotateMock.mockRejectedValue(new NotFoundError('API key not found'));
    expect((await rotatePost(jsonReq(`/${KID}/rotate`, 'POST', {}), keyParams())).status).toBe(404);
  });
});
