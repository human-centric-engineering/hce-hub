/**
 * Unit: PlanView (f-plan-view t-2) — renders server-ordered features, expands
 * to tasks, and shows the empty state.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanView } from '@/components/hub/projects/plan/plan-view';
import type { PlanFeature, ProjectPlanDTO } from '@/components/hub/projects/plan/types';

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  id: 'f1',
  title: 'Feature one',
  description: null,
  status: 'planning',
  helpWanted: false,
  owner: null,
  dependsOn: [],
  tasks: [],
  progress: { merged: 0, total: 0, live: 0 },
  ...over,
});

const plan = (features: PlanFeature[]): ProjectPlanDTO => ({ projectId: 'p1', features });

describe('PlanView rendering', () => {
  it('renders features in the given order and numbers them', () => {
    render(
      <PlanView
        plan={plan([
          feature({ id: 'a', title: 'Foundation', status: 'shipped' }),
          feature({ id: 'b', title: 'Built on it' }),
        ])}
      />
    );
    expect(screen.getByText('Foundation')).toBeInTheDocument();
    expect(screen.getByText('Built on it')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
  });

  it('shows the empty state when there are no features', () => {
    render(<PlanView plan={plan([])} />);
    expect(screen.getByText(/No features yet/i)).toBeInTheDocument();
  });

  it('expands a feature to reveal its task table on click', () => {
    render(
      <PlanView
        plan={plan([
          feature({
            id: 'f1',
            title: 'Has tasks',
            status: 'planning',
            tasks: [
              { id: 't1', title: 'Do the thing', status: 'available', prUrl: null, claimer: null },
            ],
            progress: { merged: 0, total: 1, live: 0 },
          }),
        ])}
      />
    );
    // Not expanded by default (planning, but the default-open picks the first
    // NON-shipped feature with tasks — here that IS f1, so it opens).
    expect(screen.getByText('Do the thing')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { expanded: true });
    fireEvent.click(toggle);
    expect(screen.queryByText('Do the thing')).not.toBeInTheDocument();
  });

  it('opens the first in-flight feature with tasks by default, not a shipped one', () => {
    render(
      <PlanView
        plan={plan([
          feature({
            id: 'shipped',
            title: 'Shipped feature',
            status: 'shipped',
            tasks: [
              { id: 's1', title: 'shipped task', status: 'merged', prUrl: null, claimer: null },
            ],
            progress: { merged: 1, total: 1, live: 0 },
          }),
          feature({
            id: 'live',
            title: 'Live feature',
            status: 'in_flight',
            tasks: [
              { id: 'l1', title: 'live task', status: 'claimed', prUrl: null, claimer: null },
            ],
            progress: { merged: 0, total: 1, live: 1 },
          }),
        ])}
      />
    );
    // The in-flight feature's task is visible; the shipped one's is collapsed.
    expect(screen.getByText('live task')).toBeInTheDocument();
    expect(screen.queryByText('shipped task')).not.toBeInTheDocument();
  });

  it('renders the summary line', () => {
    render(
      <PlanView plan={plan([feature({ status: 'shipped' }), feature({ status: 'planning' })])} />
    );
    const summary = screen.getByText('features').closest('div')!;
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/most ready to advance/i)).toBeInTheDocument();
  });
});
