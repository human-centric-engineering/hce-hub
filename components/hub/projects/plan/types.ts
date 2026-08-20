/**
 * Client-facing DTOs for the Plan view (f-plan-view t-2).
 *
 * Mirror the server shapes in `lib/projects/plan.ts` (feature 09 t-1) so client
 * components don't import the server module. The `/plan` payload carries no
 * `Date`s, so these are exact structural mirrors.
 */
import type { UserRef } from '@/components/hub/projects/types';

/**
 * A feature's *effective*, readiness-derived status (`computeFeatureStatus`) — the
 * stored `planning` never reaches the client; it resolves to `available`/`blocked`
 * from dependency readiness (f-status-model §20 t-37).
 */
export type FeatureStatus = 'available' | 'blocked' | 'in_flight' | 'shipped';

/** A dependency a `blocked` feature is waiting on (not yet shipped). */
export interface WaitingOnRef {
  slug: string | null;
  title: string;
}

/** Feature depth axis (`Feature.planningStage`) — sketch vs materialised tasks. */
export type FeaturePlanningStage = 'indicative' | 'planned';

/** An indicative-task sketch bullet on a not-yet-planned feature (§18). */
export interface PlanIndicativeTask {
  id: string;
  order: number;
  text: string;
}

/** A task's *effective* status (`computeEffectiveStatus`) — includes computed `blocked`. */
export type TaskEffectiveStatus = 'claimed' | 'active' | 'merged' | 'blocked';

/**
 * A task's kind (mirrors Prisma `TaskKind`, f-bug-handling §22-02; `enhancement`
 * added by f-work-kinds §32 t-79).
 *
 * Hand-mirrored rather than imported because this type crosses into client
 * components, which can't pull from `@prisma/client`. That makes it the one copy
 * no type-check can keep honest — the DTO reaches it through an unchecked
 * `parseApiResponse` cast, so a missing value here doesn't error, it just makes
 * `kind === 'enhancement'` a "no overlap" compile error at every render site.
 * Keep it in step with the enum.
 */
export type TaskKind = 'feature_work' | 'bug' | 'enhancement';

/** A depended-on feature, for the "depends on …" chips. */
export interface PlanDependencyRef {
  id: string;
  /** Authored short key (`f-access`); `null` until authored → render falls back to title. */
  slug: string | null;
  title: string;
}

/** A task row in a feature's inset table. */
export interface PlanTask {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  status: TaskEffectiveStatus;
  /** `bug` vs `feature_work` (f-bug-handling §22-02). */
  kind: TaskKind;
  prUrl: string | null;
  /** `null` when unclaimed or the claimant was erased. */
  claimer: UserRef | null;
  /** The phase that borrowed this task, when it isn't its feature's own (§32 t-95). */
  committedPhaseName: string | null;
}

/** A feature row in the Plan view. */
export interface PlanFeature {
  id: string;
  /** Project-wide stable ordinal, rendered `§N`; `null` until assigned. */
  number: number | null;
  /** Authored short key (`f-mcp`); `null` until authored. */
  slug: string | null;
  title: string;
  /** Short plain one-liner for the row; falls back to `description` when unset (§21 t-d). */
  summary: string | null;
  description: string | null;
  status: FeatureStatus;
  /** For a `blocked` feature: the unshipped dependencies it's waiting on. */
  waitingOn: WaitingOnRef[];
  /** Depth axis: `indicative` sketch vs `planned` (real tasks) — §18. */
  planningStage: FeaturePlanningStage;
  helpWanted: boolean;
  /** `null` when unowned or the owner was erased. */
  owner: UserRef | null;
  dependsOn: PlanDependencyRef[];
  tasks: PlanTask[];
  /** The high-level sketch, shown while `indicative` (empty once planned). */
  indicativeTasks: PlanIndicativeTask[];
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

/** A phase's lifecycle status (mirrors Prisma `PhaseStatus`, f-phases §22). */
export type PhaseStatus = 'upcoming' | 'active' | 'complete' | 'parked';

/**
 * A task borrowed into a phase band — `Task.phaseId` names a phase other than its
 * feature's, so this phase *chose* to do work on someone else's feature (§32 t-95).
 * Rendered inline in the borrowing band, and unchanged in its origin feature's table.
 */
export interface PlanBorrowedTask {
  id: string;
  number: number | null;
  title: string;
  status: TaskEffectiveStatus;
  kind: TaskKind;
  prUrl: string | null;
  claimer: UserRef | null;
  /** Where the task really lives — the breadcrumb target. */
  feature: { id: string; slug: string | null; title: string };
  /** The origin feature's own phase name, for the "↩" half; `null` if unfiled. */
  originPhaseName: string | null;
}

/** One rendered row of a band: a feature, or a task borrowed into the phase. */
export type PlanBandRow =
  { kind: 'feature'; feature: PlanFeature } | { kind: 'task'; task: PlanBorrowedTask };

/**
 * A phase band on the Plan — features filed under one phase, keeping their
 * `planOrder()` (f-phases §22 t2). `id: null` is the residual "no phase" band.
 */
export interface PlanPhaseBand {
  id: string | null;
  name: string | null;
  /** `null` for the residual band; `parked`/`complete` bands collapse by default. */
  status: PhaseStatus | null;
  ordinal: number | null;
  /**
   * The phase's one-line intent, **plain text** (§33-sweep t-104). What the band
   * actually renders. `null` for the residual band, and for any phase nobody has
   * written one for yet — the band then falls back to `description`.
   */
  summary: string | null;
  /**
   * The phase's authored intent — why this grouping exists, and what would make
   * it complete. Written since f-phases §22 and carried by the payload all along;
   * this mirror simply never declared it, so nothing could render it (§33 t-99).
   * `null` for the residual band, which nobody authored.
   */
  description: string | null;
  /** When the phase began / finished (ISO); `null` when not yet, or residual. */
  startedAt: string | null;
  completedAt: string | null;
  /** Features filed under this phase — the count, the summary, the auto-expand pick. */
  features: PlanFeature[];
  /** What the band renders, in readiness order: those features plus borrowed tasks. */
  rows: PlanBandRow[];
}

/**
 * The `/plan` payload — features grouped into phase bands (f-phases §22 t2).
 * A project with no phases yields a single residual band = the flat plan list.
 */
export interface ProjectPlanDTO {
  projectId: string;
  /** The project's slug (`hce-hub`) — feature-page links prefer it; `null` → falls back to `projectId`. */
  projectSlug: string | null;
  phases: PlanPhaseBand[];
}
