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
import type { FeaturePlanningStage, Prisma, TaskKind, TaskStatus } from '@prisma/client';
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
  /** `bug` (a defect) vs `feature_work` vs `enhancement` (f-bug-handling §22-02, f-work-kinds §32). */
  kind: TaskKind;
  /** When the task was raised — placed against the feature's `shippedAt` to compute progress (§32). */
  createdAt: Date;
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

/**
 * A phase move drawn as a boundary inside the feature's task list (§33 t-100).
 *
 * Phase names are the **snapshots** taken at write time by
 * `lib/projects/phase-events.ts`, so a later rename never rewrites what a past
 * boundary says. `null` on either side means the feature was unfiled then.
 */
export interface FeatureTaskPhaseBoundary {
  /** The task this boundary is drawn ABOVE; `null` ⇒ draw below the last task. */
  beforeTaskId: string | null;
  fromPhaseName: string | null;
  toPhaseName: string | null;
  /** When the move happened, ISO — the payload carries no `Date`s. */
  movedAt: string;
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
  /** The phase this feature is filed under; `null` when unfiled (§32 t-80). */
  phase: { id: string; name: string } | null;
  /**
   * The completion boundary (§32 t-79): tasks raised after it are off the
   * completion axis. `null` until shipped ⇒ every task counts.
   */
  shippedAt: Date | null;
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
  /**
   * Where the feature changed phase mid-flight (§33 t-100). **Empty for a
   * feature that never moved**, which is the overwhelming common case — the
   * list then renders exactly as it did before. `tasks` is ordered so each
   * boundary's bands are contiguous.
   */
  taskPhaseBoundaries: FeatureTaskPhaseBoundary[];
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

/** One recorded move of THIS feature between phases, oldest first. */
interface PhaseMove {
  at: Date;
  fromPhaseName: string | null;
  toPhaseName: string | null;
}

/**
 * Read a `phase_membership_changed` event as a feature move, or `null`.
 *
 * `metadata` is an opaque `JsonValue` on read, so every field is guarded rather
 * than asserted (the `toReferences` rule). The `subject` check is load-bearing,
 * not defensive: the same kind records a **task's** commitment marker (§32 t-80)
 * and those events carry this feature's id too, so that they can be chipped in
 * the Log — without the filter, committing one task to a phase would draw a
 * boundary across the whole feature.
 */
function toPhaseMove(metadata: Prisma.JsonValue | null, at: Date): PhaseMove | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  if (m.subject !== 'feature') return null;
  return {
    at,
    fromPhaseName: typeof m.fromPhaseName === 'string' ? m.fromPhaseName : null,
    toPhaseName: typeof m.toPhaseName === 'string' ? m.toPhaseName : null,
  };
}

/** This feature's phase moves, oldest first. */
async function loadFeaturePhaseMoves(projectId: string, featureId: string): Promise<PhaseMove[]> {
  const rows = await prisma.projectEvent.findMany({
    where: { projectId, featureId, kind: 'phase_membership_changed' },
    orderBy: { createdAt: 'asc' },
    select: { metadata: true, createdAt: true },
  });
  return rows
    .map((r) => toPhaseMove(r.metadata, r.createdAt))
    .filter((m): m is PhaseMove => m !== null);
}

/**
 * Group a feature's tasks into the phases they were **completed under**, and
 * return the boundaries to draw between those bands (§33 t-100).
 *
 * **Completion time, not creation time.** A feature is normally planned in full
 * and then re-homed mid-build, so every task predates the move and a
 * creation-time split would draw nothing at all in precisely the case this
 * exists for. §33's own three tasks were created within the same second, which
 * is the check that settled it.
 *
 * **The merge instant lives only on the event.** `Task` has no merged-at column
 * — `complete_task` flips `status` and the timestamp survives solely as the
 * `task_merged` event's `createdAt`. That is why this reads the journal rather
 * than the rows, and why a *merged* task with no event is read as imported
 * history rather than as unfinished work.
 *
 * **Bands, not one divider.** Merge order and `t-N` order genuinely diverge
 * (f-work-kinds merged t-89 nine hours before t-88), so a single marker inserted
 * into a number-ordered list would put tasks on the wrong side of it. Tasks are
 * therefore partitioned by band and the bands laid out in order; within a band
 * the original number order is untouched, and a feature that never moved has one
 * band and so renders byte-identically to before.
 */
