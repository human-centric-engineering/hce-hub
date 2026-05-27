/**
 * Admin Orchestration — Single evaluation run (read).
 *
 * GET /api/v1/admin/orchestration/evaluations/runs/:id
 *   Detail + summary + recent progress. The UI polls this every 3s
 *   while status='running' so per-case results land incrementally.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { successResponse } from '@/lib/api/responses';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { computeGateVerdict } from '@/lib/orchestration/evaluations/gate';
import type { GateConfig } from '@/lib/validations/orchestration-evaluations';

export const GET = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const idParsed = cuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    throw new ValidationError('Invalid run id', { id: ['Must be a valid CUID'] });
  }
  const id = idParsed.data;
  const run = await prisma.aiEvaluationRun.findFirst({
    where: { id, userId: session.user.id },
    include: {
      agent: { select: { id: true, name: true, slug: true } },
      workflow: { select: { id: true, name: true, slug: true } },
      dataset: { select: { id: true, name: true, caseCount: true, contentHash: true } },
      _count: { select: { results: true } },
    },
  });
  if (!run) throw new NotFoundError(`Run ${id} not found`);

  // Phase 4: compute the gate verdict on the fly when both `gateConfig`
  // and a populated `summary` exist. CI callers read `data.gate.passed`
  // directly to exit 0 / non-zero.
  const gate = computeGateVerdict(
    run.gateConfig as GateConfig | null,
    run.summary as {
      stats?: Record<string, { mean?: number | null; passRate?: number | null }>;
    } | null
  );

  log.info('Loaded run', { runId: id, status: run.status, gatePassed: gate?.passed });
  return successResponse({ ...run, gate });
});
