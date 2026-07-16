/**
 * Client-facing DTOs for the task sheet (f-task-sheet §11).
 *
 * Mirror the server shapes in `lib/projects/task-detail.ts` (t-1) so client
 * components don't import the server module. The `/tasks/[taskId]` payload
 * carries no `Date`s, so these are exact structural mirrors.
 */
import type { UserRef } from '@/components/hub/projects/types';
import type { TaskEffectiveStatus } from '@/components/hub/projects/plan/types';

/** A neighbour in the dependency graph (a blocker or a dependent). */
export interface TaskDetailRef {
  id: string;
  number: number | null;
  title: string;
  featureSlug: string | null;
  status: TaskEffectiveStatus;
}

/** One task's full detail (`GET /api/v1/projects/:id/tasks/:taskId`). */
export interface TaskDetailDTO {
  id: string;
  number: number | null;
  title: string;
  description: string | null;
  status: TaskEffectiveStatus;
  prUrl: string | null;
  filesScope: string[];
  claimer: UserRef | null;
  isMine: boolean;
  feature: {
    id: string;
    slug: string | null;
    title: string;
    owner: UserRef | null;
  };
  blockedBy: TaskDetailRef[];
  blocks: TaskDetailRef[];
}

/** A soft-collision warning from a claim — advisory, never a block (mirrors `CollisionWarning`). */
export interface ClaimWarning {
  kind: 'already_claimed' | 'file_overlap';
  message: string;
}

/** The `POST …/claim` payload. */
export interface ClaimResultDTO {
  taskId: string;
  claimed: boolean;
  warnings: ClaimWarning[];
}
