'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAutoRefresh } from '@/lib/hooks/use-auto-refresh';

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
 * ## One poller, not one per surface
 *
 * Mounted once per page. `/api/v1/projects/:id/revision` has its own `hub-revision`
 * rate-limit tier (t-125), but that budget is per user across every tab, so a
 * poller per surface would multiply it by four on a single page for no gain. Every
 * consumer reads the same context.
 */
const ProjectLiveContext = createContext<number>(0);

/** How often to ask, while the tab is visible. `useAutoRefresh` pauses when it isn't. */
export const PROJECT_POLL_INTERVAL_MS = 5_000;

/**
 * Consecutive-failure backoff, in ticks skipped: 1, 2, 4 … capped at 32 (≈2.7min at
 * the 5s cadence).
 *
 * A 429 is the case that matters, and it is **silent** — a poller has no
 * user-visible failure mode, so without this a rate-limited client would hammer a
 * closed door for as long as the tab stayed open, and the only symptom anywhere
 * would be surfaces that quietly stopped updating.
 */
const MAX_SKIPPED_TICKS = 32;

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
  const token = useRef<string | null>(null);
  const skipTicks = useRef(0);
  const failures = useRef(0);

  const poll = useCallback(async () => {
    if (skipTicks.current > 0) {
      skipTicks.current -= 1;
      return;
    }

    let res: Response;
    try {
      res = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/revision`, {
        // Our own `If-None-Match` is the conditional request; going through the
        // browser cache as well would mean a 304 could be answered transparently
        // as a 200-from-cache, and the status would stop meaning what it says.
        cache: 'no-store',
        headers: token.current ? { 'If-None-Match': token.current } : undefined,
      });
    } catch {
      // Offline, or the request was cut off. Back off and try later; a dropped
      // poll is a no-op, never an error the user should see.
      failures.current += 1;
      skipTicks.current = Math.min(2 ** (failures.current - 1), MAX_SKIPPED_TICKS);
      return;
    }

    if (res.status === 304) {
      failures.current = 0;
      return;
    }

    if (!res.ok) {
      failures.current += 1;
      skipTicks.current = Math.min(2 ** (failures.current - 1), MAX_SKIPPED_TICKS);
      return;
    }

    failures.current = 0;

    const json = (await res.json().catch(() => null)) as { data?: { revision?: unknown } } | null;
    const next = json?.data?.revision;
    // Validated, not cast: this is a response body, and a malformed one must leave
    // the baseline alone rather than poison it with `undefined` — which would make
    // the NEXT poll look like a change and refresh the page for no reason.
    if (typeof next !== 'string') return;

    const previous = token.current;
    token.current = next;

    // The first token establishes the baseline. Comparing tokens rather than
    // trusting the status also keeps this correct if a 304 ever arrives as a
    // 200-from-cache.
    if (previous === null || previous === next) return;

    setChanges((n) => n + 1);
    router.refresh();
  }, [projectId, router]);

  useAutoRefresh(poll, PROJECT_POLL_INTERVAL_MS);

  return <ProjectLiveContext.Provider value={changes}>{children}</ProjectLiveContext.Provider>;
}
