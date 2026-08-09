/**
 * Single-feature detail read (f-feature-planning §18 t-3).
 *
 * The one-feature read the shareable **feature page** renders
 * (`/projects/<id>/features/<slug>`): the deep view the whole-project `/plan`
 * read summarises — a feature's description, definition of done, cross-reference
 * chips, dependency chips, and its task surface (the real `Task` rows once
 * `planned`, or the ordered `IndicativeTask` sketch while still `indicative`).
 * The feature-scoped journal is a separate client read (`/events?featureId=`).
 *
 * Membership is the [[f-access]] funnel's: the load goes through
 * `getAccessibleProjectByRef` (the project segment is a slug or cuid; a non-member
 * or unknown project → 404, never 403), and the feature is then resolved
 * **scoped to that project's canonical id** by its human `slug`
 * (the shareable key) or its cuid `id` — so a feature in another project, an
 * unknown slug, or a slug from a project the caller can't see is a 404 too. Task
 * status is the shared `computeEffectiveStatus` (so the page never diverges from
 * the §09 Plan / §10 Board), and every nullable `user` ref resolves to
 * `UserRef | null` ("unassigned / former member"), never dereferenced.
 */
import type { FeaturePlanningStage, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';
import { getAccessibleProjectByRef } from '@/lib/projects/access';
import { computeEffectiveStatus, type EffectiveStatus } from '@/lib/projects/task-status';
import {
  computeFeatureStatus,
  type EffectiveFeatureStatus,
  type WaitingOnRef,
} from '@/lib/projects/feature-status';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

/** A cross-reference chip (`Feature.references` — a stored `{ label, target }` list). */
export interface FeatureReference {
  label: string;
  target: string;
}

/** A depended-on feature, for the "depends on …" chips. */
export interface FeatureDetailRef {
  id: string;
  /** Authored short key (`f-access`); `null` until authored → render falls back to title. */
  slug: string | null;
  title: string;
}

/** A real task row on a planned feature. */
export interface FeatureDetailTask {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  /** Effective status (via `computeEffectiveStatus`) — matches Plan/Board. */
  status: EffectiveStatus;
  /** The per-task acceptance contract (§18). */
  doneWhen: string | null;
  prUrl: string | null;
  /** `null` when unclaimed or the claimant was erased. */
  claimer: UserRef | null;
  /** "This is yours" — defaults to the feature owner at plan time; `null` if unassigned/erased. */
  assignee: UserRef | null;
}

/** An indicative-task sketch bullet on a not-yet-planned feature. */
export interface FeatureDetailIndicativeTask {
  id: string;
  order: number;
  text: string;
}

/** The feature page's full payload for one feature. */
export interface FeatureDetail {
  id: string;
  projectId: string;
  /** The parent project's slug (`hce-hub`) — for the shareable back-link; `null` → falls back to `projectId`. */
  projectSlug: string | null;
  /** The parent project's name — for the feature page's breadcrumb + header. */
  projectName: string;
  /** Project-wide stable ordinal, rendered `§N`; `null` until assigned. */
  number: number | null;
  /** Authored short key (`f-mcp`); `null` until authored. */
  slug: string | null;
  title: string;
  description: string | null;
  doneWhen: string | null;
  references: FeatureReference[];
  /** Readiness-derived status (via `computeFeatureStatus`) — never raw `planning`. */
  status: EffectiveFeatureStatus;
  /** For a `blocked` feature: the unshipped dependencies it's waiting on. */
  waitingOn: WaitingOnRef[];
  /** Depth axis: `indicative` sketch vs `planned` (real tasks materialised). */
  planningStage: FeaturePlanningStage;
  helpWanted: boolean;
  /** `null` when unowned or the owner was erased. */
  owner: UserRef | null;
  /**
   * The project's members — the "reassign remaining tasks" picker's options
   * (f-task-assignment §22 t2). Membership order; erased users dropped.
   */
  members: UserRef[];
  dependsOn: FeatureDetailRef[];
  /** Real tasks (populated once planned). */
  tasks: FeatureDetailTask[];
  /** The high-level sketch (populated while indicative; replaced at plan time). */
  indicativeTasks: FeatureDetailIndicativeTask[];
}

/**
 * Coerce the stored `references` JSON into a clean `{ label, target }[]`. The
 * column is written by `create_feature` from validated input, but on read it is
 * an opaque `JsonValue`, so we defensively keep only well-formed string pairs
 * (never trust structured JSON as its declared shape without a guard).
 */
function toReferences(json: Prisma.JsonValue | null): FeatureReference[] {
  if (!Array.isArray(json)) return [];
  const refs: FeatureReference[] = [];
  for (const entry of json) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const label = (entry as Record<string, unknown>).label;
      const target = (entry as Record<string, unknown>).target;
      if (typeof label === 'string' && typeof target === 'string') {
        refs.push({ label, target });
      }
    }
  }
  return refs;
}

