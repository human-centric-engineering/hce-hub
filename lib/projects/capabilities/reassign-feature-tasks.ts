/**
 * `reassign_feature_tasks` — hand a feature's remaining work to someone else
 * (f-task-assignment §22 t2, design call 3).
 *
 * The MCP-first verb for "a dev is off / pulled onto something else — move their
 * outstanding tasks on this feature to another member" in one action. Wraps the
 * shared `reassignFeatureTasks` core (`task-actions.ts`) so the MCP, UI, and any
 * automation path can't diverge.
 *
 * **Unmerged tasks only** — merged tasks keep their doer's credit. **Never touches
 * feature ownership** — this moves the tasks, not the feature (call 4). Any project
 * member may reassign (open/trusting); the assignee must be a member of the
 * feature's project. Membership is the [[f-access]] funnel's (`not_found`, never
 * `forbidden` — no enumeration); no free text ⇒ no PII.
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { reassignFeatureTasks } from '@/lib/projects/task-actions';
import type { CollisionWarning } from '@/lib/projects/collision';

const schema = z.object({
  featureId: z.string().describe('The feature whose remaining (unmerged) tasks to reassign.'),
  assigneeUserId: z
    .string()
    .describe('The project member to hand the remaining tasks to (yourself or someone else).'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the feature must belong to this project (guards against an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  featureId: string;
  /** How many unmerged tasks were reassigned (0 = nothing outstanding). */
  reassigned: number;
  /** Soft heads-ups, one per active task taken from a different worker — never a block. */
  warnings: CollisionWarning[];
}

export class ReassignFeatureTasksCapability extends BaseCapability<Args, Data> {
  readonly slug = 'reassign_feature_tasks';
  readonly processesPii = false; // ids only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'reassign_feature_tasks',
    description:
      "Reassign a feature's remaining (unmerged) tasks to a project member — e.g. a teammate is away, so hand their outstanding work on this feature to someone else in one action. Merged tasks are left as-is (they credit whoever did them); feature ownership is never changed. Any project member may reassign; the assignee must be a project member. Active tasks handed to a different person are reset to claimed so the new person starts fresh.",
    parameters: {
      type: 'object',
      properties: {
        featureId: {
          type: 'string',
          description: 'The feature whose remaining (unmerged) tasks to reassign.',
        },
        assigneeUserId: {
          type: 'string',
          description: 'The project member to hand the remaining tasks to.',
        },
        projectId: {
          type: 'string',
          description: 'Optional: the feature must belong to this project (guards an id mix-up).',
        },
      },
      required: ['featureId', 'assigneeUserId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('reassign_feature_tasks requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await reassignFeatureTasks(
        userId,
        args.featureId,
        args.assigneeUserId,
        args.projectId
      );
      return this.success({
        featureId: result.featureId,
        reassigned: result.reassigned,
        warnings: result.warnings,
      });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown / cross-project feature.
      if (err instanceof NotFoundError) {
        return this.error(`Feature ${args.featureId} not found.`, 'not_found');
      }
      // The assignee isn't a member of the feature's project.
      if (err instanceof ValidationError) {
        return this.error(err.message, 'invalid_assignee');
      }
      throw err;
    }
  }
}
