'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAutoRefresh } from '@/lib/hooks/use-auto-refresh';
// Shared with `lib/app/rate-limit.ts`, which derives the tier's cap from it — the
// two must agree, and once did not.
import { PROJECT_POLL_INTERVAL_MS } from '@/lib/projects/live-cadence';
import { Button } from '@/components/ui/button';

/**
 * Live project surfaces — one poller per page (f-realtime §36 t-126).
 *
 * The Hub's working loop is *agent writes over MCP → human reads the board*, so
 * without this the two halves are looking at different states by construction. A
 * change made elsewhere — over MCP, by the GitHub webhook, or by another member —
 * reaches every open surface within a few seconds and no one reloads anything.
 *
 * ## Two halves, because one is not enough
 *
 * **Server-rendered surfaces** (Plan, Board, Ideas, the bugs strip, the feature
 * page, the project header) come back through `router.refresh()`, which re-runs the
 * server render *without remounting* — expanded phase bands, scroll position and
 * every other piece of local state survive. That is the same call the write paths
 * have always made; the only new thing is a reason to make it.
 *
 * **Client-fetched surfaces** (the Log, the task sheet, the two activity timelines)
 * do NOT come back that way. `router.refresh()` does not re-run a `useEffect`, so
 * they would sit visibly stale over a Plan that updates correctly — the failure
 * this feature is supposed to remove, reintroduced one layer down. They each take
 * {@link useProjectLive} as an effect dependency instead.
 *
 * ## Why a counter and not the token
 *
 * The value handed out is a **change count**, not the revision string. Exposing the
 * token would fire every consumer's effect once on mount, the moment the first poll
 * resolved — a guaranteed second fetch of data the page had just rendered. The
 * first token is a *baseline*, so the count stays at 0 until something genuinely
 * moves. It also drops straight into the `refreshKey`-shaped props these components
 * already had.
 *
 * ## Auth loss is terminal; everything else recovers
 *
 * A 401/403 is the one failure a backoff cannot fix — the session is gone and no
 * amount of waiting brings it back. Left on the normal path the poller would slow
 * to a crawl and go on failing forever while every surface showed the last data it
 * happened to have, with nothing on screen to say it was frozen. That is worse than
 * the flicker this feature already fixed, because it is invisible.
 *
 * So auth loss **stops the poller and says so**. Deliberately not a redirect: this
 * fires from a timer, at a moment the user did not choose, and the task sheet's
 * set-PR form and the jot-idea popover both hold unsaved text a surprise navigation
 * would discard. `app/(hub)/layout.tsx` is the one auth guard for the whole group
 * and already bounces a signed-out visitor to `/login`, so a reload does exactly the
 * right thing — the user only needs telling to take it.
 *
 * Every other failure (500, offline, a dropped connection) keeps backing off and
 * recovers on its own, which is why the two are distinguished rather than lumped
 * together as "not ok".
 *
 * ## One poller, not one per surface
 *
 * Mounted once per page. `/api/v1/projects/:id/revision` has its own `hub-revision`
 * rate-limit tier (t-125), but that budget is per user across every tab, so a
 * poller per surface would multiply it by four on a single page for no gain. Every
 * consumer reads the same context.
 */
const ProjectLiveContext = createContext<number>(0);

/**
 * Consecutive-failure backoff: wait 2, 4, 8 … cadences before the next attempt,
 * capped at 32 (≈2.7min at the 5s cadence).
 *
 * Starts at two rather than one so "backing off" always means waiting longer than
 * the normal cadence — a one-cadence wait lands exactly on the next tick and skips
 * nothing, which is a backoff in name only.
 *
 * A 429 is the case that matters, and it is **silent** — a poller has no
 * user-visible failure mode, so without this a rate-limited client would hammer a
 * closed door for as long as the tab stayed open, and the only symptom anywhere
 * would be surfaces that quietly stopped updating.
 *
 * **A deadline, not a count of skipped ticks.** Counting ticks made the backoff
 * defeatable by tab-switching, twice over: `useAutoRefresh` polls on every return
 * to visible, and each of those polls burned a skip, so N flicks paid off N ticks
 * of debt for free. Patching that needed a second mechanism — forgive the debt a
 * hidden tab could not have paid — which introduced its own hole, because once the
 * debt drained to zero `away >= 0` was trivially true and any flick then cleared
 * the failure count as well (`/code-review` rounds 3 and 4).
 *
 * A wall-clock deadline has none of that. Time passes whether the tab is visible,
 * hidden, or being flicked between — so a hidden tab serves its wait exactly like a
 * visible one, no forgiveness logic is needed, and there is nothing for a
 * visibilitychange to game. The two-mechanism version was a fix that needed a fix;
 * this is the shape that removes the question.
 */
