/**
 * `assign_task` — (re)assign or **release** a task (f-task-assignment t1, §32 t-89).
 *
 * The MCP-first verb that re-sets the task's `assigneeUserId`: assign it to
 * yourself ("take it"), to someone else ("reassign" — e.g. a teammate is off
 * sick and you hand their task over), or to **`null`** ("put it back" — return it
 * to the unassigned pool for anyone to pick up). Wraps the shared `assignTask`
 * core (`task-actions.ts`) so the MCP, UI, and any automation path can't diverge.
 *
 * Release lives here rather than on `update_task` because it moves the task's
 * *status*, and `update_task` is explicitly the verb that doesn't. It is also the
 * same door in reverse: this verb already owns "an active task handed on resets to
 * claimed", which is exactly what releasing one must do.
 *
 * **Any project member may (re)assign or release** (open/trusting for now); a
 * *named* assignee must be a member of the task's project (a null one has nobody
 * to check). Reassigning or releasing an *active* task resets it to `claimed` (a
 * clean handoff); a *merged* task is a no-op (its doer keeps the credit). Never
 * touches feature ownership. Membership is the [[f-access]] funnel's (`not_found`,
 * never `forbidden` — no enumeration); no free text ⇒ no PII.
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { assignTask } from '@/lib/projects/task-actions';
import type { CollisionWarning } from '@/lib/projects/collision';
import type { TaskStatus } from '@prisma/client';

const schema = z.object({
  taskId: z.string().describe('The task to assign.'),
  assigneeUserId: z
    .string()
    .nullable()
    .describe(
      'The project member to assign it to (yourself to take it, or someone else), or null to return it to the unassigned pool.'
    ),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards against an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  /** The task's `t-N` ref (f-refs; `null` until assigned) — name what you just (re)assigned (t-66). */
  number: number | null;
  status: TaskStatus;
  /** Soft heads-up when a reassignment displaced someone's active work — never a block. */
  warnings: CollisionWarning[];
}

export class AssignTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'assign_task';
  readonly processesPii = false; // ids only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'assign_task',
    description:
      'Assign, reassign, or release a task: assigneeUserId to yourself to take it, to someone else to hand it over (e.g. a teammate is away), or null to return it to the unassigned pool for anyone to pick up. Any project member may assign; a named assignee must be a project member. Reassigning or releasing an active task resets it to claimed so the next person starts fresh; a merged task is left as-is (it credits whoever did it). Never changes feature ownership.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to assign.' },
        assigneeUserId: {
          type: ['string', 'null'],
          description:
            'The project member to assign it to (yourself, or someone else), or null to return it to the unassigned pool.',
        },
        projectId: {
          type: 'string',
          description: 'Optional: the task must belong to this project (guards an id mix-up).',
        },
      },
      required: ['taskId', 'assigneeUserId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('assign_task requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await assignTask(userId, args.taskId, args.assigneeUserId, args.projectId);
      return this.success({
        taskId: result.taskId,
        number: result.number,
        status: result.status,
        warnings: result.warnings,
      });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown / cross-project task.
      if (err instanceof NotFoundError) {
        return this.error(`Task ${args.taskId} not found.`, 'not_found');
      }
      // The assignee isn't a member of the task's project.
      if (err instanceof ValidationError) {
        return this.error(err.message, 'invalid_assignee');
      }
      throw err;
    }
  }
}
