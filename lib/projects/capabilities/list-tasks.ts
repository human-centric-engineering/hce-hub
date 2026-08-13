/**
 * `list_tasks` — read a feature's (or a project's) tasks over MCP (f-task-reads §30 t-67).
 *
 * The read that lets a coding agent **see the work**, not just the single
 * `next_task` recommendation: given a project (and optionally one feature, and/or a
 * status / kind filter), return its tasks with their `t-N`, id, title, feature ref,
 * effective status, kind, assignee, and PR. The concrete need that motivated it —
 * "which open bugs are on this project?" — is one call with `kind: 'bug'`.
 *
 * A thin projection over `getProjectTasks` (the same funnel-scoped read, with the
 * shared effective-status computation so it never diverges from the Plan / Board).
 * A non-member / unknown project is `not_found` (no enumeration). Ids + refs + short
 * labels + an opaque assignee id ⇒ no PII.
 *
 * Complements t-66 (f-refs), which makes the *write* verbs return refs; this is the
 * *read* side. Together they let the human and the agent name the same task.
 */
import { z } from 'zod';
import type { TaskKind } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { getProjectTasks } from '@/lib/projects/tasks';

const schema = z.object({
  projectId: z.string().describe('The project whose tasks to read.'),
  featureId: z.string().optional().describe('Optional: restrict to one feature in the project.'),
  status: z
    .enum(['claimed', 'active', 'blocked', 'merged'])
    .optional()
    .describe('Optional: restrict to one effective status (blocked = deps not all merged).'),
  kind: z
    .enum(['feature_work', 'bug'])
    .optional()
    .describe('Optional: restrict to one kind — e.g. "bug" for the open-bugs read.'),
});

type Args = z.infer<typeof schema>;

/** A task under the project — just enough to identify and act on it. */
interface TaskRefDto {
  id: string;
  /** Project-wide `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  featureId: string;
  /** Authored feature slug (`f-mcp`); `null` until authored. */
  featureSlug: string | null;
  featureTitle: string;
  /** Effective status: `claimed` | `active` | `blocked` | `merged`. */
  status: 'claimed' | 'active' | 'blocked' | 'merged';
  /** `bug` | `feature_work`. */
  // `TaskKind` rather than a literal union: a hand-written copy silently goes
  // stale the next time the enum grows (it did, at §32 t-79's `enhancement`).
  kind: TaskKind;
  /** Assignee (raw id; `null` when unassigned / erased). */
  assigneeUserId: string | null;
  prUrl: string | null;
}

interface Data {
  projectId: string;
  tasks: TaskRefDto[];
}

export class ListTasksCapability extends BaseCapability<Args, Data> {
  readonly slug = 'list_tasks';
  readonly processesPii = false; // ids + refs + short labels; assignee is an opaque id

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'list_tasks',
    description:
      "Read a project's tasks — each with its t-N number, id, title, feature (id + slug), effective status (claimed | active | blocked | merged), kind (bug | feature_work), assignee id, and PR url. Narrow with featureId (one feature's tasks), kind (e.g. 'bug' for the open bugs), and/or status. Use it to see and name the same tasks/bugs the human sees on the board — e.g. before picking work up. On a large project, prefer narrowing with featureId or kind over reading every task. Membership-scoped: a project you can't see is not_found.",
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project whose tasks to read.' },
        featureId: {
          type: 'string',
          description: 'Optional: restrict to one feature in the project.',
        },
        status: {
          type: 'string',
          enum: ['claimed', 'active', 'blocked', 'merged'],
          description:
            'Optional: restrict to one effective status (blocked = deps not all merged).',
        },
        kind: {
          type: 'string',
          enum: ['feature_work', 'bug'],
          description: 'Optional: restrict to one kind — e.g. "bug" for the open-bugs read.',
        },
      },
      required: ['projectId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('list_tasks requires a signed-in caller.', 'no_user_context');
    }

    try {
      // Reuse the tasks read (membership-scoped; throws NotFoundError on deny).
      const { projectId, tasks } = await getProjectTasks(userId, args.projectId, {
        featureId: args.featureId,
        status: args.status,
        kind: args.kind,
      });
      return this.success({ projectId, tasks });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown project (no enumeration).
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
