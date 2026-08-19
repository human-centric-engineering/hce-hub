/**
 * Presentation constants for the Board view (f-board-view t-2).
 */
import type { BoardColumn, BoardLane, BoardTaskCard } from '@/components/hub/projects/board/types';

/** The three status columns, in display order, with header labels + subtitles. */
export const COLUMN_META: { key: BoardColumn; label: string; sub: string }[] = [
  { key: 'claimed', label: 'Assigned', sub: 'assigned · ready or blocked' },
  { key: 'active', label: 'Active', sub: 'being worked' },
  { key: 'merged', label: 'Merged', sub: 'landed' },
];

/** The shared grid template — Owner column (200px) + 3 equal status columns. */
export const BOARD_GRID: React.CSSProperties = {
  gridTemplateColumns: '200px repeat(3, minmax(0, 1fr))',
};

/** How many merged cards a lane shows before the rest are folded away (§33-sweep t-108). */
export const MERGED_VISIBLE = 5;

/**
 * Bucket a lane's tasks by their (server-computed) column.
 *
 * The **merged** bucket comes back newest-first; the other two keep the server's
 * `createdAt asc`. Merged work is history, and the useful card there is almost
 * always the one that just landed — whereas an open column reads as a queue, where
 * oldest-first is the right order.
 *
 * A `null` `mergedAt` sorts LAST, i.e. oldest. It means "merged before we tracked
 * it" (§19's import predates the column — see `.context/app/work-kinds.md`), never
 * "unmerged", so dropping those rows would silently hide real history.
 */
export function groupByColumn(lane: BoardLane): Record<BoardColumn, BoardTaskCard[]> {
  const byColumn: Record<BoardColumn, BoardTaskCard[]> = {
    claimed: [],
    active: [],
    merged: [],
  };
  for (const task of lane.tasks) byColumn[task.column].push(task);
  byColumn.merged.sort(byMergedAtDesc);
  return byColumn;
}

/** Newest merge first; unknown instants (imported history) last. */
function byMergedAtDesc(a: BoardTaskCard, b: BoardTaskCard): number {
  if (a.mergedAt === b.mergedAt) return 0;
  if (a.mergedAt === null) return 1;
  if (b.mergedAt === null) return -1;
  // ISO-8601 UTC strings from the same source sort lexicographically — no Date
  // parsing, so this is allocation-free and immune to timezone handling.
  return a.mergedAt < b.mergedAt ? 1 : -1;
}

/**
 * Bug cards hidden from the **Assigned** column when the toggle is on (t-107).
 *
 * Assigned only, not board-wide: bugs keep the owner cascade, so they land assigned
 * and pile up there, crowding out work someone actually chose. A bug already in
 * flight is work in progress and stays visible.
 */
export function hiddenBugCount(lanes: BoardLane[]): number {
  return lanes.reduce(
    (n, lane) => n + lane.tasks.filter((t) => t.column === 'claimed' && t.kind === 'bug').length,
    0
  );
}
