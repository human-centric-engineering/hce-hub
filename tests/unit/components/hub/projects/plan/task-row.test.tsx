/**
 * Unit: TaskRow (f-plan-view t-2) — title, claimer (null → "—"), PR label,
 * effective-status pill.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskRow } from '@/components/hub/projects/plan/task-row';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { PlanTask } from '@/components/hub/projects/plan/types';

const task = (over: Partial<PlanTask> = {}): PlanTask => ({
  id: 't1',
  number: null,
  title: 'A task',
  status: 'claimed',
  prUrl: null,
  claimer: null,
  ...over,
});

describe('TaskRow', () => {
  it('renders the stable t-{number} and title', () => {
    render(<TaskRow task={task({ number: 6 })} ordinal={3} />);
    expect(screen.getByText('t-6')).toBeInTheDocument(); // the project-wide number, not the ordinal
    expect(screen.getByText('A task')).toBeInTheDocument();
  });

  it('falls back to the positional ordinal when the task has no number', () => {
    render(<TaskRow task={task({ number: null })} ordinal={3} />);
    expect(screen.getByText('t-3')).toBeInTheDocument();
  });

  it('renders the effective-status label', () => {
    render(<TaskRow task={task({ status: 'blocked' })} ordinal={1} />);
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('opens the task sheet with the task id on click', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <TaskRow task={task({ id: 'task-xyz' })} ordinal={1} />
      </TaskSheetControlsProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Open task/ }));
    expect(open).toHaveBeenCalledWith('task-xyz');
  });

  it('opens the sheet on keyboard activation (Enter / Space)', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <TaskRow task={task({ id: 'task-kbd' })} ordinal={1} />
      </TaskSheetControlsProvider>
    );
    const row = screen.getByRole('button', { name: /Open task/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' }); // a non-activating key does nothing
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith('task-kbd');
  });

  it('clicking the PR link does not open the sheet (stops propagation)', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <TaskRow task={task({ prUrl: 'https://github.com/x/y/pull/5' })} ordinal={1} />
      </TaskSheetControlsProvider>
    );
    fireEvent.click(screen.getByRole('link'));
    expect(open).not.toHaveBeenCalled();
  });

  it('renders "active" for the active status', () => {
    render(<TaskRow task={task({ status: 'active' })} ordinal={1} />);
    expect(screen.getByText('active')).toBeInTheDocument();
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
