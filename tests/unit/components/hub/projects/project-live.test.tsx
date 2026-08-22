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
import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMockRouter } from '@/tests/types/mocks';
import { ProjectLiveProvider } from '@/components/hub/projects/project-live';
import { PROJECT_POLL_INTERVAL_MS } from '@/lib/projects/live-cadence';
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
/**
 * `window.location` is replaced outright by the reload test. Saved here and put
 * back after every case: `TaskSheet.copyLink` reads `window.location.href`, so an
 * unrestored plain-object stand-in is a live cross-test leak rather than untidiness
 * (`/code-review`).
 */
const REAL_LOCATION = Object.getOwnPropertyDescriptor(window, 'location');
const REAL_HIDDEN = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

/** `document.hidden` is a getter; override it so visibility can be driven. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (REAL_LOCATION) Object.defineProperty(window, 'location', REAL_LOCATION);
  Reflect.deleteProperty(document, 'hidden');
  if (REAL_HIDDEN) Object.defineProperty(Document.prototype, 'hidden', REAL_HIDDEN);
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

  it('backs off on a malformed body, rather than polling forever against it', async () => {
    // A 200 carrying a body we cannot read is a proxy, an edge error page, or a bad
    // deploy. Shrugging at it meant full-cadence polling forever while every surface
    // froze silently — the invisible-frozen-page failure the terminal branches exist
    // to prevent, reached through a door nobody was watching (`/code-review`).
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    const garbage = {
      ok: true,
      status: 200,
      json: async () => ({ data: { revision: 42 } }),
    } as unknown as Response;
    // Records like any other poll. A stub that does not push here makes the counter
    // blind, and the assertion passes whether the backoff exists or not — which is
    // exactly how this test first shipped useless.
    vi.mocked(fetch).mockImplementation((_url, init) => {
      state.revisionCalls.push(init ?? {});
      return Promise.resolve(garbage);
    });

    await tick();
    const afterGarbage = state.revisionCalls.length;

    // Inside the backoff window: nothing goes out.
    await tick();
    expect(state.revisionCalls).toHaveLength(afterGarbage);
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

    // The wait is a deadline, so it is stated in time: two cadences after a first
    // failure. The tick inside that window sends nothing.
    await tick();
    expect(state.revisionCalls).toHaveLength(afterFirstFailure);

    // ...and the one past the deadline goes out again.
    await tick();
    expect(state.revisionCalls.length).toBeGreaterThan(afterFirstFailure);
  });

  it('treats a thrown fetch (offline) as transient, not as a reason to shout', async () => {
    // Going offline is the most ordinary failure there is. It must back off like any
    // other transient one, and it must NOT look like auth loss — a laptop closing
    // its lid should not tell the user they have been signed out.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    const live = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    await tick();
    const afterFailure = state.revisionCalls.length;

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // The next tick is skipped by the backoff...
    await tick();
    expect(state.revisionCalls).toHaveLength(afterFailure);

    // ...and it recovers on its own once the network is back.
    if (live) vi.mocked(fetch).mockImplementation(live);
    await tick(2);
    expect(state.revisionCalls.length).toBeGreaterThan(afterFailure);
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

describe('signed out — the one failure a backoff cannot fix', () => {
  it.each([401, 403])('stops polling on a %i', async (status) => {
    // A backoff assumes the failure is transient. An expired session is not: the
    // poller would slow to a crawl and go on failing forever while every surface
    // showed whatever data it happened to have, with nothing on screen to say it
    // was frozen. Worse than the flicker, because it is invisible.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = status;
    await tick();
    const afterAuthFailure = state.revisionCalls.length;

    await tick(4);
    expect(state.revisionCalls).toHaveLength(afterAuthFailure);
  });

  it('tells the user, rather than going quiet', async () => {
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 401;
    await tick();

    expect(screen.getByRole('status')).toHaveTextContent(/signed out/i);
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('keeps backing off and recovering on a 500 — only auth loss is terminal', async () => {
    // The other direction, and the reason the two are distinguished rather than
    // lumped together as "not ok": a server blip must not permanently freeze a page.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 500;
    await tick();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    state.status = 200;
    await tick(2); // one skipped by the backoff, then a live one
    const recovered = state.revisionCalls.length;

    state.token = 'W/"moved"';
    await tick();
    expect(state.revisionCalls.length).toBeGreaterThan(recovered);
    expect(router.refresh).toHaveBeenCalled();
  });

  it('reloads when the button is pressed, rather than routing to /login itself', async () => {
    // The behaviour, not just the button's presence — `/pre-pr` coverage caught that
    // the handler was never invoked by any test.
    //
    // A reload (not `router.push('/login')`) is the point: `app/(hub)/layout.tsx` is
    // the one auth guard for the whole group, and deciding here what a signed-out
    // visitor sees would be a second answer to a question the app already answers.
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();
    state.status = 401;
    await tick();

    await act(async () => {
      screen.getByRole('button', { name: /reload/i }).click();
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows nothing at all while the session is good', async () => {
    // Guards against the notice being rendered unconditionally, which would pass
    // the "tells the user" test above for entirely the wrong reason.
    mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();
    await tick(3);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('the poller’s lifecycle edges', () => {
  it('never runs two polls at once', async () => {
    // `useAutoRefresh` fires on the interval AND on every visibilitychange, so this
    // is reachable by alt-tabbing, not just by a slow server. Out-of-order
    // resolution rewinds the baseline and produces a cascade of spurious refreshes.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    // Hold the revision response open, then fire more ticks underneath it.
    let release: () => void = () => {};
    // One cast, at the boundary: `mockImplementationOnce` is typed as the real
    // `fetch`, and a partial stand-in is the whole point of a stub.
    const slowResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { revision: 'W/"slow"' } }),
    } as unknown as Response;

    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      // Recorded like any other poll — otherwise the pending one is invisible to
      // the counter and the assertion below cannot tell "blocked" from "never sent".
      state.revisionCalls.push(init ?? {});
      return new Promise<Response>((resolve) => {
        release = () => resolve(slowResponse);
      });
    });

    const before = state.revisionCalls.length;
    await tick(3);
    expect(state.revisionCalls.length, 'ticks fired while one was pending').toBe(before + 1);

    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('gives every poll an abort signal, so a hung request cannot latch it shut', async () => {
    // `inFlight` makes a never-settling request permanently fatal: every later tick
    // returns at the guard, so neither the backoff nor the stop-and-tell strip can
    // fire and every surface freezes in silence. The signal routes it into the
    // transient path instead (`/code-review`).
    //
    // Honest limit: this pins the WIRING, not the duration — `AbortSignal.timeout`
    // runs on a timer the test harness does not drive.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();
    await tick();

    expect(state.revisionCalls.length).toBeGreaterThan(0);
    for (const init of state.revisionCalls) {
      expect(init.signal, 'a poll went out with no abort signal').toBeInstanceOf(AbortSignal);
    }
  });

  it('does not refresh a page the user has already navigated to', async () => {
    // The router instance is global, so a poll resolving after unmount would
    // `router.refresh()` whatever route the user just landed on, for a change with
    // nothing to do with it. Every other fetch in the Hub carries an abort/active
    // guard; this one did not (`/code-review`).
    mockEndpoints();
    const view = await act(async () =>
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>)
    );
    await flush();

    let release: () => void = () => {};
    const moved = {
      ok: true,
      status: 200,
      json: async () => ({ data: { revision: 'W/"landed-late"' } }),
    } as unknown as Response;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = () => resolve(moved)))
    );

    await tick(); // the poll goes out and hangs
    view.unmount(); // ...and the user leaves

    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('stops on a 404 — the door a removed member actually comes through', async () => {
    // The revision endpoint answers a non-member with 404, never 403, so losing
    // membership mid-session lands here rather than on the auth branch.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 404;
    await tick();
    const afterLoss = state.revisionCalls.length;

    await tick(4);
    expect(state.revisionCalls).toHaveLength(afterLoss);
    expect(screen.getByRole('status')).toHaveTextContent(/no longer have access/i);
  });

  /** Drive the tab hidden, wait, and bring it back. */
  async function hideFor(ms: number) {
    setHidden(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(ms);
    });
    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('is NOT defeated by REPEATED tab flicks', async () => {
    // The edge that broke both earlier attempts. Counting skipped ticks let each
    // return-to-visible burn one off, so N flicks paid N ticks of debt for free; the
    // fix for that then let any flick clear the failure count once the debt hit zero
    // (`/code-review` rounds 3 and 4). A wall-clock deadline is immune to both —
    // time is time whether the tab is watched or not — which is why the fix was to
    // change the mechanism rather than add a third guard to it.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 429;
    await tick();
    const owed = state.revisionCalls.length;

    // Flick repeatedly, well inside the backoff window.
    for (let i = 0; i < 5; i++) await hideFor(50);

    expect(state.revisionCalls).toHaveLength(owed);
  });

  it('serves its wait while hidden, with no forgiveness logic', async () => {
    // The property that made the deadline worth switching to: a hidden tab runs no
    // ticks but time still passes, so the wait is served exactly as a visible tab's
    // would be. The tick-counting version needed a separate mechanism to approximate
    // this, and that mechanism was the hole.
    const state = mockEndpoints();
    await act(async () => {
      render(<ProjectLiveProvider projectId={PID}>{null}</ProjectLiveProvider>);
    });
    await flush();

    state.status = 500;
    await tick();
    const owed = state.revisionCalls.length;
    state.status = 200;

    await hideFor(PROJECT_POLL_INTERVAL_MS * 10);
    await tick();

    expect(state.revisionCalls.length).toBeGreaterThan(owed);
  });
});

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

  it.each(CLIENT_FETCHED_SURFACES.filter((surface) => surface.showsEvents))(
    '$name reports a failed FIRST load, even under StrictMode',
    async ({ render: renderSurface }) => {
      // The regression `/code-review` round 3 caught in round 2's own fix. Keying
      // "is this a background refresh?" on SUBJECT IDENTITY looked equivalent to
      // `task-sheet.tsx`'s `!detail &&` and is not: `reactStrictMode` is on
      // (`next.config.js`), React double-invokes effects, and the ref survives — so
      // run 2 saw the same subject, called a genuinely failing first load
      // "background", and left "Loading activity…" on screen forever. Before that
      // commit it reported honestly.
      //
      // StrictMode here is the real trigger, not a contrivance: this is what dev
      // does on every mount.
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          url.includes('/revision')
            ? Promise.resolve({ ok: true, status: 200, json: async () => ({ data: {} }) })
            : Promise.reject(new Error('boom'))
        )
      );

      await act(async () => {
        render(<StrictMode>{renderSurface()}</StrictMode>);
      });
      await flush();

      expect(screen.queryByText('Loading activity…')).not.toBeInTheDocument();
      expect(screen.getByText(/Couldn.t load/)).toBeInTheDocument();
    }
  );

  it('the Log reports a failed load after a FILTER change', async () => {
    // Round 3 keyed the error on subject identity; round 4's fix keyed it on
    // `hasData` — and forgot to reset that when the subject changes. So a successful
    // load followed by a failing filter change suppressed the error as though data
    // were present, and hung on the skeleton forever with no retry path. Two
    // consecutive fixes for one bug, each introducing the next (`/code-review`).
    let failNext = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/revision')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: {} }) });
        }
        return failNext
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [EVENT] }) });
      })
    );

    await act(async () => {
      render(<LogView projectId={PID} projectRef="hce-hub" />);
    });
    await flush();
    expect(screen.getByText('A decision already on screen')).toBeInTheDocument();

    failNext = true;
    await act(async () => {
      screen.getByRole('tab', { name: 'Decisions' }).click();
    });
    await flush();

    expect(screen.queryByText('Loading activity…')).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn.t load/)).toBeInTheDocument();
  });

  it('an activity timeline reports a failed load after the SUBJECT changes', async () => {
    // The same defect reached by navigation rather than a click: the provider is
    // keyed on the project, so moving between two features of one project keeps the
    // component — and its refs — alive.
    let failNext = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        failNext
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [EVENT] }) })
      )
    );

    const view = await act(async () =>
      render(<FeatureActivity projectId={PID} projectRef="hce-hub" featureId="f1" />)
    );
    await flush();
    expect(screen.getByText('A decision already on screen')).toBeInTheDocument();

    failNext = true;
    await act(async () => {
      view.rerender(<FeatureActivity projectId={PID} projectRef="hce-hub" featureId="f2" />);
    });
    await flush();

    expect(screen.queryByText('Loading activity…')).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn.t load/)).toBeInTheDocument();
  });

  it('the task timeline reports a failed load after the TASK changes', async () => {
    // Masked in the app today — `task-sheet.tsx` nulls `detail` on a task change and
    // unmounts this — but the defect is in the component, so it is pinned here. A
    // bug that survives only because of a neighbour's incidental behaviour is one
    // refactor away from being real.
    let failNext = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        failNext
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [EVENT] }) })
      )
    );

    const view = await act(async () =>
      render(<TaskActivity projectId={PID} projectRef="hce-hub" taskId="t1" refreshKey={0} />)
    );
    await flush();
    expect(screen.getByText('A decision already on screen')).toBeInTheDocument();

    failNext = true;
    await act(async () => {
      view.rerender(
        <TaskActivity projectId={PID} projectRef="hce-hub" taskId="t2" refreshKey={0} />
      );
    });
    await flush();

    expect(screen.queryByText('Loading activity…')).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn.t load/)).toBeInTheDocument();
  });

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
