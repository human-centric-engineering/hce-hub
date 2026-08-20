/**
 * Consumer — project phases: list + create (f-phases §22 t3)
 *
 * GET  /api/v1/projects/:id/phases — the project's phases, ordinal-ordered, with
 *   feature counts (the management dialog + the assign picker read this).
 * POST /api/v1/projects/:id/phases — create a phase (name required; optional
 *   description / status / ordinal). Appends to the end unless an ordinal is given.
 *
 * Fork-owned. Auth + the automatic per-section cap come from `withAuth`. Both go
 * through the [[f-access]] funnel (`member` tier — phases are collaborative
 * structure): a non-member or unknown id is a **404, never 403**. The HTTP face of
 * the same `listProjectPhases` / `createPhase` cores the read + `create_phase` MCP
 * capability run, so they never drift.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { listProjectPhases } from '@/lib/projects/phases';
import { createPhase } from '@/lib/projects/phases-service';

export const GET = withAuth<{ id: string }>(async (_request, session, { params }) => {
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);
  const phases = await listProjectPhases(session.user.id, id);
  return successResponse({ phases });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Plain text, and shorter than `description` on purpose — it is the one line the
  // Plan band renders (§33-sweep t-104).
  summary: z.string().max(300).nullish(),
  description: z.string().max(2000).nullish(),
  status: z.enum(['upcoming', 'active', 'complete', 'parked']).optional(),
  ordinal: z.number().int().min(0).optional(),
});

export const POST = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('A phase name (1–200 chars) is required.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const result = await createPhase(session.user.id, id, {
    name: parsed.data.name,
    summary: parsed.data.summary,
    description: parsed.data.description,
    status: parsed.data.status,
    ordinal: parsed.data.ordinal,
  });

  log.info('Phase created', { userId: session.user.id, projectId: id, phaseId: result.phaseId });
  return successResponse(result);
});
