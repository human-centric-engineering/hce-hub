/**
 * Unit: LogView (f-journal §17 t-3) — the project Log tab. Load-bearing: fetches
 * the events endpoint, renders the stream, and re-queries server-side with the
 * matching `kinds` when the filter changes (not a client slice).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogView } from '@/components/hub/projects/log/log-view';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const decision: ProjectEventDTO = {
  id: 'e1',
  kind: 'decision',
  actor: { id: 'u1', name: 'Simon Holmes', email: 's@x', image: null },
  actorAgentId: null,
  feature: { id: 'f1', slug: 'f-journal', title: 'Journal' },
  task: null,
  title: 'One journal',
  body: 'One stream.',
  metadata: null,
  createdAt: '2026-07-17T10:00:00.000Z',
};

function mockFetch(byUrl: (url: string) => ProjectEventDTO[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ data: byUrl(url) }) })
    )
  );
}

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

describe('LogView', () => {
  it('fetches all events and renders the stream', async () => {
    mockFetch(() => [decision]);
    render(<LogView projectId="p1" />);
    expect(await screen.findByText('One journal')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p1/events',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('re-queries with kinds=decision when the Decisions filter is chosen', async () => {
    mockFetch(() => [decision]);
    render(<LogView projectId="p1" />);
    await screen.findByText('One journal');

    fireEvent.click(screen.getByRole('tab', { name: 'Decisions' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/projects/p1/events?kinds=decision',
        expect.objectContaining({ signal: expect.anything() })
      )
    );
  });

  it('renders a per-filter empty state', async () => {
    mockFetch(() => []);
    render(<LogView projectId="p1" />);
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Decisions' }));
    expect(await screen.findByText('No decisions recorded yet.')).toBeInTheDocument();
  });

  it('renders the error state on a failed fetch (no crash)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<LogView projectId="p1" />);
    expect(await screen.findByText(/Couldn.t load the log/)).toBeInTheDocument();
  });
});
