/**
 * Unit: BorrowedTaskRow (f-work-kinds §32 t-95) — a task committed to a phase other
 * than its feature's, rendered inline in the borrowing band.
 *
 * The row's job is to read as "work from elsewhere, being done here": kind tag,
 * origin breadcrumb back to the feature, and the same task sheet as any other row.
 * What it must NOT do is signal that through placement — that is the band's
 * ordering, asserted in `plan.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BorrowedTaskRow } from '@/components/hub/projects/plan/borrowed-task-row';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { PlanBorrowedTask } from '@/components/hub/projects/plan/types';

const task = (over: Partial<PlanBorrowedTask> = {}): PlanBorrowedTask => ({
  id: 't93',
  number: 93,
  title: 'Feature-level blocking propagates to its tasks',
  status: 'claimed',
  kind: 'enhancement',
  prUrl: null,
  claimer: null,
  feature: { id: 'f20', slug: 'f-status-model', title: 'Readiness-derived status' },
  originPhaseName: 'Foundations (V1)',
  ...over,
});

const renderRow = (over: Partial<PlanBorrowedTask> = {}, projectRef = 'hce-hub') =>
  render(
    <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
      <BorrowedTaskRow task={task(over)} projectRef={projectRef} />
    </TaskSheetControlsProvider>
  );

describe('BorrowedTaskRow', () => {
  it('renders the task ref, title and kind tag', () => {
    renderRow();
    expect(screen.getByText('t-93')).toBeInTheDocument();
    expect(screen.getByText(/Feature-level blocking/)).toBeInTheDocument();
    // The §32 t-88 kind tag — an enhancement reads "new".
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('carries an origin breadcrumb linking back to the feature it belongs to', () => {
    renderRow();
    const link = screen.getByRole('link', { name: 'f-status-model' });
    expect(link).toHaveAttribute('href', '/projects/hce-hub/features/f-status-model');
    expect(screen.getByText(/Foundations \(V1\)/)).toBeInTheDocument();
  });

  it('falls back to the feature id in the link, and the title as the ref, when unslugged', () => {
    renderRow({ feature: { id: 'f20', slug: null, title: 'Readiness-derived status' } });
    const link = screen.getByRole('link', { name: 'Readiness-derived status' });
    expect(link).toHaveAttribute('href', '/projects/hce-hub/features/f20');
  });

  it('omits the origin phase when the feature is unfiled, without breaking the crumb', () => {
    renderRow({ originPhaseName: null });
    expect(screen.getByRole('link', { name: 'f-status-model' })).toBeInTheDocument();
  });

  it('opens the task sheet on click — the same sheet as any other task row', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <BorrowedTaskRow task={task()} projectRef="hce-hub" />
      </TaskSheetControlsProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Open task t-93/ }));
    expect(open).toHaveBeenCalledWith('t93');
  });

  it('opens the sheet on keyboard activation (Enter / Space), like every other row', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <BorrowedTaskRow task={task()} projectRef="hce-hub" />
      </TaskSheetControlsProvider>
    );
    const row = screen.getByRole('button', { name: /Open task t-93/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' }); // a non-activating key does nothing
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith('t93');
  });

  it('does not open the sheet when the PR link is clicked (stops propagation)', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <BorrowedTaskRow
          task={task({ prUrl: 'https://github.com/o/r/pull/156' })}
          projectRef="hce-hub"
        />
      </TaskSheetControlsProvider>
    );
    fireEvent.click(screen.getByRole('link', { name: '#156' }));
    expect(open).not.toHaveBeenCalled();
  });

  it('renders the holder avatar image when they have one', () => {
    renderRow({
      claimer: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: 'https://x/a.png' },
    });
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('does not open the sheet when the breadcrumb link is clicked (stops propagation)', () => {
    // Otherwise navigating to the feature would also open the sheet behind it.
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <BorrowedTaskRow task={task()} projectRef="hce-hub" />
      </TaskSheetControlsProvider>
    );
    fireEvent.click(screen.getByRole('link', { name: 'f-status-model' }));
    expect(open).not.toHaveBeenCalled();
  });

  it('renders "unassigned" for a task nobody holds — the normal state for an enhancement', () => {
    // Two of them, and that is the point: the person slot AND the status chip,
    // which since §32 t-89 stops claiming "assigned" for work nobody holds. The
    // borrowed row inherits that agreement by using the same `taskStatus` helper.
    renderRow({ claimer: null });
    expect(screen.getAllByText('unassigned')).toHaveLength(2);
  });

  it('renders the holder first name when someone has it', () => {
    renderRow({ claimer: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null } });
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('renders no link for a javascript: PR url (sanitized to no-link)', () => {
    renderRow({ prUrl: 'javascript:alert(1)' });
    expect(screen.queryByRole('link', { name: /^#/ })).not.toBeInTheDocument();
  });

  it('renders a short #-labelled PR link when one is set', () => {
    renderRow({ prUrl: 'https://github.com/o/r/pull/156' });
    expect(screen.getByRole('link', { name: '#156' })).toHaveAttribute(
      'href',
      'https://github.com/o/r/pull/156'
    );
  });

  it('renders "t-—" for a task with no number yet', () => {
    renderRow({ number: null });
    expect(screen.getByText('t-—')).toBeInTheDocument();
  });
});
