/**
 * Conversation access authorization
 *
 * Single source of truth for "can this admin view this conversation?".
 * Every conversation route — list, detail, messages, provenance, export —
 * gates through this helper rather than hand-rolling its own check.
 *
 * The rule is simple: an admin can view a conversation iff
 *
 *   1. They own it (`AiConversation.userId === adminUserId`), OR
 *   2. The owner has created an active share record.
 *
 * "Active" means: `revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now())`.
 *
 * The helper is a pure read — no audit log writes happen here. Callers
 * decide whether to log:
 *
 *   - `basis === 'owner'`: routine self-access, skip logging.
 *   - `basis === 'shared'`: cross-user access, ALWAYS log via
 *     `logConversationAccess` (see `lib/orchestration/audit/admin-audit-logger.ts`).
 *
 * The `ownerId` field is surfaced so callers can record the conversation's
 * owner on the audit row without an extra DB round-trip.
 *
 * Future extension: when a `COMPLIANCE_OFFICER` role lands, this helper
 * will grow a third basis (`'compliance'`) that bypasses the share check
 * for documented-legal-basis access. The audit-of-audits requirements for
 * that path are stricter (mandatory justification text, user
 * notification); the helper signature can absorb that without callers
 * needing to change.
 */

import { prisma } from '@/lib/db/client';

export type AccessBasis = 'owner' | 'shared';

export interface AdminCanViewResult {
  /** True when the admin can access the conversation. */
  ok: boolean;
  /** Why access was granted, or `null` when denied / not found. */
  basis: AccessBasis | null;
  /**
   * The conversation's owner userId. Surfaced so audit-log callers can
   * record cross-user accesses (`basis === 'shared'`) without an extra
   * DB round-trip. `null` when the conversation does not exist.
   */
  ownerId: string | null;
}

const DENY: AdminCanViewResult = { ok: false, basis: null, ownerId: null };

/**
 * Returns whether the calling admin can access a conversation, and why.
 *
 * One DB query (`findUnique` with share include). No audit log writes —
 * the caller is responsible for logging cross-user accesses.
 *
 * Returns `{ ok: false, basis: null, ownerId: null }` when the
 * conversation doesn't exist. Routes typically translate this to a 404.
 */
export async function adminCanViewConversation(
  conversationId: string,
  adminUserId: string
): Promise<AdminCanViewResult> {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: conversationId },
    select: {
      userId: true,
      share: {
        select: {
          revokedAt: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!conversation) return DENY;

  if (conversation.userId === adminUserId) {
    return { ok: true, basis: 'owner', ownerId: conversation.userId };
  }

  const share = conversation.share;
  if (share && isShareActive(share)) {
    return { ok: true, basis: 'shared', ownerId: conversation.userId };
  }

  // Conversation exists but caller is neither owner nor shared-with.
  // Return the ownerId as null so callers translate to a generic 404
  // — leaking the owner's identity on a denied access would be a
  // user-enumeration vector.
  return DENY;
}

/**
 * Active share predicate.
 *
 * A share is active when it has not been revoked AND has either no
 * expiry or an expiry in the future. Exported for use by routes that
 * need to surface "is this conversation currently shared?" in their
 * UI (e.g. the admin list view's `shared` badge).
 */
export function isShareActive(share: { revokedAt: Date | null; expiresAt: Date | null }): boolean {
  if (share.revokedAt !== null) return false;
  if (share.expiresAt !== null && share.expiresAt <= new Date()) return false;
  return true;
}
