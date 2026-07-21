/**
 * Integration: Hub feature page (server component).
 * @see app/(hub)/projects/[id]/features/[slug]/page.tsx
 *
 * Fetches the feature detail, mounts the task-sheet provider, and renders the
 * feature view. A 404 from the read → notFound().
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';

const navMock = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/lib/api/server-fetch', () => ({ serverFetch: vi.fn(), parseApiResponse: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('next/navigation', () => ({
  notFound: navMock.notFound,
  useSearchParams: () => new URLSearchParams(),
  // The unowned feature renders ClaimFeatureButton, which calls useRouter (§18 t-4).
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import FeaturePage from '@/app/(hub)/projects/[id]/features/[slug]/page';

const fetchMock = serverFetch as unknown as Mock<(url: string) => Promise<unknown>>;
const parseMock = parseApiResponse as unknown as Mock<(res: unknown) => Promise<unknown>>;

const featureDetail = {
  id: 'f1',
  projectId: 'p1',
  projectName: 'HCE Hub',
  slug: 'f-mcp',
  title: 'MCP server',
  description: 'Expose tools',
  doneWhen: 'tools/list works',
  references: [],
  status: 'in_flight',
  planningStage: 'planned',
  helpWanted: false,
  owner: null,
  dependsOn: [],
  tasks: [],
  indicativeTasks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // FeatureActivity fetches on mount (client) — keep the global quiet.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) })
  );
});

describe('FeaturePage', () => {
  it('renders the feature view for a member', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: true, data: featureDetail });

    render(await FeaturePage({ params: Promise.resolve({ id: 'p1', slug: 'f-mcp' }) }));
    expect(screen.getByRole('heading', { name: 'MCP server' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/p1/features/f-mcp');
  });

  it('calls notFound for a 404 (non-member / unknown feature)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      FeaturePage({ params: Promise.resolve({ id: 'p1', slug: 'gone' }) })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(navMock.notFound).toHaveBeenCalled();
  });
});
