/**
 * `ship_feature` — mark a feature shipped with a closing narrative
 * (f-feature-planning §18). The owner-tier close-out: sets `status → shipped` and
 * writes a `feature_shipped` journal entry whose `body` is the ship summary (the
 * MCP replacement for the plan's close-out narrative). "Done" is human-judged
 * (§5, pull-not-push), so unmerged tasks are a **soft warning**, never a hard
 * block — you can ship a feature whose tasks aren't all merged, and the warning
 * simply records that you did.
 *
 * Authorization is the feature funnel at the `owner` tier (`resolveFeatureAccess`):
 * a non-member is `not_found`, a member who is neither owner nor lead is
 * `forbidden`. The summary is free text ⇒ `processesPii`.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  featureId: z.string().describe('The feature to ship.'),
  summary: z.string().min(1).max(10000).describe('The closing narrative (markdown).'),
});

type Args = z.infer<typeof schema>;

/** Advisory only — shipping is never blocked (§5, done is human-judged). */
interface ShipFeatureWarning {
  kind: 'unmerged_tasks';
  count: number;
  message: string;
}

interface Data {
  featureId: string;
  shipped: boolean;
  warnings: ShipFeatureWarning[];
}

export class ShipFeatureCapability extends BaseCapability<Args, Data> {
  readonly slug = 'ship_feature';
  readonly processesPii = true; // free-text ship summary

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'ship_feature',
    description:
      'Mark a feature shipped with a closing summary (recorded to the journal). Only the feature owner or a project lead may ship. Unmerged tasks are a soft warning, never a block — done is human-judged.',
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to ship.' },
        summary: { type: 'string', description: 'The closing narrative (markdown).' },
      },
      required: ['featureId', 'summary'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask the free-text summary; keep the feature id.
    return {
      args: {
        featureId: args.featureId,
        summary: redactedString(`summary (${args.summary.length} chars)`),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('ship_feature requires a signed-in caller.', 'no_user_context');
    }

    // Owner tier: the feature owner or a project lead. Non-member → not_found.
    const access = await resolveFeatureAccess(userId, args.featureId, 'owner');
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Feature ${args.featureId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can ship a feature.', 'forbidden');
    }

    // Soft signal: how many tasks aren't merged yet. Never blocks the ship.
    const unmergedCount = await prisma.task.count({
      where: { featureId: args.featureId, status: { not: 'merged' } },
    });
    const warnings: ShipFeatureWarning[] = [];
    if (unmergedCount > 0) {
      warnings.push({
        kind: 'unmerged_tasks',
        count: unmergedCount,
        message: `Heads-up: ${unmergedCount} task(s) on this feature are not merged yet.`,
      });
    }

    await executeTransaction(async (tx) => {
      await tx.feature.update({
        where: { id: args.featureId },
        data: { status: 'shipped' },
      });
      // The ship narrative is the journal entry's body; atomic with the flip.
      await recordProjectEvent(tx, {
        projectId: access.feature.projectId,
        featureId: args.featureId,
        kind: 'feature_shipped',
        actorUserId: userId,
        body: args.summary,
        metadata: { unmergedCount },
      });
    });

    logAdminAction({
      userId,
      action: 'feature.ship',
      entityType: 'app_feature',
      entityId: args.featureId,
      metadata: { projectId: access.feature.projectId, unmergedCount },
    });

    return this.success({ featureId: args.featureId, shipped: true, warnings });
  }
}
