/**
 * Admin Orchestration — Registered graders.
 *
 * GET /api/v1/admin/orchestration/evaluations/graders
 *   Returns every grader registered at module load: slug, family,
 *   referenceRequired, defaultConfig, description. The run-creation UI
 *   uses this to render the metric picker without a hard-coded list,
 *   so adding a grader file + barrel line is the only step needed to
 *   make it pickable.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listGraders } from '@/lib/orchestration/evaluations/graders';
import '@/lib/orchestration/evaluations/graders'; // side-effect: register

export const GET = withAdminAuth(async (request) => {
  const log = await getRouteLogger(request);
  const graders = listGraders().map((g) => {
    const entry = {
      slug: g.slug,
      family: g.family,
      description: g.description,
      referenceRequired: 'referenceRequired' in g ? g.referenceRequired : false,
      defaultConfig: (g.defaultConfig ?? null) as unknown,
    };
    return entry;
  });
  log.info('Listed graders', { count: graders.length });
  return successResponse({ graders });
});
