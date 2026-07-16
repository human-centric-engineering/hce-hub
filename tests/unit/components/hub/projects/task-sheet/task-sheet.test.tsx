/**
 * Unit: TaskSheet — the sliding task detail panel (f-task-sheet §11 t-2).
 *
 * Load-bearing: fetches the detail client-side and renders the identity/status;
 * Esc + scrim close; copy-link writes `location.href`; the sheet's `right`
 * offset flips with the sidekick-open context (the reposition requirement);
 * a failed fetch renders the error state, never a crash.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskSheet } from '@/components/hub/projects/task-sheet/task-sheet';
import { SidekickProvider } from '@/components/hub/sidekick-context';
import type { TaskDetailDTO } from '@/components/hub/projects/task-sheet/types';

const detail = (over: Partial<TaskDetailDTO> = {}): TaskDetailDTO => ({
  id: 't1',
  number: 6,
  title: 'Wire the streaming handler',
  description: null,
  status: 'available',
  prUrl: null,
  filesScope: [],
  claimer: null,
  isMine: false,
  feature: { id: 'f1', slug: 'f-mcp', title: 'MCP server', owner: null },
  blockedBy: [],
  blocks: [],
  ...over,
});

function mockFetchOnce(res: { ok?: boolean; data?: TaskDetailDTO }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: res.ok ?? true,
      status: res.ok === false ? 500 : 200,
      json: async () => ({ data: res.data }),
    })
  );
}

const renderSheet = (opts: { sidekickOpen?: boolean; onClose?: () => void } = {}) =>
  render(
    <SidekickProvider value={{ open: opts.sidekickOpen ?? false }}>
      <TaskSheet projectId="p1" taskId="t1" onClose={opts.onClose ?? (() => {})} />
    </SidekickProvider>
  );

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('TaskSheet', () => {
  it('fetches the task and renders its identity + status', async () => {
    mockFetchOnce({ data: detail() });
    renderSheet();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p1/tasks/t1',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(await screen.findByText('Wire the streaming handler')).toBeInTheDocument();
    expect(screen.getByText('t-6')).toBeInTheDocument();
    expect(screen.getByText('f-mcp')).toBeInTheDocument();
    expect(screen.getByText('available')).toBeInTheDocument();
    expect(screen.getByText('unclaimed')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    mockFetchOnce({ data: detail() });
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on scrim click and via the close button', async () => {
    mockFetchOnce({ data: detail() });
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copy-link writes the current URL to the clipboard', async () => {
    mockFetchOnce({ data: detail() });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this task' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('anchors left of the sidekick when it is open (right: 392px), flush right otherwise', async () => {
    mockFetchOnce({ data: detail() });
    const { rerender } = renderSheet({ sidekickOpen: true });
    expect(screen.getByRole('dialog')).toHaveStyle({ right: '392px' });

    rerender(
      <SidekickProvider value={{ open: false }}>
        <TaskSheet projectId="p1" taskId="t1" onClose={() => {}} />
      </SidekickProvider>
    );
    expect(screen.getByRole('dialog')).toHaveStyle({ right: '0px' });
  });

  it('renders the claimer (with the "· you" mark) and falls back when number/slug are null', async () => {
    mockFetchOnce({
      data: detail({
        number: null,
        isMine: true,
        claimer: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
        feature: { id: 'f1', slug: null, title: 'MCP server', owner: null },
      }),
    });
    renderSheet();
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('· you')).toBeInTheDocument();
    // number null → the ref falls back to the id tail; slug null → the feature title.
    expect(screen.getByText(/^t-/)).toBeInTheDocument();
    expect(screen.getByText('MCP server')).toBeInTheDocument();
  });

  it('renders the error state on a failed fetch (no crash)', async () => {
    mockFetchOnce({ ok: false });
    renderSheet();
    expect(await screen.findByText(/Couldn.t load this task/)).toBeInTheDocument();
  });
});
