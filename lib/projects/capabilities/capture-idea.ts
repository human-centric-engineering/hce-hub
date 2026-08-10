/**
 * `capture_idea` — the parking gesture (f-idea-capture §22-03 t-58).
 *
 * Jot a line from Claude Code and it lands as an indicative feature stub in the
 * project's parked phase (the Ideas Park), to triage later — the low-friction
 * "capture without leaving the current work". Wraps the shared `captureIdea` core
 * so the MCP verb and the `POST …/ideas` route can't drift.
 *
 * Any project member may capture; a non-member sees `not_found` (the [[f-access]]
 * funnel, no enumeration). A project with no parked phase returns `no_parked_phase`.
 * Free text ⇒ `processesPii`, and the jot is **masked** in the durable provenance
 * row (the write-side redaction, as `create_feature` does — the idea text never
 * lands verbatim in the audit trail).
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { captureIdea } from '@/lib/projects/capture-idea-service';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  projectId: z.string().describe('The project to capture the idea into.'),
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('The idea — a short line; it becomes an indicative feature stub in the Ideas Park.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  featureId: string;
  /** The parked phase (Ideas Park) the idea landed in. */
  phaseId: string;
}

export class CaptureIdeaCapability extends BaseCapability<Args, Data> {
  readonly slug = 'capture_idea';
  readonly processesPii = true; // free-text jot

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'capture_idea',
    description:
      "Capture an idea or tweak without leaving your current work — jot a short line and it lands as an indicative feature stub in the project's parked phase (the Ideas Park), to triage later (promote into an active phase, or drop). Any project member may capture. The project must have a parked phase.",
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project to capture the idea into.' },
        text: {
          type: 'string',
          description:
            'The idea — a short line; it becomes an indicative feature stub in the Ideas Park.',
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
      return this.success({ featureId: result.featureId, phaseId: result.phaseId });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown project.
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      // No parked phase to capture into.
      if (err instanceof ValidationError) {
        return this.error(err.message, 'no_parked_phase');
      }
      throw err;
    }
  }
}
