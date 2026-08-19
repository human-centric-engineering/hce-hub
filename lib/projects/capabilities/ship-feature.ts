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
    const access = await resolveFeatureAccess(
      userId,
      args.featureId,
      'owner',
      context.scope?.projectId
    );
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Feature ${args.featureId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can ship a feature.', 'forbidden');
    }

    // Soft signal: how many tasks that count toward completion aren't merged yet.
    // Never blocks the ship. Bug-kind tasks are off the completion axis
    // (f-bug-handling §22-02 — they're open fixes, not unfinished build-out), so
    // they don't count here, matching computeFeatureProgress and the Plan's
    // "N/N + · N open fixes".
    //
    // `enhancement` is deliberately NOT excluded (f-work-kinds §32 t-79). The
    // ship boundary hasn't been stamped yet at this point, so every existing task
    // is build-out as far as `computeFeatureProgress` is concerned — an
    // enhancement raised *before* ship is scope, not an afterthought. Excluding it
    // here would make this warning disagree with the bar it is meant to mirror.
    // Post-ship enhancements never reach this count: they don't exist yet.
    const unmergedCount = await prisma.task.count({
      where: { featureId: args.featureId, status: { not: 'merged' }, kind: { not: 'bug' } },
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
      // `shippedAt` seals completion (f-work-kinds §32 t-79): from here, tasks
      // raised against this feature sit off its completion axis whatever their
      // kind. Stamped in the SAME update as the status flip so the two can never
      // disagree — a shipped feature without a boundary would silently go back to
      // counting every future task.
      //
      // FIRST ship wins. `ship_feature` is idempotent and re-runnable — a corrected
      // narrative, or an agent retrying after an MCP timeout — and re-stamping would
      // move the boundary forward, pulling work raised since the real ship back
      // inside it and denting the bar. That is precisely the dent this feature
      // exists to remove. A null still stamps, so re-shipping repairs a feature the
      // backfill couldn't resolve (safe: a null was counting everything already).
      //
      // The "first wins" test is the SQL predicate `shippedAt: null`, not a `??` in
      // JavaScript. It used to be `access.feature.shippedAt ?? new Date()`, and
      // `access` is resolved before the transaction opens — so two OVERLAPPING ships
      // both read null and the second overwrote the first, moving a boundary
      // `computeFeatureProgress` filters on. (A *sequential* retry was always fine:
      // it re-reads the committed value. True concurrency was the hole.) Postgres
      // re-evaluates the predicate after taking the row lock, so the loser now
      // matches zero rows — the same guard `complete_task` uses for `Task.mergedAt`.
      await tx.feature.update({
        where: { id: args.featureId },
        data: { status: 'shipped' },
      });
      await tx.feature.updateMany({
        where: { id: args.featureId, shippedAt: null },
        data: { shippedAt: new Date() },
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
