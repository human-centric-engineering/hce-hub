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
import type { FeaturePlanningStage, FeatureStatus, PhaseStatus, TaskKind } from '@prisma/client';
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
import { planOrder, byCompletionOrder } from '@/lib/projects/plan-order';

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
  /** `bug` (a defect, styled distinctly + surfaced on the active-bugs strip) vs `feature_work` (f-bug-handling §22-02). */
  kind: TaskKind;
  prUrl: string | null;
  /**
   * The person shown against the task (via `taskHolderId`, f-task-assignment §22
   * t2): the **assignee** while the task is open, the **doer** (claimant) once
   * merged. `null` when unassigned or the resolved user was erased.
   */
  claimer: UserRef | null;
  /**
   * The phase that **borrowed** this task, when it isn't its feature's own (§32
   * t-95) — the reciprocal of the borrowed row rendered in that phase's band.
   * `null` for the overwhelming majority, which simply inherit.
   *
   * Shown on the task's row here so a feature owner isn't blind to work happening
   * on their feature under another phase's banner. Deliberately per-task rather
   * than a count on the feature's summary line: that line's markers have to stay
   * disjoint (§32 t-94), and "which phase" is the useful part anyway.
   */
  committedPhaseName: string | null;
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
   * separately as `openBugs` (f-bug-handling §22-02).
   */
  progress: {
    merged: number;
    total: number;
    live: number;
    blocked: number;
    openBugs: number;
    openSinceShip: number;
    unstartedSinceShip: number;
  };
}

/**
 * A task **borrowed** into a phase band — one whose `Task.phaseId` names a phase
 * other than its feature's, i.e. work this phase *chose* to do on someone else's
 * feature (§32 t-95).
 *
 * It renders at both ends: here, inline in the borrowing band, and unchanged in its
 * origin feature's own task table. Carries the origin refs so the row can say where
 * it came from — `f-status-model · Foundations (V1) ↩`, the active-bugs strip's
 * breadcrumb pattern.
 */
export interface PlanBorrowedTask {
  id: string;
  number: number | null;
  title: string;
  status: EffectiveStatus;
  kind: TaskKind;
  prUrl: string | null;
  /** The holder (assignee, else claimant); `null` when nobody holds it. */
  claimer: UserRef | null;
  /** The feature this task actually belongs to — the breadcrumb target. */
  feature: { id: string; slug: string | null; title: string };
  /** The name of the feature's own phase, for the "↩ from" half; `null` if unfiled. */
  originPhaseName: string | null;
}

/**
 * One rendered row of a phase band: a feature, or a task borrowed into it.
 *
 * A discriminated union rather than two lists, because the ordering **between**
 * them is the point — a borrowed task must sit *inline*, never in a trailing
 * sub-band, or `planOrder` would place it below the very feature it blocks
 * (§32 t-95, owner). Ordering stays the server's job (see `plan-view.tsx`).
 */
