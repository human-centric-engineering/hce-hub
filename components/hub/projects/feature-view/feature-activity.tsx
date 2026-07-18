'use client';

import { useEffect, useState } from 'react';
import { EventRow } from '@/components/hub/projects/log/event-row';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

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
  featureId,
}: {
  projectId: string;
  featureId: string;
}) {
  const [events, setEvents] = useState<ProjectEventDTO[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState('loading');
    fetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/events?featureId=${encodeURIComponent(featureId)}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: ProjectEventDTO[] };
        if (active) {
          setEvents(json.data);
          setState('ready');
        }
      })
      .catch((err: unknown) => {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          setState('error');
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, featureId]);

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
              <EventRow key={e.id} event={e} showRefs />
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
