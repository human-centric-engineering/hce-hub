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
 * reason; `useSearchParams` seeds the initial value so a deep-linked
 * `?task=` survives a refresh, and a `popstate` listener keeps back/forward in
 * sync. Because `children` is a stable element passed from the (server) project
 * view, toggling the sheet re-renders only this host, not the surface beneath.
 */
export function TaskSheetProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const [taskId, setTaskId] = useState<string | null>(() => searchParams.get('task'));

  // Keep in sync with browser back/forward (the sheet is URL state).
  useEffect(() => {
    const sync = () => setTaskId(new URLSearchParams(window.location.search).get('task'));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

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
