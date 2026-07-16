/**
 * Unit: FeatureRow (f-plan-view t-2).
 *
 * Load-bearing: a null owner renders "unassigned" (never a deref — carried
 * f-data-model t-3 finding); the mono feature slug + dependency chips render the
 * slug (title fallback, f-refs); help-wanted flags; progress + chevron only when
 * the feature has tasks.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureRow } from '@/components/hub/projects/plan/feature-row';
import type { PlanFeature } from '@/components/hub/projects/plan/types';

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  id: 'f1',
  slug: null,
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

const noop = () => {};

describe('FeatureRow', () => {
  it('renders a null owner as "unassigned", never dereferencing', () => {
    render(
      <FeatureRow feature={feature({ owner: null })} ordinal={1} expanded={false} onToggle={noop} />
    );
    expect(screen.getByText('unassigned')).toBeInTheDocument();
  });

  it('renders the owner first name when present', () => {
    render(
      <FeatureRow
        feature={feature({
          owner: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
        })}
        ordinal={1}
        expanded={false}
        onToggle={noop}
      />
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('renders the mono feature slug beside the title', () => {
    render(
      <FeatureRow
        feature={feature({ slug: 'f-access', title: 'Membership funnel' })}
        ordinal={1}
        expanded={false}
        onToggle={noop}
      />
    );
    expect(screen.getByText('f-access')).toBeInTheDocument();
    expect(screen.getByText('Membership funnel')).toBeInTheDocument();
  });

  it('renders dependency chips with the depended-on feature slug (title fallback)', () => {
    render(
      <FeatureRow
        feature={feature({
          dependsOn: [
            { id: 'a', slug: 'f-access', title: 'Membership funnel' },
            { id: 'b', slug: null, title: 'Unslugged feature' },
          ],
        })}
        ordinal={2}
        expanded={false}
        onToggle={noop}
      />
    );
    expect(screen.getByText('depends on')).toBeInTheDocument();
    expect(screen.getByText('f-access')).toBeInTheDocument(); // slug
    expect(screen.getByText('Unslugged feature')).toBeInTheDocument(); // title fallback
  });

  it('flags a help-wanted feature', () => {
    render(
      <FeatureRow
        feature={feature({ helpWanted: true })}
        ordinal={1}
        expanded={false}
        onToggle={noop}
      />
    );
    expect(screen.getByText('help wanted')).toBeInTheDocument();
  });

  it('shows progress and is a toggle button when the feature has tasks', () => {
    const onToggle = vi.fn();
    render(
      <FeatureRow
        feature={feature({
          tasks: [
            { id: 't1', number: null, title: 'x', status: 'merged', prUrl: null, claimer: null },
          ],
          progress: { merged: 1, total: 2, live: 1 },
        })}
        ordinal={1}
        expanded={false}
        onToggle={onToggle}
      />
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText(/1 live/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('is not a button and shows "no tasks yet" when a planning feature has none', () => {
    render(
      <FeatureRow
        feature={feature({ status: 'planning', tasks: [] })}
        ordinal={1}
        expanded={false}
        onToggle={noop}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('no tasks yet')).toBeInTheDocument();
  });

  it('renders the task table when expanded', () => {
    render(
      <FeatureRow
        feature={feature({
          tasks: [
            {
              id: 't1',
              number: null,
              title: 'Expanded task',
              status: 'available',
              prUrl: null,
              claimer: null,
            },
          ],
          progress: { merged: 0, total: 1, live: 0 },
        })}
        ordinal={1}
        expanded
        onToggle={noop}
      />
    );
    // The expanded task row is itself a button (opens the sheet), so select the
    // feature toggle by its aria-expanded state to disambiguate.
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open task Expanded task' })).toBeInTheDocument();
    expect(screen.getByText('Expanded task')).toBeInTheDocument();
  });
});
