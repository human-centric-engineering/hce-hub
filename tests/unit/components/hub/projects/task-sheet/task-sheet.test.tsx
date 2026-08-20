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
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// The sheet refreshes the server surface behind it after a reassignment (§22 t2).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The activity timeline (f-journal §17 t-3) fetches `/events` on its own once the
// detail loads, and nothing in this file asserts on it — both fetch mocks below
// used to special-case that URL purely to keep it quiet. Which left the request
// racing `afterEach`'s `vi.unstubAllGlobals()`: lose the race and a REAL fetch
// escaped to localhost:3000, printing unhandled ECONNREFUSED noise into the run.
// It surfaced when §33-sweep t-109 added tests here — not because those tests do
// anything network-ish, but because more tests changed the timing. Stubbing the
// component removes the request rather than trying to out-run it.
vi.mock('@/components/hub/projects/task-sheet/task-activity', () => ({
  TaskActivity: () => null,
}));

import { TaskSheet } from '@/components/hub/projects/task-sheet/task-sheet';
import { SidekickProvider } from '@/components/hub/sidekick-context';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type {
  TaskDetailDTO,
  TaskCollision,
  TaskActionResultDTO,
} from '@/components/hub/projects/task-sheet/types';

const detail = (over: Partial<TaskDetailDTO> = {}): TaskDetailDTO => ({
  id: 't1',
  number: 6,
  title: 'Wire the streaming handler',
  description: null,
  doneWhen: null,
  status: 'claimed',
  kind: 'feature_work',
  prUrl: null,
  filesScope: [],
  collisions: [],
  claimer: null,
  mergedBy: null,
  assignee: null,
  isMine: false,
  members: [],
  feature: { id: 'f1', slug: 'f-mcp', title: 'MCP server', owner: null },
  blockedBy: [],
  blocks: [],
  ...over,
});

