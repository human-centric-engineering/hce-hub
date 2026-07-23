/**
 * Presentation constants for the Board view (f-board-view t-2).
 */
import type { BoardColumn, BoardLane, BoardTaskCard } from '@/components/hub/projects/board/types';

/** The three status columns, in display order, with header labels + subtitles. */
export const COLUMN_META: { key: BoardColumn; label: string; sub: string }[] = [
  { key: 'claimed', label: 'Claimed', sub: 'owned · ready or blocked' },
  { key: 'active', label: 'Active', sub: 'being worked' },
  { key: 'merged', label: 'Merged', sub: 'landed' },
];

/** The shared grid template — Owner column (200px) + 3 equal status columns. */
export const BOARD_GRID: React.CSSProperties = {
  gridTemplateColumns: '200px repeat(3, minmax(0, 1fr))',
};

/** Bucket a lane's tasks by their (server-computed) column. */
export function groupByColumn(lane: BoardLane): Record<BoardColumn, BoardTaskCard[]> {
  const byColumn: Record<BoardColumn, BoardTaskCard[]> = {
    claimed: [],
    active: [],
    merged: [],
  };
  for (const task of lane.tasks) byColumn[task.column].push(task);
  return byColumn;
}
