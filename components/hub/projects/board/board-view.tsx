'use client';

/**
 * The Board view (f-board-view t-2) — the project's tasks as a Kanban: member
 * swim lanes × effective-status columns (routed server-side by `/board`). Scrolls
 * horizontally within its own container on narrow viewports; lanes and header
 * share one grid template so columns line up.
 *
 * Client since §33-sweep t-107: the hide-bugs choice is per-viewer, per-project
 * UI state, persisted in `localStorage` like the active-bugs strip's collapse.
 * It is deliberately NOT a server filter — the counts must keep reporting the
 * true totals (see `BoardHeader`), and a server-side filter would have to send
 * both the filtered list and the unfiltered counts to achieve the same thing.
 */
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { BoardHeader } from '@/components/hub/projects/board/board-header';
import { SwimLane } from '@/components/hub/projects/board/swim-lane';
import { hiddenBugCount } from '@/components/hub/projects/board/presentation';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';

export function BoardView({ board }: { board: ProjectBoardDTO }) {
  // Project-keyed, matching the active-bugs strip: hiding bugs on one project
  // says nothing about another. Default `false` — showing — so the board never
  // silently withholds work from someone who has not opted in.
  //
  // ACCEPTED LIMIT (review round 1): `useLocalStorage` deliberately returns
  // `initial` on the first render so the client's tree matches the server's HTML,
  // and picks the stored value up post-mount. For a viewer who HAS opted in, that
  // means the bugs render once and then vanish — a visible flash and a small
  // layout shift on every load, and any screenshot or print is unfiltered.
  // Kept because every alternative is worse: the server cannot read localStorage,
  // so removing the flash means either withholding the whole board until mount (a
  // blank flash instead of a content one, on the primary surface) or moving the
  // preference server-side, which is a user-preferences model and API for one
  // boolean. The active-bugs strip already accepts the same trade; this is a
  // bigger surface, but the same reasoning and the same wrong alternatives.
  const [hideBugs, setHideBugs] = useLocalStorage(
    `hub:board-hide-assigned-bugs:${board.projectId}`,
    false
  );

  if (board.lanes.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No members yet — the board fills in once a project has a team.
      </p>
    );
  }

  // Counted from the WHOLE board, not per lane, because the toggle is one control
  // over every lane at once — "5 bugs hidden" has to mean five cards you cannot
  // currently see anywhere, or the number is a lie the moment there are two lanes.
  const hidden = hiddenBugCount(board.lanes);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[60rem]">
        <BoardHeader
          columnTotals={board.columnTotals}
          hideBugs={hideBugs}
          hiddenBugs={hidden}
          onToggleBugs={() => setHideBugs((v) => !v)}
        />
        {board.lanes.map((lane) => (
          <SwimLane key={lane.key} lane={lane} hideBugs={hideBugs} />
        ))}
      </div>
    </div>
  );
}
