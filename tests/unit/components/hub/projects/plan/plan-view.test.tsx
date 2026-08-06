/**
 * Unit: PlanView (f-plan-view t-2) — renders server-ordered features, expands
 * to tasks, and shows the empty state.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanView } from '@/components/hub/projects/plan/plan-view';
import type {
  PlanFeature,
  PlanPhaseBand,
  ProjectPlanDTO,
} from '@/components/hub/projects/plan/types';

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  id: 'f1',
  number: null,
  slug: null,
  title: 'Feature one',
  summary: null,
  description: null,
  status: 'available',
  waitingOn: [],
  planningStage: 'planned',
  helpWanted: false,
  owner: null,
  dependsOn: [],
  tasks: [],
  indicativeTasks: [],
  progress: { merged: 0, total: 0, live: 0, blocked: 0 },
  ...over,
});

// Wrap features in a single residual band — mirrors the server's no-phases output
// (an empty residual is dropped), so these render exactly like the flat plan.
const plan = (features: PlanFeature[], projectSlug: string | null = null): ProjectPlanDTO => ({
  projectId: 'p1',
  projectSlug,
  phases: features.length ? [{ id: null, name: null, status: null, ordinal: null, features }] : [],
});

// Build a plan from explicit phase bands (for the grouping/collapse tests).
const banded = (phases: PlanPhaseBand[]): ProjectPlanDTO => ({
  projectId: 'p1',
  projectSlug: null,
  phases,
});

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
            status: 'available',
            tasks: [
              {
                id: 't1',
                number: null,
                title: 'Do the thing',
                status: 'claimed',
                prUrl: null,
                claimer: null,
              },
            ],
            progress: { merged: 0, total: 1, live: 0, blocked: 0 },
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
              {
                id: 's1',
                number: null,
                title: 'shipped task',
                status: 'merged',
                prUrl: null,
                claimer: null,
              },
            ],
            progress: { merged: 1, total: 1, live: 0, blocked: 0 },
          }),
          feature({
            id: 'live',
            title: 'Live feature',
            status: 'in_flight',
            tasks: [
              {
                id: 'l1',
                number: null,
                title: 'live task',
                status: 'claimed',
                prUrl: null,
                claimer: null,
              },
            ],
            progress: { merged: 0, total: 1, live: 1, blocked: 0 },
          }),
        ])}
      />
    );
    // The in-flight feature's task is visible; the shipped one's is collapsed.
    expect(screen.getByText('live task')).toBeInTheDocument();
    expect(screen.queryByText('shipped task')).not.toBeInTheDocument();
  });

  it('prefers the feature containing an active task over an earlier non-shipped feature with only claimed tasks (f-status-model §20 t-37)', () => {
    render(
      <PlanView
        plan={plan([
          feature({
            id: 'first',
            title: 'First in order, nothing active',
            status: 'in_flight',
            tasks: [
              {
                id: 't1',
                number: null,
                title: 'claimed task',
                status: 'claimed',
                prUrl: null,
                claimer: null,
              },
            ],
            progress: { merged: 0, total: 1, live: 0, blocked: 0 },
          }),
          feature({
            id: 'second',
            title: 'Later, has the active task',
            status: 'in_flight',
            tasks: [
              {
                id: 't2',
                number: null,
                title: 'active task',
                status: 'active',
                prUrl: null,
                claimer: null,
              },
            ],
            progress: { merged: 0, total: 1, live: 1, blocked: 0 },
          }),
        ])}
      />
    );
    // The second feature (the one with the active task) is expanded by default,
    // even though the first feature sorts earlier and is also non-shipped with tasks.
    expect(screen.getByText('active task')).toBeInTheDocument();
    expect(screen.queryByText('claimed task')).not.toBeInTheDocument();
  });

  it('links feature rows using the project slug for the page URL when present (§19)', () => {
    render(
      <PlanView plan={plan([feature({ slug: 'f-x', title: 'Slugged feature' })], 'hce-hub')} />
    );
    const link = screen.getByRole('link', { name: /Slugged feature/ });
    expect(link).toHaveAttribute('href', '/projects/hce-hub/features/f-x');
  });

  it('falls back to the cuid projectId for feature links when the plan has no project slug', () => {
    render(<PlanView plan={plan([feature({ slug: 'f-x', title: 'No slug project' })], null)} />);
    const link = screen.getByRole('link', { name: /No slug project/ });
    expect(link).toHaveAttribute('href', '/projects/p1/features/f-x');
  });

  it('renders the summary line', () => {
    render(
      <PlanView plan={plan([feature({ status: 'shipped' }), feature({ status: 'available' })])} />
    );
    const summary = screen.getByText('features').closest('div')!;
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/most ready to advance/i)).toBeInTheDocument();
  });
});

describe('PlanView phase grouping (f-phases §22 t2)', () => {
  it('shows a band header with the phase name and feature count when phases exist', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'ph1',
            name: 'v0.9.0',
            status: 'active',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Filed feature' })],
          },
        ])}
      />
    );
    expect(screen.getByText('v0.9.0')).toBeInTheDocument();
    expect(screen.getByText('1 feature')).toBeInTheDocument();
    expect(screen.getByText('Filed feature')).toBeInTheDocument();
  });

  it('does not render band chrome when the plan is a single residual band', () => {
    render(<PlanView plan={plan([feature({ id: 'a', title: 'Unfiled' })])} />);
    expect(screen.getByText('Unfiled')).toBeInTheDocument();
    expect(screen.queryByText('No phase')).not.toBeInTheDocument();
  });

  it('labels the residual band "No phase" with no status chip (not "parked")', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'ph1',
            name: 'Active',
            status: 'active',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Filed' })],
          },
          {
            id: null,
            name: null,
            status: null,
            ordinal: null,
            features: [feature({ id: 'b', title: 'Unfiled' })],
          },
        ])}
      />
    );
    const residual = screen.getByRole('button', { name: /No phase/ });
    // Regression: a null-status residual band fell into the parked branch and
    // rendered "parked". It must carry no status chip at all.
    expect(within(residual).queryByText('parked')).not.toBeInTheDocument();
    expect(within(residual).getByText('1 feature')).toBeInTheDocument();
  });

  it('collapses a complete phase by default (done history), open on click', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'done',
            name: 'Foundations',
            status: 'complete',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Shipped work', status: 'shipped' })],
          },
        ])}
      />
    );
    expect(screen.queryByText('Shipped work')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Foundations/ }));
    expect(screen.getByText('Shipped work')).toBeInTheDocument();
  });

  it('collapses a parked band by default and reveals it on click', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'ideas',
            name: 'Idea park',
            status: 'parked',
            ordinal: 0,
            features: [feature({ id: 'p1', title: 'Parked idea' })],
          },
        ])}
      />
    );
    // Hidden until the parked band is opened.
    expect(screen.queryByText('Parked idea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Idea park/ }));
    expect(screen.getByText('Parked idea')).toBeInTheDocument();
  });
});
