/**
 * Unit: SwimLane (f-board-view t-2) — lane head, owned-feature chips, tasks
 * bucketed into columns, empty-column dots, the Unassigned lane.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SwimLane } from '@/components/hub/projects/board/swim-lane';
import type { BoardLane, BoardTaskCard } from '@/components/hub/projects/board/types';

const card = (over: Partial<BoardTaskCard>): BoardTaskCard => ({
  id: 't1',
  title: 't',
  featureId: 'f1',
  featureTitle: 'F1',
  status: 'available',
  column: 'available',
  prUrl: null,
  claimer: null,
  isMine: false,
  collision: null,
  ...over,
});

const lane = (over: Partial<BoardLane> = {}): BoardLane => ({
  key: 'u1',
  member: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
  role: 'lead',
  ownedFeatures: [],
  tasks: [],
  taskCount: 0,
  ...over,
});

describe('SwimLane', () => {
  it('renders the member name and role', () => {
    render(<SwimLane lane={lane()} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('lead')).toBeInTheDocument();
  });

  it('renders owned-feature chips', () => {
    render(<SwimLane lane={lane({ ownedFeatures: [{ id: 'f1', title: 'f-access' }] })} />);
    expect(screen.getByText('f-access')).toBeInTheDocument();
  });

  it('renders the Unassigned lane head (no member) with the pull-not-assign copy', () => {
    render(
      <SwimLane
        lane={lane({
          key: 'unassigned',
          member: null,
          role: null,
          taskCount: 2,
          tasks: [card({ id: 'a' }), card({ id: 'b' })],
        })}
      />
    );
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText(/pull, don.t assign/i)).toBeInTheDocument();
  });

  it('places a task in its column and shows dots for the empty ones', () => {
    render(
      <SwimLane
        lane={lane({
          tasks: [card({ id: 't1', title: 'Merged task', column: 'merged' })],
          taskCount: 1,
        })}
      />
    );
    expect(screen.getByText('Merged task')).toBeInTheDocument();
    // available/claimed/in_pr/backlog empty → four dots (merged has the card)
    expect(screen.getAllByText('·')).toHaveLength(4);
  });
});
