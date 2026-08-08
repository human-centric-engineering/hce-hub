/**
 * `assign_task` — (re)assign a task to a project member (f-task-assignment t1).
 *
 * The MCP-first verb that re-sets the task's `assigneeUserId`: assign it to
 * yourself ("take it") or to someone else ("reassign" — e.g. a teammate is off
 * sick and you hand their task over). Wraps the shared `assignTask` core
 * (`task-actions.ts`) so the MCP, UI, and any automation path can't diverge.
 *
 * **Any project member may (re)assign** (open/trusting for now); the assignee
 * must be a member of the task's project. Reassigning an *active* task resets it
 * to `claimed` (a clean handoff); a *merged* task is a no-op (its doer keeps the
 * credit). Never touches feature ownership. Membership is the [[f-access]]
 * funnel's (`not_found`, never `forbidden` — no enumeration); no free text ⇒ no PII.
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
import type { TaskStatus } from '@prisma/client';

const schema = z.object({
  taskId: z.string().describe('The task to assign.'),
  assigneeUserId: z
    .string()
    .describe('The project member to assign it to (yourself to take it, or someone else).'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards against an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  status: TaskStatus;
}

export class AssignTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'assign_task';
  readonly processesPii = false; // ids only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'assign_task',
    description:
      'Assign (or reassign) a task to a project member: assigneeUserId to yourself to take it, or to someone else to hand it over (e.g. a teammate is away). Any project member may assign; the assignee must be a project member. Reassigning an active task resets it to claimed so the new person starts fresh; a merged task is left as-is (it credits whoever did it). Never changes feature ownership.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to assign.' },
        assigneeUserId: {
          type: 'string',
          description: 'The project member to assign it to (yourself, or someone else).',
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
      return this.success({ taskId: result.taskId, status: result.status });
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
