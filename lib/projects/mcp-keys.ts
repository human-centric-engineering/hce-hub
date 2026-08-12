/**
 * Member self-service **project-scoped MCP keys** (f-mcp-project-scope §31 t-C).
 *
 * Lifts MCP key management out of `/admin`: any **member** of a project can mint,
 * rotate, and revoke their own key **bound to that project** — the credential a
 * Claude Code session pastes into a repo's `.mcp.json` to become that project's
 * agent (see [[mcp-project-scope]]). The admin key routes stay for the unscoped
 * "super-admin" key; this is the narrow, member-safe path.
 *
 * The safety of a self-service key surface lives in what a member CANNOT choose:
 *
 * - **Scope is forced** to the project (`scope = { projectId: <canonical cuid> }`).
 *   The ref the caller passes (slug or cuid) is resolved through the membership
 *   funnel and the **canonical cuid** is stored — never a slug (the scope contract:
 *   verbs resolve `projectId` by `findUnique({ where: { id } })`).
 * - **Scopes are locked** to the project tool set (`tools:list` + `tools:execute`).
 *   A member cannot mint a `resources:read` / system / unscoped key, so a leaked
 *   member key can drive the coordination verbs for one project and nothing else.
 * - **Ownership is enforced** on every op: a member sees / rotates / revokes only
 *   keys they created that are scoped to this project. Another member's key, an
 *   admin key, or a key in another project is `not_found` (uniform, anti-enumeration).
 *
 * Membership is the [[f-access]] funnel's (`getAccessibleProjectByRef`): a
 * non-member — or unknown project — is `NotFoundError` (→ 404), never a 403.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import type { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getAccessibleProjectByRef } from '@/lib/projects/access';
import { generateApiKey } from '@/lib/orchestration/mcp/auth';
import { mcpKeyScopeSchema } from '@/lib/validations/mcp';
import { McpScope } from '@/types/mcp';

/**
 * The locked scope set for a member key: enough to discover and run the Hub
 * coordination verbs, and nothing more (no knowledge-base `resources:read`, no
 * admin surface). A member cannot widen this.
 */
export const PROJECT_KEY_SCOPES: string[] = [McpScope.TOOLS_LIST, McpScope.TOOLS_EXECUTE];

/**
 * Per-member, per-project cap on active keys — a self-service surface must not
 * accumulate unboundedly. Generous (a dev might have a few machines / repos) but
 * bounded; revoke one to mint past it.
 */
export const MAX_ACTIVE_KEYS_PER_PROJECT = 20;

/** Client-safe projection — never the credential-derived `keyHash`. */
const SAFE_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  scope: true,
  isActive: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.McpApiKeySelect;

export type ProjectMcpKey = Prisma.McpApiKeyGetPayload<{ select: typeof SAFE_SELECT }>;

/** A minted/rotated key plus its plaintext — the plaintext is returned ONCE. */
export interface MintedProjectMcpKey {
  key: ProjectMcpKey;
  /** The bearer token — shown to the caller once, never stored or logged. */
  plaintext: string;
  /** On rotation, the invalidated key's prefix (for the audit trail). */
  previousPrefix?: string;
}

/**
 * Create-body: a member chooses only the name (and an optional future expiry).
 * The "future" bound is a `.refine` — evaluated **per request** — not
 * `.min(new Date())`, which Zod freezes at module construction (a stale bound on
 * a long-lived server would let an already-past expiry slip through).
 */
export const projectMcpKeyCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  expiresAt: z.coerce
    .date()
    .nullable()
    .optional()
    .refine((d) => d == null || d.getTime() > Date.now(), {
      message: 'Expiration must be in the future',
    }),
});
export type ProjectMcpKeyCreateInput = z.infer<typeof projectMcpKeyCreateSchema>;

/** Safely read a key's `scope.projectId` (the JSON column is never trusted raw). */
function scopeProjectId(scope: Prisma.JsonValue | null): string | null {
  if (scope === null || scope === undefined) return null;
  const parsed = mcpKeyScopeSchema.safeParse(scope);
  return parsed.success ? (parsed.data.projectId ?? null) : null;
}

/**
 * Resolve a key the caller **owns and that is scoped to this project**, or throw
 * `NotFoundError`. Not-yours / wrong-project / unknown all map to the same 404 —
 * a member can never probe another member's or project's keys.
 */
