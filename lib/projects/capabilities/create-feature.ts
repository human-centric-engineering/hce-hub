/**
 * `create_feature` — author a feature into a project as a high-level, unowned
 * sketch (f-feature-planning §18). You **claim** features, not tasks: creation is
 * collaborative discovery (any project **member**, like `add_backlog`), so a new
 * feature starts `planning` + `indicative`, **unowned** (`ownerUserId = null`) —
 * `claim_feature` takes ownership, `plan_feature` materialises real tasks later.
 *
 * Carries the feature's definition (`title`, optional `slug`, `description`,
 * `doneWhen`, `references`), optional dependency edges on existing features, and
 * an optional indicative task sketch (ordered free text — not claimable tasks).
 *
 * Authorization is the project-membership funnel (`canAccessProject`): a
 * non-member sees `not_found` (no enumeration). Acyclicity needs no guard here —
 * a brand-new feature only gains OUTGOING edges to existing features, so it can't
 * close a cycle (planning-retro B26; see `dependency-graph.ts`). Slug and
 * dependency ids are validated before the write. Free text ⇒ `processesPii`.
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
import { canAccessProject } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { redactedString } from '@/lib/security/redact';

const referenceSpec = z.object({
  label: z.string().min(1).max(200).describe('Human label for the reference.'),
  target: z.string().min(1).max(1000).describe('The target — a URL, doc path, or key.'),
});

const schema = z.object({
  projectId: z.string().describe('The project to create the feature in.'),
  title: z.string().min(1).max(500).describe('The feature title.'),
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'lowercase words separated by single hyphens (e.g. "f-mcp")'
    )
    .max(100)
    .optional()
    .describe('Optional short human key, unique within the project (e.g. "f-mcp").'),
  description: z.string().max(10000).optional().describe('Human-readable description (markdown).'),
  doneWhen: z.string().max(5000).optional().describe("The feature's definition of done."),
  references: z
    .array(referenceSpec)
    .max(50)
    .optional()
    .describe('Cross-references (label + target), rendered as chips.'),
  dependsOnFeatureIds: z
    .array(z.string())
    .optional()
    .describe('Ids of existing features in the same project this one depends on.'),
  indicativeTasks: z
    .array(z.string().min(1).max(500))
    .max(100)
    .optional()
    .describe('Optional high-level task sketch (ordered free text; not claimable tasks).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  featureId: string;
  slug: string | null;
}

export class CreateFeatureCapability extends BaseCapability<Args, Data> {
  readonly slug = 'create_feature';
  readonly processesPii = true; // free-text title / description / doneWhen / refs / sketch

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'create_feature',
    description:
      'Author a feature into a project as an unowned, high-level sketch (planning + indicative). Carries title, optional slug/description/done-when/references, optional dependencies on existing features, and an optional indicative task sketch. Any project member may create one; claim it separately to take ownership.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project to create the feature in.' },
        title: { type: 'string', description: 'The feature title.' },
        slug: {
          type: 'string',
          description: 'Optional short human key, unique within the project (e.g. "f-mcp").',
        },
        description: { type: 'string', description: 'Human-readable description (markdown).' },
        doneWhen: { type: 'string', description: "The feature's definition of done." },
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
          description: 'Cross-references (label + target), rendered as chips.',
        },
        dependsOnFeatureIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids of existing features in the same project this one depends on.',
        },
        indicativeTasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional high-level task sketch (ordered free text; not claimable tasks).',
        },
      },
      required: ['projectId', 'title'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask every free-text field on the durable provenance row; keep the scope
    // ids, the slug (a short public key), and the dependency ids.
    return {
      args: {
        projectId: args.projectId,
        slug: args.slug ?? null,
        dependsOnFeatureIds: args.dependsOnFeatureIds ?? [],
        title: redactedString(`title (${args.title.length} chars)`),
        description: args.description
          ? redactedString(`description (${args.description.length} chars)`)
          : null,
        doneWhen: args.doneWhen ? redactedString(`doneWhen (${args.doneWhen.length} chars)`) : null,
        references: redactedString(`${args.references?.length ?? 0} reference(s)`),
        indicativeTasks: redactedString(`${args.indicativeTasks?.length ?? 0} indicative task(s)`),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('create_feature requires a signed-in caller.', 'no_user_context');
    }

    // Any member may author a feature; a non-member sees not_found (no enumeration).
    const { basis } = await canAccessProject(userId, args.projectId);
    if (basis === null) {
      return this.error(`Project ${args.projectId} not found.`, 'not_found');
    }

    // Slug is unique within the project (@@unique([projectId, slug])). Pre-check
    // for a friendly error; the DB constraint is the race backstop.
    if (args.slug) {
      const clash = await prisma.feature.findFirst({
        where: { projectId: args.projectId, slug: args.slug },
        select: { id: true },
      });
      if (clash) {
        return this.error(`A feature with slug "${args.slug}" already exists.`, 'slug_taken');
      }
    }

    // Dependencies must be existing features in the SAME project (integrity +
    // scope — you can't depend on a feature you can't see). De-duplicated.
    const depIds = [...new Set(args.dependsOnFeatureIds ?? [])];
    if (depIds.length > 0) {
      const found = await prisma.feature.findMany({
        where: { id: { in: depIds }, projectId: args.projectId },
        select: { id: true },
      });
      if (found.length !== depIds.length) {
        return this.error(
          'One or more dependencies were not found in this project.',
          'invalid_dependency'
        );
      }
    }

    const feature = await executeTransaction(async (tx) => {
      // Bump the project counter for a unique, stable project-wide `number` by
      // construction — the feature's §N, mirroring Task.number (f-status-model §20 t-37).
      const { featureCounter } = await tx.project.update({
        where: { id: args.projectId },
        data: { featureCounter: { increment: 1 } },
        select: { featureCounter: true },
      });
      const created = await tx.feature.create({
        data: {
          projectId: args.projectId,
          number: featureCounter,
          title: args.title,
          slug: args.slug ?? null,
          description: args.description ?? null,
          doneWhen: args.doneWhen ?? null,
          ...(args.references ? { references: args.references } : {}),
          status: 'planning',
          planningStage: 'indicative',
          // Unowned until claimed — you claim features, not tasks.
          ownerUserId: null,
        },
        select: { id: true, slug: true },
      });
      if (depIds.length > 0) {
        await tx.featureDependency.createMany({
          data: depIds.map((dependsOnFeatureId) => ({ featureId: created.id, dependsOnFeatureId })),
        });
      }
      if (args.indicativeTasks && args.indicativeTasks.length > 0) {
        await tx.indicativeTask.createMany({
          data: args.indicativeTasks.map((text, order) => ({ featureId: created.id, order, text })),
        });
      }
      // Journal the creation inside the same tx (an event iff the feature commits).
      await recordProjectEvent(tx, {
        projectId: args.projectId,
        featureId: created.id,
        kind: 'feature_created',
        actorUserId: userId,
        metadata: { slug: created.slug },
      });
      return created;
    });

    logAdminAction({
      userId,
      action: 'feature.create',
      entityType: 'app_feature',
      entityId: feature.id,
      entityName: args.slug ?? args.title,
      metadata: { projectId: args.projectId, dependsOnFeatureIds: depIds },
    });

    return this.success({ featureId: feature.id, slug: feature.slug });
  }
}