export type PlanBandRow =
  { kind: 'feature'; feature: PlanFeatureView } | { kind: 'task'; task: PlanBorrowedTask };

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
   * The phase's one-line intent, plain text (§33-sweep t-104). What the band
   * renders — `description` is long-form markdown and was being clamped to two
   * lines mid-sentence, which is the defect this replaced.
   */
  summary: string | null;
  /**
   * The phase's authored intent — why this grouping exists (f-work-kinds §32
   * t-80). Written since f-phases §22 and carried here so it can finally be
   * rendered and projected; `null` for the residual band, which nobody authored.
   * Still the band's fallback when no `summary` is written.
   */
  description: string | null;
  /**
   * When the phase began and finished — derived coherently in `phases-service`
   * since f-phases §22 (`completedAt` set ⟺ complete; `startedAt` stamped on the
   * first active/complete and never un-stamped) and, until f-phase-history §33
   * t-99, selected by no read at all. ISO strings so the client DTO can mirror
   * them without a Date across the boundary.
   */
  startedAt: string | null;
  completedAt: string | null;
  /** Display position; `null` for the residual band. */
  ordinal: number | null;
  /**
   * The features filed under this phase, in `planOrder()`. Unchanged by §32 t-95 —
   * this is still "which features live here", and it is what the summary, the
   * auto-expand pick, the §N fallback and the band's feature count all read.
   */
  features: PlanFeatureView[];
  /**
   * What the band **renders**, in order: the same features, interleaved with any
   * tasks borrowed into this phase. A superset of `features`; the two can't drift
   * (asserted in `plan.test.ts`). Split from `features` deliberately — a borrowed
   * task is not a member of this phase's feature set, and must not be counted as one.
   */
  rows: PlanBandRow[];
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
    select: {
      id: true,
      name: true,
      status: true,
      ordinal: true,
      summary: true,
      description: true,
      startedAt: true,
      completedAt: true,
    },
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
        // Withdrawn work is not work (§21 t-123) — dropped here rather than
        // post-filtered so it can never reach `computeFeatureProgress`, whose
        // `unstartedSinceShip` is derived NEGATIVELY ("whatever live/blocked don't
        // show") and would silently count a withdrawn post-ship task as new.
        where: { withdrawnAt: null },
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
          mergedAt: true, // orders completed rows in a band by recency (§33-sweep t-60)
          phaseId: true, // the phase that CHOSE this work, when it isn't the feature's (§32 t-95)
          prUrl: true,
          claimedByUserId: true,
          assigneeUserId: true,
          withdrawnAt: true, // always null here (the `where` above) — the shared status input requires it
          dependencies: { select: { dependsOn: { select: { status: true, withdrawnAt: true } } } },
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

  // Phase names, for the origin half of a borrowed row's breadcrumb.
  const phaseNameById = new Map((await phasesPromise).map((p) => [p.id, p.name]));
  // Tasks this project has committed to a phase OTHER than their feature's (§32
  // t-95), grouped by the phase that borrowed them. Built from the tasks already
  // loaded above — no second query, no N+1.
  const borrowedByPhase = new Map<string, PlanBorrowedTask[]>();

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
      const claimer = holderId ? (users.get(holderId) ?? null) : null;
      // A commitment to a phase OTHER than the feature's is a *borrow*: the task
      // also renders in that band. Equal ids mean the commitment agrees with the
      // inheritance, so there is nothing to show twice.
      // `!= null` (nullish), not `!== null`: an absent phaseId must read as "inherit"
      // exactly like an explicit null, or a missing field would masquerade as a
      // commitment and silently duplicate the row into a band.
      const borrowedBy = t.phaseId != null && t.phaseId !== f.phaseId ? t.phaseId : null;
      if (borrowedBy !== null) {
        const borrowed: PlanBorrowedTask = {
          id: t.id,
          number: t.number,
          title: t.title,
          status,
          kind: t.kind,
          prUrl: t.prUrl,
          claimer,
          feature: { id: f.id, slug: f.slug, title: f.title },
          originPhaseName: f.phaseId ? (phaseNameById.get(f.phaseId) ?? null) : null,
        };
        const arr = borrowedByPhase.get(borrowedBy);
        if (arr) arr.push(borrowed);
        else borrowedByPhase.set(borrowedBy, [borrowed]);
      }
      return {
        id: t.id,
        number: t.number,
        title: t.title,
        status,
        kind: t.kind,
        prUrl: t.prUrl,
        claimer,
        committedPhaseName: borrowedBy ? (phaseNameById.get(borrowedBy) ?? null) : null,
      };
    });

    // Progress reads off the SAME effective status the rows render (§09 carry):
    // a dep-blocked task counts as `blocked`, never `live`, so a feature's
    // summary can't disagree with its own task table. `bug` tasks are excluded
    // from completion and tallied as `openBugs` (f-bug-handling §22-02) — an
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
      shippedAt: f.shippedAt, // the shipped band reads in ship order (§33-sweep t-60)
    }))
  );
  const viewById = new Map(views.map((v) => [v.id, v]));
  // `planOrder` returns the same ids it was given → every lookup resolves.
  const orderedViews = ordered.map((o) => viewById.get(o.id)!);

  // Map each feature's membership + its STORED status — the grouping needs the
  // latter to place a borrowed task among features by readiness, and the stored
  // value is what `planOrder` banded on (the derived one is presentation).
  const phases = await phasesPromise;
  const phaseIdByFeature = new Map(features.map((f) => [f.id, f.phaseId]));
  const statusByFeature = new Map(features.map((f) => [f.id, f.status]));
  // When each row finished — features by `shippedAt`, tasks by `mergedAt` — so the
  // completed group of a band can be ordered by recency across both (§33-sweep t-60).
  // One map for both id spaces: they are disjoint cuids, and the interleave should not
  // have to know which kind of row it is looking at to ask when it was done.
  const completedAtById = new Map<string, Date | null>();
  for (const f of features) {
    completedAtById.set(f.id, f.shippedAt);
    for (const t of f.tasks) completedAtById.set(t.id, t.mergedAt);
  }

  return {
    projectId,
    projectSlug: project.slug,
    phases: groupIntoPhaseBands(
      orderedViews,
      phaseIdByFeature,
      phases,
      borrowedByPhase,
      statusByFeature,
      completedAtById
    ),
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
  summary: string | null;
  description: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

/**
 * The rank both tables below assign to finished work — `shipped` for a feature,
 * `merged` for a task. Named rather than written as `0` at the comparison site,
 * because the branch there means "this row is done", not "this row happens to rank
 * first".
 */
const COMPLETED_RANK = 0;

/**
 * Readiness rank shared by feature rows and borrowed task rows, so the two can be
 * interleaved on one scale (§32 t-95). Mirrors `plan-order.ts`'s `STATUS_BAND`
 * — done first, then in-flight, then ready, then blocked — because that is the
 * order the band's features are already in.
 */
const FEATURE_RANK: Record<FeatureStatus, number> = {
  shipped: COMPLETED_RANK,
  in_flight: 1,
  planning: 2,
  blocked: 3,
};
const TASK_RANK: Record<EffectiveStatus, number> = {
  merged: COMPLETED_RANK,
  active: 1,
  claimed: 2,
  blocked: 3,
  // Unreachable by construction — the Plan's task query excludes `withdrawnAt`
  // rows, so no withdrawn task is ever ranked. Ranked WITH completed work rather
  // than given its own band because if that filter were ever dropped, terminal is
  // the truthful place for it: a withdrawn task is finished-with, not pending.
  withdrawn: COMPLETED_RANK,
};

/**
 * Interleave a band's borrowed tasks among its features, in readiness order.
 *
 * **Never a trailing sub-band.** That is the load-bearing requirement (owner,
 * §32 t-95): a borrowed enhancement can be the thing *blocking* a feature new to
 * this phase, and parking borrowed rows at the end would sort it below the very
 * feature it blocks. Placement must not encode "borrowed" — the kind tag and the
 * origin breadcrumb do that.
 *
 * Tasks are placed **before** features of equal rank: a task pulled into a phase is
 * a prerequisite far more often than not, and a tie is exactly the case where the
 * blocking reading matters. Within each group the incoming order is preserved (the
 * sort is stable and features arrive in `planOrder`), so this reorders nothing that
 * was already ordered.
 *
 * **Except at rank 0, where that rule buys nothing** (§33-sweep t-60). "Tasks first"
 * exists so a borrowed prerequisite sorts above the feature it blocks — and completed
 * work blocks nothing. Applied to done rows it just stacked every merged task above
 * every shipped feature: on the Hub's own Project flow band, eleven merged tasks sat
 * at the top of a list whose stated order is *most ready to advance first*.
 *
 * So the completed group is ordered by **completion instant, oldest first, across both
 * row types** — features by `Feature.shippedAt`, borrowed tasks by `Task.mergedAt` —
 * using the same `byCompletionOrder` the shipped band itself uses, so the two orderings
 * cannot disagree about what "completion order" means. Unknown instants sort first and
 * tie, leaving those rows in their incoming order.
 *
 * **Ascending, so the band reads as linear history** (owner, 2026-08-21). Completed work
 * renders above work still moving, so ordering it newest-first would stand the oldest
 * thing in the band next to the thing being done today. Oldest-first makes the column
 * flow downward through time and puts what just finished directly beside what is next.
 */
function interleaveBandRows(
  features: PlanFeatureView[],
  borrowed: PlanBorrowedTask[],
  statusByFeature: Map<string, FeatureStatus>,
  completedAtById: Map<string, Date | null>
): PlanBandRow[] {
  if (borrowed.length === 0) return features.map((feature) => ({ kind: 'feature', feature }));
  const ranked: { rank: number; at: Date | null; row: PlanBandRow }[] = [
    ...borrowed.map((task) => ({
      rank: TASK_RANK[task.status],
      at: completedAtById.get(task.id) ?? null,
      row: { kind: 'task', task } as const,
    })),
    ...features.map((feature) => ({
      // A feature missing from the map cannot happen (same query), but rank it as
      // ready rather than throwing — a read degrades, it never breaks the page.
      rank: FEATURE_RANK[statusByFeature.get(feature.id) ?? 'planning'],
      at: completedAtById.get(feature.id) ?? null,
      row: { kind: 'feature', feature } as const,
    })),
  ];
  return ranked
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // Rank 0 is the completed group — recency, across both row types.
      if (a.rank === COMPLETED_RANK) return byCompletionOrder(a.at, b.at);
      // Every other rank keeps the stable "tasks before features" order they were
      // pushed in (§32 t-95). Returning 0 is what preserves it — do not "tidy" this
      // into a single comparator.
      //
      // **The rank check is defensive, not load-bearing**, and it is worth knowing
      // which: a row above rank 0 has no completion instant *by construction* —
      // `completedAtById` reads `Feature.shippedAt` and `Task.mergedAt`, `startTask`
      // refuses a merged task ("can't restart finished work"), and nothing clears
      // either column. So dropping the check would not change a single rendered row
      // today, and no test can tell the two apart. It stays because it states the
      // intent — recency is a fact about *finished* work — and because it is what
      // keeps §32 t-95's rule correct on the day someone adds a reopen path.
      return 0;
    })
    .map((r) => r.row);
}

