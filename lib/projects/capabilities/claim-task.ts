/**
 * `claim_task` — mark a task as being worked on and register the caller's
 * files-in-flight, returning **soft collision warnings** (v1-requirements §5,
 * §11). The Hub never hard-locks: claiming always succeeds; if the task is
 * already claimed by someone else, or another open claim touches overlapping
 * files, the caller gets a heads-up to decide — not a block.
 *
 * Any project member may claim (pull-not-push, §5) — routed through
 * `resolveTaskAccess` (non-member ≡ `not_found`). Claiming records a `TaskClaim`
 * (the append-only soft-collision history) and points `Task.claimedByUserId` at
 * the caller; any prior open claim on the same task is released (the handoff is
 * recorded), keeping at most one open claim per task.
 *
 * Null-claimant handling (carried finding): a task whose stored claimant was
 * erased (`claimedByUserId = null`) is treated as unclaimed — no "already
 * claimed" warning — so it can be picked up cleanly.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { claimTask } from '@/lib/projects/claim-task-service';
import type { CollisionWarning } from '@/lib/projects/collision';

const schema = z.object({
  taskId: z.string().describe('The task to claim.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  claimed: boolean;
  /** Soft warnings — advisory, never a block. */
  warnings: CollisionWarning[];
}

export class ClaimTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'claim_task';
  readonly processesPii = false;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'claim_task',
    description:
      'Claim a task to signal you are working on it and register your files-in-flight. Always succeeds (never a hard lock); returns soft warnings if the task is already claimed or another open claim touches overlapping files. Any project member may claim.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to claim.' },
      },
      required: ['taskId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('claim_task requires a signed-in caller.', 'no_user_context');
    }

    // The claim core is shared with the consumer route so the two never drift.
    try {
      const result = await claimTask(userId, args.taskId);
      return this.success(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Task ${args.taskId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
