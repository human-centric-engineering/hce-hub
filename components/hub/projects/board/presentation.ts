/**
 * Presentation constants for the Board view (f-board-view t-2).
 */
import type { BoardColumn, BoardLane, BoardTaskCard } from '@/components/hub/projects/board/types';

/** The five status columns, in display order, with header labels + subtitles. */
export const COLUMN_META: { key: BoardColumn; label: string; sub: string }[] = [
  { key: 'available', label: 'Available', sub: 'deps met · anyone can claim' },
  { key: 'claimed', label: 'Claimed', sub: 'in progress, no PR yet' },
  { key: 'in_pr', label: 'In PR', sub: 'awaiting review / CI' },
  { key: 'merged', label: 'Merged', sub: 'landed' },
  { key: 'backlog', label: 'Backlog', sub: 'deps unmet or not yet promoted' },
];

/** The shared grid template — Owner column (200px) + 5 equal status columns. */
export const BOARD_GRID: React.CSSProperties = {
  gridTemplateColumns: '200px repeat(5, minmax(0, 1fr))',
};

/** Bucket a lane's tasks by their (server-computed) column. */
export function groupByColumn(lane: BoardLane): Record<BoardColumn, BoardTaskCard[]> {
  const byColumn: Record<BoardColumn, BoardTaskCard[]> = {
    available: [],
    claimed: [],
    in_pr: [],
    merged: [],
    backlog: [],
  };
  for (const task of lane.tasks) byColumn[task.column].push(task);
  return byColumn;
}
