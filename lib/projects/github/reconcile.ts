/**
 * Reconcile a GitHub `pull_request` webhook onto the Hub board (f-github-sync
 * §14 t-42).
 *
 * Acts ONLY on a merged close (`action === 'closed' && pull_request.merged ===
 * true`); every other action — opened, synchronize, an unmerged close — is an
 * intentional no-op. Finds **all** tasks whose `prUrl` equals the PR's
 * `html_url` (one PR can deliver several tasks — e.g. this very §14 PR) and
 * drives each to `merged` through the shared `completeTask` core.
 *
 * **Actor = the task's own `claimedByUserId`** — the Hub worker who did the work,
 * credited as the one who completed it, NEVER the webhook (§14 owner decision;
 * mapping GitHub's `merged_by` to a Hub user is a deliberate later feature).
 *
 * Resilient by design: `completeTask` is idempotent (an already-`merged` task is
 * a no-op), so a re-delivered event is safe; a matched task that is unclaimed,
 * or whose claimant is no longer a project member (the funnel's 404), is
 * **skipped with a warning** rather than failing the whole delivery. Unblocking
 * dependents needs no active step — task/feature status is derived, so the board
 * recomputes on the next read.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { completeTask } from '@/lib/projects/task-actions';
import { NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging';

/** The slice of GitHub's `pull_request` event payload we consume. */
const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    html_url: z.string().url(),
    merged: z.boolean().optional(),
  }),
});

export interface ReconcileResult {
  /** True only when the event was a merged-PR close we acted on. */
  handled: boolean;
  /** The PR's html_url, when the payload parsed; else null. */
  prUrl: string | null;
  /** Tasks found linked to the PR by `prUrl`. */
  matched: number;
  /** Tasks driven to `merged` (or already there — idempotent). */
  reconciled: number;
  /** Matched tasks skipped: unclaimed, or claimant no longer a member. */
  skipped: number;
}

const noop = (prUrl: string | null): ReconcileResult => ({
  handled: false,
  prUrl,
  matched: 0,
  reconciled: 0,
  skipped: 0,
});

/**
 * Reconcile a parsed GitHub webhook payload. Never throws on payload shape or a
 * per-task resolution failure — returns a summary the route logs and 200s.
 */
export async function reconcilePullRequestEvent(payload: unknown): Promise<ReconcileResult> {
  const parsed = pullRequestEventSchema.safeParse(payload);
  if (!parsed.success) {
    // Not a pull_request-shaped payload (e.g. a ping the route already filtered,
    // or a malformed body). Nothing to reconcile.
    return noop(null);
  }

  const { action, pull_request: pr } = parsed.data;
  if (action !== 'closed' || pr.merged !== true) {
    return noop(pr.html_url);
  }

  const prUrl = pr.html_url;
  const tasks = await prisma.task.findMany({
    where: { prUrl },
    select: { id: true, claimedByUserId: true },
  });

  let reconciled = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (!task.claimedByUserId) {
      skipped++;
      logger.warn('github-sync: task linked to merged PR is unclaimed — skipped', {
        taskId: task.id,
        prUrl,
      });
      continue;
    }
    try {
      await completeTask(task.claimedByUserId, task.id);
      reconciled++;
    } catch (err) {
      if (err instanceof NotFoundError) {
        // The claimant is no longer a member of the task's project (the access
        // funnel's 404). Skip this task; don't fail the rest of the delivery.
        skipped++;
        logger.warn('github-sync: merged-PR task claimant not resolvable — skipped', {
          taskId: task.id,
          prUrl,
        });
        continue;
      }
      throw err;
    }
  }

  logger.info('github-sync: reconciled merged PR', {
    prUrl,
    matched: tasks.length,
    reconciled,
    skipped,
  });

  return { handled: true, prUrl, matched: tasks.length, reconciled, skipped };
}
