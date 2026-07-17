'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { EventRow } from '@/components/hub/projects/log/event-row';
import {
  LOG_FILTERS,
  filterKinds,
  type LogFilter,
} from '@/components/hub/projects/log/presentation';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * The project **Log** tab (`?view=log`) — a filtered view over the one
 * `ProjectEvent` stream (self-hosting §1). The filter (All / Decisions / Work
 * completed) re-queries the events endpoint with the matching `kinds`, so each
 * view is server-scoped, not a client slice of a mixed page. Client-fetched
 * (like the task sheet) so switching filters is instant and needs no reload.
 */
export function LogView({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const [events, setEvents] = useState<ProjectEventDTO[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState('loading');

    const kinds = filterKinds(filter);
    const qs = kinds ? `?kinds=${encodeURIComponent(kinds.join(','))}` : '';
    fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/events${qs}`, {
      signal: controller.signal,
    })
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
  }, [projectId, filter]);

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
              <EventRow key={e.id} event={e} showRefs />
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
