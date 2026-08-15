/**
 * Project Plan read (f-plan-view, feature 09).
 *
 * The **feature-tree** read the Plan view renders — the feature/task read
 * deferred from f-projects §08 (which shipped header + counts only). Returns one
 * project's features in `planOrder()`, each with its dependency chips, its task
 * table, and resolved owner/claimer identities — the single enriched payload the
 * `/plan` endpoint serves in one request (no N+1).
 *
 * Membership is the [[f-access]] funnel's, not re-implemented here: the load
 * goes through `getAccessibleProject`, so a **non-member or unknown id is a 404,
 * never a 403** (anti-enumeration). Task status is the shared
 * `computeEffectiveStatus` (so the Plan and the §10 Board never diverge), and
 * every nullable `user` ref resolves to `UserRef | null` (rendered as
 * "unassigned / former member" — carried f-data-model t-3 finding), never
 * dereferenced.
 */
import type { FeaturePlanningStage, PhaseStatus, TaskKind } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import {
  computeEffectiveStatus,
  taskHolderId,
  type EffectiveStatus,
} from '@/lib/projects/task-status';
import { computeFeatureProgress, type ProgressTaskInput } from '@/lib/projects/feature-progress';
import {
  computeFeatureStatus,
  type EffectiveFeatureStatus,
  type WaitingOnRef,
} from '@/lib/projects/feature-status';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';
import { planOrder } from '@/lib/projects/plan-order';

/** A depended-on feature, for the "depends on …" chips (slug, with title fallback). */
export interface PlanDependencyRef {
  id: string;
  /** Authored short key (`f-access`); `null` until authored → render falls back to title. */
  slug: string | null;
  title: string;
}

/** A task row in a feature's inset table. */
export interface PlanTaskView {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  /** Effective status (via `computeEffectiveStatus`) — matches the §10 Board. */
  status: EffectiveStatus;
  /** `bug` (a defect, styled distinctly + surfaced as a fix) vs `feature_work` (f-bug-handling §22-02). */
  kind: TaskKind;
  prUrl: string | null;
  /**
   * The person shown against the task (via `taskHolderId`, f-task-assignment §22
   * t2): the **assignee** while the task is open, the **doer** (claimant) once
   * merged. `null` when unassigned or the resolved user was erased.
   */
  claimer: UserRef | null;
}

/** An indicative-task sketch bullet on a not-yet-planned feature (§18). */
export interface PlanIndicativeTaskView {
  id: string;
  order: number;
  text: string;
}

/** A feature row in the Plan view. */
export interface PlanFeatureView {
  id: string;
  /** Project-wide stable ordinal, rendered `§N`; `null` until assigned. */
  number: number | null;
  /** Authored short key (`f-mcp`); `null` until authored. */
  slug: string | null;
  title: string;
  /** Short plain one-liner for the row; falls back to `description` when unset (§21 t-d). */
  summary: string | null;
  description: string | null;
  /** Readiness-derived status (via `computeFeatureStatus`) — never raw `planning`. */
  status: EffectiveFeatureStatus;
  /** For a `blocked` feature: the unshipped dependencies it's waiting on. */
  waitingOn: WaitingOnRef[];
  /** Depth axis: `indicative` sketch vs `planned` (real tasks) — §18. */
  planningStage: FeaturePlanningStage;
  helpWanted: boolean;
  /** `null` when unowned or the owner was erased. */
  owner: UserRef | null;
  dependsOn: PlanDependencyRef[];
  tasks: PlanTaskView[];
  /** The high-level sketch, shown while `indicative` (empty once planned). */
  indicativeTasks: PlanIndicativeTaskView[];
  /**
   * Progress off *effective* status (so a feature's counts match its task rows):
   * `merged`/`total`, `live` (actively being worked — effective `active`) and
   * `blocked` (a claimed task waiting on an unmerged dependency). Kind-aware:
   * `bug`-kind tasks are excluded from these completion counts and tallied
   * separately as `openFixes` (f-bug-handling §22-02).
   */
  progress: {
    merged: number;
    total: number;
    live: number;
    blocked: number;
    openFixes: number;
    openSinceShip: number;
    unstartedSinceShip: number;
  };
}

/**
 * A phase band on the Plan — a group of features filed under one phase (f-phases
 * §22 t2). Features inside keep their project-wide `planOrder()`. The residual
 * band (`id: null`) collects features not yet filed under any phase.
 */
