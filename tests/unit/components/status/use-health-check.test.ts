/**
 * Tests: useHealthCheck hook
 *
 * Covers the hook's observable contract: what it puts into state, when it fires
 * `onStatusChange`, how polling is governed, and the PR #268 safety net — that
 * a malformed `/api/health` payload becomes a clean `error` state rather than a
 * silent `undefined` in the UI.
 *
 * @see components/status/use-health-check.ts
 * @see lib/validations/monitoring.ts (healthCheckResponseSchema)
 * @see tests/unit/lib/validations/monitoring.test.ts (schema-only tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHealthCheck } from '@/components/status/use-health-check';
import type { HealthCheckResponse } from '@/lib/monitoring';

// ─── Shared fixtures ─────────────────────────────────────────────────────────
// Mirrors the validPayload shape used in tests/unit/lib/validations/monitoring.test.ts

const validOkPayload: HealthCheckResponse = {
  status: 'ok',
  version: '1.0.0',
  sunrise: '0.1.0',
  uptime: 1234,
  timestamp: '2026-05-28T10:00:00.000Z',
  services: {
    database: {
      status: 'operational',
      connected: true,
      latency: 5,
    },
  },
};

const validErrorPayload: HealthCheckResponse = {
  status: 'error',
  version: '1.0.0',
  sunrise: '0.1.0',
  uptime: 1234,
  timestamp: '2026-05-28T10:00:00.000Z',
  services: {
    database: {
      status: 'outage',
      connected: false,
    },
  },
  error: 'Database unreachable',
};

// Malformed payload: missing the `sunrise` field — the schema added in PR #268
// will reject this, triggering the parse-failure path in fetchHealth.
const malformedPayload = {
  status: 'ok',
  version: '1.0.0',
  // sunrise omitted deliberately
  uptime: 1234,
  timestamp: '2026-05-28T10:00:00.000Z',
  services: {
    database: { status: 'operational', connected: true, latency: 5 },
  },
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function mockFetchOnce(payload: unknown, status = 200): void {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(payload), { status })
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('useHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Initial fetch + auto-start ─────────────────────────────────────────────

  describe('initial fetch + auto-start', () => {
    it('populates data, clears isLoading, and sets lastUpdated on a successful first fetch', async () => {
      mockFetchOnce(validOkPayload);

      const { result } = renderHook(() => useHealthCheck({ autoStart: false }));

      // isLoading starts true before the first fetch resolves
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toMatchObject({ status: 'ok', sunrise: '0.1.0' });
      // lastUpdated is set by the hook after a successful parse — it's not in the payload
      expect(result.current.lastUpdated).toBeInstanceOf(Date);
      expect(result.current.error).toBeNull();
    });

    it('does NOT fire onStatusChange on the first successful fetch', async () => {
      // previousStatus starts as null; the guard requires it to be non-null
      // AND different from the new status before firing. On the very first fetch
      // the null check prevents the callback from running.
      mockFetchOnce(validOkPayload);
      const onStatusChange = vi.fn();

      await act(async () => {
        renderHook(() => useHealthCheck({ autoStart: false, onStatusChange }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it('does not start a polling interval when autoStart is false', async () => {
      const INTERVAL = 5000;
      mockFetchOnce(validOkPayload);
      // No further mocks set up — any extra fetch would throw/fail the test

      const { result } = renderHook(() =>
        useHealthCheck({ autoStart: false, pollingInterval: INTERVAL })
      );

      await act(async () => {
        // Advance past two full polling cycles
        await vi.advanceTimersByTimeAsync(INTERVAL * 2 + 100);
      });

      // Only the single initial fetch ran
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.isPolling).toBe(false);
    });
  });

  // ── Parse-failure path (PR #268 safety net) ───────────────────────────────

  describe('parse-failure path', () => {
    it('sets an error whose message starts with "Invalid /api/health response shape:" when the payload fails schema validation', async () => {
      // A payload missing `sunrise` passes json() but fails healthCheckResponseSchema.safeParse().
      // The hook must throw with the prefixed message — not silently render undefined.
      mockFetchOnce(malformedPayload);

      const { result } = renderHook(() => useHealthCheck({ autoStart: false }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toMatch(/^Invalid \/api\/health response shape:/);
      expect(result.current.isLoading).toBe(false);
    });

    it('fires onStatusChange("error") on the first parse failure', async () => {
      // The error path fires onStatusChange whenever previousStatus !== 'error'.
      // On the first call previousStatus is null, so the callback runs — this is
      // the asymmetric behaviour relative to the success-path first-fetch guard.
      mockFetchOnce(malformedPayload);
      const onStatusChange = vi.fn();

      await act(async () => {
        renderHook(() => useHealthCheck({ autoStart: false, onStatusChange }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith('error');
    });

    it('preserves the previous data when a subsequent fetch fails schema validation', async () => {
      // Sequence: good fetch (seeds data) → bad fetch (parse fails).
      // The error path only updates isLoading and error — it must NOT wipe data.
      mockFetchOnce(validOkPayload); // first fetch: succeeds
      mockFetchOnce(malformedPayload); // second fetch: parse fails

      const { result } = renderHook(() => useHealthCheck({ autoStart: false }));

      // First fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.status).toBe('ok');

      // Manually trigger a second fetch using refresh()
      await act(async () => {
        await result.current.refresh();
      });

      // data must still be the good payload; the parse failure must not wipe it
      expect(result.current.data).toMatchObject({ status: 'ok', sunrise: '0.1.0' });
      expect(result.current.error?.message).toMatch(/^Invalid \/api\/health response shape:/);
    });
  });

  // ── Fetch-error path ───────────────────────────────────────────────────────

  describe('fetch-error path', () => {
    it('preserves the thrown Error instance on result.current.error', async () => {
      const networkError = new Error('Network unreachable');
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useHealthCheck({ autoStart: false }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // The hook re-uses the original Error instance (err instanceof Error branch)
      expect(result.current.error).toBe(networkError);
      expect(result.current.isLoading).toBe(false);
    });

    it('wraps a non-Error thrown value as new Error("Failed to fetch health status")', async () => {
      // Covers the fallback branch: `err instanceof Error ? err : new Error('Failed to fetch health status')`
      vi.spyOn(global, 'fetch').mockRejectedValueOnce('string error');

      const { result } = renderHook(() => useHealthCheck({ autoStart: false }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Failed to fetch health status');
    });

    it('fires onStatusChange("error") on the first fetch failure', async () => {
      // Asymmetric with the success path: the first ERROR does fire onStatusChange
      // because previousStatus starts as null, and the error guard only checks
      // `previousStatus.current !== 'error'` (null !== 'error' is true).
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
      const onStatusChange = vi.fn();

      await act(async () => {
        renderHook(() => useHealthCheck({ autoStart: false, onStatusChange }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith('error');
    });
  });

  // ── Status-change detection ────────────────────────────────────────────────

  describe('status-change detection', () => {
    it('fires onStatusChange("error") exactly once on an ok → error transition', async () => {
      mockFetchOnce(validOkPayload); // seeds previousStatus = 'ok'
      mockFetchOnce(validErrorPayload); // triggers transition

      const onStatusChange = vi.fn();
      const INTERVAL = 5000;

      const { result } = renderHook(() =>
        useHealthCheck({ autoStart: false, pollingInterval: INTERVAL, onStatusChange })
      );

      // First fetch: seeds status, no callback
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onStatusChange).not.toHaveBeenCalled();

      // Second fetch via refresh: ok → error transition
      await act(async () => {
        await result.current.refresh();
      });

      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith('error');
    });

    it('fires onStatusChange("ok") exactly once on an error → ok transition', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down')); // seeds 'error'
      mockFetchOnce(validOkPayload); // triggers error → ok transition

      const onStatusChange = vi.fn();

      const { result } = renderHook(() => useHealthCheck({ autoStart: false, onStatusChange }));

      // First fetch: error, fires onStatusChange('error')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onStatusChange).toHaveBeenCalledTimes(1);
      onStatusChange.mockClear();

      // Second fetch: error → ok transition
      await act(async () => {
        await result.current.refresh();
      });

      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith('ok');
    });

    it('does NOT fire onStatusChange when the same status is repeated across fetches', async () => {
      mockFetchOnce(validOkPayload); // seeds 'ok'
      mockFetchOnce(validOkPayload); // same status — no transition

      const onStatusChange = vi.fn();

      const { result } = renderHook(() => useHealthCheck({ autoStart: false, onStatusChange }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onStatusChange).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.refresh();
      });

      // Still not called — ok → ok is not a transition
      expect(onStatusChange).not.toHaveBeenCalled();
    });
  });

  // ── Polling lifecycle ──────────────────────────────────────────────────────

  describe('polling lifecycle', () => {
    it('schedules repeated fetches at pollingInterval after startPolling()', async () => {
      const INTERVAL = 5000;
      // Initial fetch + 2 polling ticks = 3 total
      mockFetchOnce(validOkPayload);
      mockFetchOnce(validOkPayload);
      mockFetchOnce(validOkPayload);

      const { result } = renderHook(() =>
        useHealthCheck({ autoStart: false, pollingInterval: INTERVAL })
      );

      // Initial fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Start polling and advance through two intervals
      act(() => {
        result.current.startPolling();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVAL * 2);
      });

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.current.isPolling).toBe(true);
    });

    it('calling startPolling while already polling clears the previous interval — no double-fetch per tick', async () => {
      const INTERVAL = 5000;
      // Initial + 1 tick after restart (not 2 — the old interval must be gone)
      mockFetchOnce(validOkPayload);
      mockFetchOnce(validOkPayload);

      const { result } = renderHook(() =>
        useHealthCheck({ autoStart: false, pollingInterval: INTERVAL })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // First startPolling
      act(() => {
        result.current.startPolling();
      });

      // Advance halfway through the first interval, then call startPolling again.
      // This clears the first interval and replaces it with a new one starting now.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVAL / 2);
      });

      act(() => {
        result.current.startPolling();
      });

      // The old timer was cleared. Advance a full interval from the second startPolling —
      // exactly one more tick should fire.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVAL);
      });

      // 1 initial + 1 tick from the new interval = 2 total
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('stopPolling clears the interval and flips isPolling to false', async () => {
      const INTERVAL = 5000;
      mockFetchOnce(validOkPayload);
      // After stopPolling, no further fetches should run even if time advances

      const { result } = renderHook(() =>
        useHealthCheck({ autoStart: false, pollingInterval: INTERVAL })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        result.current.startPolling();
      });
      expect(result.current.isPolling).toBe(true);

      act(() => {
        result.current.stopPolling();
      });
      expect(result.current.isPolling).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVAL * 3);
      });

      // Only the initial fetch ran; nothing after stopPolling
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('unmount clears the polling interval — no further fetches after the component unmounts', async () => {
      const INTERVAL = 5000;
      mockFetchOnce(validOkPayload);
      // If the interval leaked after unmount, a second fetch would run at t=INTERVAL.

      const { unmount } = renderHook(() =>
        useHealthCheck({ autoStart: true, pollingInterval: INTERVAL })
      );

      // Let the initial fetch settle
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      unmount();

      // Advance well past the next polling tick
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVAL * 2);
      });

      // Still only the single pre-unmount fetch
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── Refresh + mounted guard ────────────────────────────────────────────────

  describe('refresh + mounted guard', () => {
    it('sets isLoading: true before refetching when refresh() is called', async () => {
      mockFetchOnce(validOkPayload); // initial fetch
      // For the refresh() call: hold the fetch pending so we can observe the
      // intermediate isLoading: true state before the promise resolves.
      let resolveRefresh!: (r: Response) => void;
      vi.spyOn(global, 'fetch').mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        })
      );

      const { result } = renderHook(() => useHealthCheck({ autoStart: false }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.isLoading).toBe(false);

      // Kick off refresh without awaiting — capture the intermediate state
      let refreshPromise!: Promise<void>;
      act(() => {
        refreshPromise = result.current.refresh();
      });

      // refresh() sets isLoading: true synchronously before the fetch resolves
      expect(result.current.isLoading).toBe(true);

      // Resolve the pending fetch and await refresh
      await act(async () => {
        resolveRefresh(new Response(JSON.stringify(validOkPayload)));
        await refreshPromise;
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toMatchObject({ status: 'ok' });
    });

    it('does not update state after the component unmounts while a fetch is in flight', async () => {
      // Hold the initial fetch promise so we can unmount while it's pending.
      let resolveFetch!: (r: Response) => void;
      vi.spyOn(global, 'fetch').mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { result, unmount } = renderHook(() => useHealthCheck({ autoStart: false }));

      // Fetch is now in flight; mountedRef.current is still true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Capture the state snapshot at unmount time
      const snapshotBeforeUnmount = {
        data: result.current.data,
        isLoading: result.current.isLoading,
        error: result.current.error,
      };

      unmount(); // sets mountedRef.current = false

      // Resolve the fetch after unmount — the hook's guard must abort every setState
      await act(async () => {
        resolveFetch(new Response(JSON.stringify(validOkPayload)));
        await Promise.resolve();
        await Promise.resolve();
      });

      // State must match the snapshot taken at unmount time; nothing was mutated
      expect(result.current.data).toBe(snapshotBeforeUnmount.data);
      expect(result.current.isLoading).toBe(snapshotBeforeUnmount.isLoading);
      expect(result.current.error).toBe(snapshotBeforeUnmount.error);
    });
  });
});
