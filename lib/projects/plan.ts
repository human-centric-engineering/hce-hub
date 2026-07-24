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
import type { FeaturePlanningStage } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/projects/task-status';
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
  prUrl: string | null;
  /** `null` when unclaimed or the claimant was erased. */
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
   * `blocked` (a claimed task waiting on an unmerged dependency).
   */
  progress: { merged: number; total: number; live: number; blocked: number };
}

/** The Plan view's payload — features already in `planOrder()`. */
export interface ProjectPlan {
  projectId: string;
  features: PlanFeatureView[];
}

/**
 * Load one project's Plan view for a member. Throws `NotFoundError` (→ 404) for a
 * non-member or unknown id, via `getAccessibleProject`.
 */
export async function getProjectPlan(userId: string, projectId: string): Promise<ProjectPlan> {
  // Access decides visibility (deny ≡ 404). We only need the id it confirms.
  await getAccessibleProject(userId, projectId);

  const features = await prisma.feature.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      number: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      planningStage: true,
      helpWanted: true,
      ownerUserId: true,
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
          prUrl: true,
          claimedByUserId: true,
          dependencies: { select: { dependsOn: { select: { status: true } } } },
        },
      },
    },
  });

  // One batched identity lookup for every owner + claimer across the tree.
  const userIds = features.flatMap((f) => [
    ...(f.ownerUserId ? [f.ownerUserId] : []),
    ...f.tasks.flatMap((t) => (t.claimedByUserId ? [t.claimedByUserId] : [])),
  ]);
  const users = await fetchUsers(userIds);

  // Slug + title (chips) + stored status (readiness derivation) for every
  // feature — every dependency edge points at a feature in the same project, so
  // resolve from the loaded set (no extra query, no N+1).
  const metaById = new Map(
    features.map((f) => [f.id, { slug: f.slug, title: f.title, status: f.status }])
  );

  const views: PlanFeatureView[] = features.map((f) => {
    const tasks: PlanTaskView[] = f.tasks.map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      status: computeEffectiveStatus(
        t,
        t.dependencies.map((d) => d.dependsOn)
      ),
      prUrl: t.prUrl,
      claimer: t.claimedByUserId ? (users.get(t.claimedByUserId) ?? null) : null,
    }));

    // Progress reads off the SAME effective status the rows render (§09 carry):
    // a dep-blocked task counts as `blocked`, never `live`, so a feature's
    // summary can't disagree with its own task table. `live` = actively worked
    // (`active`); claimed-but-ready tasks are pending, neither live nor blocked.
    const total = tasks.length;
    const merged = tasks.filter((t) => t.status === 'merged').length;
    const blocked = tasks.filter((t) => t.status === 'blocked').length;
    const live = tasks.filter((t) => t.status === 'active').length;

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
      progress: { merged, total, live, blocked },
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

  return {
    projectId,
    // `planOrder` returns the same ids it was given → every lookup resolves.
    features: ordered.map((o) => viewById.get(o.id)!),
  };
}
