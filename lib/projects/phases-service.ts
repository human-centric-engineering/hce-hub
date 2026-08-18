/**
 * Shared phase-write service (f-phases §22 t1).
 *
 * The write logic behind the dormant `Phase` scaffolding this feature activates
 * (the model, `PhaseStatus` enum and `Feature.phaseId` FK all pre-exist, so there
 * is **no migration**): create / update a phase (t1), plus **reorder** phases and
 * **assign** a feature to a phase (t3). Extracted here so **both** callers run
 * identical logic with no drift: the `create_phase` / `update_phase` MCP
 * capabilities and t3's REST routes — the same split as `claimFeature()`.
 *
 * A `Phase` is **project-scoped organisational structure** with no per-phase
 * owner, so authorization is the plain project-membership funnel
 * (`canAccessProject`, the `member` tier): any member may shape the roadmap, and
 * a non-member — or a phase in a project the caller can't see — is
 * `NotFoundError` (→ 404, never 403; no enumeration). If multi-user use later
 * wants phase management restricted to the lead, tighten the `need` here in one
 * place.
 *
 * Phase edits are audit-logged (`logAdminAction`) **and**, since f-phase-history
 * §33 t-98, journaled as `ProjectEvent`s so a change appends instead of
 * overwriting. The emitters live in `lib/projects/phase-events.ts` because three
 * further phase-write paths (`create_feature`, `create_task`, `update_task` and
 * `update_feature`) never come through this file. `reorderPhases` is the one
 * write that stays unjournalled: ordering is presentation, not history.
 */
import type { PhaseStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { canAccessProject, resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { resolveIdeaOnPromotion } from '@/lib/projects/idea-promotion';
import {
  recordPhaseCreated,
  recordPhaseMembershipChange,
  recordPhaseUpdated,
} from '@/lib/projects/phase-events';

/** The mutable fields of a phase (its lifecycle timestamps are derived, not set). */
export interface CreatePhaseInput {
  name: string;
  description?: string | null;
  /** Defaults to `upcoming`. */
  status?: PhaseStatus;
  /** Explicit display position; defaults to appended after the project's last phase. */
  ordinal?: number;
  /**
   * Optional: the id of an OPEN idea in this project being promoted into this
   * phase. Marked promoted and linked atomically in the create tx. The caller
   * (the `create_phase` capability) pre-checks it; here it is the in-tx resolve.
   */
  fromIdeaId?: string;
}

export interface CreatePhaseResult {
  phaseId: string;
  ordinal: number;
}

export interface UpdatePhaseInput {
  name?: string;
  description?: string | null;
  status?: PhaseStatus;
  // No `ordinal` — order is changed only via `reorderPhases` (batch, collision-free).
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
    // Append after the project's current last phase unless a position is given.
    // Best-effort: there is no unique(projectId, ordinal) constraint, so a rare
    // concurrent create (or an explicit ordinal) can duplicate a position; reads
    // break ties deterministically (ordinal, then createdAt). A hardened reorder
    // with a uniqueness guarantee lands in t3.
    let ordinal = input.ordinal;
    if (ordinal === undefined) {
      const { _max } = await tx.phase.aggregate({
        where: { projectId },
        _max: { ordinal: true },
      });
      ordinal = (_max.ordinal ?? -1) + 1; // first phase → 0
    }
    const phase = await tx.phase.create({
      data: {
        projectId,
        name: input.name,
        description: input.description ?? null,
        status,
        ordinal,
        // Derive the lifecycle timestamps from the initial status, keeping the
        // invariant: completedAt set ⟺ complete, and startedAt set once the phase
        // has begun — so a phase created straight into `complete` still records a
        // start (never complete-with-null-start).
        startedAt: status === 'active' || status === 'complete' ? now : null,
        completedAt: status === 'complete' ? now : null,
      },
      select: { id: true, ordinal: true },
    });
    // Promotion: mark the source idea promoted into this phase, atomically.
    if (input.fromIdeaId !== undefined) {
      await resolveIdeaOnPromotion(tx, {
        ideaId: input.fromIdeaId,
        projectId,
        kind: 'phase',
        refId: phase.id,
      });
    }
    // Journal inside the same transaction — the event exists iff the phase does.
    await recordPhaseCreated(tx, {
      projectId,
      actorUserId: userId,
      phaseId: phase.id,
      name: input.name,
      status,
    });
    return phase;
  });

  logAdminAction({
    userId,
    action: 'phase.create',
    entityType: 'app_phase',
    entityId: created.id,
    entityName: input.name,
    metadata: {
      projectId,
      status,
      ordinal: created.ordinal,
      ...(input.fromIdeaId ? { fromIdeaId: input.fromIdeaId } : {}),
    },
  });

  return { phaseId: created.id, ordinal: created.ordinal };
}