function groupIntoPhaseBands(
  orderedViews: PlanFeatureView[],
  phaseIdByFeature: Map<string, string | null>,
  phases: PhaseRow[],
  borrowedByPhase: Map<string, PlanBorrowedTask[]>,
  statusByFeature: Map<string, FeatureStatus>,
  /**
   * When each row finished, keyed by feature id *and* task id — the two id spaces are
   * disjoint cuids, so one map serves both and the interleave never has to know which
   * kind of row it is holding (§33-sweep t-60). `null` for anything unfinished or
   * whose instant predates the columns that record it.
   */
  completedAtById: Map<string, Date | null>
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
  const bands: PlanPhaseBand[] = phases.map((p) => {
    const features = byPhase.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      ordinal: p.ordinal,
      summary: p.summary,
      description: p.description,
      startedAt: p.startedAt?.toISOString() ?? null,
      completedAt: p.completedAt?.toISOString() ?? null,
      features,
      rows: interleaveBandRows(
        features,
        borrowedByPhase.get(p.id) ?? [],
        statusByFeature,
        completedAtById
      ),
    };
  });
  if (residual.length > 0) {
    bands.push({
      id: null,
      name: null,
      status: null,
      ordinal: null,
      summary: null,
      description: null,
      // The residual band is not a phase, so it has no lifecycle of its own.
      startedAt: null,
      completedAt: null,
      features: residual,
      // The residual band has no phase id, so nothing can be committed *to* it —
      // a task's `phaseId` always names a real phase, and null means "inherit".
      rows: residual.map((feature) => ({ kind: 'feature', feature })),
    });
  }
  return bands;
}
