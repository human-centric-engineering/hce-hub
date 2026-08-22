'use client';

import { useEffect, useRef, useState } from 'react';
import { EventRow } from '@/components/hub/projects/log/event-row';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';
import { useProjectLive } from '@/components/hub/projects/project-live';

const sectionLabel = 'font-mono text-[10px] tracking-wider uppercase';

/**
 * The feature-scoped **activity timeline** (f-feature-planning §18 t-3). A
 * `?featureId=`-scoped read of the one `ProjectEvent` stream (the feature's
 * lifecycle events + its tasks' events + any feature-scoped decisions/notes),
 * newest first. Reuses the shared `EventRow` with `showRefs` so a `task_created`
 * row still names its task. Client-fetched — the feature page's server render
 * carries the feature detail, not its (separately-capped) journal.
 */
export function FeatureActivity({
  projectId,
  projectRef,
  featureId,
}: {
  projectId: string;
  /** The project's slug (or id) for the ref chips' feature-page hrefs (t-105). */
  projectRef: string;
  featureId: string;
}) {
  const [events, setEvents] = useState<ProjectEventDTO[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
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
  // Refetch when the project changed elsewhere (f-realtime §36 t-126).
  const live = useProjectLive();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // Skeleton only when the SUBJECT changed (mount, or the user picked something
    // else). A refresh of the same subject keeps what is on screen until the new
    // data lands.
    const subject = `${projectId}|${featureId}`;
    const isBackgroundRefresh = lastSubject.current === subject;
    lastSubject.current = subject;
    if (!isBackgroundRefresh) setState('loading');
    fetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/events?featureId=${encodeURIComponent(featureId)}`,
      { signal: controller.signal }
    )
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
  }, [projectId, featureId, live]);

  return (
    <section className="flex flex-col gap-1.5">
      <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
        Activity
      </div>
      {state === 'loading' && (
        <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          Loading activity…
        </p>
      )}
      {state === 'error' && (
        <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          Couldn&rsquo;t load activity just now.
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
          <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            No activity yet.
          </p>
        ))}
    </section>
  );
}