/**
 * Update `phaseId` for `userId` — partial patch of name / description / status
 * (reordering is a separate batch op). Throws `NotFoundError` (→ 404) for an
 * unknown phase or a non-member,
 * and `ValidationError` (→ 400) when no field is supplied. A status transition
 * into `active`/`complete` stamps the matching timestamp if not already set
 * (idempotent — re-setting the same status never re-stamps).
 */
export async function updatePhase(
  userId: string,
  phaseId: string,
  input: UpdatePhaseInput,
  expectedProjectId?: string
): Promise<UpdatePhaseResult> {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { projectId: true, status: true, startedAt: true, completedAt: true },
  });
  if (!phase) throw new NotFoundError(`Phase ${phaseId} not found`);
  // Scope to the route's project when asked (no cross-project id-swap).
  if (expectedProjectId && phase.projectId !== expectedProjectId) {
    throw new NotFoundError(`Phase ${phaseId} not found`);
  }

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
  if (input.status !== undefined) {
    data.status = input.status;
    // Keep the lifecycle timestamps coherent with the resulting status:
    //   completedAt set ⟺ status is complete (reopening clears it, no stale "done"),
    //   startedAt persists once the phase has begun (stamped on the first
    //   active/complete, never un-stamped) — so it's never complete-with-null-start.
    const now = new Date();
    if (input.status === 'complete') {
      data.completedAt = phase.completedAt ?? now;
      if (phase.startedAt === null) data.startedAt = now;
    } else {
      if (phase.completedAt !== null) data.completedAt = null; // reopened → drop the done stamp
      if (input.status === 'active' && phase.startedAt === null) data.startedAt = now;
    }
    updated.push('status');
  }

  if (updated.length === 0) {
    throw new ValidationError('No fields to update were provided.');
  }

  // One transaction so the journal entry commits iff the edit did (§33 t-98).
  await executeTransaction(async (tx) => {
    await tx.phase.update({ where: { id: phaseId }, data });
    await recordPhaseUpdated(tx, {
      projectId: phase.projectId,
      actorUserId: userId,
      phaseId,
      fields: updated,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
  });

  logAdminAction({
    userId,
    action: 'phase.update',
    entityType: 'app_phase',
    entityId: phaseId,
    metadata: { projectId: phase.projectId, fields: updated },
  });

  return { phaseId, updated };
}

/**
 * Reorder a project's phases (f-phases §22 t3). **Batch** by design: the caller
 * supplies the complete, new order of the project's phase ids and the service
 * reassigns ordinals `0..n-1` straight down the list in one transaction — so the
 * sequence is always dense and collision-free (there is no
 * `@@unique(projectId, ordinal)`, and this is why we don't need one). The list
 * must be *exactly* the project's phases (every id, no strangers): a partial list
 * would leave the unlisted phases with stale ordinals that collide with the new
 * ones. Member-tier (any member may organise the roadmap); non-member → 404.
 */
export async function reorderPhases(
  userId: string,
  projectId: string,
  orderedPhaseIds: string[]
): Promise<{ projectId: string; count: number }> {
  const { basis } = await canAccessProject(userId, projectId);
  if (basis === null) throw new NotFoundError(`Project ${projectId} not found`);

  const ordered = [...new Set(orderedPhaseIds)];

  // Validate completeness and rewrite ordinals in ONE transaction, so a phase
  // created/deleted between the two can't cause a stale-ordinal collision or a raw
  // P2025 500: the read and the writes see one consistent snapshot. A phase deleted
  // just before → the exact-set check fails cleanly (ValidationError → 400).
  await executeTransaction(async (tx) => {
    const existing = await tx.phase.findMany({ where: { projectId }, select: { id: true } });
    const existingIds = new Set(existing.map((p) => p.id));
    // The list must be the project's exact phase set — same size, every id present.
    const complete =
      ordered.length === existingIds.size && ordered.every((id) => existingIds.has(id));
    if (!complete) {
      throw new ValidationError('The reorder must list exactly this project’s phases, once each.');
    }
    for (let i = 0; i < ordered.length; i++) {
      await tx.phase.update({ where: { id: ordered[i] }, data: { ordinal: i } });
    }
  });

  logAdminAction({
    userId,
    action: 'phase.reorder',
    entityType: 'app_phase',
    entityId: projectId,
    metadata: { projectId, order: ordered },
  });

  return { projectId, count: ordered.length };
}

/**
 * Resolve `phaseId` **within** `projectId` — the one same-project guard every
 * phase-assignment path shares: `assignFeatureToPhase` (below), `create_feature`,
 * `update_feature`, and — since f-work-kinds §32 t-80 — `create_task` /
 * `update_task`. Extracted because the query had already been hand-copied twice
 * before that task would have made it four times, and a hand-copied rule is one
 * that drifts (the stale-enum-copy failure f-phases spent two review rounds on).
 *
 * Returns the phase (`null` when it is absent or belongs elsewhere) rather than
 * throwing, so each caller keeps its own idiom — `ValidationError` in the
 * service, a capability `invalid_phase` error over MCP. It returns the row and
 * not a boolean because since §33 t-98 every one of those callers also journals
 * the move, and the journal snapshots the phase's **name** as it was at the time
 * (see `phase-events.ts`); a boolean would have meant a second read on every
 * assignment purely to fetch it.
 */
export async function findProjectPhase(
  phaseId: string,
  projectId: string
): Promise<{ id: string; name: string } | null> {
  return prisma.phase.findFirst({
    where: { id: phaseId, projectId },
    select: { id: true, name: true },
  });
}

/**
 * File a feature under a phase, or unfile it (`phaseId: null`) — f-phases §22 t3.
 * **Member-tier**: filing is collaborative roadmap organisation (like
 * `create_feature` and phase CRUD), NOT editing the feature's authored content,
 * so any project member may file *any* feature — not just its owner. (The
 * owner-tier `update_feature.phaseId` path stays for comprehensive edits.) The
 * phase must belong to the feature's own project. `expectedProjectId`, when
 * given, scopes the feature to that project so a REST route can reject a
 * cross-project id-swap. Non-member / unknown feature → 404 (no enumeration).
 */
export async function assignFeatureToPhase(
  userId: string,
  featureId: string,
  phaseId: string | null,
  expectedProjectId?: string
): Promise<{ featureId: string; phaseId: string | null }> {
  const access = await resolveFeatureAccess(userId, featureId, 'member');
  if (!access.ok) throw new NotFoundError(`Feature ${featureId} not found`);
  const projectId = access.feature.projectId;
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new NotFoundError(`Feature ${featureId} not found`);
  }

  let target: { id: string; name: string } | null = null;
  if (phaseId !== null) {
    target = await findProjectPhase(phaseId, projectId);
    if (!target) throw new ValidationError('That phase was not found in this project.');
  }

  // One transaction so the journal entry commits iff the move did (§33 t-98).
  await executeTransaction(async (tx) => {
    // The phase being REPLACED is read inside the transaction, not from the
    // earlier access resolve: `fromPhaseId` must be the value this write actually
    // overwrote, and an access read taken before the transaction can be stale by
    // the time it commits. This is history — a plausible previous value is worse
    // than none.
    const before = await tx.feature.findUnique({
      where: { id: featureId },
      select: { phase: { select: { id: true, name: true } } },
    });
    await tx.feature.update({
      where: { id: featureId },
      // A relation FK — Prisma's update input takes the nested connect/disconnect.
      data: { phase: phaseId === null ? { disconnect: true } : { connect: { id: phaseId } } },
    });
    // A no-op re-file (already in this phase) records nothing — see phase-events.
    await recordPhaseMembershipChange(tx, {
      projectId,
      actorUserId: userId,
      subject: 'feature',
      featureId,
      from: before?.phase ?? null,
      to: target,
    });
  });

  logAdminAction({
    userId,
    action: 'feature.assign_phase',
    entityType: 'app_feature',
    entityId: featureId,
    metadata: { projectId, phaseId },
  });

  return { featureId, phaseId };
}
