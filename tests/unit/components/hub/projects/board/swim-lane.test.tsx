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
  number: null,
  title: 't',
  featureId: 'f1',
  featureSlug: null,
  featureTitle: 'F1',
  status: 'claimed',
  kind: 'feature_work',
  column: 'claimed',
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
    render(
      <SwimLane lane={lane({ ownedFeatures: [{ id: 'f1', slug: 'f-access', title: 'Access' }] })} />
    );
    expect(screen.getByText('f-access')).toBeInTheDocument();
  });

  it('renders the Unassigned lane head (no member) as a pool anyone can take from', () => {
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
    // The copy must match the affordance: the task sheet offers Assign (to
    // yourself, which is the pull), so the old "pull, don't assign" contradicted
    // the only control the lane leads to (§32 t-89).
    expect(screen.getByText('2 tasks · free to take')).toBeInTheDocument();
  });

  it('singularises the lane count', () => {
    render(
      <SwimLane
        lane={lane({
          key: 'unassigned',
          member: null,
          role: null,
          taskCount: 1,
          tasks: [card({ id: 'a' })],
        })}
      />
    );
    expect(screen.getByText('1 task · free to take')).toBeInTheDocument();
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
    // claimed/active empty → two dots (merged has the card)
    expect(screen.getAllByText('·')).toHaveLength(2);
  });
});
