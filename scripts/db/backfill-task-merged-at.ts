/**
 * Backfill `Task.mergedAt` from each task's GitHub PR `merged_at` (§33-sweep t-117).
 *
 * §33-sweep t-115 added the column and backfilled it from `task_merged` journal
 * events. That only reaches work merged after §17 shipped the event stream —
 * everything §19's cutover imported from `plan.md` predates it and stayed null.
 * On dev that was 34 of 48 merged tasks, so the Board's Merged column (t-108)
 * could order only the recent tail and left three quarters of the Hub's own
 * history in an undifferentiated block.
 *
 * Every one of those tasks carries a `prUrl`, and GitHub's `merged_at` is the
 * authoritative instant the work actually landed — better than anything we could
 * reconstruct locally.
 *
 * **A script, not a migration.** It makes network calls, and a migration that
 * depends on an external API is a migration that can fail forever on a fresh
 * database — `migrate deploy` on a new environment would try to reach GitHub.
 *
 * **Idempotent and non-destructive.** Only ever writes where
 * `mergedAt IS NULL AND status = 'merged'`, in an `updateMany` carrying that same
 * predicate — so a re-run cannot move a stamp that `complete_task` or an earlier
 * run already set, exactly as t-115's write guard works. Re-running is safe and
 * simply resolves fewer rows.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/db/backfill-task-merged-at.ts [--dry-run]
 *
 * Optional environment:
 *   GITHUB_TOKEN — raises the API rate limit from 60/hr to 5,000/hr. Read
 *     straight from `process.env` rather than `lib/env.ts`: this is a one-off
 *     operator script, and adding a variable to the validated env schema would
 *     make every deployment carry a setting only this file has ever wanted.
 *
 * Exits 0 when every candidate was either resolved or explainably skipped,
 * 1 if any lookup failed outright (network/HTTP), so CI or an operator sees it.
 */
import { z } from 'zod';

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { parsePullRequestUrl } from '@/lib/projects/github/pr-url';

/**
 * Only the one field we use. `merged_at` is null for an open or closed-unmerged
 * PR, which is a real answer ("this never landed"), not a failure.
 */
const PullRequest = z.object({ merged_at: z.iso.datetime().nullable() });

/** Be a good citizen on an unauthenticated quota; harmless when a token is set. */
const DELAY_MS = 150;

interface Outcome {
  resolved: number;
  /** PR exists but was never merged — leaving null is the truthful answer. */
  unmerged: number;
  /** `prUrl` didn't match the expected shape — nothing to look up. */
  unparseable: string[];
  /** Network or HTTP failure — the only outcome that fails the run. */
  failed: string[];
}

async function fetchMergedAt(owner: string, repo: string, num: string): Promise<Date | null> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${num}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}${res.status === 403 ? ' (rate limited? set GITHUB_TOKEN)' : ''}`
    );
  }
  // Validated, never cast: this is external data reaching a write path.
  const parsed = PullRequest.safeParse(await res.json());
  if (!parsed.success) throw new Error('unexpected GitHub response shape');
  return parsed.data.merged_at ? new Date(parsed.data.merged_at) : null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = await prisma.task.findMany({
    where: { status: 'merged', mergedAt: null, prUrl: { not: null } },
    select: { id: true, number: true, prUrl: true },
    orderBy: { number: 'asc' },
  });

  const alreadyDated = await prisma.task.count({
    where: { status: 'merged', mergedAt: { not: null } },
  });
  const noPr = await prisma.task.count({
    where: { status: 'merged', mergedAt: null, prUrl: null },
  });

  logger.info('Backfill Task.mergedAt from GitHub', {
    candidates: candidates.length,
    alreadyDated,
    // Named explicitly: these can never be resolved by this script, and a run
    // that silently ignored them would look complete when it was not.
    mergedWithNoPrUrl: noPr,
    dryRun,
  });

  const out: Outcome = { resolved: 0, unmerged: 0, unparseable: [], failed: [] };

  for (const task of candidates) {
    const ref = `t-${task.number ?? '?'}`;
    const pr = parsePullRequestUrl(task.prUrl);
    if (!pr) {
      out.unparseable.push(`${ref} (${task.prUrl ?? 'null'})`);
      continue;
    }
    const { owner, repo, number: num } = pr;

    try {
      const mergedAt = await fetchMergedAt(owner, repo, num);
      if (!mergedAt) {
        out.unmerged += 1;
        logger.info(`  ${ref} — PR #${num} was never merged; leaving null`);
        continue;
      }
      if (!dryRun) {
        // Same guard as t-115's stamp: the predicate carries `mergedAt: null`, so
        // a concurrent `complete_task` (or a second copy of this script) cannot
        // have its value overwritten — the loser matches zero rows.
        await prisma.task.updateMany({
          where: { id: task.id, status: 'merged', mergedAt: null },
          data: { mergedAt },
        });
      }
      out.resolved += 1;
      logger.info(`  ${ref} → ${mergedAt.toISOString()} (${owner}/${repo}#${num})`);
    } catch (error) {
      out.failed.push(`${ref}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  logger.info(dryRun ? 'Dry run complete — nothing written' : 'Backfill complete', {
    resolved: out.resolved,
    unmerged: out.unmerged,
    unparseable: out.unparseable.length,
    failed: out.failed.length,
  });
  if (out.unparseable.length > 0) logger.warn('Unparseable prUrl', { tasks: out.unparseable });
  if (out.failed.length > 0) logger.error('Lookups failed', { tasks: out.failed });

  await prisma.$disconnect();
  process.exit(out.failed.length > 0 ? 1 : 0);
}

void main();
