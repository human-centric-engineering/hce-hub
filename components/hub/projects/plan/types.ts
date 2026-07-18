/**
 * Client-facing DTOs for the Plan view (f-plan-view t-2).
 *
 * Mirror the server shapes in `lib/projects/plan.ts` (feature 09 t-1) so client
 * components don't import the server module. The `/plan` payload carries no
 * `Date`s, so these are exact structural mirrors.
 */
import type { UserRef } from '@/components/hub/projects/types';

/** Stored feature status (`Feature.status`). */
export type FeatureStatus = 'planning' | 'in_flight' | 'blocked' | 'shipped';

/** Feature depth axis (`Feature.planningStage`) — sketch vs materialised tasks. */
export type FeaturePlanningStage = 'indicative' | 'planned';

/** An indicative-task sketch bullet on a not-yet-planned feature (§18). */
export interface PlanIndicativeTask {
  id: string;
  order: number;
  text: string;
}

/** A task's *effective* status (`computeEffectiveStatus`) — includes computed `blocked`. */
export type TaskEffectiveStatus =
  'backlog' | 'available' | 'claimed' | 'in_pr' | 'merged' | 'blocked';

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
  prUrl: string | null;
  /** `null` when unclaimed or the claimant was erased. */
  claimer: UserRef | null;
}

/** A feature row in the Plan view. */
export interface PlanFeature {
  id: string;
  /** Authored short key (`f-mcp`); `null` until authored. */
  slug: string | null;
  title: string;
  description: string | null;
  status: FeatureStatus;
  /** Depth axis: `indicative` sketch vs `planned` (real tasks) — §18. */
  planningStage: FeaturePlanningStage;
  helpWanted: boolean;
  /** `null` when unowned or the owner was erased. */
  owner: UserRef | null;
  dependsOn: PlanDependencyRef[];
  tasks: PlanTask[];
  /** The high-level sketch, shown while `indicative` (empty once planned). */
  indicativeTasks: PlanIndicativeTask[];
  progress: { merged: number; total: number; live: number; blocked: number };
}

/** The `/plan` payload — features already in `planOrder()`. */
export interface ProjectPlanDTO {
  projectId: string;
  features: PlanFeature[];
}
