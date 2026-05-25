/**
 * Admin Orchestration — Cancel a queued or running evaluation run.
 *
 * POST /api/v1/admin/orchestration/evaluations/runs/:id/cancel
 *
 * Behaviour:
 *   - queued  → status flips to 'cancelled' immediately
 *   - running → status flips to 'cancelled'; the in-flight tick will
 *     finish writing the current case but won't pick up a new one
 *     (the worker checks `status` between cases via its claim re-read
 *     when the lease is released)
 *   - completed | failed | cancelled → 409 (idempotency)
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { successResponse } from '@/lib/api/responses';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export const POST = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const idParsed = cuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    throw new ValidationError('Invalid run id', { id: ['Must be a valid CUID'] });
  }
  const id = idParsed.data;
  const run = await prisma.aiEvaluationRun.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!run) throw new NotFoundError(`Run ${id} not found`);
  if (TERMINAL.has(run.status)) {
    throw new ConflictError(`Run is already ${run.status}`);
  }

  const cancelled = await prisma.aiEvaluationRun.update({
    where: { id },
    data: { status: 'cancelled', completedAt: new Date(), lockedBy: null, lockedAt: null },
  });
  log.info('Run cancelled', { runId: id, priorStatus: run.status });
  return successResponse(cancelled);
});
