/**
 * `start_task` — begin work on a task: `claimed → active` (f-status-model §20 t-38).
 *
 * The **MCP-first** task-lifecycle verb the repo session drives to say "I'm
 * starting this." You claim *features* (ownership cascades to their tasks); these
 * verbs move an individual task through its lifecycle. This wraps the shared
 * `startTask` core (`task-actions.ts`) — the same core the task-sheet button and
 * `f-github-sync` use — so the MCP, UI, and automation paths can't diverge.
 *
 * Pull-not-push, still soft (§5): starting never hard-locks. It credits the
 * caller as the active worker (`claimedByUserId → caller`), opens a `TaskClaim` as
 * the active-work record, and returns advisory file-overlap warnings against
 * others' open claims — never a block. Idempotent: a no-op if the task is already
 * `merged`. Membership is the [[f-access]] funnel's (`resolveTaskAccess` inside the
 * core): a non-member, or a task in a project the caller can't see, is `not_found`
 * (never `forbidden` — no enumeration). No free text ⇒ no PII.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { startTask } from '@/lib/projects/task-actions';
import type { CollisionWarning } from '@/lib/projects/collision';
import type { TaskStatus } from '@prisma/client';

const schema = z.object({
  taskId: z.string().describe('The task to start.'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards against an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  status: TaskStatus;
  /** Advisory file-overlap / already-held warnings — never a block. */
  warnings: CollisionWarning[];
}

export class StartTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'start_task';
  readonly processesPii = false; // ids only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'start_task',
    description:
      "Start a task you're picking up: moves it claimed → active and records you as the active worker. Any project member may start a task in a feature they can see (you claim features, but drive individual tasks with start/complete). Returns advisory file-overlap warnings against others' active work — never a block. Idempotent: a no-op if the task is already merged.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to start.' },
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
      return this.error('start_task requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await startTask(userId, args.taskId, args.projectId);
      return this.success(result);
    } catch (err) {
      // The funnel throws NotFoundError for a non-member / unknown / cross-project
      // task (deny ≡ not_found, no enumeration); anything else is a real fault.
      if (err instanceof NotFoundError) {
        return this.error(`Task ${args.taskId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