async function resolveOwnProjectKey(
  userId: string,
  projectId: string,
  keyId: string
): Promise<ProjectMcpKey> {
  // `createdBy` is needed for the ownership check (it's outside the client-safe
  // projection); everything else is the same SAFE projection the callers return.
  const key = await prisma.mcpApiKey.findUnique({
    where: { id: keyId },
    select: { ...SAFE_SELECT, createdBy: true },
  });
  if (!key || key.createdBy !== userId || scopeProjectId(key.scope) !== projectId) {
    throw new NotFoundError('API key not found');
  }
  return key;
}

/**
 * The caller's own keys scoped to `projectRef`, newest first. Membership-gated.
 */
export async function listProjectMcpKeys(
  userId: string,
  projectRef: string
): Promise<ProjectMcpKey[]> {
  const project = await getAccessibleProjectByRef(userId, projectRef);
  // The caller's own keys, filtered to this project in memory. A member's total
  // key count is small (bounded by the per-project cap × their projects), so a
  // by-project JSON-path query filter isn't worth introducing for a handful of rows.
  const rows = await prisma.mcpApiKey.findMany({
    where: { createdBy: userId },
    select: SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  return rows.filter((k) => scopeProjectId(k.scope) === project.id);
}

/**
 * Mint a project-scoped key for the caller. Scope + scopes are forced; the
 * plaintext is returned once. Refuses past the per-project active-key cap.
 */
export async function createProjectMcpKey(
  userId: string,
  projectRef: string,
  input: ProjectMcpKeyCreateInput
): Promise<MintedProjectMcpKey> {
  const project = await getAccessibleProjectByRef(userId, projectRef);

  // Accumulation guard — count the caller's active keys already on this project.
  // Advisory, not a security boundary: a rare concurrent double-create is a
  // read-then-write TOCTOU that could exceed the cap by one. Harmless (they're all
  // the member's own project keys), so it isn't worth a transaction/lock.
  const existing = await prisma.mcpApiKey.findMany({
    where: { createdBy: userId, isActive: true },
    select: { scope: true },
  });
  const activeForProject = existing.filter((k) => scopeProjectId(k.scope) === project.id).length;
  if (activeForProject >= MAX_ACTIVE_KEYS_PER_PROJECT) {
    throw new ValidationError(
      `You already have ${MAX_ACTIVE_KEYS_PER_PROJECT} active keys for this project. Revoke one before minting another.`
    );
  }

  const { plaintext, hash, prefix } = generateApiKey();
  const key = await prisma.mcpApiKey.create({
    data: {
      name: input.name,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: PROJECT_KEY_SCOPES, // forced — a member cannot widen these
      scope: { projectId: project.id }, // forced — the canonical cuid, never a slug
      expiresAt: input.expiresAt ?? null,
      createdBy: userId,
    },
    select: SAFE_SELECT,
  });
  return { key, plaintext };
}

/**
 * Rotate the caller's own project key: fresh material, the old secret invalidated
 * immediately. New plaintext returned once. Rotation refreshes the **secret** only
 * (expiry is a create-time choice); an **already-lapsed** expiry is cleared so the
 * fresh secret isn't dead on arrival, while a still-future expiry is preserved.
 */
export async function rotateProjectMcpKey(
  userId: string,
  projectRef: string,
  keyId: string
): Promise<MintedProjectMcpKey> {
  const project = await getAccessibleProjectByRef(userId, projectRef);
  const existing = await resolveOwnProjectKey(userId, project.id, keyId);

  const { plaintext, hash, prefix } = generateApiKey();
  const data: Prisma.McpApiKeyUpdateInput = { keyHash: hash, keyPrefix: prefix };
  // Don't rotate into a dead key: drop an already-lapsed expiry.
  if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) data.expiresAt = null;

  const key = await prisma.mcpApiKey.update({ where: { id: keyId }, data, select: SAFE_SELECT });
  return { key, plaintext, previousPrefix: existing.keyPrefix };
}

/** Revoke (delete) the caller's own project key. */
export async function revokeProjectMcpKey(
  userId: string,
  projectRef: string,
  keyId: string
): Promise<{ id: string; name: string; keyPrefix: string }> {
  const project = await getAccessibleProjectByRef(userId, projectRef);
  const existing = await resolveOwnProjectKey(userId, project.id, keyId);
  await prisma.mcpApiKey.delete({ where: { id: keyId } });
  return { id: keyId, name: existing.name, keyPrefix: existing.keyPrefix };
}
