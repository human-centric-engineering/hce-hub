'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { EventRow } from '@/components/hub/projects/log/event-row';
import {
  LOG_FILTERS,
  filterKinds,
  type LogFilter,
} from '@/components/hub/projects/log/presentation';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';
import { useProjectLive } from '@/components/hub/projects/project-live';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * The project **Log** tab (`?view=log`) — a filtered view over the one
 * `ProjectEvent` stream (self-hosting §1). The filter (All / Decisions / Work
 * completed) re-queries the events endpoint with the matching `kinds`, so each
 * view is server-scoped, not a client slice of a mixed page. Client-fetched
 * (like the task sheet) so switching filters is instant and needs no reload.
 */
export function LogView({ projectId, projectRef }: { projectId: string; projectRef: string }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const [events, setEvents] = useState<ProjectEventDTO[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  // The last SUBJECT this fetched for. A background refresh must not blank the
  // list and repaint it — the browser check on t-126 caught exactly that flicker,
  // on every project change, including ones with nothing to do with this surface.
  // `task-sheet.tsx` already had the right treatment (`!detail && state ===
  // 'loading'`); this is the same rule stated as a subject comparison.
  const lastSubject = useRef<string | null>(null);
  /**
   * Whether a fetch has ever succeeded — i.e. whether there is anything on screen
   * worth protecting. The ERROR state keys on this, not on subject identity.
   *
   * Keying the error on "was this a background refresh" was wrong twice over
   * (`/code-review`): React StrictMode double-mounts in dev, and `lastSubject`
   * survives it, so run 2 saw the same subject and a genuinely failing FIRST load
   * showed a permanent skeleton instead of "couldn't load". A `live` tick landing
   * mid-first-fetch does the same in production. `task-sheet.tsx`'s `!detail &&`
   * is the predicate this was supposed to be copying — it asks whether there is
   * data, which is the actual question.
   */
  const hasData = useRef(false);
  // Re-query when something changed elsewhere: `router.refresh()` re-renders the
  // server surfaces but never re-runs this effect (f-realtime §36 t-126).
  const live = useProjectLive();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // Skeleton only when the SUBJECT changed (mount, or the user picked something
    // else). A refresh of the same subject keeps what is on screen until the new
    // data lands.
    const subject = `${projectId}|${filter}`;
    const isBackgroundRefresh = lastSubject.current === subject;
    lastSubject.current = subject;
    if (!isBackgroundRefresh) setState('loading');

    const kinds = filterKinds(filter);
    const qs = kinds ? `?kinds=${encodeURIComponent(kinds.join(','))}` : '';
    fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/events${qs}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: ProjectEventDTO[] };
        if (active) {
          hasData.current = true;
          setEvents(json.data);
          setState('ready');
        }
      })
      .catch((err: unknown) => {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          // A failed refresh leaves the last-good list on screen: one dropped poll
          // should not replace something the user is reading with "couldn't load",
          // and the next tick fixes it. But with NOTHING on screen there is nothing
          // to protect, and staying on the skeleton forever is the worse failure —
          // so the guard asks whether there is data, never why we fetched.
          if (!hasData.current) setState('error');
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, filter, live]);

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Log filter">
        {LOG_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'focus-visible:ring-ring rounded-full px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none',
              filter === f.key
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state === 'loading' && (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
          Loading activity…
        </p>
      )}
      {state === 'error' && (
        <p className="text-muted-foreground py-16 text-center text-sm">
          Couldn&rsquo;t load the log just now — try refreshing.
        </p>
      )}
      {state === 'ready' &&
        (events.length > 0 ? (
          <ul className="divide-border/60 divide-y">
            {events.map((e) => (
              <EventRow key={e.id} event={e} projectRef={projectRef} showRefs />
            ))}
          </ul>
        ) : (
          <p className="py-16 text-center text-sm" style={{ color: 'var(--ink-faint)' }}>
            {filter === 'all'
              ? 'No activity yet.'
              : filter === 'decisions'
                ? 'No decisions recorded yet.'
                : 'Nothing completed yet.'}
          </p>
        ))}
    </div>
  );
}
