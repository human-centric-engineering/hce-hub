/**
 * `claim_feature` — take ownership of a feature (f-feature-planning §18). The
 * pull-not-push ownership move (§5, mirroring `claim_task`): any project
 * **member** may claim, which points `Feature.ownerUserId` at the caller and
 * moves `status → in_flight`. Claiming never hard-blocks; if the feature is
 * already owned by someone else, a **soft warning** is returned for the human to
 * weigh, and the claim still proceeds (ownership is a coordination signal, not a
 * lock).
 *
 * Authorization is the feature funnel at the `member` tier (`resolveFeatureAccess`)
 * — a non-member, or a feature in a project the caller can't see, is `not_found`
 * (no enumeration). No free text ⇒ no PII redaction.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { executeTransaction } from '@/lib/db/utils';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';

const schema = z.object({
  featureId: z.string().describe('The feature to claim ownership of.'),
});

type Args = z.infer<typeof schema>;

/** Advisory, never a block — mirrors the claim_task collision warnings. */
interface ClaimFeatureWarning {
  kind: 'already_owned';
  ownerUserId: string;
  message: string;
}

interface Data {
  featureId: string;
  claimed: boolean;
  warnings: ClaimFeatureWarning[];
}

export class ClaimFeatureCapability extends BaseCapability<Args, Data> {
  readonly slug = 'claim_feature';

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'claim_feature',
    description:
      'Take ownership of a feature: sets you as its owner and moves it to in_flight. Any project member may claim. If it is already owned by someone else, the claim still succeeds but returns a soft warning.',
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to claim ownership of.' },
      },
      required: ['featureId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('claim_feature requires a signed-in caller.', 'no_user_context');
    }

    // Any member may claim (the pull action); a non-member sees not_found.
    const access = await resolveFeatureAccess(userId, args.featureId, 'member');
    if (!access.ok) {
      return this.error(`Feature ${args.featureId} not found.`, 'not_found');
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
        where: { id: args.featureId },
        data: { ownerUserId: userId, status: 'in_flight' },
      });
      // Journal the claim inside the same tx (an event iff the claim commits).
      await recordProjectEvent(tx, {
        projectId: access.feature.projectId,
        featureId: args.featureId,
        kind: 'feature_claimed',
        actorUserId: userId,
        metadata: { previousOwner },
      });
    });

    logAdminAction({
      userId,
      action: 'feature.claim',
      entityType: 'app_feature',
      entityId: args.featureId,
      metadata: { previousOwner, warningCount: warnings.length },
    });

    return this.success({ featureId: args.featureId, claimed: true, warnings });
  }
}
