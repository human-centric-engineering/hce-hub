/**
 * Unit: FeatureTaskList (f-feature-planning §18 t-3). A planned feature shows real
 * task rows that open the `?task=` sheet; an indicative feature shows its muted
 * sketch (no task buttons); neither → an honest empty state.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureTaskList } from '@/components/hub/projects/feature-view/feature-task-list';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { FeatureDetailTaskDTO } from '@/components/hub/projects/feature-view/types';

const task = (over: Partial<FeatureDetailTaskDTO> = {}): FeatureDetailTaskDTO => ({
  id: 't1',
  number: 3,
  title: 'Wire the guard',
  status: 'claimed',
  doneWhen: null,
  prUrl: null,
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
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('Wire the guard')).toBeInTheDocument();
    expect(screen.getByText(/done when: gates green/)).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument(); // assignee (no live claimer)
    fireEvent.click(screen.getByRole('button', { name: 'Open task t-3' }));
    expect(open).toHaveBeenCalledWith('t1');
  });

  it('renders "unassigned" with no claimer/assignee and a "t-—" for a null number', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList
          tasks={[task({ number: null, doneWhen: null, claimer: null, assignee: null })]}
          indicativeTasks={[]}
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('unassigned')).toBeInTheDocument();
    expect(screen.getByText('t-—')).toBeInTheDocument();
  });

  it('opens the sheet on keyboard activation (Enter)', () => {
    const open = vi.fn();
    render(
      <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
        <FeatureTaskList tasks={[task()]} indicativeTasks={[]} />
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
        />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText('sketch the schema')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an honest empty state when unplanned with no sketch', () => {
    render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <FeatureTaskList tasks={[]} indicativeTasks={[]} />
      </TaskSheetControlsProvider>
    );
    expect(screen.getByText(/hasn.t been planned/)).toBeInTheDocument();
  });
});