export interface PlanPhaseBand {
  /** Phase id, or `null` for the residual "no phase" band. */
  id: string | null;
  /** Phase name, or `null` for the residual band. */
  name: string | null;
  /** `null` for the residual band; `parked` bands are rendered collapsed. */
  status: PhaseStatus | null;
  /**
   * The phase's authored intent — why this grouping exists (f-work-kinds §32
   * t-80). Written since f-phases §22 and carried here so it can finally be
   * rendered and projected; `null` for the residual band, which nobody authored.
   */
  description: string | null;
  /** Display position; `null` for the residual band. */
  ordinal: number | null;
  features: PlanFeatureView[];
}

/**
 * The Plan view's payload — features grouped into phase bands (f-phases §22 t2).
 * Band order: every real phase in ordinal order (the manage dialog's order — a
 * `parked` phase sits where its ordinal puts it, just collapsed), then the
 * residual "no phase" band last (only if it has features). A project with no
 * phases yields a single residual band = the flat plan-ordered list.
 */
export interface ProjectPlan {
  projectId: string;
  /** The project's slug (`hce-hub`) — feature-page links prefer it; `null` → falls back to `projectId`. */
  projectSlug: string | null;
  phases: PlanPhaseBand[];
}

/**
 * Load one project's Plan view for a member. Throws `NotFoundError` (→ 404) for a
 * non-member or unknown id, via `getAccessibleProject`.
 */
export async function getProjectPlan(userId: string, projectId: string): Promise<ProjectPlan> {
  // Access decides visibility (deny ≡ 404); reuse the project for its slug (the
  // feature-page links the Plan renders prefer the human slug — §19).
  const project = await getAccessibleProject(userId, projectId);

  // The feature tree and the project's phases are independent given the (already
  // authorized) projectId, so dispatch the phases read now and let it run
  // concurrently with the feature read below — one round-trip's latency, not two.
  const phasesPromise = prisma.phase.findMany({
    where: { projectId },
    orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, status: true, ordinal: true, description: true },
  });

  const features = await prisma.feature.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      number: true,
      slug: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      planningStage: true,
      helpWanted: true,
      ownerUserId: true,
      phaseId: true,
      shippedAt: true, // the completion boundary progress is measured against (§32 t-79)
      dependencies: { select: { dependsOnFeatureId: true } },
      indicativeTasks: {
        orderBy: { order: 'asc' },
        select: { id: true, order: true, text: true },
      },
      tasks: {
        // Numerical order — tasks are built sequentially (f-status-model §20).
        // Unnumbered (null) tasks sort last, then by creation for a stable tie.
        orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          kind: true,
          createdAt: true, // placed against the feature's shippedAt (§32 t-79)
          prUrl: true,
          claimedByUserId: true,
          assigneeUserId: true,
          dependencies: { select: { dependsOn: { select: { status: true } } } },
        },
      },
    },
  });

  // One batched identity lookup for every owner + task holder across the tree
  // (a holder is the assignee or the claimant — `taskHolderId`, resolved below).
  const userIds = features.flatMap((f) => [
    ...(f.ownerUserId ? [f.ownerUserId] : []),
    ...f.tasks.flatMap((t) => [
      ...(t.claimedByUserId ? [t.claimedByUserId] : []),
      ...(t.assigneeUserId ? [t.assigneeUserId] : []),
    ]),
  ]);
  const users = await fetchUsers(userIds);

  // Slug + title (chips) + stored status (readiness derivation) for every
  // feature — every dependency edge points at a feature in the same project, so
  // resolve from the loaded set (no extra query, no N+1).
  const metaById = new Map(
    features.map((f) => [f.id, { slug: f.slug, title: f.title, status: f.status }])
  );

  const views: PlanFeatureView[] = features.map((f) => {
    // Progress needs each task's `createdAt` (to place it against the ship
    // boundary) alongside the *derived* status the rows render. Accumulated here
    // rather than zipped with `f.tasks` afterwards, so the pairing survives any
    // later filter or reorder of the view list.
    const progressInput: ProgressTaskInput[] = [];
    const tasks: PlanTaskView[] = f.tasks.map((t) => {
      const status = computeEffectiveStatus(
        t,
        t.dependencies.map((d) => d.dependsOn)
      );
      progressInput.push({ status, kind: t.kind, createdAt: t.createdAt });
      // Show the assignee while open, the doer once merged (f-task-assignment §22 t2).
      const holderId = taskHolderId(status, t.claimedByUserId, t.assigneeUserId);
      return {
        id: t.id,
        number: t.number,
        title: t.title,
        status,
        kind: t.kind,
        prUrl: t.prUrl,
        claimer: holderId ? (users.get(holderId) ?? null) : null,
      };
    });

    // Progress reads off the SAME effective status the rows render (§09 carry):
    // a dep-blocked task counts as `blocked`, never `live`, so a feature's
    // summary can't disagree with its own task table. `bug` tasks are excluded
    // from completion and tallied as `openFixes` (f-bug-handling §22-02) — an
    // open bug must not make a shipped feature read "3/4 merged" — and, past
    // `shippedAt`, no task counts toward completion at all (f-work-kinds §32 t-79).
    const progress = computeFeatureProgress(progressInput, f.shippedAt);

    // Readiness-derived feature status: `planning` becomes `available`/`blocked`
    // from the loaded dependency statuses (`in_flight`/`shipped` pass through).
    const deps = f.dependencies
      .map((d) => metaById.get(d.dependsOnFeatureId))
      .filter((m): m is NonNullable<typeof m> => m != null);
    const { status: effectiveStatus, waitingOn } = computeFeatureStatus(f.status, deps);

    return {
      id: f.id,
      number: f.number,
      slug: f.slug,
      title: f.title,
      summary: f.summary,
      description: f.description,
      status: effectiveStatus,
      waitingOn,
      planningStage: f.planningStage,
      helpWanted: f.helpWanted,
      owner: f.ownerUserId ? (users.get(f.ownerUserId) ?? null) : null,
      dependsOn: f.dependencies
        .map((d) => {
          const meta = metaById.get(d.dependsOnFeatureId);
          return meta ? { id: d.dependsOnFeatureId, slug: meta.slug, title: meta.title } : null;
        })
        .filter((d): d is PlanDependencyRef => d !== null),
      tasks,
      indicativeTasks: f.indicativeTasks,
      progress,
    };
  });

  // Ordering bands on the *stored* status (unchanged, `planOrder`'s STATUS_BAND) —
  // the derived `available`/`blocked` are presentation only. Take it from the raw
  // rows so the derived-status views don't feed the ordering.
  const ordered = planOrder(
    features.map((f) => ({
      id: f.id,
      status: f.status,
      dependsOn: f.dependencies.map((d) => d.dependsOnFeatureId),
    }))
  );
  const viewById = new Map(views.map((v) => [v.id, v]));
  // `planOrder` returns the same ids it was given → every lookup resolves.
  const orderedViews = ordered.map((o) => viewById.get(o.id)!);

  // Await the phases dispatched up-front, and map each feature's membership —
  // the two inputs the grouping needs (ordinal-ordered, tie → createdAt).
  const phases = await phasesPromise;
  const phaseIdByFeature = new Map(features.map((f) => [f.id, f.phaseId]));

  return {
    projectId,
    projectSlug: project.slug,
    phases: groupIntoPhaseBands(orderedViews, phaseIdByFeature, phases),
  };
}

