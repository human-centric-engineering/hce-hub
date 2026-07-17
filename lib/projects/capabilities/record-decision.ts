/**
 * `record_decision` — capture a decision and its rationale into the project
 * journal (f-journal §17 t-2), feature- or project-scoped. The manual/MCP
 * precursor to the `plan.md` decisions log: a `decision` `ProjectEvent` whose
 * `title` + `body` (markdown) are the entry, and whose `featureId` (when given)
 * marks it as planning rationale vs a project-level architectural/process ADR
 * (self-hosting §1). `category` is an optional tag carried in `metadata`.
 *
 * Scope + authorization run through the shared `resolveEventScope` funnel: a
 * `featureId` derives its own project (so a decision can't be mis-scoped), else
 * a `projectId` is required. Any project **member** may record a decision — it's
 * collaborative narrative, not an owner-gated mutation — and a non-member sees
 * `not_found` (no enumeration). Carries free text, so `processesPii = true` and
 * `redactProvenance` masks the title + body on the durable provenance row.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { resolveEventScope } from '@/lib/projects/access';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('The project for a project-level decision (omit when featureId is given).'),
  featureId: z
    .string()
    .optional()
    .describe('The feature this decision concerns; its project is used and takes precedence.'),
  title: z.string().min(1).max(200).describe('A short heading for the decision.'),
  body: z.string().min(1).max(10000).describe('The decision and its rationale (markdown).'),
  category: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe('Optional tag, e.g. "architecture" or "process".'),
});

type Args = z.infer<typeof schema>;

interface Data {
  eventId: string;
}

export class RecordDecisionCapability extends BaseCapability<Args, Data> {
  readonly slug = 'record_decision';
  readonly processesPii = true; // free-text title + body

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'record_decision',
    description:
      'Record a decision and its rationale into the project journal. Provide a featureId for a feature-level decision (planning rationale) or a projectId for a project-level architectural/process decision. Any project member may record one.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project for a project-level decision (omit when featureId is given).',
        },
        featureId: {
          type: 'string',
          description:
            'The feature this decision concerns; its project is used (takes precedence).',
        },
        title: { type: 'string', description: 'A short heading for the decision.' },
        body: { type: 'string', description: 'The decision and its rationale (markdown).' },
        category: {
          type: 'string',
          description: 'Optional tag, e.g. "architecture" or "process".',
        },
      },
      required: ['title', 'body'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask the free-text title + body on the durable, broadly-visible provenance
    // row; the scope ids + category tag are not sensitive. The result is just an
    // event id.
    return {
      args: {
        projectId: args.projectId ?? null,
        featureId: args.featureId ?? null,
        category: args.category ?? null,
        title: redactedString(`title (${args.title.length} chars)`),
        body: redactedString(`body (${args.body.length} chars)`),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('record_decision requires a signed-in caller.', 'no_user_context');
    }
    if (!args.featureId && !args.projectId) {
      return this.error(
        'Provide a projectId or a featureId to scope the decision.',
        'invalid_scope'
      );
    }

    const scope = await resolveEventScope(userId, {
      projectId: args.projectId,
      featureId: args.featureId,
    });
    if (!scope.ok) {
      return this.error('Project or feature not found.', 'not_found');
    }

    // A single insert IS the whole write — no transaction needed; the base
    // prisma client satisfies recordProjectEvent's client type.
    const event = await recordProjectEvent(prisma, {
      projectId: scope.projectId,
      featureId: scope.featureId,
      kind: 'decision',
      actorUserId: userId,
      title: args.title,
      body: args.body,
      ...(args.category ? { metadata: { category: args.category } } : {}),
    });

    logAdminAction({
      userId,
      action: 'journal.record_decision',
      entityType: 'app_project_event',
      entityId: event.id,
      metadata: {
        projectId: scope.projectId,
        featureId: scope.featureId,
        category: args.category ?? null,
      },
    });

    return this.success({ eventId: event.id });
  }
}
