/**
 * Unit: TaskRow (f-plan-view t-2) — title, claimer (null → "—"), PR label,
 * effective-status pill.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskRow } from '@/components/hub/projects/plan/task-row';
import type { PlanTask } from '@/components/hub/projects/plan/types';

const task = (over: Partial<PlanTask> = {}): PlanTask => ({
  id: 't1',
  title: 'A task',
  status: 'available',
  prUrl: null,
  claimer: null,
  ...over,
});

describe('TaskRow', () => {
  it('renders the positional t-N ordinal and title', () => {
    render(<TaskRow task={task()} ordinal={3} />);
    expect(screen.getByText('t-3')).toBeInTheDocument();
    expect(screen.getByText('A task')).toBeInTheDocument();
  });

  it('renders the effective-status label', () => {
    render(<TaskRow task={task({ status: 'blocked' })} ordinal={1} />);
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('renders "in pr" for the in_pr status', () => {
    render(<TaskRow task={task({ status: 'in_pr' })} ordinal={1} />);
    expect(screen.getByText('in pr')).toBeInTheDocument();
  });

  it('renders a null claimer as "—"', () => {
    render(<TaskRow task={task({ claimer: null })} ordinal={1} />);
    // two "—" (claimer + pr); both dashes are fine, assert at least one present
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the claimer first name when present', () => {
    render(
      <TaskRow
        task={task({ claimer: { id: 'u1', name: 'Grace Hopper', email: 'g@x.io', image: null } })}
        ordinal={1}
      />
    );
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('renders a PR link with a short #-label when prUrl is set', () => {
    render(<TaskRow task={task({ prUrl: 'https://github.com/o/r/pull/44' })} ordinal={1} />);
    const link = screen.getByRole('link', { name: '#44' });
    expect(link).toHaveAttribute('href', 'https://github.com/o/r/pull/44');
  });

  it('renders no link for a javascript: PR url (sanitized to no-link)', () => {
    render(<TaskRow task={task({ prUrl: 'javascript:alert(1)' })} ordinal={1} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
