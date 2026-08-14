/**
 * `update_feature` — edit an existing feature (f-authoring-fidelity §21 t-e). The
 * feature-level sibling of `update_task`: the verb that lets the record be
 * **corrected from the Hub**, not the DB. Edits the authored fields
 * (`title`/`summary`/`description`/`doneWhen`/`references`), **replaces the
 * dependency edges** (cycle-guarded), **unclaims / reassigns** the owner, and
 * **files the feature under a phase** (`phaseId`, in this project; null unfiles).
 *
 * Partial patch — only the fields you supply change; a `null`
 * summary/description/doneWhen/references clears it. `dependsOnFeatureIds`, when
 * supplied, **replaces** the feature's outgoing edge set (validated to exist in the
 * project + proven acyclic against the whole feature graph before any write).
 * `ownerUserId: null` unclaims (→ `planning`); a member id reassigns (→ `in_flight`).
 * At least one field must change (`nothing_to_update` otherwise).
 *
 * Authorization is the **owner** tier (`resolveFeatureAccess('owner')`): a
 * non-member, or a feature the caller can't see, is `not_found` (no enumeration);
 * a member who is neither owner nor lead is `forbidden`. A `note`-style edit, so it
 * emits no `ProjectEventKind` (the lifecycle events stay meaningful); audit-logged.
 * Free text ⇒ `processesPii`.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { resolveFeatureAccess, canAccessProject } from '@/lib/projects/access';
import { assertAcyclic, DependencyCycleError } from '@/lib/projects/dependency-graph';
import { phaseBelongsToProject } from '@/lib/projects/phases-service';
import { isWriteConflict, withWriteConflictRetry } from '@/lib/projects/write-conflict';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { redactedString } from '@/lib/security/redact';

const referenceSpec = z.object({
  label: z.string().min(1).max(200).describe('Human label for the reference.'),
  target: z.string().min(1).max(1000).describe('The target — a URL, doc path, or key.'),
});

const schema = z.object({
  featureId: z.string().describe('The feature to edit.'),
  title: z.string().min(1).max(500).optional().describe('New title.'),
  summary: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .describe('New plain one-line summary; null clears it.'),
  description: z
    .string()
    .max(10000)
    .nullable()
    .optional()
    .describe('New full detail (markdown); null clears it.'),
  doneWhen: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .describe('New definition of done; null clears it.'),
  references: z
    .array(referenceSpec)
    .max(50)
    .nullable()
    .optional()
    .describe('New cross-reference list — replaces the existing one; null clears it.'),
  dependsOnFeatureIds: z
    .array(z.string())
    .optional()
    .describe(
      'New dependency set — replaces the existing edges (existing features in this project).'
    ),
  ownerUserId: z
    .string()
    .nullable()
    .optional()
    .describe('Reassign the owner to a project member, or null to unclaim.'),
  phaseId: z
    .string()
    .nullable()
    .optional()
    .describe('File the feature under a phase in this project, or null to unfile it.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  featureId: string;
  /** The names of the fields actually changed. */
  updated: string[];
}

