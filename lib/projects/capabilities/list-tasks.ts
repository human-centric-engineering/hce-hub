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
import { TaskKind } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { getProjectTasks } from '@/lib/projects/tasks';
import type { EffectiveStatus } from '@/lib/projects/task-status';

const schema = z.object({
  projectId: z.string().describe('The project whose tasks to read.'),
  featureId: z.string().optional().describe('Optional: restrict to one feature in the project.'),
  status: z
    .enum(['claimed', 'active', 'blocked', 'merged', 'withdrawn'])
    .optional()
    .describe(
      'Optional: restrict to one effective status (blocked = deps not all merged; withdrawn = called off, and the only way to see it — every other read hides it).'
    ),
  kind: z
    .nativeEnum(TaskKind)
    .optional()
    .describe(
      'Optional: restrict to one kind — e.g. "bug" for the open-bugs read, or "enhancement" for the open improvements.'
    ),
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
  /**
   * Effective status. `EffectiveStatus` rather than a hand-written union, for the
   * reason the `kind` comment immediately below already gives — and which this line
   * did not heed until §21 t-123 added `withdrawn`.
   */
  status: EffectiveStatus;
  /** `bug` | `feature_work`. */
  // `TaskKind` rather than a literal union: a hand-written copy silently goes
  // stale the next time the enum grows (it did, at §32 t-79's `enhancement`).
  kind: TaskKind;
  /** The phase that *chose* this work, when it differs from its feature's; `null` = inherit (§32 t-80). */
  phaseId: string | null;
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
      "Read a project's tasks — each with its t-N number, id, title, feature (id + slug), effective status (claimed | active | blocked | merged), kind (feature_work | bug | enhancement), the phase that chose it (phaseId; null = inherits its feature's phase), assignee id, and PR url. Narrow with featureId (one feature's tasks), kind (e.g. 'bug' for the open bugs, 'enhancement' for the open improvements), and/or status. Withdrawn tasks — work called off via withdraw_task — are excluded from every result unless you ask for them with status: 'withdrawn'; this is the only read that shows them, so it is how you find one to restore. Use it to see and name the same tasks/bugs the human sees on the board — e.g. before picking work up. On a large project, prefer narrowing with featureId or kind over reading every task. Membership-scoped: a project you can't see is not_found.",
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
          enum: ['claimed', 'active', 'blocked', 'merged', 'withdrawn'],
          description:
            'Optional: restrict to one effective status (blocked = deps not all merged; withdrawn = called off, and the only way to see it — every other read hides withdrawn work).',
        },
        kind: {
          type: 'string',
          enum: ['feature_work', 'bug', 'enhancement'],
          description:
            'Optional: restrict to one kind — e.g. "bug" for the open-bugs read, or "enhancement" for the open improvements.',
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