const MAX_BACKOFF_MULTIPLE = 32;

/**
 * Give up on a request that outlives two cadences. Long enough that a merely slow
 * response is not cut off, short enough that a hung one cannot outlast the tab.
 */
const POLL_TIMEOUT_MS = PROJECT_POLL_INTERVAL_MS * 2;

/**
 * How many 404s in a row before we believe access is really gone. Three at the
 * backoff's cadence is ~35s of consistent 404 — long enough to outlast a deploy, far
 * short of leaving someone staring at stale data.
 */
const CONSECUTIVE_404S_BEFORE_TERMINAL = 3;

/**
 * A timeout signal, or `undefined` where the platform has no `AbortSignal.timeout`
 * (Safari <16, Firefox <100, some test environments).
 *
 * Guarded rather than called directly because an unguarded call throws *inside* the
 * try block, which classifies every poll as a network failure — so the poller backs
 * off to its cap and fails forever, neither terminal branch is ever reached, and
 * nothing appears on screen. That is the invisible-frozen-page failure this design
 * keeps trying to close, arriving through the guard added to close it
 * (`/code-review`).
 */
function pollTimeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(POLL_TIMEOUT_MS)
    : undefined;
}

/** Next time a poll may run. `0` = no backoff in force. */
const backoffFor = (failures: number): number =>
  now() + Math.min(2 ** failures, MAX_BACKOFF_MULTIPLE) * PROJECT_POLL_INTERVAL_MS;

/**
 * Monotonic, not wall-clock. `Date.now()` can step backwards — an NTP correction, a
 * VM resume, someone changing the system clock — which would leave `backoffUntil`
 * in the future by that whole offset and strand the poller far past the 32-cadence
 * cap, with no recovery and nothing on screen. `performance.now()` gives the same
 * immunity to tab-flicking that the deadline was chosen for, and immunity to the
 * clock as well (`/code-review`).
 */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Increments once per detected change; `0` until the first one. */
export function useProjectLive(): number {
  return useContext(ProjectLiveContext);
}

