/**
 * `flag_help_wanted` — the feature owner (or a project lead) toggles the
 * `help-wanted` flag on a feature (v1-requirements §11), surfacing it to other
 * members as open for contribution. A deliberate, owner-driven signal (§3) —
 * not automatic.
 *
 * Authorization is the `owner` tier via `resolveFeatureAccess` (non-member ≡
 * `not_found`). No free text, so no PII. Idempotent — setting the flag to its
 * current value is a no-op that still reports success.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';

const schema = z.object({
  featureId: z.string().describe('The feature to toggle help-wanted on.'),
  helpWanted: z.boolean().describe('Whether the feature wants help (true) or not (false).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  featureId: string;
  helpWanted: boolean;
}

export class FlagHelpWantedCapability extends BaseCapability<Args, Data> {
  readonly slug = 'flag_help_wanted';
  readonly processesPii = false;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'flag_help_wanted',
    description:
      "Set or clear the help-wanted flag on a feature, signalling to other members that it's open for contribution. Only the feature's owner or a project lead may toggle it.",
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to toggle help-wanted on.' },
        helpWanted: {
          type: 'boolean',
          description: 'Whether the feature wants help (true) or not (false).',
        },
      },
      required: ['featureId', 'helpWanted'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('flag_help_wanted requires a signed-in caller.', 'no_user_context');
    }

    const access = await resolveFeatureAccess(userId, args.featureId, 'owner');
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Feature ${args.featureId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can flag help-wanted.', 'forbidden');
    }

    const before = access.feature.helpWanted;
    if (before !== args.helpWanted) {
      await prisma.feature.update({
        where: { id: args.featureId },
        data: { helpWanted: args.helpWanted },
      });
      logAdminAction({
        userId,
        action: 'feature.help_wanted',
        entityType: 'app_feature',
        entityId: args.featureId,
        changes: { helpWanted: { from: before, to: args.helpWanted } },
      });
    }

    return this.success({ featureId: args.featureId, helpWanted: args.helpWanted });
  }
}
