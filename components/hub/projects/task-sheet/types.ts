/**
 * Client-facing DTOs for the task sheet (f-task-sheet §11).
 *
 * Mirror the server shapes in `lib/projects/task-detail.ts` (t-1) so client
 * components don't import the server module. The `/tasks/[taskId]` payload
 * carries no `Date`s, so these are exact structural mirrors.
 */
import type { UserRef } from '@/components/hub/projects/types';
import type { TaskEffectiveStatus, TaskKind } from '@/components/hub/projects/plan/types';

/** A neighbour in the dependency graph (a blocker or a dependent). */
export interface TaskDetailRef {
  id: string;
  number: number | null;
  title: string;
  featureSlug: string | null;
  status: TaskEffectiveStatus;
  /** Whether anyone holds it (§32 t-89) — a `claimed` chip reads "assigned" or
   * "unassigned" on this, so it can't contradict the neighbour's own row. */
  hasHolder: boolean;
}

/** One task's full detail (`GET /api/v1/projects/:id/tasks/:taskId`). */
export interface TaskDetailDTO {
  id: string;
  number: number | null;
  title: string;
  description: string | null;
  doneWhen: string | null;
  status: TaskEffectiveStatus;
  /** `bug` vs `feature_work` (f-bug-handling §22-02) — drives the sheet's bug tag. */
  kind: TaskKind;
  prUrl: string | null;
  filesScope: string[];
  /** The doer, once merged; `null` when unclaimed/erased. */
  claimer: UserRef | null;
  /**
   * The GitHub merger mapped to a Hub user (f-github-identity §23) — additive,
   * distinct from `claimer`. `null` unless the PR was merged by a linked Hub user.
   */
  mergedBy: UserRef | null;
  /** Who the task is assigned to (the picker's current value); `null` if unassigned/erased. */
  assignee: UserRef | null;
  isMine: boolean;
  /** The project's members — the assignee picker's options (membership order). */
  members: UserRef[];
  feature: {
    id: string;
    slug: string | null;
    title: string;
    owner: UserRef | null;
  };
  blockedBy: TaskDetailRef[];
  blocks: TaskDetailRef[];
}

/** A soft-collision warning from Start — advisory, never a block (mirrors `CollisionWarning`). */
export interface CollisionWarning {
  kind: 'already_claimed' | 'file_overlap';
  message: string;
}

/** The `POST …/start` | `…/complete` payload (mirrors `TaskActionResult`). */
export interface TaskActionResultDTO {
  taskId: string;
  /** The task's `t-N` ref (f-refs; `null` until assigned) — carried so a handler can
   * name what it just started/completed (t-66). */
  number: number | null;
  status: TaskEffectiveStatus;
  warnings: CollisionWarning[];
}
