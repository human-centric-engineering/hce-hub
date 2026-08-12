/**
 * `update_idea` — edit an inbox idea and/or drop/restore it (f-idea-capture §22).
 *
 * The human-native lifecycle ops an idea needs as it evolves: refine the jot text,
 * or move it between `open` and `dropped` (a dropped idea is a retained, browseable
 * archive — never deleted). Wraps the shared `updateIdea` core so this MCP verb and
 * the `PATCH …/ideas/:ideaId` route can't drift.
 *
 * Promotion is deliberately NOT here — an idea becomes a feature/task/phase/bug via
 * the create verbs' `fromIdeaId`, so `promoted` is terminal (the core refuses it).
 * Any project member may tend the inbox; a non-member / unknown idea sees
 * `not_found` (the [[f-access]] funnel). Free text ⇒ `processesPii`, masked in the
 * durable provenance row.
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { updateIdea } from '@/lib/projects/update-idea-service';
import { IDEA_TEXT_MAX } from '@/lib/projects/idea-constants';
import { redactedString } from '@/lib/security/redact';

const schema = z
  .object({
    ideaId: z.string().describe('The idea to edit or drop/restore.'),
    text: z
      .string()
      .trim()
      .min(1)
      .max(IDEA_TEXT_MAX)
      .optional()
      .describe('New idea text (refine the jot).'),
    status: z
      .enum(['open', 'dropped'])
      .optional()
      .describe('Drop (`dropped`) or restore (`open`) the idea. Promotion is a separate action.'),
  })
  .refine((v) => v.text !== undefined || v.status !== undefined, {
    message: 'Provide a new text and/or status.',
  });

type Args = z.infer<typeof schema>;

interface Data {
  ideaId: string;
  status: string;
}

export class UpdateIdeaCapability extends BaseCapability<Args, Data> {
  readonly slug = 'update_idea';
  readonly processesPii = true; // free-text jot

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'update_idea',
    description:
      "Edit an inbox idea's text and/or drop or restore it. Drop (status 'dropped') archives it — reversible, never deleted — and restore ('open') brings it back. Promotion into a feature/task/phase/bug is a separate action (create it with fromIdeaId). Any project member may.",
    parameters: {
      type: 'object',
      properties: {
        ideaId: { type: 'string', description: 'The idea to edit or drop/restore.' },
        text: { type: 'string', description: 'New idea text (refine the jot).' },
        status: {
          type: 'string',
          enum: ['open', 'dropped'],
          description:
            'Drop ("dropped") or restore ("open") the idea. Promotion is a separate action.',
        },
      },
      required: ['ideaId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask the free-text jot on the durable provenance row; keep the ids/status.
    return {
      args: {
        ideaId: args.ideaId,
        status: args.status ?? null,
        text: args.text !== undefined ? redactedString(`idea (${args.text.length} chars)`) : null,
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('update_idea requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await updateIdea(
        userId,
        args.ideaId,
        {
          text: args.text,
          status: args.status,
        },
        context.scope?.projectId
      );
      return this.success({ ideaId: result.ideaId, status: result.status });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown idea.
      if (err instanceof NotFoundError) {
        return this.error(`Idea ${args.ideaId} not found.`, 'not_found');
      }
      // Nothing to change, or the idea is already promoted (terminal).
      if (err instanceof ValidationError) {
        return this.error(err.message, 'invalid_update');
      }
      throw err;
    }
  }
}
