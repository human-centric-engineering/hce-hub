/**
 * `withdraw_task` — call work off, or bring it back (f-authoring-fidelity §21 t-123).
 *
 * §21's rule is that the MCP verbs are how the record gets corrected **from the Hub,
 * never the DB**. Until now there was no verb for the commonest correction of all —
 * "this task shouldn't exist" — so a mis-filed, duplicated or superseded task was
 * permanent, and three smoke tasks once had to be removed with a raw `DELETE`.
 * `complete_task` is not the answer: it says the work landed, which is a lie that
 * also pollutes the Merged column and the feature's completion count.
 *
 * **Soft and reversible.** Withdrawal is an instant (`Task.withdrawnAt`), not a
 * status, so restoring re-derives whatever the task was before with nothing to
 * remember, and `t-N` is never reused. Withdrawn work leaves the Plan, the Board,
 * `next_task` and every progress count, and remains visible in the journal and via
 * `list_tasks { status: 'withdrawn' }` — the `IdeaStatus.dropped` model, where
 * dropped ideas stay listed as a reversible archive.
 *
 * Owner tier (the feature owner or a project lead), matching `update_task`; the
 * funnel maps non-member → `not_found`, member-non-owner → `forbidden`. A merged
 * task is refused. **Processes PII: `reason` is free text.**
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/api/errors';
import { withdrawTask, type DependentRef } from '@/lib/projects/task-actions';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  taskId: z.string().describe('The task to withdraw (or restore).'),
  reason: z
    .string()
    .max(500)
    .optional()
    .describe('Why — e.g. "duplicate of t-88", "superseded by §38". Recorded in the journal.'),
  restore: z
    .boolean()
    .optional()
    .describe('Set true to bring a withdrawn task back instead of withdrawing it.'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards an id mix-up).'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  /** The task's `t-N` ref (f-refs; `null` until assigned) — name what you just did. */
  number: number | null;
  /** `true` when it is now withdrawn, `false` when it was restored. */
  withdrawn: boolean;
  /** Unmerged tasks that depended on this one — advisory, never a refusal. */
  affectedDependents: DependentRef[];
}

export class WithdrawTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'withdraw_task';
  // `reason` is free text a human writes — it can name people, customers, anything.
  readonly processesPii = true;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'withdraw_task',
    description:
      "Withdraw a task — say the work is not going to happen — or restore a withdrawn one with restore: true. Use it for a task that is mis-filed, a duplicate, a smoke artefact, or superseded before work started; never complete_task, which claims the work landed and counts toward its feature's completion. Withdrawn tasks disappear from the Plan, the Board, next_task and every progress count, keep their t-N (never reused), and stay findable via list_tasks { status: 'withdrawn' } and in the project journal — so a withdrawal is always reversible. A merged task cannot be withdrawn: it has already landed. Only the feature's owner or a project lead may. The result reports any unmerged tasks that depended on this one — their dependency on it stops blocking them, which is worth knowing before you leave it.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to withdraw (or restore).' },
        reason: {
          type: 'string',
          description:
            'Why — e.g. "duplicate of t-88", "superseded by §38". Recorded in the journal.',
        },
        restore: {
          type: 'boolean',
          description: 'Set true to bring a withdrawn task back instead of withdrawing it.',
        },
        projectId: {
          type: 'string',
          description: 'Optional: the task must belong to this project (guards an id mix-up).',
        },
      },
      required: ['taskId'],
    },
  };

  protected readonly schema = schema;

  /** Keep the free-text reason out of the durable call log — only its shape. */
  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        taskId: args.taskId,
        restore: args.restore ?? false,
        projectId: args.projectId ?? null,
        reason: args.reason ? redactedString(`reason (${args.reason.length} chars)`) : null,
      },
      // The result is ids, counts and titles the caller already had — nothing the
      // reason adds. Kept whole so the provenance trail says what actually happened.
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('withdraw_task requires a signed-in caller.', 'no_user_context');
    }

    try {
      const result = await withdrawTask(userId, args.taskId, {
        restore: args.restore,
        reason: args.reason,
        expectedProjectId: args.projectId ?? context.scope?.projectId,
      });
      return this.success(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Task ${args.taskId} not found.`, 'not_found');
      }
      if (err instanceof ForbiddenError) {
        return this.error(
          'Only the feature owner or a project lead can withdraw its tasks.',
          'forbidden'
        );
      }
      if (err instanceof ValidationError) {
        return this.error(err.message, 'already_merged');
      }
      throw err;
    }
  }
}
