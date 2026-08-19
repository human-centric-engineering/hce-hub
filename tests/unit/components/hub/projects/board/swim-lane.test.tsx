/**
 * Unit: SwimLane (f-board-view t-2) — lane head, owned-feature chips, tasks
 * bucketed into columns, empty-column dots, the Unassigned lane.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  mergedAt: null,
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
    render(<SwimLane hideBugs={false} lane={lane()} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('lead')).toBeInTheDocument();
  });

  it('renders owned-feature chips', () => {
    render(
      <SwimLane
        hideBugs={false}
        lane={lane({ ownedFeatures: [{ id: 'f1', slug: 'f-access', title: 'Access' }] })}
      />
    );
    expect(screen.getByText('f-access')).toBeInTheDocument();
  });

  it('renders the Unassigned lane head (no member) as a pool anyone can take from', () => {
    render(
      <SwimLane
        hideBugs={false}
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
        hideBugs={false}
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
        hideBugs={false}
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

describe('SwimLane — bugs out of Assigned (§33-sweep t-107)', () => {
  const bugs = () =>
    lane({
      tasks: [
        card({ id: 'a', title: 'Real work', column: 'claimed', kind: 'feature_work' }),
        card({ id: 'b', title: 'A defect', column: 'claimed', kind: 'bug' }),
        card({ id: 'c', title: 'Bug in flight', column: 'active', kind: 'bug' }),
      ],
    });

  it('hides bug cards from Assigned when the toggle is on', () => {
    render(<SwimLane hideBugs lane={bugs()} />);
    expect(screen.getByText('Real work')).toBeInTheDocument();
    expect(screen.queryByText('A defect')).not.toBeInTheDocument();
  });

  it('leaves an ACTIVE bug visible — in-flight work is not clutter', () => {
    // The filter is Assigned-only by design: a bug someone is working on is work
    // in progress, and hiding it board-wide would conceal live activity.
    render(<SwimLane hideBugs lane={bugs()} />);
    expect(screen.getByText('Bug in flight')).toBeInTheDocument();
  });

  it('shows everything when the toggle is off', () => {
    render(<SwimLane hideBugs={false} lane={bugs()} />);
    expect(screen.getByText('A defect')).toBeInTheDocument();
    expect(screen.getByText('Bug in flight')).toBeInTheDocument();
  });
});

describe('SwimLane — Merged column cap (§33-sweep t-108)', () => {
  /** Seven merged cards, deliberately supplied OLDEST-first to prove the sort. */
  const sevenMerged = () =>
    lane({
      tasks: Array.from({ length: 7 }, (_, i) =>
        card({
          id: `m${i}`,
          title: `Merged ${i}`,
          column: 'merged',
          mergedAt: `2026-08-0${i + 1}T00:00:00.000Z`,
        })
      ),
    });

  it('shows the five NEWEST and folds the rest', () => {
    render(<SwimLane hideBugs={false} lane={sevenMerged()} />);
    // Newest is index 6 (2026-08-07); the two oldest fall behind the control.
    expect(screen.getByText('Merged 6')).toBeInTheDocument();
    expect(screen.getByText('Merged 2')).toBeInTheDocument();
    expect(screen.queryByText('Merged 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Merged 0')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 2 more' })).toBeInTheDocument();
  });

  it('reveals the rest and folds them again', () => {
    render(<SwimLane hideBugs={false} lane={sevenMerged()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getByText('Merged 0')).toBeInTheDocument();
    const collapse = screen.getByRole('button', { name: 'Show fewer' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapse);
    expect(screen.queryByText('Merged 0')).not.toBeInTheDocument();
  });

  it('offers no control at or under the cap', () => {
    render(
      <SwimLane
        hideBugs={false}
        lane={lane({
          tasks: Array.from({ length: 5 }, (_, i) =>
            card({ id: `m${i}`, title: `Merged ${i}`, column: 'merged' })
          ),
        })}
      />
    );
    expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument();
  });

  it('sorts a null mergedAt LAST — imported history, not unmerged', () => {
    // `null` means "merged before we tracked it" (§19's import predates the
    // column). Sorting it newest would put the oldest work at the top; dropping
    // it would hide real history. It goes last, which is where it belongs.
    render(
      <SwimLane
        hideBugs={false}
        lane={lane({
          tasks: [
            card({ id: 'old', title: 'Imported', column: 'merged', mergedAt: null }),
            card({
              id: 'new',
              title: 'Recent',
              column: 'merged',
              mergedAt: '2026-08-19T00:00:00.000Z',
            }),
          ],
        })}
      />
    );
    // Both fit under the cap; ORDER is what is under test.
    const shown = screen.getAllByRole('button', { name: /Open task/ });
    const text = shown.map((b) => b.textContent ?? '').join('|');
    expect(text.indexOf('Recent')).toBeLessThan(text.indexOf('Imported'));
  });
});
