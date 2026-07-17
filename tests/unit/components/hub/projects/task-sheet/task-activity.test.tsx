/**
 * Unit: TaskActivity (f-journal §17 t-3) — the task-sheet activity timeline
 * (discharges the §11 deferral). Fetches the task-scoped events and refetches
 * when `refreshKey` bumps (after a claim), so a fresh event appears in place.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TaskActivity } from '@/components/hub/projects/task-sheet/task-activity';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const claimed: ProjectEventDTO = {
  id: 'e1',
  kind: 'task_claimed',
  actor: { id: 'u1', name: 'Simon Holmes', email: 's@x', image: null },
  actorAgentId: null,
  feature: null,
  task: { id: 't1', number: 5 },
  title: null,
  body: null,
  metadata: null,
  createdAt: '2026-07-17T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

describe('TaskActivity', () => {
  it('fetches the task-scoped events and renders the timeline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [claimed] }) })
    );
    render(<TaskActivity projectId="p1" taskId="t1" refreshKey={0} />);
    expect(await screen.findByText(/claimed the task/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p1/events?taskId=t1',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('renders the empty state when the task has no events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) })
    );
    render(<TaskActivity projectId="p1" taskId="t1" refreshKey={0} />);
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
  });

  it('refetches when refreshKey changes (a claim landed)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<TaskActivity projectId="p1" taskId="t1" refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<TaskActivity projectId="p1" taskId="t1" refreshKey={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('renders the error state on a failed fetch (no crash)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<TaskActivity projectId="p1" taskId="t1" refreshKey={0} />);
    expect(await screen.findByText(/Couldn.t load activity/)).toBeInTheDocument();
  });
});
