/**
 * Execution Reaper
 *
 * Marks stale workflow executions as `failed`. If the process restarts
 * mid-execution, a client never reconnects after approve/retry, or an
 * approval is never acted on, these rows are orphaned forever unless
 * something sweeps them. This module provides that sweep.
 *
 * Three thresholds:
 *   - `running` rows older than 30 minutes (process crash / disconnect)
 *   - `pending` rows older than 1 hour (client never reconnected after approve/retry)
 *   - `paused_for_approval` rows older than 7 days (approval never acted on)
 *
 * Called by the unified maintenance tick endpoint.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { recordReleaseEvent } from '@/lib/orchestration/engine/lease';
import { WorkflowStatus } from '@/types/orchestration';

// Mirrors the closed set used by the live route. Defined locally
// rather than imported because there's no shared module for it yet
// and the alternative (a one-line constants file) would be premature.
const TERMINAL_STATUSES = [
  WorkflowStatus.COMPLETED,
  WorkflowStatus.FAILED,
  WorkflowStatus.CANCELLED,
];

/** Executions running longer than this are considered zombies. */
const ZOMBIE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Pending rows older than this were never picked up by a client. */
const STALE_PENDING_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/** Approval requests older than this are considered abandoned. */
const ABANDONED_APPROVAL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Stable sentinel strings used both as the errorMessage written by the
// reaper and as the marker the post-update confirmation query matches
// on to decide which targeted rows we genuinely flipped. No other
// writer uses these exact strings, so a row with status=FAILED and
// errorMessage matching one of them was reaped by *this* module.
const REAPER_ERROR_RUNNING = 'Execution reaped: exceeded zombie threshold without completing';
const REAPER_ERROR_PENDING =
  'Execution reaped: client did not reconnect within 1 hour after approve/retry';
const REAPER_ERROR_APPROVAL = 'Execution reaped: approval not received within 7 days';

export interface ReaperResult {
  reaped: number;
  stalePending: number;
  abandonedApprovals: number;
}

/**
 * Find workflow executions stuck in `running`, `pending`, or
 * `paused_for_approval` beyond their respective thresholds and mark
 * them as `failed`.
 */
