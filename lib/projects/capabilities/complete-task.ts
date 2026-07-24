/**
 * `complete_task` — finish a task: `→ merged` (f-status-model §20 t-38).
 *
 * The **MCP-first** task-lifecycle verb the repo session drives to say "I've
 * completed this." The sibling of `start_task`; both wrap the shared task-progress
 * core (`task-actions.ts`) that the task-sheet button and (later) `f-github-sync`'s
 * PR-merge automation also use, so the paths can't diverge.
 *
 * Lenient + idempotent (§5, done is human-judged): advances from `claimed` or
 * `active`, closes the open active-work `TaskClaim`, and journals `task_merged`. A
 * no-op when already `merged`, so a double-fire (e.g. a re-delivered merge event)
 * can't error. Membership is the [[f-access]] funnel's (`resolveTaskAccess` inside
 * the core): a non-member, or a task in a project the caller can't see, is
 * `not_found` (never `forbidden`). No free text ⇒ no PII.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { completeTask } from '@/lib/projects/task-actions';
import type { CollisionWarning } from '@/lib/projects/collision';
import type { TaskStatus } from '@prisma/client';

const schema = z.object({
  taskId: z.string().describe('The task to complete.'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards against an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  status: TaskStatus;
  /** Always empty for complete — kept for a uniform task-action shape. */
  warnings: CollisionWarning[];
}

export class CompleteTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'complete_task';
  readonly processesPii = false; // ids only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'complete_task',
    description:
      "Mark a task complete: moves it to merged and closes its active-work record. Any project member may complete a task in a feature they can see. Idempotent: a no-op if it's already merged. (f-github-sync will later do this automatically when the task's PR merges.)",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to complete.' },
        projectId: {
          type: 'string',
          description: 'Optional: the task must belong to this project (guards an id mix-up).',
        },
      },
      required: ['taskId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('complete_task requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await completeTask(userId, args.taskId, args.projectId);
      return this.success(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Task ${args.taskId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