/**
 * Partition the plan-ordered features into phase bands. Non-parked phases come
 * in **true ordinal order** (`parked` ones sit where their ordinal puts them —
 * the client still collapses them by default — so the manage dialog's reorder is
 * honoured exactly), then the residual "no phase" catch-all **last** (only if it
 * has features). Empty real phases are kept so the roadmap skeleton stays visible;
 * an empty residual is dropped. A feature whose `phaseId` points outside the loaded
 * phase set (a mid-read delete) falls into the residual band — never dropped.
 */
/** The phase-row projection the grouping consumes (matches the `phases` select). */
type PhaseRow = {
  id: string;
  name: string;
  status: PhaseStatus;
  ordinal: number;
  description: string | null;
};

function groupIntoPhaseBands(
  orderedViews: PlanFeatureView[],
  phaseIdByFeature: Map<string, string | null>,
  phases: PhaseRow[]
): PlanPhaseBand[] {
  const known = new Set(phases.map((p) => p.id));
  const byPhase = new Map<string, PlanFeatureView[]>();
  const residual: PlanFeatureView[] = [];
  for (const v of orderedViews) {
    const pid = phaseIdByFeature.get(v.id) ?? null;
    if (pid !== null && known.has(pid)) {
      const arr = byPhase.get(pid);
      if (arr) arr.push(v);
      else byPhase.set(pid, [v]);
    } else {
      residual.push(v);
    }
  }

  // Real phases in ordinal order (the `phases` query is already sorted), then the
  // residual catch-all last. No parked-to-bottom reshuffle — the plan mirrors the
  // dialog's order, and `parked`/`complete` are hidden via the band's collapse.
  const bands: PlanPhaseBand[] = phases.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    ordinal: p.ordinal,
    description: p.description,
    features: byPhase.get(p.id) ?? [],
  }));
  if (residual.length > 0) {
    bands.push({
      id: null,
      name: null,
      status: null,
      ordinal: null,
      description: null,
      features: residual,
    });
  }
  return bands;
}
