/**
 * `set_pr` — link a task to its pull request (`f-github-sync` §14 t-1).
 *
 * The **MCP-first** verb a member (or the repo session in Claude Code) drives to
 * say "here's the PR for this task." A thin wrapper over the shared `setTaskPr`
 * core (`task-actions.ts`) — the same `Task.prUrl` the task sheet reads and the
 * §14 webhook reconciles against — so the MCP, UI, and automation paths can't
 * diverge. **No status change:** linking a PR is not merging it (the §14 webhook
 * flips a task to `merged` on the *merge* event, via `complete_task`'s core).
 *
 * `prUrl` is validated at this boundary (a well-formed http(s) URL — CLAUDE.md:
 * validate user input with Zod; the render layer also `sanitizeUrl`s it).
 * Membership is the [[f-access]] funnel's (`resolveTaskAccess` inside the core): a
 * non-member, or a task in a project the caller can't see, is `not_found` (never
 * `forbidden` — no enumeration). The only free text is a URL (assumed non-PII).
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { setTaskPr } from '@/lib/projects/task-actions';
import type { TaskStatus } from '@prisma/client';

const schema = z.object({
  taskId: z.string().describe('The task to link a PR to.'),
  prUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'PR URL must be an http(s) URL.')
    .describe('The pull-request URL to attach to the task.'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards against an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  /** The task's `t-N` ref (f-refs; `null` until assigned) — name what you just linked (t-66). */
  number: number | null;
  /** The task's status — unchanged (linking a PR never advances the lifecycle). */
  status: TaskStatus;
}

export class SetPrCapability extends BaseCapability<Args, Data> {
  readonly slug = 'set_pr';
  readonly processesPii = false; // a URL + ids only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'set_pr',
    description:
      "Link a task to its pull request: attach or replace the task's PR URL. Any project member may set it on a task in a feature they can see. Does NOT change status — linking a PR is not merging it (a merged PR is reconciled separately). Idempotent: re-linking the same URL is safe.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to link a PR to.' },
        prUrl: { type: 'string', description: 'The pull-request URL to attach to the task.' },
        projectId: {
          type: 'string',
          description: 'Optional: the task must belong to this project (guards an id mix-up).',
        },
      },
      required: ['taskId', 'prUrl'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('set_pr requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await setTaskPr(userId, args.taskId, args.prUrl, args.projectId);
      return this.success({
        taskId: result.taskId,
        number: result.number,
        status: result.status,
      });
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
