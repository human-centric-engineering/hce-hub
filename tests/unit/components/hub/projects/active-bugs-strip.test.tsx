/**
 * Unit: ActiveBugsStrip (f-bug-handling §22-02 t2) — the project-scoped band of
 * open bugs. Self-hides when empty; each row shows the bug + an origin
 * breadcrumb (feature slug/title · phase) and opens the bug on click.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveBugsStrip } from '@/components/hub/projects/active-bugs-strip';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { ActiveBugDTO } from '@/components/hub/projects/types';

const bug = (over: Partial<ActiveBugDTO> = {}): ActiveBugDTO => ({
  taskId: 'bug-1',
  taskNumber: 42,
  title: 'Log decisions render raw',
  feature: { slug: 'f-journal', title: 'Journal' },
  phaseName: 'Foundations',
  ...over,
});

function renderStrip(bugs: ActiveBugDTO[], open = vi.fn()) {
  render(
    <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
      <ActiveBugsStrip bugs={bugs} projectId="proj-1" />
    </TaskSheetControlsProvider>
  );
  return open;
}

describe('ActiveBugsStrip', () => {
  beforeEach(() => localStorage.clear()); // the collapse pref persists — isolate each test

  it('renders nothing (no element, no spacing) when there are no open bugs', () => {
    const { container } = render(
      <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
        <ActiveBugsStrip bugs={[]} projectId="proj-1" />
      </TaskSheetControlsProvider>
    );
    // Fully empty — the top spacing rides the section, so an empty strip leaves
    // no residual gap above the work body.
    expect(container).toBeEmptyDOMElement();
  });

  it('scopes the collapse preference to the project (no cross-project leak)', () => {
    localStorage.setItem('hub:active-bugs-collapsed:other-project', 'true');
    renderStrip([bug()]); // renders under projectId "proj-1"
    // Collapsed in another project → this project's strip is still expanded.
    expect(screen.getByText('Log decisions render raw')).toBeInTheDocument();
  });

  it('shows the count and each bug with its origin breadcrumb', () => {
    renderStrip([
      bug(),
      bug({
        taskId: 'bug-2',
        taskNumber: null,
        title: 'Logout missing in nav',
        feature: { slug: null, title: 'Platform' },
        phaseName: null,
      }),
    ]);
    expect(screen.getByText(/Active bugs · 2/)).toBeInTheDocument();
    expect(screen.getByText('Log decisions render raw')).toBeInTheDocument();
    // Breadcrumb prefers the slug and appends the phase (rendered as sibling spans).
    expect(screen.getByText('f-journal')).toBeInTheDocument();
    expect(screen.getByText(/· Foundations/)).toBeInTheDocument();
    // A slug-less, unfiled bug falls back to the feature title, no phase segment.
    expect(screen.getByText('Logout missing in nav')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('opens the bug when a row is clicked', () => {
    const open = renderStrip([bug({ taskId: 'bug-xyz' })]);
    fireEvent.click(screen.getByText('Log decisions render raw'));
    expect(open).toHaveBeenCalledWith('bug-xyz');
  });

  it('collapses and re-expands the list via the header toggle, keeping the count visible', () => {
    renderStrip([bug()]);
    expect(screen.getByText('Log decisions render raw')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide active bugs' }));
    expect(screen.queryByText('Log decisions render raw')).not.toBeInTheDocument();
    expect(screen.getByText(/Active bugs · 1/)).toBeInTheDocument(); // count stays

    fireEvent.click(screen.getByRole('button', { name: 'Show active bugs' }));
    expect(screen.getByText('Log decisions render raw')).toBeInTheDocument();
  });
});