export function ProjectLiveProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [changes, setChanges] = useState(0);
  /**
   * Why the poller has given up, or `null` while it is running. Both values are
   * terminal — no amount of waiting fixes either — and both reach the user through
   * the same stop-and-tell strip, because an invisible frozen page is the failure
   * mode, whichever door it came through.
   */
  const [stopped, setStopped] = useState<'signed-out' | 'no-access' | null>(null);
  const token = useRef<string | null>(null);
  const failures = useRef(0);
  /** Wall-clock deadline; polls before this are skipped. See {@link MAX_BACKOFF_MULTIPLE}. */
  const backoffUntil = useRef(0);
  /** Consecutive 404s. See {@link CONSECUTIVE_404S_BEFORE_TERMINAL}. */
  const notFounds = useRef(0);
  /**
   * One poll at a time. `useAutoRefresh` fires on the interval AND immediately on
   * every `visibilitychange`, so alt-tabbing — or any response slower than the
   * cadence — can otherwise put two in flight at once. If those resolve out of
   * order the baseline *rewinds*: the later one records R2 and refreshes, the
   * earlier lands with R1 and refreshes again, and the next poll sees R1→R2 and
   * refreshes a third time. The same race double-counted `failures`, jumping the
   * backoff two steps for one outage (`/code-review`).
   */
  const inFlight = useRef(false);
  /**
   * The router instance is global, so a poll resolving after the user navigated away
   * would `router.refresh()` whatever route they had just landed on, for a change
   * with nothing to do with it (`/code-review`).
   *
   * A flag rather than an `AbortController` — unlike the surfaces, this request has
   * no render to race, so all that matters is not acting on a stale result. An
   * earlier version of this comment claimed parity with "every other fetch in the
   * Hub", which was simply untrue of the code beneath it.
   */
  const mounted = useRef(true);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    if (now() < backoffUntil.current) return;
    inFlight.current = true;
    try {
      await runPoll();
    } finally {
      inFlight.current = false;
    }

    async function runPoll() {
      let res: Response;
      try {
        res = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/revision`, {
          // Our own `If-None-Match` is the conditional request; going through the
          // browser cache as well would mean a 304 could be answered transparently
          // as a 200-from-cache, and the status would stop meaning what it says.
          cache: 'no-store',
          headers: token.current ? { 'If-None-Match': token.current } : undefined,
          // Without this a request that never settles — a captive portal, a proxy
          // holding the socket — leaves `inFlight` latched true forever. Every later
          // tick returns at the guard, so neither the backoff nor the stop-and-tell
          // strip can ever fire, and every surface freezes in silence: the
          // invisible-frozen-page failure again, through the one door that had no
          // guard on it. Browsers give up on their own only after minutes. The abort
          // throws, which routes it into the transient path below (`/code-review`).
          signal: pollTimeoutSignal(),
        });
      } catch {
        // Offline, or the request was cut off. Back off and try later; a dropped
        // poll is a no-op, never an error the user should see.
        failures.current += 1;
        backoffUntil.current = backoffFor(failures.current);
        return;
      }

      if (res.status === 304) {
        failures.current = 0;
        backoffUntil.current = 0;
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setStopped('signed-out');
        return;
      }

      if (res.status === 404) {
        // Reached by the door the Hub actually uses: the revision endpoint answers a
        // non-member with 404, never 403 (anti-enumeration). So a lead removing
        // someone's membership — or the project being deleted — arrives here rather
        // than above.
        //
        // But a 404 is NOT proof of that on its own. Deploy skew, an edge 404, a
        // route briefly unavailable — all look identical, and going terminal on the
        // first one pins a false and alarming "you no longer have access" over a
        // perfectly good page, permanently, while a mere 5xx on the line below
        // politely recovers. So it has to repeat before we believe it; anything else
        // backs off like any other transient failure (`/code-review`).
        notFounds.current += 1;
        if (notFounds.current >= CONSECUTIVE_404S_BEFORE_TERMINAL) {
          setStopped('no-access');
          return;
        }
        failures.current += 1;
        backoffUntil.current = backoffFor(failures.current);
        return;
      }
      notFounds.current = 0;

      if (!res.ok) {
        failures.current += 1;
        backoffUntil.current = backoffFor(failures.current);
        return;
      }

      const json = (await res.json().catch(() => null)) as { data?: { revision?: unknown } } | null;
      const next = json?.data?.revision;
      // Validated, not cast: this is a response body, and a malformed one must leave
      // the baseline alone rather than poison it with `undefined` — which would make
      // the NEXT poll look like a change and refresh the page for no reason.
      //
      // It also counts as a FAILURE. A 200 carrying a body we cannot read is a proxy,
      // an edge error page, or a bad deploy — and treating it as a shrug meant polling
      // at full cadence forever while every surface froze silently, which is the
      // invisible-frozen-page failure the terminal branches exist to prevent, reached
      // through a door nobody was watching (`/code-review`).
      if (typeof next !== 'string') {
        failures.current += 1;
        backoffUntil.current = backoffFor(failures.current);
        return;
      }

      // Only a well-formed response clears the backoff.
      failures.current = 0;
      backoffUntil.current = 0;

      const previous = token.current;
      token.current = next;

      // The first token establishes the baseline. Comparing tokens rather than
      // trusting the status also keeps this correct if a 304 ever arrives as a
      // 200-from-cache.
      if (previous === null || previous === next) return;

      if (!mounted.current) return;
      setChanges((n) => n + 1);
      router.refresh();
    }
  }, [projectId, router]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Both call sites pass `key={projectId}`, so this instance should never span two
  // projects. This makes that belt-and-braces rather than load-bearing: a third
  // mount point that forgot the key would otherwise silently reintroduce the exact
  // trap the key was added for — A's revision as B's baseline, and A's "no longer
  // have access" notice pinned over B (`/code-review`).
  useEffect(() => {
    token.current = null;
    failures.current = 0;
    backoffUntil.current = 0;
    notFounds.current = 0;
    setStopped(null);
    setChanges(0);
  }, [projectId]);

  useAutoRefresh(poll, PROJECT_POLL_INTERVAL_MS, { enabled: stopped === null });

  return (
    <ProjectLiveContext.Provider value={changes}>
      {children}
      {stopped && <StoppedNotice reason={stopped} />}
    </ProjectLiveContext.Provider>
  );
}

/**
 * Shown when the poller has stopped because the session is gone.
 *
 * Bottom-anchored so it cannot collide with the sticky topbar, and `role="status"`
 * rather than `alert` — this is worth announcing, but it is not an emergency and
 * should not interrupt whatever a screen reader is mid-way through.
 *
 * The button reloads rather than routing to `/login` itself: the reload hits the
 * `(hub)` layout's guard, which is the single place that decides what a signed-out
 * visitor sees. Re-implementing that decision here would be a second answer to a
 * question the app has already answered once.
 */
function StoppedNotice({ reason }: { reason: 'signed-out' | 'no-access' }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-3 border-t px-4 py-3 text-sm"
      style={{
        borderColor: 'var(--line)',
        backgroundColor: 'var(--bg-elev)',
        color: 'var(--ink-soft)',
      }}
    >
      <span>
        {reason === 'signed-out'
          ? 'You’ve been signed out — this page is no longer updating.'
          : 'You no longer have access to this project — this page is no longer updating.'}
      </span>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        {reason === 'signed-out' ? 'Reload to sign in' : 'Reload'}
      </Button>
    </div>
  );
}