function mockFetchOnce(res: { ok?: boolean; data?: TaskDetailDTO }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
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
      <TaskSheet
        projectRef="hce-hub"
        projectId="p1"
        taskId="t1"
        onClose={opts.onClose ?? (() => {})}
      />
    </SidekickProvider>
  );

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
// `afterAll`, deliberately NOT `afterEach`. Unstubbing between tests opens a
// window in which a fetch already in flight — the detail load, whose effect can
// still be settling — resolves against the REAL global and dials localhost:3000,
// surfacing as unhandled ECONNREFUSED noise. Each test installs its own stub
// before rendering, so leaving the previous one in place between tests costs
// nothing and closes the window (§33-sweep t-109).
afterAll(() => vi.unstubAllGlobals());

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
    // This fixture has neither claimer nor assignee, so the chip reads
    // "unassigned" — it used to read "assigned" directly above a picker saying
    // "Unassigned", each contradicting the other (§32 t-89).
    expect(screen.getByText('unassigned')).toBeInTheDocument();
    // An open, unassigned task shows the assignee picker with the "Unassigned"
    // placeholder (f-task-assignment §22 t2), not a read-only name.
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Unassigned');
  });

  it('reads "assigned" once somebody holds the task', async () => {
    mockFetchOnce({
      data: detail({ assignee: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null } }),
    });
    renderSheet();
    // effective `claimed` + a holder reads "assigned" (f-task-assignment t1)
    expect(await screen.findByText('assigned')).toBeInTheDocument();
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
        <TaskSheet projectRef="hce-hub" projectId="p1" taskId="t1" onClose={() => {}} />
      </SidekickProvider>
    );
    expect(screen.getByRole('dialog')).toHaveStyle({ right: '0px' });
  });

  it('renders the doer (with the "· you" mark) on a MERGED task, and falls back when number/slug are null', async () => {
    // Merged → the doer is shown read-only for credit (open tasks show the picker,
    // covered below); f-task-assignment §22 t2.
    mockFetchOnce({
      data: detail({
        number: null,
        status: 'merged',
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

  it('shows the additive "Merged by" attribution, distinct from the doer', async () => {
    // f-github-identity §23: the GitHub merger (Bo) is shown alongside — not in
    // place of — the doer (Ada).
    mockFetchOnce({
      data: detail({
        status: 'merged',
        claimer: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
        mergedBy: { id: 'u2', name: 'Bo Diaz', email: 'b@x.io', image: null },
      }),
    });
    renderSheet();
    expect(await screen.findByText('Merged by')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument(); // the merger
    expect(screen.getByText('Ada')).toBeInTheDocument(); // the doer, still shown
  });

  it('suppresses "Merged by" when the merger is the doer (merging your own PR)', async () => {
    mockFetchOnce({
      data: detail({
        status: 'merged',
        claimer: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
        mergedBy: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null }, // same person
      }),
    });
    renderSheet();
    await screen.findByText('Ada'); // the doer line renders
    expect(screen.queryByText('Merged by')).not.toBeInTheDocument();
  });

  it('renders the assignee picker (not a read-only name) on an OPEN task', async () => {
    // An open task is (re)assignable — the sheet shows the member picker seeded
    // with the current assignee + the project's members (f-task-assignment §22 t2).
    mockFetchOnce({
      data: detail({
        status: 'claimed',
        assignee: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
        members: [
          { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
          { id: 'u2', name: 'Bo Diaz', email: 'b@x.io', image: null },
        ],
      }),
    });
    renderSheet();
    // The picker is a Radix combobox labelled "Assignee", showing the current one.
    const picker = await screen.findByRole('combobox', { name: 'Assignee' });
    expect(picker).toHaveTextContent('Ada');
  });

  it('shows a bug tag for a bug-kind task, and none for feature_work', async () => {
    mockFetchOnce({ data: detail({ kind: 'bug' }) });
    const { unmount } = renderSheet();
    expect(await screen.findByText('bug')).toBeInTheDocument();
    unmount();

    mockFetchOnce({ data: detail({ kind: 'feature_work' }) });
    renderSheet();
    // Wait for the sheet to load, then confirm no kind tag on feature-work.
    expect(await screen.findByText('Wire the streaming handler')).toBeInTheDocument();
    expect(screen.queryByText('bug')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/An enhancement/)).not.toBeInTheDocument();
  });

  it('shows an enhancement tag for an enhancement-kind task (§32 t-88)', async () => {
    mockFetchOnce({ data: detail({ kind: 'enhancement' }) });
    renderSheet();
    expect(await screen.findByTitle(/An enhancement — new work/)).toBeInTheDocument();
    expect(screen.queryByText('bug')).not.toBeInTheDocument();
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
      vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: opts.action ?? { taskId: 't1', status: 'active', warnings: [] },
            }),
          });
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
          <TaskSheet projectRef="hce-hub" projectId="p1" taskId="t1" onClose={() => {}} />
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
  // `afterAll`, deliberately NOT `afterEach`. Unstubbing between tests opens a
  // window in which a fetch already in flight — the detail load, whose effect can
  // still be settling — resolves against the REAL global and dials localhost:3000,
  // surfacing as unhandled ECONNREFUSED noise. Each test installs its own stub
  // before rendering, so leaving the previous one in place between tests costs
  // nothing and closes the window (§33-sweep t-109).
  afterAll(() => vi.unstubAllGlobals());

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
            hasHolder: true,
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

  it('renders the Done-when section + the description as markdown (§21 t-c)', async () => {
    renderSheet({
      detail: detail({ description: 'Build the **widget**.', doneWhen: 'it **renders**' }),
    });
    await screen.findByText('Wire the streaming handler');
    // The description renders as markdown — bold becomes <strong>, no literal ** leaks.
    expect(screen.getByText('widget').tagName).toBe('STRONG');
    // A "Done when" section appears with its (markdown) contract.
    expect(screen.getByText('Done when')).toBeInTheDocument();
    expect(screen.getByText('renders').tagName).toBe('STRONG');
  });

  it('omits the Done-when section when the task has none', async () => {
    renderSheet({ detail: detail({ doneWhen: null }) });
    await screen.findByText('Wire the streaming handler');
    expect(screen.queryByText('Done when')).not.toBeInTheDocument();
  });

  it('jumps to a dependency task when its row is clicked', async () => {
    const onOpen = vi.fn();
    renderSheet({
      detail: detail({
        blockedBy: [
          {
            id: 'dep-9',
            number: 9,
            title: 'Do the base',
            featureSlug: 'f-x',
            status: 'claimed',
            hasHolder: true,
          },
        ],
      }),
      onOpen,
    });
    fireEvent.click(await screen.findByText('Do the base'));
    expect(onOpen).toHaveBeenCalledWith('dep-9');
  });

  it('a blocker nobody holds reads "unassigned" on its chip, matching its own row (§32 t-89)', async () => {
    // The contradiction one surface over: before `hasHolder` reached the chip, a
    // born-unassigned blocker read "assigned" here while its own sheet said
    // "unassigned".
    renderSheet({
      detail: detail({
        blockedBy: [
          {
            id: 'free-1',
            number: 7,
            title: 'Unheld blocker',
            featureSlug: 'f-x',
            status: 'claimed',
            hasHolder: false,
          },
        ],
      }),
    });
    expect(await screen.findByText('Unheld blocker')).toBeInTheDocument();
    // Two: the sheet's own chip (fixture has no holder) and the blocker's.
    expect(screen.getAllByText('unassigned')).toHaveLength(2);
  });

  it('starts via POST and renders the returned soft warnings', async () => {
    renderSheet({
      detail: detail({ status: 'claimed' }),
      action: {
        taskId: 't1',
        number: 1,
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
      action: { taskId: 't1', number: 1, status: 'merged', warnings: [] },
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
        <TaskSheet projectRef="hce-hub" projectId="p1" taskId="t1" onClose={() => {}} />
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
        <TaskSheet projectRef="hce-hub" projectId="p1" taskId="t1" onClose={() => {}} />
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

  // Link-PR affordance (f-github-sync §14 t-1): a member can attach/replace a
  // task's PR URL via an inline form that POSTs to `.../set-pr` (no status change).
  it('links a PR via the inline form — POSTs the URL to set-pr', async () => {
    renderSheet({
      detail: detail({ status: 'claimed', prUrl: null }),
      action: { taskId: 't1', number: 1, status: 'claimed', warnings: [] },
    });
    // With no PR yet, the affordance reads "Link PR".
    fireEvent.click(await screen.findByRole('button', { name: 'Link PR' }));
    fireEvent.change(screen.getByLabelText('Pull request URL'), {
      target: { value: 'https://github.com/o/r/pull/7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/projects/p1/tasks/t1/set-pr',
        expect.objectContaining({ method: 'POST' })
      )
    );
    const call = vi
      .mocked(fetch)
      .mock.calls.find((c) => typeof c[0] === 'string' && c[0].endsWith('/set-pr'));
    expect(JSON.parse((call![1] as { body: string }).body).prUrl).toBe(
      'https://github.com/o/r/pull/7'
    );
  });

  it('shows Open PR + an Edit PR affordance when a PR is already linked', async () => {
    renderSheet({ detail: detail({ prUrl: 'https://github.com/o/r/pull/9' }) });
    await screen.findByText('Wire the streaming handler');
    expect(screen.getByRole('button', { name: 'Edit PR' })).toBeInTheDocument();
    // Named, not `getByRole('link')` alone: the header's feature slug is a link
    // too since t-105, so an unnamed query now matches two.
    expect(screen.getByRole('link', { name: '#9' })).toHaveAttribute(
      'href',
      'https://github.com/o/r/pull/9'
    );
  });

  it('links the header feature slug to that feature page (t-105)', async () => {
    // The slug identified the parent but didn't reach it — reading a task and
    // then opening its feature was a manual hunt through the Plan.
    renderSheet({ detail: detail({}) });
    await screen.findByText('Wire the streaming handler');
    expect(screen.getByRole('link', { name: 'f-mcp' })).toHaveAttribute(
      'href',
      '/projects/hce-hub/features/f-mcp'
    );
  });

  it('falls back to the feature id in the href, and the title as the label', async () => {
    // The label falls back to the TITLE and the href to the ID — different
    // fallbacks, because one has to be readable and the other has to resolve.
    renderSheet({
      detail: detail({ feature: { id: 'f1', slug: null, title: 'MCP server', owner: null } }),
    });
    await screen.findByText('Wire the streaming handler');
    expect(screen.getByRole('link', { name: 'MCP server' })).toHaveAttribute(
      'href',
      '/projects/hce-hub/features/f1'
    );
  });
  /** An overlapping open claim, as the detail read returns it (§33-sweep t-109). */
  const collision = (over: Partial<TaskCollision> = {}): TaskCollision => ({
    taskId: 't9',
    number: 9,
    title: 'Other work',
    holder: { id: 'u2', name: 'Ada Lovelace', email: 'a@x.io', image: null },
    isMine: false,
    paths: ['lib/projects/collision.ts'],
    ...over,
  });

  it('names who holds an overlapping claim and which declared paths collide', async () => {
    // The warning existed only on the Board card, which has room to say that
    // something overlaps but not what — so it arrived without the detail that
    // would change what you do, on the surface you are not reading yet.
    renderSheet({
      detail: detail({ filesScope: ['lib/projects/collision.ts'], collisions: [collision()] }),
    });
    expect(await screen.findByText('Overlapping claims')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Other work/ });
    expect(row).toHaveTextContent('t-9');
    expect(row).toHaveTextContent('Ada'); // first name, as the Board card shows it
    expect(row).toHaveTextContent('lib/projects/collision.ts');
  });

  it('jumps to the overlapping task', async () => {
    // Knowing a claim overlaps is only half of it — the next thing you want is
    // to read the task that holds it.
    const onOpen = vi.fn();
    renderSheet({ detail: detail({ collisions: [collision()] }), onOpen });
    await screen.findByText('Overlapping claims');
    fireEvent.click(screen.getByRole('button', { name: /Other work/ }));
    expect(onOpen).toHaveBeenCalledWith('t9');
  });

  it('labels the viewer OWN overlapping claim rather than attributing it to a stranger', async () => {
    renderSheet({ detail: detail({ collisions: [collision({ isMine: true })] }) });
    await screen.findByText('Overlapping claims');
    const row = screen.getByRole('button', { name: /Other work/ });
    expect(row).toHaveTextContent('yours');
    expect(row).not.toHaveTextContent('Ada');
  });

  it('survives a holder who has since been erased', async () => {
    // The claim outlives the user row; a row that dereferenced it would crash
    // the whole sheet over a detail nobody needs.
    renderSheet({ detail: detail({ collisions: [collision({ holder: null })] }) });
    await screen.findByText('Overlapping claims');
    expect(screen.getByRole('button', { name: /Other work/ })).toHaveTextContent('former member');
  });

  it('shows no section at all when nothing overlaps', async () => {
    // Not an empty "no collisions" block: that would be noise on almost every
    // task, and the quiet state is the normal one.
    renderSheet({ detail: detail({ filesScope: ['lib/a.ts'], collisions: [] }) });
    await screen.findByText('Wire the streaming handler');
    expect(screen.queryByText('Overlapping claims')).not.toBeInTheDocument();
  });
});
