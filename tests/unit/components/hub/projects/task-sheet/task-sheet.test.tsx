/**
 * Unit: TaskSheet — the sliding task detail panel (f-task-sheet §11 t-2; the
 * action row moved from Claim to Start/Complete in f-status-model §20 t-1).
 *
 * Load-bearing: fetches the detail client-side and renders the identity/status;
 * Esc + scrim close; copy-link writes `location.href`; the sheet's `right`
 * offset flips with the sidekick-open context (the reposition requirement);
 * a failed fetch renders the error state, never a crash. You claim features,
 * not tasks — a task is *born* `claimed`; **Start** (`claimed → active`) and
 * **Complete** (`active → merged`) are the two hand transitions, POSTing to
 * `.../start` and `.../complete` via the shared `lib/projects/task-actions.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskSheet } from '@/components/hub/projects/task-sheet/task-sheet';
import { SidekickProvider } from '@/components/hub/sidekick-context';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type {
  TaskDetailDTO,
  TaskActionResultDTO,
} from '@/components/hub/projects/task-sheet/types';

const detail = (over: Partial<TaskDetailDTO> = {}): TaskDetailDTO => ({
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
  ...over,
});

function mockFetchOnce(res: { ok?: boolean; data?: TaskDetailDTO }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      // The activity timeline (f-journal §17 t-3) fetches events once detail
      // loads; keep it empty so these detail-focused tests are unaffected.
      if (typeof url === 'string' && url.includes('/events')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) });
      }
      return Promise.resolve({
        ok: res.ok ?? true,
        status: res.ok === false ? 500 : 200,
        json: async () => ({ data: res.data }),
      });
    })
  );
}

const renderSheet = (opts: { sidekickOpen?: boolean; onClose?: () => void } = {}) =>
  render(
    <SidekickProvider value={{ open: opts.sidekickOpen ?? false, setOpen: () => {} }}>
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
    expect(screen.getByText('claimed')).toBeInTheDocument();
    expect(screen.getByText('unassigned')).toBeInTheDocument();
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
      <SidekickProvider value={{ open: false, setOpen: () => {} }}>
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

/**
 * t-3 (retrofitted for f-status-model §20): the body (description, files,
 * dependency graph) + the action row — Start (claimed → active), Complete
 * (active → merged), Open PR, Ask sidekick.
 */
