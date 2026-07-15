/**
 * Unit: PlanSummary (f-plan-view t-2) — feature count, tasks merged, status pills.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanSummary } from '@/components/hub/projects/plan/plan-summary';
import type { PlanFeature } from '@/components/hub/projects/plan/types';

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  id: 'f1',
  title: 't',
  description: null,
  status: 'planning',
  helpWanted: false,
  owner: null,
  dependsOn: [],
  tasks: [],
  progress: { merged: 0, total: 0, live: 0 },
  ...over,
});

describe('PlanSummary', () => {
  it('counts features and merged/total tasks', () => {
    render(
      <PlanSummary
        features={[
          feature({ status: 'shipped', progress: { merged: 1, total: 2, live: 0 } }),
          feature({ status: 'planning', progress: { merged: 0, total: 3, live: 1 } }),
        ]}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument(); // feature count (unique)
    expect(screen.getByText('/5')).toBeInTheDocument(); // total tasks
    expect(screen.getByText('shipped')).toBeInTheDocument();
    expect(screen.getByText('planning')).toBeInTheDocument();
  });

  it('omits a status pill for a band with zero features', () => {
    render(<PlanSummary features={[feature({ status: 'planning' })]} />);
    expect(screen.queryByText('blocked')).not.toBeInTheDocument();
    expect(screen.getByText('planning')).toBeInTheDocument();
  });
});
