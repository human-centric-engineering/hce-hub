'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAutoRefresh } from '@/lib/hooks/use-auto-refresh';
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
  const [signedOut, setSignedOut] = useState(false);
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

    if (res.status === 401 || res.status === 403) {
      // Terminal. Stop asking and tell them — see the header.
      setSignedOut(true);
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

  useAutoRefresh(poll, PROJECT_POLL_INTERVAL_MS, { enabled: !signedOut });

  return (
    <ProjectLiveContext.Provider value={changes}>
      {children}
      {signedOut && <SignedOutNotice />}
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
function SignedOutNotice() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t px-4 py-3 text-sm"
      style={{
        borderColor: 'var(--line)',
        backgroundColor: 'var(--bg-elev)',
        color: 'var(--ink-soft)',
      }}
    >
      <span>You&rsquo;ve been signed out — this page is no longer updating.</span>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        Reload to sign in
      </Button>
    </div>
  );
}
