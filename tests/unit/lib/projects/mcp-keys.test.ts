/**
 * Tests for `lib/projects/mcp-keys.ts` — member self-service project-scoped MCP keys
 * (f-mcp-project-scope §31 t-C/t-D). The security-sensitive surface: membership gating
 * (deny ≡ 404), the FORCED scope (canonical cuid, never a slug) + FORCED scopes (locked
 * tool set), the auto-derived name, one-key-per-project, and ownership + project
 * isolation on regenerate/revoke (not-mine / wrong-project / unknown all 404).
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
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/projects/access', () => ({ getAccessibleProjectByRef: vi.fn() }));
vi.mock('@/lib/orchestration/mcp/auth', () => ({ generateApiKey: vi.fn() }));

const { prisma } = await import('@/lib/db/client');
const { getAccessibleProjectByRef } = await import('@/lib/projects/access');
const { generateApiKey } = await import('@/lib/orchestration/mcp/auth');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { McpScope } = await import('@/types/mcp');
const { createProjectMcpKey, listProjectMcpKeys, rotateProjectMcpKey, revokeProjectMcpKey } =
  await import('@/lib/projects/mcp-keys');

const keyFindUnique = prisma.mcpApiKey.findUnique as ReturnType<typeof vi.fn>;
const findMany = prisma.mcpApiKey.findMany as ReturnType<typeof vi.fn>;
const create = prisma.mcpApiKey.create as ReturnType<typeof vi.fn>;
const update = prisma.mcpApiKey.update as ReturnType<typeof vi.fn>;
const del = prisma.mcpApiKey.delete as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const resolveRef = getAccessibleProjectByRef as ReturnType<typeof vi.fn>;
const genKey = generateApiKey as ReturnType<typeof vi.fn>;

const USER = 'u1';
const PROJECT_CUID = 'cproj0000000000000000000';

beforeEach(() => {
  vi.clearAllMocks();
  // The ref resolves to the canonical project (cuid), even when a slug was passed.
  resolveRef.mockResolvedValue({ id: PROJECT_CUID, slug: 'hce-hub', name: 'HCE Hub' });
  genKey.mockReturnValue({ plaintext: 'smcp_secret', hash: 'HASH', prefix: 'smcp_abcd12' });
  userFindUnique.mockResolvedValue({ name: 'Bo Diaz' });
  findMany.mockResolvedValue([]); // no existing keys by default
});

describe('createProjectMcpKey', () => {
  it('denies a non-member (funnel 404), without minting', async () => {
    resolveRef.mockRejectedValue(new NotFoundError('nope'));
    await expect(createProjectMcpKey(USER, 'hce-hub')).rejects.toBeInstanceOf(NotFoundError);
    expect(create).not.toHaveBeenCalled();
  });

  it('forces the scope to the canonical cuid + the locked scope set, and auto-names it', async () => {
    create.mockResolvedValue({
      id: 'k1',
      keyPrefix: 'smcp_abcd12',
      scope: { projectId: PROJECT_CUID },
    });

    const res = await createProjectMcpKey(USER, 'hce-hub');

    const arg = create.mock.calls[0][0];
    // Scope is the canonical cuid the funnel resolved — never the slug the caller passed.
    expect(arg.data.scope).toEqual({ projectId: PROJECT_CUID });
    expect(arg.data.scopes).toEqual([McpScope.TOOLS_LIST, McpScope.TOOLS_EXECUTE]);
    expect(arg.data.createdBy).toBe(USER);
    expect(arg.data.keyHash).toBe('HASH');
    // Name is derived "<member> · <project>", not chosen by the member.
    expect(arg.data.name).toBe('Bo Diaz · HCE Hub');
    expect(res.plaintext).toBe('smcp_secret'); // returned once
  });

  it('falls back to "Member" when the user has no name', async () => {
    userFindUnique.mockResolvedValue({ name: null });
    create.mockResolvedValue({ id: 'k1', scope: { projectId: PROJECT_CUID } });
    await createProjectMcpKey(USER, 'hce-hub');
    expect(create.mock.calls[0][0].data.name).toBe('Member · HCE Hub');
  });

  it('refuses a second key for the same project (one per project)', async () => {
    findMany.mockResolvedValue([{ scope: { projectId: PROJECT_CUID } }]); // one already here
    await expect(createProjectMcpKey(USER, 'hce-hub')).rejects.toBeInstanceOf(ValidationError);
    expect(create).not.toHaveBeenCalled();
  });

  it('a key in ANOTHER project does not block this one', async () => {
    findMany.mockResolvedValue([{ scope: { projectId: 'other' } }]);
    create.mockResolvedValue({ id: 'k1', scope: { projectId: PROJECT_CUID } });
    await expect(createProjectMcpKey(USER, 'hce-hub')).resolves.toBeDefined();
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
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdBy: USER } }));
  });

  it('denies a non-member', async () => {
    resolveRef.mockRejectedValue(new NotFoundError('nope'));
    await expect(listProjectMcpKeys(USER, 'hce-hub')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('rotateProjectMcpKey (regenerate) — ownership + project isolation', () => {
  it('404s a key owned by someone else', async () => {
    keyFindUnique.mockResolvedValue({
      id: 'k1',
      createdBy: 'someone-else',
      scope: { projectId: PROJECT_CUID },
    });
    await expect(rotateProjectMcpKey(USER, 'hce-hub', 'k1')).rejects.toBeInstanceOf(NotFoundError);
    expect(update).not.toHaveBeenCalled();
  });

  it('404s a key scoped to a different project (even if you own it)', async () => {
    keyFindUnique.mockResolvedValue({ id: 'k1', createdBy: USER, scope: { projectId: 'p-other' } });
    await expect(rotateProjectMcpKey(USER, 'hce-hub', 'k1')).rejects.toBeInstanceOf(NotFoundError);
    expect(update).not.toHaveBeenCalled();
  });

  it('404s an unknown key', async () => {
    keyFindUnique.mockResolvedValue(null);
    await expect(rotateProjectMcpKey(USER, 'hce-hub', 'k1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('regenerates an owned in-project key: fresh secret + plaintext once + previous prefix', async () => {
    keyFindUnique.mockResolvedValue({
      id: 'k1',
      name: 'Bo Diaz · HCE Hub',
      createdBy: USER,
      keyPrefix: 'smcp_OLD012',
      scope: { projectId: PROJECT_CUID },
    });
    update.mockResolvedValue({
      id: 'k1',
      keyPrefix: 'smcp_abcd12',
      scope: { projectId: PROJECT_CUID },
    });

    const res = await rotateProjectMcpKey(USER, 'hce-hub', 'k1');

    // Fresh material + any lapsed expiry cleared, so the new secret is never dead on arrival.
    expect(update.mock.calls[0][0].data).toEqual({
      keyHash: 'HASH',
      keyPrefix: 'smcp_abcd12',
      expiresAt: null,
    });
    expect(res.plaintext).toBe('smcp_secret');
    expect(res.previousPrefix).toBe('smcp_OLD012');
  });
});

describe('revokeProjectMcpKey — ownership + project isolation', () => {
  it("404s another member's key, without deleting", async () => {
    keyFindUnique.mockResolvedValue({
      id: 'k1',
      createdBy: 'someone-else',
      scope: { projectId: PROJECT_CUID },
    });
    await expect(revokeProjectMcpKey(USER, 'hce-hub', 'k1')).rejects.toBeInstanceOf(NotFoundError);
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes an owned in-project key and returns its identity', async () => {
    keyFindUnique.mockResolvedValue({
      id: 'k1',
      name: 'Bo Diaz · HCE Hub',
      createdBy: USER,
      keyPrefix: 'smcp_abcd12',
      scope: { projectId: PROJECT_CUID },
    });
    const res = await revokeProjectMcpKey(USER, 'hce-hub', 'k1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'k1' } });
    expect(res).toEqual({ id: 'k1', name: 'Bo Diaz · HCE Hub', keyPrefix: 'smcp_abcd12' });
  });
});