/**
 * Load one feature's full detail for a member of the project named by `projectRef`
 * (its `slug` or cuid `id`), the feature itself resolved by `key` (its `slug` or
 * cuid `id`). Throws `NotFoundError` (→ 404) for a non-member/unknown project (via
 * `getAccessibleProjectByRef`) or a feature that doesn't exist /
 * lives in another project (the `projectId` scope + slug/id match).
 */
export async function getFeatureDetail(
  userId: string,
  projectRef: string,
  key: string
): Promise<FeatureDetail> {
  // Access decides visibility (deny ≡ 404). The project segment is a **slug or
  // cuid** (a feature page URL prefers the human project slug — §19), resolved to
  // the canonical project here; reuse it for its name/slug (breadcrumb + header)
  // instead of a second read.
  const project = await getAccessibleProjectByRef(userId, projectRef);

  // Scoped to the confirmed project's **canonical id** and matched by slug OR cuid
  // — a feature from another project (even one the caller belongs to) is not found
  // here, and the human slug is the shareable key. The project's members (the
  // "reassign remaining" picker's options) load in parallel.
  const [feature, memberRows] = await Promise.all([
    prisma.feature.findFirst({
      where: { projectId: project.id, OR: [{ slug: key }, { id: key }] },
      select: {
        id: true,
        number: true,
        slug: true,
        title: true,
        description: true,
        doneWhen: true,
        references: true,
        status: true,
        planningStage: true,
        helpWanted: true,
        ownerUserId: true,
        dependencies: {
          // `status` feeds the readiness derivation; slug/title feed the chips.
          select: { dependsOn: { select: { id: true, slug: true, title: true, status: true } } },
        },
        tasks: {
          // Numerical order — tasks are built sequentially (f-status-model §20).
          orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            doneWhen: true,
            prUrl: true,
            claimedByUserId: true,
            assigneeUserId: true,
            dependencies: { select: { dependsOn: { select: { status: true } } } },
          },
        },
        indicativeTasks: {
          orderBy: { order: 'asc' },
          select: { id: true, order: true, text: true },
        },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId: project.id },
      orderBy: { addedAt: 'asc' },
      select: { userId: true },
    }),
  ]);
  if (!feature) throw new NotFoundError(`Feature ${key} not found`);

  // One batched identity lookup for the owner + every task claimer/assignee + every
  // member (the reassign picker's options).
  const userIds = [
    ...(feature.ownerUserId ? [feature.ownerUserId] : []),
    ...feature.tasks.flatMap((t) => [
      ...(t.claimedByUserId ? [t.claimedByUserId] : []),
      ...(t.assigneeUserId ? [t.assigneeUserId] : []),
    ]),
    ...memberRows.map((m) => m.userId),
  ];
  const users = await fetchUsers(userIds);

  // Readiness-derived status from the dependencies' stored statuses.
  const { status: effectiveStatus, waitingOn } = computeFeatureStatus(
    feature.status,
    feature.dependencies.map((d) => d.dependsOn)
  );

  return {
    id: feature.id,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    number: feature.number,
    slug: feature.slug,
    title: feature.title,
    description: feature.description,
    doneWhen: feature.doneWhen,
    references: toReferences(feature.references),
    status: effectiveStatus,
    waitingOn,
    planningStage: feature.planningStage,
    helpWanted: feature.helpWanted,
    owner: feature.ownerUserId ? (users.get(feature.ownerUserId) ?? null) : null,
    members: memberRows.map((m) => users.get(m.userId)).filter((u): u is UserRef => u != null),
    dependsOn: feature.dependencies.map((d) => ({
      id: d.dependsOn.id,
      slug: d.dependsOn.slug,
      title: d.dependsOn.title,
    })),
    tasks: feature.tasks.map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      status: computeEffectiveStatus(
        t,
        t.dependencies.map((d) => d.dependsOn)
      ),
      doneWhen: t.doneWhen,
      prUrl: t.prUrl,
      claimer: t.claimedByUserId ? (users.get(t.claimedByUserId) ?? null) : null,
      assignee: t.assigneeUserId ? (users.get(t.assigneeUserId) ?? null) : null,
    })),
    indicativeTasks: feature.indicativeTasks,
  };
}