export class UpdateFeatureCapability extends BaseCapability<Args, Data> {
  readonly slug = 'update_feature';
  readonly processesPii = true; // free-text title / summary / description / done-when / refs

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'update_feature',
    description:
      "Edit an existing feature: title, summary, description (markdown), done-when, references; replace its dependency edges (rejected if it would create a cycle); unclaim (ownerUserId null) or reassign the owner (a project member); and file it under a phase (phaseId null to unfile). Only supplied fields change; a null summary/description/done-when/references clears it. Only the feature's owner or a project lead may edit it.",
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to edit.' },
        title: { type: 'string', description: 'New title.' },
        summary: { type: 'string', description: 'New plain one-line summary; null clears it.' },
        description: { type: 'string', description: 'New full detail (markdown); null clears it.' },
        doneWhen: { type: 'string', description: 'New definition of done; null clears it.' },
        references: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Human label for the reference.' },
              target: { type: 'string', description: 'The target — a URL, doc path, or key.' },
            },
            required: ['label', 'target'],
          },
          description: 'New cross-reference list — replaces the existing one; null clears it.',
        },
        dependsOnFeatureIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'New dependency set — replaces the existing edges (existing features in this project).',
        },
        ownerUserId: {
          type: 'string',
          description: 'Reassign the owner to a project member, or null to unclaim.',
        },
        phaseId: {
          type: 'string',
          description: 'File the feature under a phase in this project, or null to unfile it.',
        },
      },
      required: ['featureId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    const mask = (v: string | null | undefined, label: string) =>
      typeof v === 'string' ? redactedString(`${label} (${v.length} chars)`) : v;
    return {
      args: {
        featureId: args.featureId,
        title: mask(args.title, 'title'),
        summary: mask(args.summary, 'summary'),
        description: mask(args.description, 'description'),
        doneWhen: mask(args.doneWhen, 'doneWhen'),
        references:
          args.references === undefined
            ? undefined
            : args.references === null
              ? null
              : redactedString(`${args.references.length} reference(s)`),
        dependsOnFeatureIds: args.dependsOnFeatureIds,
        ownerUserId: args.ownerUserId,
        phaseId: args.phaseId,
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('update_feature requires a signed-in caller.', 'no_user_context');
    }

    // Owner tier on the feature: non-member → not_found, member-non-owner → forbidden.
    const access = await resolveFeatureAccess(
      userId,
      args.featureId,
      'owner',
      context.scope?.projectId
    );
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Feature ${args.featureId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can edit it.', 'forbidden');
    }
    const projectId = access.feature.projectId;

    // Build the field patch from supplied values (undefined = leave unchanged).
    const data: Prisma.FeatureUpdateInput = {};
    const updated: string[] = [];
    if (args.title !== undefined) {
      data.title = args.title;
      updated.push('title');
    }
    if (args.summary !== undefined) {
      data.summary = args.summary;
      updated.push('summary');
    }
    if (args.description !== undefined) {
      data.description = args.description;
      updated.push('description');
    }
    if (args.doneWhen !== undefined) {
      data.doneWhen = args.doneWhen;
      updated.push('doneWhen');
    }
    if (args.references !== undefined) {
      // JSON column: an array sets it, null clears to DB NULL.
      data.references = args.references === null ? Prisma.DbNull : args.references;
      updated.push('references');
    }

    // Owner reassign / unclaim — mirrors claimFeature's status coupling.
    if (args.ownerUserId !== undefined) {
      if (args.ownerUserId === null) {
        data.ownerUserId = null;
        // Unclaiming makes it unowned → derive as available/blocked; never un-ship.
        if (access.feature.status !== 'shipped') data.status = 'planning';
      } else {
        const { basis } = await canAccessProject(args.ownerUserId, projectId);
        if (basis === null) {
          return this.error('The new owner must be a member of this project.', 'invalid_owner');
        }
        data.ownerUserId = args.ownerUserId;
        // Reassigning an unowned/planning feature claims it → in_flight; else keep.
        if (access.feature.status === 'planning') data.status = 'in_flight';
      }
      updated.push('owner');
    }

    // Phase assignment — file under a phase (must be in this project) or unfile.
    // A relation FK, so Prisma's update input takes the nested connect/disconnect.
    if (args.phaseId !== undefined) {
      if (args.phaseId === null) {
        data.phase = { disconnect: true };
      } else {
        // Shared guard (§32 t-80) — one implementation across update_feature,
        // assignFeatureToPhase and the two task verbs.
        if (!(await phaseBelongsToProject(args.phaseId, projectId))) {
          return this.error('That phase was not found in this project.', 'invalid_phase');
        }
        data.phase = { connect: { id: args.phaseId } };
      }
      updated.push('phase');
    }

    // Dependency-edge replacement — validate targets, prove the whole feature
    // graph stays acyclic, then diff in the transaction.
    let depsToSet: string[] | null = null;
    if (args.dependsOnFeatureIds !== undefined) {
      depsToSet = [...new Set(args.dependsOnFeatureIds)];
      if (depsToSet.includes(args.featureId)) {
        return this.error('A feature cannot depend on itself.', 'dependency_cycle');
      }
      if (depsToSet.length > 0) {
        const found = await prisma.feature.findMany({
          where: { id: { in: depsToSet }, projectId },
          select: { id: true },
        });
        if (found.length !== depsToSet.length) {
          return this.error(
            'One or more dependencies were not found in this project.',
            'invalid_dependency'
          );
        }
      }
      updated.push('dependencies');
    }

    if (updated.length === 0) {
      return this.error('No fields to update were provided.', 'nothing_to_update');
    }

    try {
      await withWriteConflictRetry(() =>
        executeTransaction(
          async (tx) => {
            // The proof runs FIRST, before any write — see `update_task` for why
            // relying on rollback alone is worse under Serializable.
            if (depsToSet !== null) {
              // Rebuild the project's full edge set with this feature's edges
              // replaced, and prove it's still a DAG. This read lives INSIDE the
              // transaction so the proof and the write share one snapshot.
              const others = await tx.featureDependency.findMany({
                where: { feature: { projectId }, featureId: { not: args.featureId } },
                select: { featureId: true, dependsOnFeatureId: true },
              });
              const edges = [
                ...others.map((e) => ({ from: e.featureId, to: e.dependsOnFeatureId })),
                ...depsToSet.map((to) => ({ from: args.featureId, to })),
              ];
              // Throws DependencyCycleError → the transaction rolls back, so a
              // rejected edge set never leaves a partial write behind.
              assertAcyclic(edges);
            }
            if (Object.keys(data).length > 0) {
              await tx.feature.update({ where: { id: args.featureId }, data });
            }
            if (depsToSet !== null) {
              // Replace the outgoing edge set (idempotent via the @@unique constraint).
              await tx.featureDependency.deleteMany({ where: { featureId: args.featureId } });
              if (depsToSet.length > 0) {
                await tx.featureDependency.createMany({
                  data: depsToSet.map((dependsOnFeatureId) => ({
                    featureId: args.featureId,
                    dependsOnFeatureId,
                  })),
                });
              }
            }
          },
          // Serializable is what actually closes the race — moving the read inside
          // the transaction is necessary but NOT sufficient: under Read Committed
          // neither transaction sees the other's uncommitted edge, so both would
          // still validate clean and both would commit, leaving a cycle. Kept in
          // lockstep with `update_task`, the other read-then-write graph verb: SSI
          // holds only among transactions that are themselves serializable, so the
          // pair must match. See that file for why the create_*/plan_* writers
          // correctly stay at the default isolation, and why this is scoped to
          // the edge path rather than every edit this verb makes.
          depsToSet !== null ? { isolationLevel: 'Serializable' } : undefined
        )
      );
    } catch (err) {
      if (err instanceof DependencyCycleError) {
        return this.error(
          `Dependencies would form a cycle: ${err.cycle.join(' → ')}.`,
          'dependency_cycle'
        );
      }
      if (isWriteConflict(err)) {
        // Only reached once the in-process retries are also exhausted.
        return this.error(
          'A concurrent change to this feature kept winning. Re-read it and retry.',
          'concurrent_modification'
        );
      }
      throw err;
    }

    logAdminAction({
      userId,
      action: 'feature.update',
      entityType: 'app_feature',
      entityId: args.featureId,
      metadata: { fields: updated },
    });

    return this.success({ featureId: args.featureId, updated });
  }
}
