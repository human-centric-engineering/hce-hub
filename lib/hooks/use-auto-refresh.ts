'use client';

import { useEffect, useRef } from 'react';

/**
 * Run `fn` once on mount and then on a fixed interval. Pauses while
 * the document is hidden (tab in the background) so we don't poll for
 * a user who isn't watching. Resumes — including an immediate refresh
 * — when the tab regains visibility.
 *
 * Why this exists: every admin dashboard that needs "fresh-ish" data
 * was rolling its own `useEffect` + `setInterval` + cleanup. Doing it
 * once means we never forget the visibility-pause (which silently
 * doubles polling load when a user has the admin tab open in the
 * background) and the unmount cleanup (which leaks timers across hot
 * reloads in dev).
 *
 * Contract:
 *  - `fn` runs once on mount and every `intervalMs` after that.
 *  - When the tab hides, the timer is cleared. When it shows again,
 *    `fn` runs immediately and the timer restarts.
 *  - When `enabled` is false, no timer runs and `fn` is not called.
 *    Flipping enabled→true triggers an immediate call.
 *  - The most recent `fn` is always called — even if the caller passes
 *    a new closure each render (we hold it in a ref to avoid stale-
 *    closure bugs where the callback captures last render's state).
 *  - `fn`'s return value is ignored; promise rejections are not
 *    awaited. The caller owns error handling.
 */
export interface UseAutoRefreshOptions {
  enabled?: boolean;
}

export function useAutoRefresh(
  fn: () => void | Promise<void>,
  intervalMs: number,
  options: UseAutoRefreshOptions = {}
): void {
  const { enabled = true } = options;
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const run = (): void => {
      try {
        const result = fnRef.current();
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          (result as Promise<unknown>).catch(() => {
            // Owner handles errors; swallowing here only prevents an
            // unhandled-rejection warning, never hides a logged error.
          });
        }
      } catch {
        // Synchronous throw from caller's fn — same swallow rationale.
      }
    };

    const start = (): void => {
      if (timer !== null) return;
      timer = setInterval(run, intervalMs);
    };

    const stop = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibility = (): void => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        stop();
      } else {
        run();
        start();
      }
    };

    // First call on mount — gives the dashboard fresh data immediately
    // instead of waiting `intervalMs` for the first poll.
    run();

    if (typeof document !== 'undefined' && document.hidden) {
      // Tab already hidden at mount — skip starting the timer.
    } else {
      start();
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [enabled, intervalMs]);
}
