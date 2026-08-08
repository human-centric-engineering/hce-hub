/**
 * Unit: ActiveFixesStrip (f-bug-handling §22-02 t2) — the project-scoped band of
 * open bug fixes. Self-hides when empty; each row shows the bug + an origin
 * breadcrumb (feature slug/title · phase) and opens its fix task on click.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveFixesStrip } from '@/components/hub/projects/active-fixes-strip';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { ActiveFixDTO } from '@/components/hub/projects/types';

const fix = (over: Partial<ActiveFixDTO> = {}): ActiveFixDTO => ({
  taskId: 'bug-1',
  taskNumber: 42,
  title: 'Log decisions render raw',
  feature: { slug: 'f-journal', title: 'Journal' },
  phaseName: 'Foundations',
  ...over,
});

function renderStrip(fixes: ActiveFixDTO[], open = vi.fn()) {
  render(
    <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
      <ActiveFixesStrip fixes={fixes} />
    </TaskSheetControlsProvider>
  );
  return open;
}

describe('ActiveFixesStrip', () => {
  it('renders nothing when there are no open fixes (self-hiding)', () => {
    const { container } = render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <ActiveFixesStrip fixes={[]} />
      </TaskSheetControlsProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and each fix with its origin breadcrumb', () => {
    renderStrip([
      fix(),
      fix({
        taskId: 'bug-2',
        taskNumber: null,
        title: 'Logout missing in nav',
        feature: { slug: null, title: 'Platform' },
        phaseName: null,
      }),
    ]);
    expect(screen.getByText(/Active fixes · 2/)).toBeInTheDocument();
    expect(screen.getByText('Log decisions render raw')).toBeInTheDocument();
    // Breadcrumb prefers the slug and appends the phase (rendered as sibling spans).
    expect(screen.getByText('f-journal')).toBeInTheDocument();
    expect(screen.getByText(/· Foundations/)).toBeInTheDocument();
    // A slug-less, unfiled fix falls back to the feature title, no phase segment.
    expect(screen.getByText('Logout missing in nav')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('opens the fix task when a row is clicked', () => {
    const open = renderStrip([fix({ taskId: 'bug-xyz' })]);
    fireEvent.click(screen.getByText('Log decisions render raw'));
    expect(open).toHaveBeenCalledWith('bug-xyz');
  });
});
