/**
 * The Board view (f-board-view t-2) — the project's tasks as a Kanban: member
 * swim lanes × effective-status columns (routed server-side by `/board`). Scrolls
 * horizontally within its own container on narrow viewports; lanes and header
 * share one grid template so columns line up.
 */
import { BoardHeader } from '@/components/hub/projects/board/board-header';
import { SwimLane } from '@/components/hub/projects/board/swim-lane';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';

export function BoardView({ board }: { board: ProjectBoardDTO }) {
  if (board.lanes.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No members yet — the board fills in once a project has a team.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[60rem]">
        <BoardHeader columnTotals={board.columnTotals} />
        {board.lanes.map((lane) => (
          <SwimLane key={lane.key} lane={lane} />
        ))}
      </div>
    </div>
  );
}
