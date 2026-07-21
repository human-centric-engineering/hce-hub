/**
 * `claim_feature` — take ownership of a feature (f-feature-planning §18). The
 * pull-not-push ownership move (§5, mirroring `claim_task`): any project
 * **member** may claim, which points `Feature.ownerUserId` at the caller and
 * moves `status → in_flight`. Claiming never hard-blocks; if the feature is
 * already owned by someone else, a **soft warning** is returned for the human to
 * weigh, and the claim still proceeds (ownership is a coordination signal, not a
 * lock).
 *
 * The MCP/chat face of the shared `claimFeature()` core (t-4) — the same logic
 * the consumer `POST …/features/[key]/claim` route (the feature page's Claim
 * button) runs, so the two never drift. Membership is the funnel's: a non-member,
 * or a feature in a project the caller can't see, is `not_found` (the service
 * throws `NotFoundError`; no enumeration). No free text ⇒ no PII redaction.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { claimFeature, type ClaimFeatureWarning } from '@/lib/projects/claim-feature-service';

const schema = z.object({
  featureId: z.string().describe('The feature to claim ownership of.'),
});

type Args = z.infer<typeof schema>;

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

    // Shared core with the consumer claim route — a funnel denial surfaces as
    // NotFoundError, which maps to the capability's not_found (no enumeration).
    try {
      const result = await claimFeature(userId, args.featureId);
      return this.success(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Feature ${args.featureId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
