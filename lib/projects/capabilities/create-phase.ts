/**
 * `create_phase` — add a phase to a project (f-phases §22 t1). A `Phase` is the
 * roadmap band a project reads in its own semantics (an epic for the Hub, a
 * release band for Sunrise, an idea park when `parked`). Creation appends the
 * phase after the project's existing phases unless an explicit `ordinal` is
 * given; the initial `status` (default `upcoming`) stamps the matching lifecycle
 * timestamp.
 *
 * The MCP/chat face of the shared `createPhase()` core (t1) — the same logic
 * t3's admin REST route runs, so the two never drift. Authorization is the
 * project-membership funnel (`member` tier — phases are collaborative structure
 * with no per-phase owner): a non-member sees `not_found` (the service throws
 * `NotFoundError`; no enumeration). Free-text name/description ⇒ `processesPii`.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { createPhase } from '@/lib/projects/phases-service';
import { checkIdeaPromotable } from '@/lib/projects/idea-promotion';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  projectId: z.string().describe('The project to add the phase to.'),
  name: z.string().min(1).max(200).describe('The phase name (e.g. "v0.9.0", "Onboarding").'),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe('Optional description of what the phase covers (markdown).'),
  status: z
    .enum(['upcoming', 'active', 'complete', 'parked'])
    .optional()
    .describe('Lifecycle status; defaults to "upcoming". "parked" hides it from active views.'),
  ordinal: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Explicit display position; defaults to appended after the last phase.'),
  fromIdeaId: z
    .string()
    .optional()
    .describe(
      'Optional: the id of an OPEN idea in this project being promoted into this phase — it is marked promoted and linked, atomically.'
    ),
});

type Args = z.infer<typeof schema>;

interface Data {
  phaseId: string;
  ordinal: number;
}

export class CreatePhaseCapability extends BaseCapability<Args, Data> {
  readonly slug = 'create_phase';
  readonly processesPii = true; // free-text name / description

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'create_phase',
    description:
      'Add a phase (roadmap band) to a project: an epic for a build project, a release band for a platform, or an idea park when parked. Appends after the existing phases unless an ordinal is given; status defaults to "upcoming" ("parked" hides it from active views). Any project member may create one.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project to add the phase to.' },
        name: { type: 'string', description: 'The phase name (e.g. "v0.9.0", "Onboarding").' },
        description: {
          type: 'string',
          description: 'Optional description of what the phase covers (markdown).',
        },
        status: {
          type: 'string',
          enum: ['upcoming', 'active', 'complete', 'parked'],
          description:
            'Lifecycle status; defaults to "upcoming". "parked" hides it from active views.',
        },
        ordinal: {
          type: 'number',
          description: 'Explicit display position; defaults to appended after the last phase.',
        },
        fromIdeaId: {
          type: 'string',
          description:
            'Optional: the id of an open idea in this project being promoted into this phase — it is marked promoted and linked, atomically.',
        },
      },
      required: ['projectId', 'name'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        projectId: args.projectId,
        status: args.status ?? null,
        ordinal: args.ordinal,
        fromIdeaId: args.fromIdeaId ?? null,
        name: redactedString(`name (${args.name.length} chars)`),
        description:
          typeof args.description === 'string'
            ? redactedString(`description (${args.description.length} chars)`)
            : args.description,
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('create_phase requires a signed-in caller.', 'no_user_context');
    }

    // Promotion: the idea must exist in THIS project and be open (friendly
    // pre-check; createPhase's in-tx guard is the race backstop).
    if (args.fromIdeaId !== undefined) {
      const promotable = await checkIdeaPromotable(args.projectId, args.fromIdeaId);
      if (!promotable.ok) {
        return this.error(promotable.message, promotable.code);
      }
    }

    // Shared core with t3's REST route — a funnel denial surfaces as NotFoundError,
    // which maps to the capability's not_found (no enumeration).
    try {
      const result = await createPhase(userId, args.projectId, {
        name: args.name,
        description: args.description,
        status: args.status,
        ordinal: args.ordinal,
        fromIdeaId: args.fromIdeaId,
      });
      return this.success(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
