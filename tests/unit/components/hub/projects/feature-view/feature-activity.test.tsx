/**
 * Unit: FeatureActivity (f-feature-planning §18 t-3) — the feature-scoped journal
 * timeline. Fetches `?featureId=` events, renders them with refs (so a
 * task_created row names its task), and has honest loading / empty / error states.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureActivity } from '@/components/hub/projects/feature-view/feature-activity';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const planned: ProjectEventDTO = {
  id: 'e1',
  kind: 'feature_planned',
  actor: { id: 'u1', name: 'Simon Holmes', email: 's@x', image: null },
  actorAgentId: null,
  feature: { id: 'f1', slug: 'f-mcp', title: 'MCP' },
  task: null,
  title: null,
  body: null,
  metadata: null,
  createdAt: '2026-07-18T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

describe('FeatureActivity', () => {
  it('fetches the feature-scoped events and renders the timeline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [planned] }) })
    );
    render(<FeatureActivity projectId="p1" featureId="f1" />);
    expect(await screen.findByText(/Simon/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p1/events?featureId=f1',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('renders the empty state when the feature has no events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) })
    );
    render(<FeatureActivity projectId="p1" featureId="f1" />);
    expect(await screen.findByText(/No activity yet/)).toBeInTheDocument();
  });

  it('renders the error state when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<FeatureActivity projectId="p1" featureId="f1" />);
    expect(await screen.findByText(/Couldn.t load activity/)).toBeInTheDocument();
  });
});
