/**
 * Integration: Hub project-view page (server component).
 * @see app/(hub)/projects/[id]/page.tsx
 *
 * The page fetches the header and (only on the Plan tab) the `/plan` payload in
 * parallel. Mocks are URL-aware so the two fetches return their own shapes.
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
vi.mock('next/navigation', () => ({ notFound: navMock.notFound }));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import ProjectViewPage from '@/app/(hub)/projects/[id]/page';

// Typed to return promises so `mockImplementation` callbacks aren't flagged by
// no-misused-promises; the loose payload shapes are what these tests need.
const fetchMock = serverFetch as unknown as Mock<(url: string) => Promise<unknown>>;
const parseMock = parseApiResponse as unknown as Mock<(res: { url: string }) => Promise<unknown>>;

const view = {
  id: 'p1',
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
  status: 'active',
  repoUrls: [],
  leadUserId: 'u1',
  createdAt: '',
  lead: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null },
  members: [
    { userId: 'u1', role: 'lead', user: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null } },
  ],
  memberCount: 1,
  featureCount: 15,
  taskCount: 12,
};

const planPayload = {
  projectId: 'p1',
  features: [
    {
      id: 'f-fork',
      title: 'Fork + brand',
      description: null,
      status: 'shipped',
      helpWanted: false,
      owner: null,
      dependsOn: [],
      tasks: [],
      progress: { merged: 1, total: 1, live: 0 },
    },
  ],
};

/** URL-aware mocks: the `/plan` fetch returns the plan payload, else the header. */
function wireOk() {
  fetchMock.mockImplementation((url: string) => Promise.resolve({ ok: true, url }));
  parseMock.mockImplementation((res: { url: string }) =>
    Promise.resolve({
      success: true,
      data: res.url.endsWith('/plan') ? planPayload : view,
    })
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ProjectViewPage', () => {
  it('renders the project view and the Plan tab with real features by default', async () => {
    wireOk();

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    // The Plan view rendered the fetched feature.
    expect(screen.getByText('Fork + brand')).toBeInTheDocument();
  });

  it('honours ?view=board and does not fetch the plan', async () => {
    wireOk();

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'board' }),
      })
    );
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
    // Only the header was fetched — no `/plan` request on the Board tab.
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(['/api/v1/projects/p1']);
  });

  it('renders a graceful message if the plan fetch fails but the project loads', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/plan') ? { ok: false, status: 500, url } : { ok: true, url })
    );
    parseMock.mockImplementation(() => Promise.resolve({ success: true, data: view }));

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
    expect(screen.getByText(/Couldn.t load the plan/i)).toBeInTheDocument();
  });

  it('calls notFound for a non-member / unknown id (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      ProjectViewPage({
        params: Promise.resolve({ id: 'gone' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(navMock.notFound).toHaveBeenCalled();
  });
});
