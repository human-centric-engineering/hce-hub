/**
 * Project membership authorization.
 *
 * Single source of truth for "can this user reach this project?". Every
 * project-scoped read/write, page loader, and Hub capability gates through
 * `canAccessProject` / the funnel helpers here rather than hand-rolling a
 * membership check — an ad-hoc check is how enumeration and data-leak bugs get
 * in. (f-access, feature 04.)
 *
 * The rule: a user can access a project iff they have a `ProjectMember` row for
 * it. That row's `role` is the basis (`lead` | `member`). `Project.leadUserId`
 * is a denormalized pointer, NOT an access source — the "a project's lead also
 * has a `role='lead'` member row" invariant is established at project creation
 * (f-project-admin); membership is decided here from `ProjectMember` alone.
 *
 * Mirrors `lib/orchestration/access/conversation-access.ts`: a structured
 * result where **a non-member is reported identically to a non-existent
 * project** (`basis: null`) so callers translate both to a generic **404, never
 * 403** — distinguishing "not yours" from "doesn't exist" is a project-
 * enumeration vector. A member who lacks the *role* a `need` requires is a
 * different case: they can already see the project, so that is a legitimate
 * 403 (`basis` set, `ok` false). See `.context/app/planning/f-access.md`.
 */

import type { FeaturePlanningStage, FeatureStatus, Project, TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ForbiddenError } from '@/lib/api/errors';

/** A member's role on a project — the basis on which access is granted. */
export type ProjectAccessBasis = 'lead' | 'member';

/**
 * The capability level a caller needs. v1 roles are coarse: any member may
 * `view`/`contribute`; only the lead may `admin`. (`read_only` is reserved in
 * the `ProjectRole` enum for a later access tier and is not issued here.)
 */
export type ProjectAccessNeed = 'view' | 'contribute' | 'admin';

export interface ProjectAccessResult {
  /** True when the caller is a member AND satisfies `need`. */
  ok: boolean;
  /**
   * The caller's role if they are a member of the project (regardless of
   * whether `need` is met), else `null`. `basis === null` ⟺ not a member —
   * indistinguishable from a project that does not exist, by design.
   */
  basis: ProjectAccessBasis | null;
}

// Frozen: this sentinel is returned by reference from every denial, so a caller
// mutating a result must not be able to poison future denials (a 404→403 leak).
const DENY: ProjectAccessResult = Object.freeze({ ok: false, basis: null });

/** Only an `admin` need requires the `lead` role; `view`/`contribute` don't. */
function needsLead(need: ProjectAccessNeed): boolean {
  return need === 'admin';
}

/**
 * Resolve whether `userId` may act on `projectId` at the given `need`, and why.
 *
 * One indexed query (the `@@unique([projectId, userId])` composite). Returns
 * `{ ok: false, basis: null }` for both a non-member and a missing project —
 * deliberately indistinguishable (see file header).
 */
export async function canAccessProject(
  userId: string,
  projectId: string,
  need: ProjectAccessNeed = 'view'
): Promise<ProjectAccessResult> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });

  if (!membership) return DENY; // not a member ≡ project does not exist (to this caller)

  return { ok: !needsLead(need) || membership.role === 'lead', basis: membership.role };
}

/**
 * Throw the correct error when `userId` may not act on `projectId` at `need`;
 * return silently when they may. The guard every project-scoped route/loader
 * runs before touching the resource.
 *
 * - non-member (or missing project) → `NotFoundError` (404, hides existence)
 * - member lacking the required role → `ForbiddenError` (403; they can see it)
 */
export async function requireProjectAccess(
  userId: string,
  projectId: string,
  need: ProjectAccessNeed = 'view'
): Promise<void> {
  const { ok, basis } = await canAccessProject(userId, projectId, need);
  if (basis === null) throw new NotFoundError(`Project ${projectId} not found`);
  if (!ok) throw new ForbiddenError('Insufficient project role');
}

/**
 * Load a single project the caller may access, or throw (404 for a non-member /
 * missing project, 403 for an under-privileged member). The safe "get one
 * project" primitive — access is decided by `canAccessProject`, so the rule
 * lives in exactly one place.
 */
