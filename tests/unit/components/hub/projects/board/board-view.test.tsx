/**
 * Unit: BoardView + BoardHeader (f-board-view t-2).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardView } from '@/components/hub/projects/board/board-view';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';

const board = (over: Partial<ProjectBoardDTO> = {}): ProjectBoardDTO => ({
  projectId: 'p1',
  lanes: [
    {
      key: 'u1',
      member: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null },
      role: 'lead',
      ownedFeatures: [],
      tasks: [],
      taskCount: 0,
    },
  ],
  columnTotals: { claimed: 3, active: 1, merged: 5 },
  ...over,
});

describe('BoardView', () => {
  it('renders the column headers with their counts', () => {
    render(<BoardView board={board()} />);
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText('Merged')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // claimed total
    expect(screen.getByText('5')).toBeInTheDocument(); // merged total
  });

  it('renders a lane per member', () => {
    render(<BoardView board={board()} />);
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('shows the empty state when there are no lanes', () => {
    render(<BoardView board={board({ lanes: [] })} />);
    expect(screen.getByText(/No members yet/i)).toBeInTheDocument();
  });
});

describe('BoardView — hide bugs from Assigned (§33-sweep t-107)', () => {
  const withBugs = () =>
    board({
      lanes: [
        {
          key: 'u1',
          member: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null },
          role: 'lead',
          ownedFeatures: [],
          tasks: [
            {
              id: 'a',
              number: 1,
              title: 'Real work',
              featureId: 'f1',
              featureSlug: 'f-one',
              featureTitle: 'One',
              status: 'claimed',
              kind: 'feature_work',
              column: 'claimed',
              mergedAt: null,
              prUrl: null,
              claimer: null,
              isMine: false,
              collision: null,
            },
            {
              id: 'b',
              number: 2,
              title: 'A defect',
              featureId: 'f1',
              featureSlug: 'f-one',
              featureTitle: 'One',
              status: 'claimed',
              kind: 'bug',
              column: 'claimed',
              mergedAt: null,
              prUrl: null,
              claimer: null,
              isMine: false,
              collision: null,
            },
          ],
          taskCount: 2,
        },
      ],
      columnTotals: { claimed: 2, active: 0, merged: 0 },
    });

  beforeEach(() => window.localStorage.clear());

  it('defaults to SHOWING bugs — the board never withholds work unasked', () => {
    render(<BoardView board={withBugs()} />);
    expect(screen.getByText('A defect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hide bugs' })).toBeInTheDocument();
  });

  it('hides them on toggle and keeps the count TRUE', () => {
    render(<BoardView board={withBugs()} />);
    fireEvent.click(screen.getByRole('button', { name: 'hide bugs' }));

    expect(screen.queryByText('A defect')).not.toBeInTheDocument();
    expect(screen.getByText('Real work')).toBeInTheDocument();
    // The load-bearing assertion: the column count still reads 2, not 1. A count
    // that moves with a display filter is the quiet lie §32 t-94 removed — the
    // delta belongs on the toggle, which now says how many are hidden.
    expect(screen.getByText('2')).toBeInTheDocument();
    // Singular, because "1 bugs hidden" is the kind of detail that makes a
    // surface feel unfinished. The accessible name is this text.
    expect(screen.getByRole('button', { name: '1 bug hidden' })).toBeInTheDocument();
  });

  it('persists the choice per project', () => {
    const { unmount } = render(<BoardView board={withBugs()} />);
    fireEvent.click(screen.getByRole('button', { name: 'hide bugs' }));
    expect(window.localStorage.getItem('hub:board-hide-assigned-bugs:p1')).toBe('true');
    unmount();

    // A different project must NOT inherit it — the key is project-scoped.
    render(<BoardView board={{ ...withBugs(), projectId: 'p2' }} />);
    expect(screen.getByText('A defect')).toBeInTheDocument();
  });

  it('offers no toggle when there are no bugs to hide', () => {
    render(<BoardView board={board()} />);
    expect(screen.queryByRole('button', { name: /bugs?/ })).not.toBeInTheDocument();
  });
});

describe('BoardView — the opt-out stays reachable (review round 1)', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the toggle when the last bug merges, so a set preference can be cleared', () => {
    // Gating purely on `hiddenBugs > 0` removed the only control the moment the
    // last bug merged, while `hideBugs` stayed true in storage — a preference
    // still in force with nothing on screen admitting it, and no way back.
    window.localStorage.setItem('hub:board-hide-assigned-bugs:p1', 'true');
    render(<BoardView board={board()} />); // no bugs at all
    const toggle = screen.getByRole('button', { name: 'bugs hidden' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);
    // …and once cleared with nothing to hide, the control correctly goes away —
    // there is no preference in force and no bug to act on.
    expect(screen.queryByRole('button', { name: /bugs?/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('hub:board-hide-assigned-bugs:p1')).toBe('false');
  });
});
