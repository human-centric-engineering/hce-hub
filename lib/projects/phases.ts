/**
 * Project phases read (f-phases §22 t2).
 *
 * Lists a project's phases in display order (`ordinal`, then `createdAt` as the
 * deterministic tie-break — there is no unique(projectId, ordinal), see
 * `phases-service.ts`), each with its feature count. The read behind t3's phase-
 * management UI and the assignment dropdown; the Plan-view grouping (§t2) does its
 * own projection inline in `plan.ts` since it already holds the access grant.
 *
 * Membership is the [[f-access]] funnel's via `getAccessibleProject`, so a
 * **non-member or unknown id is a 404, never a 403** (anti-enumeration).
 */
import type { PhaseStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';

/** A phase row with its current feature count (for the management list). */
export interface PhaseView {
  id: string;
  name: string;
  description: string | null;
  status: PhaseStatus;
  ordinal: number;
  /** Features currently filed under this phase. */
  featureCount: number;
}

/**
 * Load a project's phases for a member, ordinal-ordered, with feature counts.
 * Throws `NotFoundError` (→ 404) for a non-member or unknown id, via
 * `getAccessibleProject`.
 */
export async function listProjectPhases(userId: string, projectId: string): Promise<PhaseView[]> {
  // Access decides visibility (deny ≡ 404); the id is validated as reachable here.
  await getAccessibleProject(userId, projectId);

  const phases = await prisma.phase.findMany({
    where: { projectId },
    orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      ordinal: true,
      _count: { select: { features: true } },
    },
  });

  return phases.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    ordinal: p.ordinal,
    featureCount: p._count.features,
  }));
}
