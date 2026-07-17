import { useEffect, useState } from 'react';
import { EventRow } from '@/components/hub/projects/log/event-row';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const sectionLabel = 'font-mono text-[10px] tracking-wider uppercase';

/**
 * The task-sheet **activity timeline** (f-journal §17 t-3 — discharges the §11
 * deferral). A `?taskId=`-scoped read of the one `ProjectEvent` stream, newest
 * first. Refetches on task change and on `refreshKey` (bumped after a claim), so
 * a just-made claim appears without reopening the sheet. Reuses the shared
 * `EventRow`; refs are hidden (we're already in the task's context).
 */
export function TaskActivity({
  projectId,
  taskId,
  refreshKey,
}: {
  projectId: string;
  taskId: string;
  refreshKey: number;
}) {
  const [events, setEvents] = useState<ProjectEventDTO[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState('loading');
    fetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/events?taskId=${encodeURIComponent(taskId)}`,
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
  }, [projectId, taskId, refreshKey]);

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
              <EventRow key={e.id} event={e} />
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
