/**
 * Unit: BoardView + BoardHeader (f-board-view t-2).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Claimed')).toBeInTheDocument();
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
