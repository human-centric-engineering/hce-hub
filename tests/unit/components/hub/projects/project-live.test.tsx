/**
 * Unit: ProjectLiveProvider (f-realtime §36 t-126) — the one poller per page.
 *
 * Two things are tested here, and the second is the one that matters.
 *
 * **The poller's own logic** — baseline, change detection, conditional requests,
 * backoff. Each of these has a silent failure mode: get the baseline wrong and
 * every page refreshes itself once on load; get the comparison wrong and it
 * refreshes forever; get the backoff wrong and a rate-limited client hammers a
 * closed door with nothing on screen to say so.
 *
 * **That a detected change actually reaches the client-fetched surfaces.** This is
 * the half a naive build ships broken: `router.refresh()` re-renders the
 * server-rendered tabs but does NOT re-run a `useEffect`, so the Log, the task
 * sheet and the two activity timelines would sit visibly stale over a Plan that
 * updates correctly. Those four are driven through the REAL provider rather than an
 * injected context value, so what is proven is the whole chain — poll, compare,
 * publish, refetch — not that a number was threaded into a dependency array.
 *
 * The surfaces are a table: a fifth one added later is one row, not a fifth
 * copy-pasted test.
 *
 * @see components/hub/projects/project-live.tsx
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMockRouter } from '@/tests/types/mocks';
import {
  ProjectLiveProvider,
  PROJECT_POLL_INTERVAL_MS,
} from '@/components/hub/projects/project-live';
import { LogView } from '@/components/hub/projects/log/log-view';
import { FeatureActivity } from '@/components/hub/projects/feature-view/feature-activity';
import { TaskActivity } from '@/components/hub/projects/task-sheet/task-activity';
import { TaskSheet } from '@/components/hub/projects/task-sheet/task-sheet';
import { SidekickProvider } from '@/components/hub/sidekick-context';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';

const router = createMockRouter();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<object>('next/navigation');
  return { ...actual, useRouter: () => router, useSearchParams: () => new URLSearchParams() };
});

const PID = 'p1';
const REVISION = `/api/v1/projects/${PID}/revision`;

/** One event, so a refreshing surface has visible content to keep (or lose). */
const EVENT = {
  id: 'e1',
  kind: 'decision',
  actor: { id: 'u1', name: 'Simon Holmes', email: 's@x', image: null },
  actorAgentId: null,
  feature: null,
  task: null,
  phaseId: null,
  title: 'A decision already on screen',
  body: null,
  metadata: null,
  createdAt: '2026-08-21T10:00:00.000Z',
};

/** Just enough of a `TaskDetailDTO` for the sheet to render. */
const TASK_DETAIL = {
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
};

/** Serves `/revision` from a mutable token, and every other GET as an empty list. */
function mockEndpoints() {
  const state = {
    token: 'W/"one"',
    status: 200,
    revisionCalls: [] as RequestInit[],
    /** Hold event responses open, so a refresh can be caught mid-flight. */
    deferEvents: false,
    release: () => {},
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.startsWith(REVISION)) {
        state.revisionCalls.push(init ?? {});
        if (state.status === 304) {
          return Promise.resolve({ ok: false, status: 304, json: async () => ({}) });
        }
        if (state.status !== 200) {
          return Promise.resolve({ ok: false, status: state.status, json: async () => ({}) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { projectId: PID, revision: state.token, changedAt: null } }),
        });
      }
      // The task sheet wants an object, every other client-fetched surface wants a
      // list of events.
      if (url.includes('/tasks/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: TASK_DETAIL }),
        });
      }
      const payload = { ok: true, status: 200, json: async () => ({ data: [EVENT] }) };
      if (state.deferEvents) {
        return new Promise((resolve) => {
          state.release = () => resolve(payload);
        });
      }
      return Promise.resolve(payload);
    })
  );
  return state;
}

