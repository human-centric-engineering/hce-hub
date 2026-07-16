'use client';

import { useEffect, useState } from 'react';
import { X, Link2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSidekick } from '@/components/hub/sidekick-context';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { taskStatus, firstName } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import type { TaskDetailDTO } from '@/components/hub/projects/task-sheet/types';

/** The width the sidekick column occupies + its gutter — the sheet anchors to its left. */
const SIDEKICK_OFFSET = 392;

type LoadState = 'loading' | 'error' | 'ready';

/**
 * TaskSheet — the sliding task detail panel (f-task-sheet §11 t-2).
 *
 * Fetches one task's detail client-side (so opening never re-runs the page),
 * slides in from the right over a scrim, closes on Esc / scrim / the close
 * button, and — the specific design requirement — **anchors to the left of the
 * sidekick when it's open** (`right: 392px`). This t-2 slice ships the frame +
 * header identity + status; the rich body (description, files, dependency graph,
 * action row) lands in t-3.
 */
export function TaskSheet({
  projectId,
  taskId,
  onClose,
}: {
  projectId: string;
  taskId: string;
  onClose: () => void;
}) {
  const { open: sidekickOpen } = useSidekick();
  const [detail, setDetail] = useState<TaskDetailDTO | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [entered, setEntered] = useState(false);

  // Trigger the slide-in on mount.
  useEffect(() => setEntered(true), []);

  // Fetch the task detail whenever the target task changes.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState('loading');
    setDetail(null);
    // Encode both ids into the path: `taskId` comes from the `?task=` URL param
    // (user-controllable), so encoding confines the request to this endpoint —
    // a crafted `../…` can't reshape the path. The request is same-origin on the
    // caller's own session and the API re-validates + access-scopes both ids
    // (t-1), so this is defence-in-depth, not the primary control.
    const path = `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
    fetch(path, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: TaskDetailDTO };
        if (active) {
          setDetail(json.data);
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
  }, [projectId, taskId]);

  // Esc closes the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyLink = () => void navigator.clipboard?.writeText(window.location.href);

  const ref = detail?.number != null ? `t-${detail.number}` : `t-${taskId.slice(-4)}`;
  const status = detail ? taskStatus(detail.status) : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`Task ${ref}`}
        className="bg-background fixed top-0 bottom-0 z-50 flex w-[440px] max-w-[calc(100vw-2rem)] flex-col border-l shadow-xl"
        style={{
          right: sidekickOpen ? SIDEKICK_OFFSET : 0,
          transform: entered ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease, right 200ms ease',
        }}
      >
        <header className="flex flex-col gap-3 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
                {ref}
              </span>
              {detail && (
                <>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    ·
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'var(--ink-mute)' }}>
                    {detail.feature.slug ?? detail.feature.title}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link to this task"
                className="hover:bg-muted rounded p-1"
              >
                <Link2 className="h-4 w-4" style={{ color: 'var(--ink-mute)' }} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hover:bg-muted rounded p-1"
              >
                <X className="h-4 w-4" style={{ color: 'var(--ink-mute)' }} />
              </button>
            </div>
          </div>

          {state === 'ready' && detail && (
            <>
              <h2 className="text-[17px] leading-snug font-medium">{detail.title}</h2>
              <div className="flex items-center gap-3">
                {status && <StatusPill tone={status.tone} label={status.label} />}
                {detail.claimer ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      {detail.claimer.image && <AvatarImage src={detail.claimer.image} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {initials(detail.claimer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-muted-foreground text-xs">
                      {firstName(detail.claimer.name)}
                      {detail.isMine && <span style={{ color: 'var(--accent)' }}> · you</span>}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    unclaimed
                  </span>
                )}
              </div>
            </>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'loading' && (
            <div className="space-y-3" aria-hidden>
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
              <div className="bg-muted h-3 w-full animate-pulse rounded" />
              <div className="bg-muted h-3 w-4/5 animate-pulse rounded" />
            </div>
          )}
          {state === 'error' && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Couldn&rsquo;t load this task — try reopening it.
            </p>
          )}
          {/* The rich body — description, files in scope, dependency graph, and
              the action row — arrives in t-3. */}
        </div>
      </aside>
    </>
  );
}
