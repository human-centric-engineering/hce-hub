'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import { TaskSheet } from '@/components/hub/projects/task-sheet/task-sheet';

/**
 * TaskSheetProvider — the client boundary that hosts the deep-linkable task
 * sheet (f-task-sheet §11 t-2). Wraps the project view so any surface below it
 * (Plan rows, Board cards) can `useTaskSheet().open(id)`.
 *
 * The open task is **URL state** (`?task=<id>`), driven client-side so opening
 * the sheet never re-runs the page's server render — the underlying Plan/Board
 * (and its local state, e.g. expanded features) is preserved. `?task=` is
 * written with the native History API rather than `router.push` for the same
 * reason. **The URL is the source of truth:** `taskId` mirrors `useSearchParams`,
 * so the sheet stays in sync through every URL change — a deep-linked `?task=`
 * on load, back/forward, *and* a `<Link>` tab switch that drops `?task=` (which
 * must close the sheet, not leave it orphaned from the address bar). `open`/
 * `close` also set state directly so the pushState path is instant. Because
 * `children` is a stable element passed from the (server) project view, toggling
 * the sheet re-renders only this host, not the surface beneath.
 */
export function TaskSheetProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const urlTask = searchParams.get('task');
  const [taskId, setTaskId] = useState<string | null>(urlTask);

  // The URL is the source of truth: follow every navigation that changes `?task=`
  // — a `<Link>` tab switch that drops it (→ close), or back/forward — so the
  // sheet never desyncs from the address bar. `open`/`close` set state directly
  // too, so the pushState path stays instant even where `useSearchParams` lags.
  useEffect(() => setTaskId(urlTask), [urlTask]);

  const open = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('task', id);
    window.history.pushState(null, '', url);
    setTaskId(id);
  }, []);

  const close = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.pushState(null, '', url);
    setTaskId(null);
  }, []);

  // Stable controls — Plan/Board rows consuming `open` don't re-render when the
  // sheet toggles (open/close are stable; the object would otherwise be new).
  const controls = useMemo(() => ({ open, close }), [open, close]);

  return (
    <TaskSheetControlsProvider value={controls}>
      {children}
      {taskId && <TaskSheet projectId={projectId} taskId={taskId} onClose={close} />}
    </TaskSheetControlsProvider>
  );
}
