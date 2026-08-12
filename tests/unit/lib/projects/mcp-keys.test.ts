/**
 * Tests for `lib/projects/mcp-keys.ts` — member self-service project-scoped MCP keys
 * (f-mcp-project-scope §31 t-C). The security-sensitive surface: pins membership
 * gating (deny ≡ 404), the FORCED scope (canonical cuid, never a slug) + FORCED
 * scopes (locked tool set), ownership + project isolation on rotate/revoke (not-mine /
 * wrong-project / unknown all 404), the accumulation cap, and plaintext-once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    mcpApiKey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('@/lib/projects/access', () => ({ getAccessibleProjectByRef: vi.fn() }));
vi.mock('@/lib/orchestration/mcp/auth', () => ({ generateApiKey: vi.fn() }));

const { prisma } = await import('@/lib/db/client');
const { getAccessibleProjectByRef } = await import('@/lib/projects/access');
const { generateApiKey } = await import('@/lib/orchestration/mcp/auth');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { McpScope } = await import('@/types/mcp');
const {
  createProjectMcpKey,
  listProjectMcpKeys,
  rotateProjectMcpKey,
  revokeProjectMcpKey,
  PROJECT_KEY_SCOPES,
  MAX_ACTIVE_KEYS_PER_PROJECT,
} = await import('@/lib/projects/mcp-keys');

const findUnique = prisma.mcpApiKey.findUnique as ReturnType<typeof vi.fn>;
const findMany = prisma.mcpApiKey.findMany as ReturnType<typeof vi.fn>;
const create = prisma.mcpApiKey.create as ReturnType<typeof vi.fn>;
const update = prisma.mcpApiKey.update as ReturnType<typeof vi.fn>;
const del = prisma.mcpApiKey.delete as ReturnType<typeof vi.fn>;
const resolveRef = getAccessibleProjectByRef as ReturnType<typeof vi.fn>;
const genKey = generateApiKey as ReturnType<typeof vi.fn>;

const USER = 'u1';
const PROJECT_CUID = 'cproj0000000000000000000';

beforeEach(() => {
  vi.clearAllMocks();
  // The ref resolves to the canonical project (cuid), even when a slug was passed.
  resolveRef.mockResolvedValue({ id: PROJECT_CUID, slug: 'hce-hub', name: 'HCE Hub' });
  genKey.mockReturnValue({ plaintext: 'smcp_secret', hash: 'HASH', prefix: 'smcp_abcd12' });
});

describe('createProjectMcpKey', () => {
  it('denies a non-member (funnel 404), without minting', async () => {
    resolveRef.mockRejectedValue(new NotFoundError('nope'));
    await expect(createProjectMcpKey(USER, 'hce-hub', { name: 'k' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('forces the scope to the canonical cuid and the locked scope set (slug in → cuid stored)', async () => {
    findMany.mockResolvedValue([]); // no existing keys → under the cap
    create.mockResolvedValue({
      id: 'k1',
      name: 'k',
      keyPrefix: 'smcp_abcd12',
      scopes: PROJECT_KEY_SCOPES,
      scope: { projectId: PROJECT_CUID },
    });

    const res = await createProjectMcpKey(USER, 'hce-hub', { name: 'my laptop' });

    const arg = create.mock.calls[0][0];
    // Scope is the canonical cuid the funnel resolved — never the slug the caller passed.
    expect(arg.data.scope).toEqual({ projectId: PROJECT_CUID });
    expect(arg.data.scopes).toEqual([McpScope.TOOLS_LIST, McpScope.TOOLS_EXECUTE]);
    expect(arg.data.createdBy).toBe(USER);
    expect(arg.data.keyHash).toBe('HASH');
    expect(arg.data.name).toBe('my laptop');
    // Plaintext is returned once.
    expect(res.plaintext).toBe('smcp_secret');
  });

  it('refuses past the per-project active-key cap', async () => {
    // MAX active keys already scoped to this project.
    findMany.mockResolvedValue(
      Array.from({ length: MAX_ACTIVE_KEYS_PER_PROJECT }, () => ({
        scope: { projectId: PROJECT_CUID },
      }))
    );
    await expect(createProjectMcpKey(USER, 'hce-hub', { name: 'k' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('counts only THIS project toward the cap (keys in other projects do not count)', async () => {
    // All the caller's active keys are in a different project → under the cap here.
    findMany.mockResolvedValue(
      Array.from({ length: MAX_ACTIVE_KEYS_PER_PROJECT + 5 }, () => ({
        scope: { projectId: 'other' },
      }))
    );
    create.mockResolvedValue({
      id: 'k1',
      name: 'k',
      keyPrefix: 'p',
      scopes: PROJECT_KEY_SCOPES,
      scope: { projectId: PROJECT_CUID },
    });
    await expect(createProjectMcpKey(USER, 'hce-hub', { name: 'k' })).resolves.toBeDefined();
    expect(create).toHaveBeenCalled();
  });
});

describe('listProjectMcpKeys', () => {
  it('returns only the caller keys scoped to this project (filters other-project / unscoped)', async () => {
    findMany.mockResolvedValue([
      { id: 'mine', scope: { projectId: PROJECT_CUID } },
      { id: 'other-project', scope: { projectId: 'p-other' } },
      { id: 'unscoped', scope: null },
    ]);
    const keys = await listProjectMcpKeys(USER, 'hce-hub');
    expect(keys.map((k) => k.id)).toEqual(['mine']);
    // The DB query is already narrowed to the caller's own keys.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdBy: USER } }));
  });

  it('denies a non-member', async () => {
    resolveRef.mockRejectedValue(new NotFoundError('nope'));
    await expect(listProjectMcpKeys(USER, 'hce-hub')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('rotateProjectMcpKey — ownership + project isolation', () => {
  it("404s a key owned by someone else (can't rotate another member's key)", async () => {
    findUnique.mockResolvedValue({
      id: 'k1',
      createdBy: 'someone-else',
      scope: { projectId: PROJECT_CUID },
    });
    await expect(rotateProjectMcpKey(USER, 'hce-hub', 'k1', {})).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('404s a key scoped to a different project (even if you own it)', async () => {
    findUnique.mockResolvedValue({ id: 'k1', createdBy: USER, scope: { projectId: 'p-other' } });
    await expect(rotateProjectMcpKey(USER, 'hce-hub', 'k1', {})).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('404s an unknown key', async () => {
    findUnique.mockResolvedValue(null);
    await expect(rotateProjectMcpKey(USER, 'hce-hub', 'k1', {})).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('rotates an owned in-project key: fresh material + plaintext once + previous prefix', async () => {
    findUnique.mockResolvedValue({
      id: 'k1',
      name: 'k',
      createdBy: USER,
      keyPrefix: 'smcp_OLD012',
      scope: { projectId: PROJECT_CUID },
    });
    update.mockResolvedValue({
      id: 'k1',
      name: 'k',
      keyPrefix: 'smcp_abcd12',
      scopes: PROJECT_KEY_SCOPES,
      scope: { projectId: PROJECT_CUID },
    });

    const res = await rotateProjectMcpKey(USER, 'hce-hub', 'k1', {});

    expect(update.mock.calls[0][0].data).toEqual({ keyHash: 'HASH', keyPrefix: 'smcp_abcd12' });
    expect(res.plaintext).toBe('smcp_secret');
    expect(res.previousPrefix).toBe('smcp_OLD012');
  });
});

describe('revokeProjectMcpKey — ownership + project isolation', () => {
  it("404s another member's key, without deleting", async () => {
    findUnique.mockResolvedValue({
      id: 'k1',
      createdBy: 'someone-else',
      scope: { projectId: PROJECT_CUID },
    });
    await expect(revokeProjectMcpKey(USER, 'hce-hub', 'k1')).rejects.toBeInstanceOf(NotFoundError);
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes an owned in-project key and returns its identity', async () => {
    findUnique.mockResolvedValue({
      id: 'k1',
      name: 'my laptop',
      createdBy: USER,
      keyPrefix: 'smcp_abcd12',
      scope: { projectId: PROJECT_CUID },
    });
    const res = await revokeProjectMcpKey(USER, 'hce-hub', 'k1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'k1' } });
    expect(res).toEqual({ id: 'k1', name: 'my laptop', keyPrefix: 'smcp_abcd12' });
  });
});