export async function getAccessibleProject(
  userId: string,
  projectId: string,
  need: ProjectAccessNeed = 'view'
): Promise<Project> {
  await requireProjectAccess(userId, projectId, need);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  // Access was just granted; a null here means it was deleted in between — 404.
  if (!project) throw new NotFoundError(`Project ${projectId} not found`);
  return project;
}

/**
 * Load a single project by its **slug OR cuid `id`** (`ref`), for the shareable
 * project URL (`/projects/hce-hub`) — the one seam that accepts a slug; every
 * project-scoped sub-route stays cuid-only and drives off the returned `id`
 * (f-selfhost-cutover §19 t-3, mirroring `getFeatureDetail`'s slug-or-cuid resolve).
 *
 * The 404-not-403 contract holds on a slug miss: an unknown `ref` and a `ref` the
 * caller can't access both throw `NotFoundError` — the existence check happens
 * before the access check, but nothing is returned until access is granted, so
 * neither reveals a project the caller shouldn't see.
 */
export async function getAccessibleProjectByRef(
  userId: string,
  ref: string,
  need: ProjectAccessNeed = 'view'
): Promise<Project> {
  const project = await prisma.project.findFirst({ where: { OR: [{ id: ref }, { slug: ref }] } });
  if (!project) throw new NotFoundError(`Project ${ref} not found`);
  // Resolved to a real project — now gate on membership by its canonical id.
  await requireProjectAccess(userId, project.id, need);
  return project;
}

/**
 * The projects `userId` is a member of, newest first. The membership-scoped
 * list every "my projects" surface uses — never `prisma.project.findMany()`
 * unfiltered.
 */
export async function listAccessibleProjects(userId: string): Promise<Project[]> {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * The ids of the projects `userId` may access — the scoping primitive that
 * feature/task/other project-child queries build their `where` on
 * (`where: { projectId: { in: await accessibleProjectIds(userId) } }`), so
 * membership is enforced without a per-row round-trip.
 */
export async function accessibleProjectIds(userId: string): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/** How much authority a feature-scoped write requires. */
export type FeatureWriteMode =
  | 'member' // any project member (e.g. drop a backlog thought)
  | 'owner'; // the feature's owner or a project lead (e.g. promote a task, toggle help-wanted)

/** The feature's write-relevant fields + the caller's role, once access is granted. */
export interface FeatureAccess {
  projectId: string;
  ownerUserId: string | null;
  status: FeatureStatus;
  /** Depth axis: `indicative` sketch vs `planned` (real tasks materialised). */
  planningStage: FeaturePlanningStage;
  helpWanted: boolean;
  /**
   * The completion boundary, `null` until shipped (f-work-kinds §32 t-79). Loaded
   * here so `ship_feature` can preserve the FIRST ship on a re-run instead of
   * moving the boundary forward.
   */
  shippedAt: Date | null;
  basis: ProjectAccessBasis;
}

export type FeatureAccessResult =
  { ok: true; feature: FeatureAccess } | { ok: false; reason: 'not_found' | 'forbidden' };

/**
 * Resolve whether `userId` may write to `featureId` at the given `mode`, and
 * load the feature's write-relevant fields — the funnel every feature-scoped
 * write capability (`create_task`, `add_backlog`, `flag_help_wanted`) runs
 * before mutating.
 *
 * Membership is decided from the feature's project via `canAccessProject`, so a
 * **non-member is reported as `not_found`** (a missing feature and one in a
 * project you can't see are indistinguishable — no enumeration). A member who
 * lacks the `owner` authority is `forbidden` (they can already see the project).
 */
export async function resolveFeatureAccess(
  userId: string,
  featureId: string,
  mode: FeatureWriteMode = 'member',
  expectedProjectId?: string
): Promise<FeatureAccessResult> {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    select: {
      projectId: true,
      ownerUserId: true,
      status: true,
      planningStage: true,
      helpWanted: true,
      shippedAt: true,
    },
  });
  if (!feature) return { ok: false, reason: 'not_found' };

  // Cross-project guard: when a project scope is supplied (a project-scoped MCP
  // key, or a nested REST route), a feature outside it is `not_found` — before
  // the membership check, so it's indistinguishable from a missing feature and
  // matches the `claimFeature` / `updateIdea` expectedProjectId convention.
  if (expectedProjectId && feature.projectId !== expectedProjectId) {
    return { ok: false, reason: 'not_found' };
  }

  const { basis } = await canAccessProject(userId, feature.projectId);
  if (basis === null) return { ok: false, reason: 'not_found' }; // non-member ≡ feature does not exist

  if (mode === 'owner' && feature.ownerUserId !== userId && basis !== 'lead') {
    return { ok: false, reason: 'forbidden' }; // a member, but not the owner/lead
  }

  return {
    ok: true,
    feature: {
      projectId: feature.projectId,
      ownerUserId: feature.ownerUserId,
      status: feature.status,
      planningStage: feature.planningStage,
      helpWanted: feature.helpWanted,
      shippedAt: feature.shippedAt,
      basis,
    },
  };
}

