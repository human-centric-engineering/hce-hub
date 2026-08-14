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
 * **Doer = the task's own `claimedByUserId`** — the Hub worker who did the work,
 * credited as the one who completed it (the `task_merged` event's actor), NEVER
 * the webhook (§14 owner decision). **Additively** (f-github-identity §23), the
 * PR's `merged_by` actor is mapped to a Hub user and recorded on
 * `Task.mergedByUserId` — the "who merged it" attribution, kept distinct from the
 * doer, never overwriting it.
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
import { completeTask, type MergeAttribution } from '@/lib/projects/task-actions';
import { resolveHubUserByGithubId } from '@/lib/projects/github/identity';
import { NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging';

/** The slice of GitHub's `pull_request` event payload we consume. */
const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    html_url: z.string().url(),
    merged: z.boolean().optional(),
    // Who clicked "Merge" on GitHub — mapped to a Hub user for attribution
    // (f-github-identity §23). Nullish: GitHub can omit it, and we don't require it.
    merged_by: z.object({ login: z.string(), id: z.number().int() }).nullish(),
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

  // Resolve the merger (merged_by) → a Hub user ONCE for the whole PR, by GitHub's
  // immutable numeric id (f-github-identity §23) — but only when a task actually
  // links this PR: most merges on a connected repo have no Hub task, and this is
  // the webhook hot path. `userId` is null when the merger isn't linked to a Hub
  // user (external / not connected); the raw login is kept for the journal either
  // way. Additive — never the doer.
  const mergedBy: MergeAttribution | undefined =
    tasks.length > 0 && pr.merged_by
      ? {
          userId: await resolveHubUserByGithubId(String(pr.merged_by.id)),
          githubLogin: pr.merged_by.login,
        }
      : undefined;

  let reconciled = 0;
  let skipped = 0;
  for (const task of tasks) {
    // An unclaimed task has no doer, and `completeTask` needs one — both for the
    // access funnel and for the `task_merged` actor. Skip rather than invent one.
    //
    // This guard was unreachable until §32 t-89: the create cascade always set a
    // claimant, so no linked task could be unclaimed. Now an `enhancement` is born
    // unassigned and any task can be released, so a PR *can* merge against a task
    // nobody holds — and it will stay open, visibly, on the board. Who should get
    // the doer credit there is an owner call, deliberately not made here: it is
    // NOT the merger (f-github-sync §14 — the doer is never the webhook actor).
    if (!task.claimedByUserId) {
      skipped++;
      logger.warn('github-sync: task linked to merged PR is unclaimed — skipped', {
        taskId: task.id,
        prUrl,
      });
      continue;
    }
    try {
      await completeTask(task.claimedByUserId, task.id, undefined, mergedBy);
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
    mergedByGithubLogin: pr.merged_by?.login ?? null,
    mergedByUserId: mergedBy?.userId ?? null,
  });

  return { handled: true, prUrl, matched: tasks.length, reconciled, skipped };
}