/**
 * Advance one poll interval and let the resulting promises settle.
 *
 * `advanceTimersByTimeAsync`, not the sync form: the poll is a chain of awaits, and
 * the sync version fires the timer without ever yielding to it. Deliberately no
 * `waitFor` anywhere in this file either — it polls on real timers, so under
 * `useFakeTimers` it does not retry, it hangs.
 */
async function tick(times = 1) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_POLL_INTERVAL_MS);
    });
  }
}

/** Let the mount-time poll (and any effect fetch) settle without moving the clock. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/**
 * How many times a URL containing `fragment` has been fetched.
 *
 * Narrowed rather than stringified: `fetch`'s first argument is
 * `RequestInfo | URL`, so `String(url)` would quietly become `[object Object]` for
 * a `Request` and match nothing — a counter that silently reads 0 is the worst
 * possible shape for a test that asserts "greater than". Every call in this file
 * passes a string, so anything else is a bug in the test, not a case to handle.
 */
function callsMatching(fragment: string): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => typeof url === 'string' && url.includes(fragment)).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ProjectLiveProvider — the poller', () => {
  it('polls on mount, without a conditional header it has no token for', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    expect(state.revisionCalls).toHaveLength(1);
    expect(state.revisionCalls[0].headers).toBeUndefined();
  });

  it('treats the first token as a baseline, not a change', async () => {
    // Otherwise every page refreshes itself once, moments after it loaded — a
    // whole extra server render per page view, for nothing.
    mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('sends the token it holds back as If-None-Match', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();
    await tick();

    expect(state.revisionCalls[1].headers).toEqual({ 'If-None-Match': 'W/"one"' });
  });

  it('refreshes the server surfaces when the token moves', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.token = 'W/"two"';
    await tick();

    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a 304', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 304;
    await tick(2);

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('does nothing when the same token comes back as a 200', async () => {
    // A 304 answered transparently from the browser cache arrives as a 200 with
    // the cached body. Comparing tokens rather than trusting the status is what
    // keeps that from reading as a change on every single poll.
    mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();
    await tick(3);

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('leaves the baseline alone when the body is malformed', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    vi.mocked(fetch).mockImplementationOnce(
      () => Promise.resolve({ ok: true, status: 200, json: async () => ({ data: {} }) }) as never
    );
    await tick();
    // A discarded body must not poison the token — if it did, the NEXT poll would
    // look like a change and refresh the page for no reason.
    state.token = 'W/"one"';
    await tick();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('backs off after a 429 instead of hammering a closed door', async () => {
    // A 429 is invisible to the user: surfaces just stop updating. Without a
    // backoff the client would keep asking every 5s for as long as the tab is open.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 429;
    await tick();
    const afterFirstFailure = state.revisionCalls.length;

    // The next tick is skipped, not sent.
    await tick();
    expect(state.revisionCalls).toHaveLength(afterFirstFailure);

    // ...and the one after it goes out again.
    await tick();
    expect(state.revisionCalls.length).toBeGreaterThan(afterFirstFailure);
  });

  it('resumes full cadence once a poll succeeds', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 429;
    await tick(); // fail → skip 1
    state.status = 200;
    await tick(); // skipped
    await tick(); // sent, succeeds → counter reset

    const before = state.revisionCalls.length;
    await tick();
    expect(state.revisionCalls.length).toBe(before + 1);
  });
});

/**
 * Every client-fetched surface, and the request that proves it re-read. Each is
 * rendered inside the REAL provider — nothing here injects a context value.
 */
const CLIENT_FETCHED_SURFACES = [
  {
    name: 'the Log tab',
    showsEvents: true,
    endpoint: `/api/v1/projects/${PID}/events`,
    render: () => <LogView projectId={PID} projectRef="hce-hub" />,
  },
  {
    name: 'a feature’s activity timeline',
    showsEvents: true,
    endpoint: 'featureId=f1',
    render: () => <FeatureActivity projectId={PID} projectRef="hce-hub" featureId="f1" />,
  },
  {
    name: 'the task sheet’s activity timeline',
    showsEvents: true,
    endpoint: 'taskId=t1',
    render: () => <TaskActivity projectId={PID} projectRef="hce-hub" taskId="t1" refreshKey={0} />,
  },
  {
    // The surface most likely to be open while someone else moves the same task,
    // and the one where staleness is worst: it shows a status and an action button.
    name: 'the task sheet’s own detail',
    // Renders a detail object, not the event list — and already guarded its
    // skeleton with `!detail`, which is where the fix for the other three came
    // from. Excluded from the no-flicker case because it has nothing to assert
    // the same way, not because it is exempt from the rule.
    showsEvents: false,
    endpoint: `/api/v1/projects/${PID}/tasks/t1`,
    render: () => (
      <SidekickProvider value={{ open: false, setOpen: () => {} }}>
        <TaskSheetControlsProvider value={{ open: vi.fn(), close: vi.fn() }}>
          <TaskSheet projectId={PID} projectRef="hce-hub" taskId="t1" onClose={vi.fn()} />
        </TaskSheetControlsProvider>
      </SidekickProvider>
    ),
  },
];

describe('a detected change reaches the client-fetched surfaces', () => {
  it.each(CLIENT_FETCHED_SURFACES)(
    '$name re-reads',
    async ({ endpoint, render: renderSurface }) => {
      const state = mockEndpoints();
      await act(async () => {
        render(<ProjectLiveProvider projectId={PID}>{renderSurface()}</ProjectLiveProvider>);
      });
      await flush();
      const initial = callsMatching(endpoint);
      expect(initial).toBeGreaterThan(0);

      state.token = 'W/"moved"';
      await tick();
      await flush();

      expect(callsMatching(endpoint)).toBeGreaterThan(initial);
    }
  );

  it.each(CLIENT_FETCHED_SURFACES)(
    '$name does NOT re-read while nothing changes',
    async ({ endpoint, render: renderSurface }) => {
      // The other half of the guard: a surface that refetches on every tick would
      // pass the test above while quietly making four requests a minute each.
      mockEndpoints();
      await act(async () => {
        render(<ProjectLiveProvider projectId={PID}>{renderSurface()}</ProjectLiveProvider>);
      });
      await flush();
      const initial = callsMatching(endpoint);

      await tick(3);
      await flush();

      expect(callsMatching(endpoint)).toBe(initial);
    }
  );

  it.each(CLIENT_FETCHED_SURFACES.filter((surface) => surface.showsEvents))(
    '$name refreshes WITHOUT blanking what is on screen',
    async ({ render: renderSurface }) => {
      // The defect the browser check caught, and no earlier test could: every
      // surface re-read correctly and then flickered, because the effect called
      // `setState('loading')` unconditionally. On a project with two people that
      // is a blank-and-repaint every few seconds, on surfaces the change had
      // nothing to do with.
      //
      // Caught by holding the response open: with the bug the skeleton is on
      // screen the instant the refetch starts, so the assertion is made while the
      // request is still in flight rather than after it settles.
      const state = mockEndpoints();
      await act(async () => {
        render(<ProjectLiveProvider projectId={PID}>{renderSurface()}</ProjectLiveProvider>);
      });
      await flush();
      expect(screen.getByText('A decision already on screen')).toBeInTheDocument();

      state.deferEvents = true;
      state.token = 'W/"moved"';
      await tick();
      await flush();

      expect(screen.queryByText('Loading activity…')).not.toBeInTheDocument();
      expect(screen.getByText('A decision already on screen')).toBeInTheDocument();

      await act(async () => {
        state.release();
        await vi.advanceTimersByTimeAsync(0);
      });
    }
  );

  it('renders outside a provider without crashing', async () => {
    // The context default is 0, so a surface mounted on some other page (or in an
    // existing test that predates this feature) keeps working and simply never
    // goes live. Additive by construction.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) }))
    );
    await act(async () => {
      render(<LogView projectId={PID} projectRef="hce-hub" />);
    });
    await flush();

    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
