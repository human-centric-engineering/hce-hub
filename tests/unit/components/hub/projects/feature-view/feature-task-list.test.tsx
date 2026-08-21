/**
 * Unit: FeatureTaskList (f-feature-planning §18 t-3). A planned feature shows real
 * task rows that open the `?task=` sheet; an indicative feature shows its muted
 * sketch (no task buttons); neither → an honest empty state.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureTaskList } from '@/components/hub/projects/feature-view/feature-task-list';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type {
  FeatureDetailTaskDTO,
  FeatureTaskPhaseBoundaryDTO,
} from '@/components/hub/projects/feature-view/types';

const task = (over: Partial<FeatureDetailTaskDTO> = {}): FeatureDetailTaskDTO => ({
  id: 't1',
  number: 3,
  title: 'Wire the guard',
  status: 'claimed',
  kind: 'feature_work',
  doneWhen: null,
  prUrl: null,
  committedPhaseName: null,
  claimer: null,
  assignee: null,
  ...over,
});

describe('FeatureTaskList — planned', () => {
  it('renders real task rows that open the sheet, showing done-when + assignee fallback', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <FeatureTaskList
          tasks={[
            task({
              doneWhen: 'gates green',
              assignee: { id: 'a', name: 'Ada Lovelace', email: 'a@x', image: null },
            }),
          ]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('Wire the guard')).toBeInTheDocument();
    expect(screen.getByText(/done when: gates green/)).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument(); // assignee (no live claimer)
    fireEvent.click(screen.getByRole('button', { name: 'Open task t-3' }));
    expect(open).toHaveBeenCalledWith('t1');
  });

  it('marks a borrowed task with its committed phase, and leaves an inherited one bare (§33-sweep t-113)', () => {
    const { rerender } = render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ committedPhaseName: 'Project flow' })]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    // The reciprocal of the Plan's borrowed row: this task also appears in that band.
    expect(screen.getByText('Project flow')).toBeInTheDocument();
    expect(
      screen.getByTitle(/Committed to the Project flow phase — it also appears in that band/)
    ).toBeInTheDocument();

    // Asserted in BOTH directions from one fixture. The overwhelmingly common case is
    // a task that simply inherits its feature's phase, and a mark that renders on every
    // row is worth nothing — so "nothing here" is the half that pins the predicate.
    rerender(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ committedPhaseName: null })]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.queryByText('Project flow')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Committed to the/)).not.toBeInTheDocument();
  });

  it('tags a bug-kind task, and leaves feature-work untagged', () => {
    const { rerender } = render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ kind: 'bug' })]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('bug')).toBeInTheDocument();

    rerender(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ kind: 'feature_work' })]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.queryByText('bug')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/An enhancement/)).not.toBeInTheDocument();
  });

  // This is the surface the gap was found on: a post-ship enhancement lands in a
  // shipped feature's task table, outside the `N/N` roll-up, and until §32 t-88
  // arrived there untagged — visually identical to the feature-work above it.
  it('tags an enhancement-kind task (§32 t-88)', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ kind: 'enhancement' })]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByTitle(/An enhancement — new work/)).toBeInTheDocument();
    expect(screen.queryByText('bug')).not.toBeInTheDocument();
  });

  it('renders "unassigned" with no claimer/assignee and a "t-—" for a null number', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ number: null, doneWhen: null, claimer: null, assignee: null })]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    // Two now: the person slot AND the status chip, which since §32 t-89 stops
    // claiming "assigned" for a task nobody holds. Their agreeing is the point.
    expect(screen.getAllByText('unassigned')).toHaveLength(2);
    expect(screen.getByText('t-—')).toBeInTheDocument();
  });

  it('opens the sheet on keyboard activation (Enter)', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <FeatureTaskList tasks={[task()]} indicativeTasks={[]} phaseBoundaries={[]} />
      </TaskSheetControlsProvider>
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open task t-3' }), { key: 'Enter' });
    expect(open).toHaveBeenCalledWith('t1');
  });

  it('prefers the live claimer over the assignee', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[
            task({
              assignee: { id: 'a', name: 'Ada', email: 'a@x', image: null },
              claimer: { id: 'b', name: 'Bo Diaz', email: 'b@x', image: null },
            }),
          ]}
          indicativeTasks={[]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });
});

describe('FeatureTaskList — indicative + empty', () => {
  it('renders the muted sketch (no task-open buttons) when there are no real tasks', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[]}
          indicativeTasks={[{ id: 'i1', order: 0, text: 'sketch the schema' }]}
          phaseBoundaries={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('sketch the schema')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an honest empty state when unplanned with no sketch', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList tasks={[]} indicativeTasks={[]} phaseBoundaries={[]} />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText(/hasn.t been planned/)).toBeInTheDocument();
  });
});

describe('FeatureTaskList — phase boundaries (§33 t-100)', () => {
  const boundary = (
    over: Partial<FeatureTaskPhaseBoundaryDTO> = {}
  ): FeatureTaskPhaseBoundaryDTO => ({
    beforeTaskId: 't2',
    fromPhaseName: 'Project flow',
    toPhaseName: 'Sunrise Management',
    movedAt: '2026-08-18T09:00:00.000Z',
    ...over,
  });

  const rows = [task({ id: 't1', number: 1 }), task({ id: 't2', number: 2 })];

  const renderList = (phaseBoundaries: FeatureTaskPhaseBoundaryDTO[]) =>
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList tasks={rows} indicativeTasks={[]} phaseBoundaries={phaseBoundaries} />
      </TaskSheetControlsProvider>
    );

  it('draws nothing at all for a feature that never moved', () => {
    renderList([]);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('names both phases and dates the move, above the task it anchors to', () => {
    const { container } = renderList([boundary()]);
    const separator = screen.getByRole('separator');
    expect(separator).toHaveAccessibleName(
      'moved from Project flow to Sunrise Management on 18 Aug 2026'
    );
    // Order is the whole point: everything above was done under the old phase.
    const children = Array.from(container.firstElementChild?.children ?? []);
    expect(children).toHaveLength(3); // t-1, the marker, t-2
    expect(children.indexOf(separator)).toBe(1); // after t-1, before t-2
  });

  it('formats the date UTC and locale-free, so the server and browser agree', () => {
    // A midnight-UTC move would render as the PREVIOUS day under local-time
    // formatting — and differently again on an en-US server (see utcShortDate).
    renderList([boundary({ movedAt: '2026-08-18T00:00:00.000Z' })]);
    expect(screen.getByRole('separator')).toHaveAccessibleName(/18 Aug 2026$/);
  });

  it('reads "no phase" for an unfiled side rather than a blank', () => {
    renderList([boundary({ fromPhaseName: null })]);
    expect(screen.getByRole('separator')).toHaveAccessibleName(
      'moved from no phase to Sunrise Management on 18 Aug 2026'
    );
  });

  it('draws a null-anchored boundary below the last task', () => {
    const { container } = renderList([boundary({ beforeTaskId: null })]);
    const children = Array.from(container.firstElementChild?.children ?? []);
    expect(children).toHaveLength(3);
    expect(children.indexOf(screen.getByRole('separator'))).toBe(2);
  });

  it('renders both markers when two moves share an anchor', () => {
    renderList([
      boundary({ toPhaseName: 'Ideas Park' }),
      boundary({ fromPhaseName: 'Ideas Park', movedAt: '2026-08-19T09:00:00.000Z' }),
    ]);
    // Neither is swallowed by the other — the shared anchor is a real case
    // (two moves with no completed work between them).
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });
});
