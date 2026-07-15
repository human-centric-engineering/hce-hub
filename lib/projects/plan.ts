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
import type { FeatureStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/projects/task-status';
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

/** A feature row in the Plan view. */
export interface PlanFeatureView {
  id: string;
  /** Authored short key (`f-mcp`); `null` until authored. */
  slug: string | null;
  title: string;
  description: string | null;
  status: FeatureStatus;
  helpWanted: boolean;
  /** `null` when unowned or the owner was erased. */
  owner: UserRef | null;
  dependsOn: PlanDependencyRef[];
  tasks: PlanTaskView[];
  /** Progress off *stored* status: merged/total + live (in-flight, i.e. not merged/backlog). */
  progress: { merged: number; total: number; live: number };
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
      slug: true,
      title: true,
      description: true,
      status: true,
      helpWanted: true,
      ownerUserId: true,
      dependencies: { select: { dependsOnFeatureId: true } },
      tasks: {
        orderBy: { createdAt: 'asc' },
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

  // Slug + title for the dependency chips — every edge in a project points at a
  // feature in the same project, so resolve from the loaded set.
  const metaById = new Map(features.map((f) => [f.id, { slug: f.slug, title: f.title }]));

  const views: PlanFeatureView[] = features.map((f) => {
    const total = f.tasks.length;
    const merged = f.tasks.filter((t) => t.status === 'merged').length;
    const live = f.tasks.filter((t) => t.status !== 'merged' && t.status !== 'backlog').length;

    return {
      id: f.id,
      slug: f.slug,
      title: f.title,
      description: f.description,
      status: f.status,
      helpWanted: f.helpWanted,
      owner: f.ownerUserId ? (users.get(f.ownerUserId) ?? null) : null,
      dependsOn: f.dependencies
        .map((d) => {
          const meta = metaById.get(d.dependsOnFeatureId);
          return meta ? { id: d.dependsOnFeatureId, slug: meta.slug, title: meta.title } : null;
        })
        .filter((d): d is PlanDependencyRef => d !== null),
      tasks: f.tasks.map((t) => ({
        id: t.id,
        number: t.number,
        title: t.title,
        status: computeEffectiveStatus(
          t,
          t.dependencies.map((d) => d.dependsOn)
        ),
        prUrl: t.prUrl,
        claimer: t.claimedByUserId ? (users.get(t.claimedByUserId) ?? null) : null,
      })),
      progress: { merged, total, live },
    };
  });

  const ordered = planOrder(
    views.map((v) => ({ id: v.id, status: v.status, dependsOn: v.dependsOn.map((d) => d.id) }))
  );
  const viewById = new Map(views.map((v) => [v.id, v]));

  return {
    projectId,
    // `planOrder` returns the same ids it was given → every lookup resolves.
    features: ordered.map((o) => viewById.get(o.id)!),
  };
}
