/**
 * `update_phase` — edit an existing phase (f-phases §22 t1). The sibling of
 * `create_phase`: rename it, change its description, or advance its lifecycle
 * `status` (upcoming → active → complete, or park it). Reordering is a separate,
 * collision-free operation (batch reorder), so there is no raw `ordinal` here.
 * Partial patch — only the fields you supply change; at least one must
 * (`nothing_to_update` otherwise). A transition into `active`/`complete` stamps
 * the matching timestamp the first time (idempotent thereafter).
 *
 * The MCP/chat face of the shared `updatePhase()` core (t1) — the same logic
 * t3's admin REST route runs. Authorization is the project-membership funnel
 * (`member` tier — phases are collaborative structure with no per-phase owner):
 * a non-member, or a phase in a project the caller can't see, is `not_found`
 * (the service throws `NotFoundError`; no enumeration). Free-text
 * name/description ⇒ `processesPii`.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { updatePhase } from '@/lib/projects/phases-service';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  phaseId: z.string().describe('The phase to edit.'),
  name: z.string().min(1).max(200).optional().describe('New phase name.'),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe('New description (markdown); null clears it.'),
  status: z
    .enum(['upcoming', 'active', 'complete', 'parked'])
    .optional()
    .describe('New lifecycle status. "parked" hides it from active views.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  phaseId: string;
  /** The names of the fields actually changed. */
  updated: string[];
}

export class UpdatePhaseCapability extends BaseCapability<Args, Data> {
  readonly slug = 'update_phase';
  readonly processesPii = true; // free-text name / description

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'update_phase',
    description:
      'Edit an existing phase: rename it, change its description, or advance its status (upcoming → active → complete, or park it). Only supplied fields change; a null description clears it. Any project member may edit a phase. (Reordering is a separate batch operation.)',
    parameters: {
      type: 'object',
      properties: {
        phaseId: { type: 'string', description: 'The phase to edit.' },
        name: { type: 'string', description: 'New phase name.' },
        description: {
          type: ['string', 'null'],
          description: 'New description (markdown); null clears it.',
        },
        status: {
          type: 'string',
          enum: ['upcoming', 'active', 'complete', 'parked'],
          description: 'New lifecycle status. "parked" hides it from active views.',
        },
      },
      required: ['phaseId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        phaseId: args.phaseId,
        status: args.status,
        name:
          typeof args.name === 'string'
            ? redactedString(`name (${args.name.length} chars)`)
            : args.name,
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
      return this.error('update_phase requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await updatePhase(
        userId,
        args.phaseId,
        {
          name: args.name,
          description: args.description,
          status: args.status,
        },
        context.scope?.projectId
      );
      return this.success(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Phase ${args.phaseId} not found.`, 'not_found');
      }
      if (err instanceof ValidationError) {
        return this.error(err.message, 'nothing_to_update');
      }
      throw err;
    }
  }
}
