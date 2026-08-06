/**
 * Shared phase-write service (f-phases §22 t1).
 *
 * The core of "create / update a phase" — the write logic behind the dormant
 * `Phase` scaffolding this feature activates (the model, `PhaseStatus` enum and
 * `Feature.phaseId` FK all pre-exist, so there is **no migration**). Extracted
 * here so **both** callers run identical logic with no drift: the
 * `create_phase` / `update_phase` MCP capabilities (t1) and t3's admin REST
 * routes — the same split as `claimFeature()` / `claimTask()`.
 *
 * A `Phase` is **project-scoped organisational structure** with no per-phase
 * owner, so authorization is the plain project-membership funnel
 * (`canAccessProject`, the `member` tier): any member may shape the roadmap, and
 * a non-member — or a phase in a project the caller can't see — is
 * `NotFoundError` (→ 404, never 403; no enumeration). If multi-user use later
 * wants phase management restricted to the lead, tighten the `need` here in one
 * place.
 *
 * Phase edits are **structural, note-style** changes: audit-logged
 * (`logAdminAction`) but NOT journaled as a `ProjectEvent` — there is no phase
 * `ProjectEventKind` and inventing one would be an enum migration this pure-
 * activation feature deliberately avoids (mirrors `update_feature`).
 */
import type { PhaseStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { canAccessProject } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';

/** The mutable fields of a phase (its lifecycle timestamps are derived, not set). */
export interface CreatePhaseInput {
  name: string;
  description?: string | null;
  /** Defaults to `upcoming`. */
  status?: PhaseStatus;
  /** Explicit display position; defaults to appended after the project's last phase. */
  ordinal?: number;
}

export interface CreatePhaseResult {
  phaseId: string;
  ordinal: number;
}

export interface UpdatePhaseInput {
  name?: string;
  description?: string | null;
  status?: PhaseStatus;
  ordinal?: number;
}

export interface UpdatePhaseResult {
  phaseId: string;
  /** The names of the fields actually changed. */
  updated: string[];
}

/**
 * Create a phase in `projectId` for `userId`. Throws `NotFoundError` (→ 404) for
 * a non-member / unknown project. Appends after the project's last phase unless
 * an explicit `ordinal` is given; an `active`/`complete` status stamps the
 * matching lifecycle timestamp on creation.
 */
export async function createPhase(
  userId: string,
  projectId: string,
  input: CreatePhaseInput
): Promise<CreatePhaseResult> {
  const { basis } = await canAccessProject(userId, projectId);
  if (basis === null) throw new NotFoundError(`Project ${projectId} not found`);

  const status: PhaseStatus = input.status ?? 'upcoming';
  const now = new Date();

  const created = await executeTransaction(async (tx) => {
    // Append to the end of the project's phase list unless a position is given.
    // Computed inside the tx so concurrent creates don't collide on ordinal.
    let ordinal = input.ordinal;
    if (ordinal === undefined) {
      const { _max } = await tx.phase.aggregate({
        where: { projectId },
        _max: { ordinal: true },
      });
      ordinal = (_max.ordinal ?? -1) + 1; // first phase → 0
    }
    return tx.phase.create({
      data: {
        projectId,
        name: input.name,
        description: input.description ?? null,
        status,
        ordinal,
        // Derive the lifecycle timestamps from the initial status.
        startedAt: status === 'active' ? now : null,
        completedAt: status === 'complete' ? now : null,
      },
      select: { id: true, ordinal: true },
    });
  });

  logAdminAction({
    userId,
    action: 'phase.create',
    entityType: 'app_phase',
    entityId: created.id,
    entityName: input.name,
    metadata: { projectId, status, ordinal: created.ordinal },
  });

  return { phaseId: created.id, ordinal: created.ordinal };
}

/**
 * Update `phaseId` for `userId` — partial patch of name / description / status /
 * ordinal. Throws `NotFoundError` (→ 404) for an unknown phase or a non-member,
 * and `ValidationError` (→ 400) when no field is supplied. A status transition
 * into `active`/`complete` stamps the matching timestamp if not already set
 * (idempotent — re-setting the same status never re-stamps).
 */
export async function updatePhase(
  userId: string,
  phaseId: string,
  input: UpdatePhaseInput
): Promise<UpdatePhaseResult> {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { projectId: true, status: true, startedAt: true, completedAt: true },
  });
  if (!phase) throw new NotFoundError(`Phase ${phaseId} not found`);

  const { basis } = await canAccessProject(userId, phase.projectId);
  if (basis === null) throw new NotFoundError(`Phase ${phaseId} not found`); // non-member ≡ absent

  const data: Prisma.PhaseUpdateInput = {};
  const updated: string[] = [];
  if (input.name !== undefined) {
    data.name = input.name;
    updated.push('name');
  }
  if (input.description !== undefined) {
    data.description = input.description;
    updated.push('description');
  }
  if (input.ordinal !== undefined) {
    data.ordinal = input.ordinal;
    updated.push('ordinal');
  }
  if (input.status !== undefined) {
    data.status = input.status;
    // Stamp the lifecycle timestamp the first time a phase enters that state.
    if (input.status === 'active' && phase.startedAt === null) data.startedAt = new Date();
    if (input.status === 'complete' && phase.completedAt === null) data.completedAt = new Date();
    updated.push('status');
  }

  if (updated.length === 0) {
    throw new ValidationError('No fields to update were provided.');
  }

  await prisma.phase.update({ where: { id: phaseId }, data });

  logAdminAction({
    userId,
    action: 'phase.update',
    entityType: 'app_phase',
    entityId: phaseId,
    metadata: { projectId: phase.projectId, fields: updated },
  });

  return { phaseId, updated };
}
