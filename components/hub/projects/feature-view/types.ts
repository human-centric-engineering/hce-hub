/**
 * Client-facing DTOs for the feature page (f-feature-planning §18 t-3).
 *
 * Mirror the server shapes in `lib/projects/feature-detail.ts` so client
 * components don't import the server module. The payload carries no `Date`s, so
 * these are exact structural mirrors. Reuses the Plan view's status unions +
 * `UserRef` so the two surfaces can't drift.
 */
import type { UserRef } from '@/components/hub/projects/types';
import type {
  FeaturePlanningStage,
  FeatureStatus,
  TaskEffectiveStatus,
  WaitingOnRef,
} from '@/components/hub/projects/plan/types';

/** A cross-reference chip (`Feature.references`). */
export interface FeatureReferenceDTO {
  label: string;
  target: string;
}

/** A depended-on feature, for the "depends on …" chips. */
export interface FeatureDetailRefDTO {
  id: string;
  slug: string | null;
  title: string;
}

/** A real task row on a planned feature. */
export interface FeatureDetailTaskDTO {
  id: string;
  number: number | null;
  title: string;
  status: TaskEffectiveStatus;
  doneWhen: string | null;
  prUrl: string | null;
  claimer: UserRef | null;
  assignee: UserRef | null;
}

/** An indicative-task sketch bullet. */
export interface FeatureDetailIndicativeTaskDTO {
  id: string;
  order: number;
  text: string;
}

/** The feature page's payload (`GET /api/v1/projects/:id/features/:key`). */
export interface FeatureDetailDTO {
  id: string;
  projectId: string;
  projectName: string;
  /** Project-wide stable ordinal, rendered `§N`; `null` until assigned. */
  number: number | null;
  slug: string | null;
  title: string;
  description: string | null;
  doneWhen: string | null;
  references: FeatureReferenceDTO[];
  status: FeatureStatus;
  /** For a `blocked` feature: the unshipped dependencies it's waiting on. */
  waitingOn: WaitingOnRef[];
  planningStage: FeaturePlanningStage;
  helpWanted: boolean;
  owner: UserRef | null;
  dependsOn: FeatureDetailRefDTO[];
  tasks: FeatureDetailTaskDTO[];
  indicativeTasks: FeatureDetailIndicativeTaskDTO[];
}
