/**
 * `capture_idea` — the parking gesture (f-idea-capture §22).
 *
 * Jot a line from Claude Code and it lands as an `Idea` in the project's inbox,
 * to triage later — the low-friction "capture without leaving the current work".
 * Wraps the shared `captureIdea` core so the MCP verb and the `POST …/ideas` route
 * can't drift.
 *
 * Any project member may capture; a non-member sees `not_found` (the [[f-access]]
 * funnel, no enumeration). Free text ⇒ `processesPii`, and the jot is **masked**
 * in the durable provenance row (the write-side redaction — the idea text never
 * lands verbatim in the audit trail).
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { captureIdea } from '@/lib/projects/capture-idea-service';
import { IDEA_TEXT_MAX } from '@/lib/projects/idea-constants';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  projectId: z.string().describe('The project to capture the idea into.'),
  text: z
    .string()
    .trim()
    .min(1)
    .max(IDEA_TEXT_MAX)
    .describe('The idea — a short line; it lands in the project inbox to triage later.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  /** The captured idea (born `open` in the project's inbox). */
  ideaId: string;
}

export class CaptureIdeaCapability extends BaseCapability<Args, Data> {
  readonly slug = 'capture_idea';
  readonly processesPii = true; // free-text jot

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'capture_idea',
    description:
      "Capture an idea or tweak without leaving your current work — jot a short line and it lands as an idea in the project's inbox, to triage later. Any project member may capture.",
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project to capture the idea into.' },
        text: {
          type: 'string',
          description: 'The idea — a short line; it lands in the project inbox to triage later.',
        },
      },
      required: ['projectId', 'text'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask the free-text jot on the durable provenance row; keep the scope id.
    return {
      args: {
        projectId: args.projectId,
        text: redactedString(`idea (${args.text.length} chars)`),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('capture_idea requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await captureIdea(userId, args.projectId, args.text);
      return this.success({ ideaId: result.ideaId });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown project.
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
