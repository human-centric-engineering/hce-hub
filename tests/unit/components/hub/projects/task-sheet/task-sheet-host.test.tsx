/**
 * Unit: TaskSheetProvider — the deep-link host (f-task-sheet §11 t-2).
 *
 * Load-bearing: a `?task=` in the URL opens the sheet on mount (deep-link
 * survives refresh); `open(id)` writes `?task=` (shareable) and shows the sheet
 * without a server nav; `close()` clears it. The URL is driven by the native
 * History API so the underlying surface is preserved.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { TaskSheetProvider } from '@/components/hub/projects/task-sheet/task-sheet-host';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { TaskDetailDTO } from '@/components/hub/projects/task-sheet/types';

const DETAIL: TaskDetailDTO = {
  id: 't1',
  number: 6,
  title: 'Wire the streaming handler',
  description: null,
  status: 'claimed',
  prUrl: null,
  filesScope: [],
  claimer: null,
  isMine: false,
  feature: { id: 'f1', slug: 'f-mcp', title: 'MCP server', owner: null },
  blockedBy: [],
  blocks: [],
};

/** A consumer that opens/closes via the context — stands in for a Plan row / Board card. */
function Trigger() {
  const { open, close } = useTaskSheet();
  return (
    <>
      <button onClick={() => open('t1')}>open-t1</button>
      <button onClick={() => close()}>close</button>
    </>
  );
}

function seedParams(search = '') {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(search) as never);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/projects/p1?view=plan');
  seedParams('view=plan');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: DETAIL }) })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('TaskSheetProvider', () => {
  it('opens the sheet on mount when the URL already carries ?task= (deep-link)', async () => {
    seedParams('view=plan&task=t1');
    render(
      <TaskSheetProvider projectId="p1">
        <Trigger />
      </TaskSheetProvider>
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not render the sheet with no ?task=', () => {
    render(
      <TaskSheetProvider projectId="p1">
        <Trigger />
      </TaskSheetProvider>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet when a navigation drops ?task= (URL is the source of truth)', async () => {
    seedParams('view=plan&task=t1');
    const { rerender } = render(
      <TaskSheetProvider projectId="p1">
        <Trigger />
      </TaskSheetProvider>
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // A <Link> tab switch navigates to a URL without ?task= — the sheet follows.
    seedParams('view=board');
    rerender(
      <TaskSheetProvider projectId="p1">
        <Trigger />
      </TaskSheetProvider>
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('open(id) writes ?task= and shows the sheet; close() clears it', async () => {
    render(
      <TaskSheetProvider projectId="p1">
        <Trigger />
      </TaskSheetProvider>
    );

    fireEvent.click(screen.getByText('open-t1'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('task')).toBe('t1');
    // The existing surface param is preserved.
    expect(new URLSearchParams(window.location.search).get('view')).toBe('plan');

    fireEvent.click(screen.getByText('close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull();
  });
});