/**
 * The resolved scope of an authored journal entry (`record_decision` /
 * `add_note`, f-journal §17 t-2): the project it lands on, and the feature it
 * concerns (or null for a project/epic-level entry).
 */
export type EventScopeResult =
  { ok: true; projectId: string; featureId: string | null } | { ok: false };

/**
 * Resolve (and authorize) the project/feature scope for an authored journal
 * entry through the same membership funnel — never hand-rolled. A `featureId`
 * **takes precedence** and derives its *own* project, so an entry can't be
 * mis-scoped to a project the feature isn't in; otherwise a `projectId` gives a
 * project-level entry. When **both** are supplied (a project-scoped MCP key
 * folds its `projectId` in alongside a `featureId`), the feature must belong to
 * that project — else `{ ok: false }`, so a scoped key can't journal onto a
 * feature outside its project. A non-member — or neither id supplied — resolves
 * to `{ ok: false }` (the caller maps it to `not_found`, no enumeration). Any
 * member may author (the `member` tier); there is no owner gate on narrative.
 */
export async function resolveEventScope(
  userId: string,
  scope: { projectId?: string; featureId?: string }
): Promise<EventScopeResult> {
  if (scope.featureId) {
    // Forward any supplied projectId as the cross-project guard: the feature
    // must live in it (scoped-key isolation + a plain id-mix-up guard). A
    // scoped MCP key folds its projectId in alongside the featureId.
    const access = await resolveFeatureAccess(userId, scope.featureId, 'member', scope.projectId);
    if (!access.ok) return { ok: false };
    return { ok: true, projectId: access.feature.projectId, featureId: scope.featureId };
  }
  if (scope.projectId) {
    const { basis } = await canAccessProject(userId, scope.projectId);
    if (basis === null) return { ok: false };
    return { ok: true, projectId: scope.projectId, featureId: null };
  }
  return { ok: false };
}

/** A task's claim-relevant fields + the caller's role, once access is granted. */
export interface TaskAccess {
  taskId: string;
  /** Project-wide `t-N`; `null` until assigned (f-refs). */
  number: number | null;
  featureId: string;
  projectId: string;
  status: TaskStatus;
  claimedByUserId: string | null;
  filesScope: string[];
  basis: ProjectAccessBasis;
}

export type TaskAccessResult = { ok: true; task: TaskAccess } | { ok: false; reason: 'not_found' };

/**
 * Resolve whether `userId` may act on `taskId` (claim it) and load the task's
 * claim-relevant fields. **Any project member may claim** — claiming is the
 * collaborative pull action (§5, pull-not-push), so there is no owner tier here;
 * the only denial is `not_found` (missing task, or one in a project the caller
 * can't see — indistinguishable, no enumeration).
 */
export async function resolveTaskAccess(userId: string, taskId: string): Promise<TaskAccessResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      number: true,
      featureId: true,
      status: true,
      claimedByUserId: true,
      filesScope: true,
      feature: { select: { projectId: true } },
    },
  });
  if (!task) return { ok: false, reason: 'not_found' };

  const { basis } = await canAccessProject(userId, task.feature.projectId);
  if (basis === null) return { ok: false, reason: 'not_found' }; // non-member ≡ task does not exist

  return {
    ok: true,
    task: {
      taskId: task.id,
      number: task.number,
      featureId: task.featureId,
      projectId: task.feature.projectId,
      status: task.status,
      claimedByUserId: task.claimedByUserId,
      filesScope: task.filesScope,
      basis,
    },
  };
}
