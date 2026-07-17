/**
 * `add_note` — drop a freeform note into the project journal (f-journal §17
 * t-2), feature- or project-scoped. The lighter sibling of `record_decision`:
 * a `note` `ProjectEvent` carrying an optional `title` heading + a markdown
 * `body`, for context that isn't a formal decision (a heads-up, a link, a
 * status aside). It surfaces in the same activity/log views.
 *
 * Scope + authorization run through the shared `resolveEventScope` funnel (a
 * `featureId` derives its own project, else a `projectId` is required); any
 * project **member** may add one, and a non-member sees `not_found` (no
 * enumeration). Carries free text, so `processesPii = true` and
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
    .describe('The project for a project-level note (omit when featureId is given).'),
  featureId: z
    .string()
    .optional()
    .describe('The feature this note concerns; its project is used and takes precedence.'),
  title: z.string().min(1).max(200).optional().describe('An optional short heading.'),
  body: z.string().min(1).max(10000).describe('The note (markdown).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  eventId: string;
}

export class AddNoteCapability extends BaseCapability<Args, Data> {
  readonly slug = 'add_note';
  readonly processesPii = true; // free-text title + body

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'add_note',
    description:
      'Add a freeform note to the project journal (a heads-up, a link, a status aside — anything that is not a formal decision). Provide a featureId to scope it to a feature or a projectId for a project-level note. Any project member may add one.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project for a project-level note (omit when featureId is given).',
        },
        featureId: {
          type: 'string',
          description: 'The feature this note concerns; its project is used (takes precedence).',
        },
        title: { type: 'string', description: 'An optional short heading.' },
        body: { type: 'string', description: 'The note (markdown).' },
      },
      required: ['body'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        projectId: args.projectId ?? null,
        featureId: args.featureId ?? null,
        title: args.title ? redactedString(`title (${args.title.length} chars)`) : null,
        body: redactedString(`body (${args.body.length} chars)`),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('add_note requires a signed-in caller.', 'no_user_context');
    }
    if (!args.featureId && !args.projectId) {
      return this.error('Provide a projectId or a featureId to scope the note.', 'invalid_scope');
    }

    const scope = await resolveEventScope(userId, {
      projectId: args.projectId,
      featureId: args.featureId,
    });
    if (!scope.ok) {
      return this.error('Project or feature not found.', 'not_found');
    }

    const event = await recordProjectEvent(prisma, {
      projectId: scope.projectId,
      featureId: scope.featureId,
      kind: 'note',
      actorUserId: userId,
      title: args.title ?? null,
      body: args.body,
    });

    logAdminAction({
      userId,
      action: 'journal.add_note',
      entityType: 'app_project_event',
      entityId: event.id,
      metadata: { projectId: scope.projectId, featureId: scope.featureId },
    });

    return this.success({ eventId: event.id });
  }
}