async function placeTasksInPhaseBands<T extends { id: string; status: TaskStatus }>(
  projectId: string,
  featureId: string,
  tasks: T[],
  moves: PhaseMove[]
): Promise<{ tasks: T[]; boundaries: FeatureTaskPhaseBoundary[] }> {
  if (moves.length === 0) return { tasks, boundaries: [] };

  const mergeEvents = await prisma.projectEvent.findMany({
    where: { projectId, featureId, kind: 'task_merged', taskId: { in: tasks.map((t) => t.id) } },
    orderBy: { createdAt: 'asc' },
    select: { taskId: true, createdAt: true },
  });
  const mergedAt = new Map<string, Date>();
  for (const e of mergeEvents) {
    // Oldest wins — the merge that first ended the work, not a later re-record.
    if (e.taskId && !mergedAt.has(e.taskId)) mergedAt.set(e.taskId, e.createdAt);
  }

  const bands = new Map(
    tasks.map((t) => {
      const at = mergedAt.get(t.id);
      if (at) {
        let band = 0;
        while (band < moves.length && moves[band].at < at) band += 1;
        return [t.id, band] as const;
      }
      // No merge event. Two opposite cases, and conflating them is wrong on the
      // majority of rows — 34 of the dev DB's 47 merged tasks have no event:
      //  - ALREADY merged ⇒ imported history (`completeTask` is the sole emitter
      //    and every live merge, webhook included, goes through it), so it
      //    predates any move we could have recorded → the FIRST band.
      //  - not merged ⇒ not done ⇒ it will be done under the phase the feature
      //    is in now → the LAST band.
      return [t.id, t.status === 'merged' ? 0 : moves.length] as const;
    })
  );
  const bandOf = (id: string): number => bands.get(id) ?? 0;

  // Stable (guaranteed since ES2019), so within a band the rows keep the number
  // order the query established.
  const ordered = [...tasks].sort((a, b) => bandOf(a.id) - bandOf(b.id));

  const boundaries = moves.map((move, i) => ({
    // The first row landing in ANY later band — so two moves with no completed
    // work between them stack two markers above the same row instead of one
    // silently swallowing the other.
    beforeTaskId: ordered.find((t) => bandOf(t.id) > i)?.id ?? null,
    fromPhaseName: move.fromPhaseName,
    toPhaseName: move.toPhaseName,
    movedAt: move.at.toISOString(),
  }));

  return { tasks: ordered, boundaries };
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
        shippedAt: true,
        phase: { select: { id: true, name: true } },
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
            kind: true,
            createdAt: true,
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
  // The phase moves ride alongside that lookup: a tiny, usually-empty read, and
  // skipped entirely for a feature with no real tasks to place them among.
  const [users, phaseMoves] = await Promise.all([
    fetchUsers(userIds),
    feature.tasks.length > 0 ? loadFeaturePhaseMoves(project.id, feature.id) : [],
  ]);
  // Only a feature that actually moved pays for the second (merge-time) read.
  const { tasks: orderedTasks, boundaries: taskPhaseBoundaries } = await placeTasksInPhaseBands(
    project.id,
    feature.id,
    feature.tasks,
    phaseMoves
  );

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
    phase: feature.phase,
    shippedAt: feature.shippedAt,
    owner: feature.ownerUserId ? (users.get(feature.ownerUserId) ?? null) : null,
    members: memberRows.map((m) => users.get(m.userId)).filter((u): u is UserRef => u != null),
    dependsOn: feature.dependencies.map((d) => ({
      id: d.dependsOn.id,
      slug: d.dependsOn.slug,
      title: d.dependsOn.title,
    })),
    tasks: orderedTasks.map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      status: computeEffectiveStatus(
        t,
        t.dependencies.map((d) => d.dependsOn)
      ),
      kind: t.kind,
      createdAt: t.createdAt,
      doneWhen: t.doneWhen,
      prUrl: t.prUrl,
      claimer: t.claimedByUserId ? (users.get(t.claimedByUserId) ?? null) : null,
      assignee: t.assigneeUserId ? (users.get(t.assigneeUserId) ?? null) : null,
    })),
    taskPhaseBoundaries,
    indicativeTasks: feature.indicativeTasks,
  };
}