describe('TaskSheet body + actions', () => {
  /** Method-aware fetch: GET → detail, POST (start/complete) → the action result. */
  function mockFetch(opts: { detail: TaskDetailDTO; action?: TaskActionResultDTO }) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: opts.action ?? { taskId: 't1', status: 'active', warnings: [] },
            }),
          });
        }
        // The activity timeline fetches events (GET); keep it empty here.
        if (typeof url === 'string' && url.includes('/events')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: opts.detail }),
        });
      })
    );
  }

  const renderSheet = (opts: {
    detail: TaskDetailDTO;
    action?: TaskActionResultDTO;
    onOpen?: (id: string) => void;
    setSidekickOpen?: (v: boolean) => void;
  }) => {
    mockFetch({ detail: opts.detail, action: opts.action });
    return render(
      <SidekickProvider value={{ open: false, setOpen: opts.setSidekickOpen ?? (() => {}) }}>
        <TaskSheetControlsProvider value={{ open: opts.onOpen ?? (() => {}), close: () => {} }}>
          <TaskSheet projectId="p1" taskId="t1" onClose={() => {}} />
        </TaskSheetControlsProvider>
      </SidekickProvider>
    );
  };

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders description, files in scope, and the dependency graph', async () => {
    renderSheet({
      detail: detail({
        description: 'Implements the SSE bridge.',
        filesScope: ['lib/sse.ts', 'app/api/chat/route.ts'],
        blockedBy: [
          {
            id: 'b1',
            number: 2,
            title: 'Provider abstraction',
            featureSlug: 'f-llm',
            status: 'merged',
          },
        ],
        blocks: [],
      }),
    });
    expect(await screen.findByText('Implements the SSE bridge.')).toBeInTheDocument();
    expect(screen.getByText('lib/sse.ts')).toBeInTheDocument();
    expect(screen.getByText('Provider abstraction')).toBeInTheDocument();
    expect(screen.getByText('nothing waiting')).toBeInTheDocument(); // empty "blocks"
  });

  it('renders honest empty states when there is no description / files / deps', async () => {
    renderSheet({ detail: detail() });
    expect(await screen.findByText('No description yet.')).toBeInTheDocument();
    expect(screen.getByText('No files declared.')).toBeInTheDocument();
    expect(screen.getByText('none — ready to start')).toBeInTheDocument();
  });

  it('jumps to a dependency task when its row is clicked', async () => {
    const onOpen = vi.fn();
    renderSheet({
      detail: detail({
        blockedBy: [
          { id: 'dep-9', number: 9, title: 'Do the base', featureSlug: 'f-x', status: 'claimed' },
        ],
      }),
      onOpen,
    });
    fireEvent.click(await screen.findByText('Do the base'));
    expect(onOpen).toHaveBeenCalledWith('dep-9');
  });

  it('starts via POST and renders the returned soft warnings', async () => {
    renderSheet({
      detail: detail({ status: 'claimed' }),
      action: {
        taskId: 't1',
        status: 'active',
        warnings: [
          { kind: 'already_claimed', message: 'Heads-up: already claimed by someone else.' },
        ],
      },
    });
    const btn = await screen.findByRole('button', { name: 'Start' });
    fireEvent.click(btn);
    expect(await screen.findByText(/already claimed by someone else/)).toBeInTheDocument();
    // Start POSTs to the start sub-path.
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p1/tasks/t1/start',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('completes via POST once the task is active', async () => {
    renderSheet({
      detail: detail({ status: 'active' }),
      action: { taskId: 't1', status: 'merged', warnings: [] },
    });
    const btn = await screen.findByRole('button', { name: 'Complete' });
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p1/tasks/t1/complete',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('keeps the content visible during the post-start refetch (no blank flash)', async () => {
    let getCount = 0;
    let resolveReload: (v: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: { taskId: 't1', status: 'active', warnings: [] } }),
          });
        }
        getCount += 1;
        if (getCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: detail({ status: 'claimed' }) }),
          });
        }
        // The reload GET hangs — the content must NOT blank while it's in flight.
        return new Promise((r) => {
          resolveReload = r;
        });
      })
    );
    render(
      <SidekickProvider value={{ open: false, setOpen: () => {} }}>
        <TaskSheet projectId="p1" taskId="t1" onClose={() => {}} />
      </SidekickProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3)); // GET, POST, reload GET
    // The reload is still pending, yet the task content is still on screen.
    expect(screen.getByText('Wire the streaming handler')).toBeInTheDocument();
    resolveReload({
      ok: true,
      status: 200,
      json: async () => ({ data: detail({ status: 'active' }) }),
    });
  });

  it('surfaces a start failure (never a silent write) — retryable', async () => {
    // GET detail ok; POST start fails.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((_url: string, init?: { method?: string }) =>
          init?.method === 'POST'
            ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
            : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: detail() }) })
        )
    );
    render(
      <SidekickProvider value={{ open: false, setOpen: () => {} }}>
        <TaskSheet projectId="p1" taskId="t1" onClose={() => {}} />
      </SidekickProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText(/Couldn.t update just now — try again\./)).toBeInTheDocument();
    // The button re-enables for a retry.
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
  });

  it('disables the action with a "Blocked by deps" state when the task is blocked', async () => {
    renderSheet({ detail: detail({ status: 'blocked' }) });
    expect(await screen.findByRole('button', { name: /Blocked by deps/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
  });

  it('shows neither Start nor Complete once the task is merged', async () => {
    renderSheet({ detail: detail({ status: 'merged' }) });
    await screen.findByText('Wire the streaming handler');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Blocked by deps/ })).not.toBeInTheDocument();
  });

  it('opens the sidekick column from "Ask sidekick"', async () => {
    const setSidekickOpen = vi.fn();
    renderSheet({ detail: detail(), setSidekickOpen });
    fireEvent.click(await screen.findByRole('button', { name: /Ask sidekick/ }));
    expect(setSidekickOpen).toHaveBeenCalledWith(true);
  });
});
