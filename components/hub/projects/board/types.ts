/**
 * Client-facing DTOs for the Board view (f-board-view t-2).
 *
 * Mirror the server shapes in `lib/projects/board.ts` (feature 10 t-1) so client
 * components don't import the server module. The `/board` payload carries no
 * `Date`s, so these are exact structural mirrors.
 */
import type { UserRef } from '@/components/hub/projects/types';
import type { TaskEffectiveStatus } from '@/components/hub/projects/plan/types';

/** The board's status columns (effective `blocked` folds into `claimed` server-side). */
export type BoardColumn = 'claimed' | 'active' | 'merged';

/** A task card on the board. */
export interface BoardTaskCard {
  id: string;
  /** Project-wide stable ordinal, rendered `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  featureId: string;
  /** The feature's authored slug (`f-mcp`); `null` until authored. */
  featureSlug: string | null;
  featureTitle: string;
  status: TaskEffectiveStatus;
  column: BoardColumn;
  prUrl: string | null;
  /** `null` when unclaimed or the claimant was erased. */
  claimer: UserRef | null;
  isMine: boolean;
  collision: { note: string } | null;
}

/** One swim lane — a project member, or the terminal Unassigned bucket. */
export interface BoardLane {
  key: string;
  /** `null` for the Unassigned lane or an erased member. */
  member: UserRef | null;
  role: 'lead' | 'member' | null;
  ownedFeatures: { id: string; slug: string | null; title: string }[];
  tasks: BoardTaskCard[];
  taskCount: number;
}

/** The `/board` payload. */
export interface ProjectBoardDTO {
  projectId: string;
  lanes: BoardLane[];
  columnTotals: Record<BoardColumn, number>;
}
