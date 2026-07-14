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
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { resolveTaskAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { detectFileOverlapWarnings, type CollisionWarning } from '@/lib/projects/collision';

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

    const access = await resolveTaskAccess(userId, args.taskId);
    if (!access.ok) {
      return this.error(`Task ${args.taskId} not found.`, 'not_found');
    }
    const task = access.task;

    const warnings: CollisionWarning[] = [];

    // Already claimed by another *live* claimant? (A null claimant — erased user
    // — is treated as unclaimed, so no warning.)
    if (task.claimedByUserId && task.claimedByUserId !== userId) {
      warnings.push({
        kind: 'already_claimed',
        userId: task.claimedByUserId,
        taskId: task.taskId,
        message: 'Heads-up: this task is already claimed by someone else.',
      });
    }

    // Other open claims in the project whose files overlap the ones this task
    // declares — the soft file-collision signal.
    const otherOpenClaims = await prisma.taskClaim.findMany({
      where: {
        releasedAt: null,
        userId: { not: userId },
        taskId: { not: task.taskId },
        task: { feature: { projectId: task.projectId } },
      },
      select: {
        userId: true,
        claimedAt: true,
        task: { select: { id: true, title: true, filesScope: true } },
      },
    });
    warnings.push(
      ...detectFileOverlapWarnings(
        task.filesScope,
        otherOpenClaims.map((c) => ({
          userId: c.userId,
          claimedAt: c.claimedAt,
          taskId: c.task.id,
          taskTitle: c.task.title,
          filesScope: c.task.filesScope,
        }))
      )
    );

    const releasedAt = new Date();
    await executeTransaction(async (tx) => {
      // Release any prior open claim on this task (records the handoff), then
      // open a fresh claim for the caller and point the task at them.
      await tx.taskClaim.updateMany({
        where: { taskId: task.taskId, releasedAt: null },
        data: { releasedAt },
      });
      await tx.taskClaim.create({ data: { taskId: task.taskId, userId } });
      await tx.task.update({
        where: { id: task.taskId },
        data: { status: 'claimed', claimedByUserId: userId },
      });
    });

    logAdminAction({
      userId,
      action: 'task.claim',
      entityType: 'app_task',
      entityId: task.taskId,
      metadata: { warningCount: warnings.length, previousClaimant: task.claimedByUserId },
    });

    return this.success({ taskId: task.taskId, claimed: true, warnings });
  }
}
