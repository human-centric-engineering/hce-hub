/**
 * Shared claim-a-feature service (f-feature-planning §18 t-4).
 *
 * The core of "claim a feature" — the pull-not-push ownership move (§5): claiming
 * points `Feature.ownerUserId` at the caller and moves `status → in_flight`, and
 * returns **soft warnings** (already owned by someone else) rather than ever
 * hard-locking. Extracted here so **both** callers run identical logic with no
 * drift: the `claim_feature` MCP/chat capability and the consumer
 * `POST …/features/[key]/claim` route (the feature page's Claim button) — the
 * same split as `claimTask()` (f-task-sheet §11).
 *
 * Membership is the [[f-access]] funnel's (`resolveFeatureAccess` at the `member`
 * tier — any member may claim): a non-member, or a feature in a project the
 * caller can't see, is `NotFoundError` (→ 404, never 403). An optional
 * `expectedProjectId` scopes the feature to a specific project so the consumer
 * route can reject a cross-project id-swap (matching the read). A null stored
 * owner (unowned, or an erased owner) counts as unowned — no warning.
 */
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError } from '@/lib/api/errors';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';

/** Advisory, never a block — mirrors the claim_task collision warnings. */
export interface ClaimFeatureWarning {
  kind: 'already_owned';
  ownerUserId: string;
  message: string;
}

export interface ClaimFeatureResult {
  featureId: string;
  claimed: boolean;
  /** Soft warnings — advisory, never a block. */
  warnings: ClaimFeatureWarning[];
}

/**
 * Claim `featureId` for `userId`. Throws `NotFoundError` (→ 404) for a
 * non-member / unknown feature, or one outside `expectedProjectId` when that is
 * supplied. Sets the caller as owner + `in_flight`, journals `feature_claimed`,
 * and returns a soft `already_owned` warning if it was owned by someone else.
 */
export async function claimFeature(
  userId: string,
  featureId: string,
  expectedProjectId?: string
): Promise<ClaimFeatureResult> {
  const access = await resolveFeatureAccess(userId, featureId, 'member');
  if (!access.ok) throw new NotFoundError(`Feature ${featureId} not found`);
  // Scope to the route's project (no cross-project id-swap) when asked to.
  if (expectedProjectId && access.feature.projectId !== expectedProjectId) {
    throw new NotFoundError(`Feature ${featureId} not found`);
  }

  const previousOwner = access.feature.ownerUserId;
  const warnings: ClaimFeatureWarning[] = [];
  // Already owned by another live user? (A null owner — unowned or erased — is
  // not a collision.) Soft signal only; the claim still proceeds.
  if (previousOwner && previousOwner !== userId) {
    warnings.push({
      kind: 'already_owned',
      ownerUserId: previousOwner,
      message: 'Heads-up: this feature is already owned by someone else.',
    });
  }

  await executeTransaction(async (tx) => {
    await tx.feature.update({
      where: { id: featureId },
      data: { ownerUserId: userId, status: 'in_flight' },
    });
    // Journal the claim inside the same tx (an event iff the claim commits) — so
    // the capability AND the consumer route both journal identically, no drift.
    await recordProjectEvent(tx, {
      projectId: access.feature.projectId,
      featureId,
      kind: 'feature_claimed',
      actorUserId: userId,
      metadata: { previousOwner },
    });
  });

  logAdminAction({
    userId,
    action: 'feature.claim',
    entityType: 'app_feature',
    entityId: featureId,
    metadata: { previousOwner, warningCount: warnings.length },
  });

  return { featureId, claimed: true, warnings };
}