export async function reapZombieExecutions(
  thresholdMs: number = ZOMBIE_THRESHOLD_MS,
  pendingThresholdMs: number = STALE_PENDING_THRESHOLD_MS,
  approvalThresholdMs: number = ABANDONED_APPROVAL_THRESHOLD_MS
): Promise<ReaperResult> {
  const runningCutoff = new Date(Date.now() - thresholdMs);
  const pendingCutoff = new Date(Date.now() - pendingThresholdMs);
  const approvalCutoff = new Date(Date.now() - approvalThresholdMs);

  // Clear lease columns alongside the FAILED flip so the row's terminal state stays
  // coherent with `claimLease`'s expectations. Without this, a reaper-killed RUNNING row
  // could keep its (now-expired) lease columns set and feed the orphan-sweep race that
  // `claimLease`'s status guard exists to defend against. Belt-and-braces with the guard.
  //
  // Two-step (findMany → updateMany) per category so we can record per-execution
  // `released` lease events for the inspector. The find is index-friendly
  // (`status, updatedAt` / `status, createdAt`) and returns zero rows the
  // overwhelming majority of ticks — typical maintenance-tick cost stays flat.
  const [runningTargets, pendingTargets, approvalTargets] = await Promise.all([
    prisma.aiWorkflowExecution.findMany({
      where: {
        status: WorkflowStatus.RUNNING,
        // Use updatedAt (not startedAt) so resumed executions aren't
        // immediately reaped — the resume path preserves the original
        // startedAt, but updatedAt is refreshed when status flips back
        // to RUNNING.
        updatedAt: { lt: runningCutoff },
      },
      select: { id: true, leaseToken: true },
    }),
    // Use createdAt (not updatedAt) so incidental DB writes don't reset
    // the reap timer — a PENDING row should be reaped based on when it
    // was created, not when it was last touched.
    prisma.aiWorkflowExecution.findMany({
      where: {
        status: WorkflowStatus.PENDING,
        createdAt: { lt: pendingCutoff },
      },
      select: { id: true, leaseToken: true },
    }),
    prisma.aiWorkflowExecution.findMany({
      where: {
        status: WorkflowStatus.PAUSED_FOR_APPROVAL,
        updatedAt: { lt: approvalCutoff },
      },
      select: { id: true, leaseToken: true },
    }),
  ]);

  // Re-assert `status` + the same time cutoff inside each `updateMany.where`
  // so the DB enforces the predicate atomically at write time. Without it,
  // a row whose status legitimately changed between the findMany above and
  // this write (natural finalize → COMPLETED, admin force-fail → FAILED with
  // a different errorMessage, claim-lease resume back to RUNNING under a new
  // host, concurrent reaper tick) would be clobbered back to FAILED with the
  // reaper's errorMessage. `updateMany.count` then tells us exactly how many
  // rows actually flipped — feeds the inspector-event gate below.
  const [runningResult, pendingResult, approvalResult] = await Promise.all([
    runningTargets.length > 0
      ? prisma.aiWorkflowExecution.updateMany({
          where: {
            id: { in: runningTargets.map((r) => r.id) },
            status: WorkflowStatus.RUNNING,
            updatedAt: { lt: runningCutoff },
          },
          data: {
            status: WorkflowStatus.FAILED,
            completedAt: new Date(),
            errorMessage: REAPER_ERROR_RUNNING,
            leaseToken: null,
            leaseExpiresAt: null,
          },
        })
      : Promise.resolve({ count: 0 }),
    pendingTargets.length > 0
      ? prisma.aiWorkflowExecution.updateMany({
          where: {
            id: { in: pendingTargets.map((r) => r.id) },
            status: WorkflowStatus.PENDING,
            createdAt: { lt: pendingCutoff },
          },
          data: {
            status: WorkflowStatus.FAILED,
            completedAt: new Date(),
            errorMessage: REAPER_ERROR_PENDING,
            leaseToken: null,
            leaseExpiresAt: null,
          },
        })
      : Promise.resolve({ count: 0 }),
    approvalTargets.length > 0
      ? prisma.aiWorkflowExecution.updateMany({
          where: {
            id: { in: approvalTargets.map((r) => r.id) },
            status: WorkflowStatus.PAUSED_FOR_APPROVAL,
            updatedAt: { lt: approvalCutoff },
          },
          data: {
            status: WorkflowStatus.FAILED,
            completedAt: new Date(),
            errorMessage: REAPER_ERROR_APPROVAL,
            leaseToken: null,
            leaseExpiresAt: null,
          },
        })
      : Promise.resolve({ count: 0 }),
  ]);

  // Confirm which targeted rows we actually flipped before recording
  // release events. Happy path (count === targets.length): every target
  // flipped, no extra query needed. Race path (count < targets.length):
  // re-query for the subset whose status is now FAILED AND whose
  // errorMessage matches our sentinel — that's the exact set of rows
  // *this* sweep reaped. Without this gate, a race-loser row terminated
  // by some other writer would get a spurious `released` lease event
  // attributed to the reaper.
  const [runningReaped, pendingReaped, approvalReaped] = await Promise.all([
    confirmReaped(runningTargets, runningResult.count, REAPER_ERROR_RUNNING),
    confirmReaped(pendingTargets, pendingResult.count, REAPER_ERROR_PENDING),
    confirmReaped(approvalTargets, approvalResult.count, REAPER_ERROR_APPROVAL),
  ]);

  // Lease inspector entries — fire-and-forget. A failure here is logged
  // inside the helper and never propagates; a missed event is a missed
  // inspector entry, not a correctness issue.
  for (const row of runningTargets) {
    if (runningReaped.has(row.id)) {
      void recordReleaseEvent(row.id, row.leaseToken, 'reaper-sweep', { kind: 'zombie' });
    }
  }
  for (const row of pendingTargets) {
    if (pendingReaped.has(row.id)) {
      void recordReleaseEvent(row.id, row.leaseToken, 'reaper-sweep', { kind: 'stale-pending' });
    }
  }
  for (const row of approvalTargets) {
    if (approvalReaped.has(row.id)) {
      void recordReleaseEvent(row.id, row.leaseToken, 'reaper-sweep', {
        kind: 'abandoned-approval',
      });
    }
  }

  if (runningResult.count > 0) {
    logger.warn('Reaped zombie workflow executions', { count: runningResult.count, thresholdMs });
  }
  if (pendingResult.count > 0) {
    logger.warn('Reaped stale pending executions', {
      count: pendingResult.count,
      pendingThresholdMs,
    });
  }
  if (approvalResult.count > 0) {
    logger.warn('Reaped abandoned approval executions', {
      count: approvalResult.count,
      approvalThresholdMs,
    });
  }

  // Self-healing sweep: any running-step rows belonging to terminal
  // executions are stale by definition. The engine clears its own rows
  // on per-step terminate and `finalize` does a sweep, so this only
  // fires when a row leaked past those paths (crash mid-finalize, manual
  // status flip, etc). Idempotent — finds zero matches when everything
  // is healthy.
  const orphanCleanup = await prisma.aiWorkflowRunningStep.deleteMany({
    where: { execution: { status: { in: TERMINAL_STATUSES } } },
  });
  if (orphanCleanup.count > 0) {
    logger.warn('Reaped orphan running-step rows', { count: orphanCleanup.count });
  }

  return {
    reaped: runningResult.count,
    stalePending: pendingResult.count,
    abandonedApprovals: approvalResult.count,
  };
}

/**
 * Given the targets read at the start of a sweep and the updateMany count
 * actually written, return the set of ids that this sweep flipped. Skips
 * the confirmation query when count is 0 (none flipped) or when count
 * matches targets.length (all flipped). The middle case — partial flip
 * due to a race between the findMany and the updateMany — re-queries for
 * the subset whose status is FAILED AND whose errorMessage matches the
 * reaper's sentinel.
 */
async function confirmReaped(
  targets: ReadonlyArray<{ id: string }>,
  count: number,
  errorMessage: string
): Promise<Set<string>> {
  if (count === 0) return new Set();
  if (count === targets.length) return new Set(targets.map((t) => t.id));
  const rows = await prisma.aiWorkflowExecution.findMany({
    where: {
      id: { in: targets.map((t) => t.id) },
      status: WorkflowStatus.FAILED,
      errorMessage,
    },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
