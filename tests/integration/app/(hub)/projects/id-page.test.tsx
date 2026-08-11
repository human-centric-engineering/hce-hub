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
// The project view now mounts the client `TaskSheetProvider`, which reads
// `useSearchParams` — provide it (empty → no sheet) alongside `notFound`.
vi.mock('next/navigation', () => ({
  notFound: navMock.notFound,
  useSearchParams: () => new URLSearchParams(),
  // A Plan row for an unowned+unshipped feature renders ClaimFeatureButton,
  // which calls useRouter (§18 t-4) — provide it so the mock is complete.
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import ProjectViewPage, { generateMetadata } from '@/app/(hub)/projects/[id]/page';

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
  activeFixes: [],
};

const planPayload = {
  projectId: 'p1',
  // Phase-banded payload (f-phases §22 t2): no phases → one residual band.
  phases: [
    {
      id: null,
      name: null,
      status: null,
      ordinal: null,
      features: [
        {
          id: 'f-fork',
          number: 1,
          title: 'Fork + brand',
          description: null,
          status: 'shipped',
          waitingOn: [],
          helpWanted: false,
          owner: null,
          dependsOn: [],
          tasks: [],
          progress: { merged: 1, total: 1, live: 0, blocked: 0, openFixes: 0 },
        },
      ],
    },
  ],
};

const boardPayload = {
  projectId: 'p1',
  lanes: [
    {
      key: 'u1',
      member: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null },
      role: 'lead',
      ownedFeatures: [],
      tasks: [],
      taskCount: 0,
    },
  ],
  columnTotals: { claimed: 0, active: 0, merged: 0 },
};

const ideasPayload = {
  ideas: [
    {
      id: 'i1',
      text: 'remember my last filter',
      status: 'open',
      createdBy: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      triagedAt: null,
    },
  ],
};

/** URL-aware mocks: `/plan` → plan, `/board` → board, `/ideas` → inbox, else header. */
function wireOk() {
  fetchMock.mockImplementation((url: string) => Promise.resolve({ ok: true, url }));
  parseMock.mockImplementation((res: { url: string }) =>
    Promise.resolve({
      success: true,
      data: res.url.endsWith('/plan')
        ? planPayload
        : res.url.endsWith('/board')
          ? boardPayload
          : res.url.endsWith('/ideas')
            ? ideasPayload
            : view,
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

  it('honours ?view=board — fetches the board (not the plan) and renders a lane', async () => {
    wireOk();

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'board' }),
      })
    );
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
    // The header + the board were fetched; the plan was not.
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/v1/projects/p1');
    expect(urls).toContain('/api/v1/projects/p1/board');
    expect(urls).not.toContain('/api/v1/projects/p1/plan');
    // The board rendered its lane + column headers.
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });

  it('honours ?view=ideas — fetches the inbox (not plan/board) and renders an idea', async () => {
    wireOk();

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'ideas' }),
      })
    );
    expect(screen.getByRole('tab', { name: 'Ideas' })).toHaveAttribute('aria-selected', 'true');
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/v1/projects/p1/ideas');
    expect(urls).not.toContain('/api/v1/projects/p1/plan');
    expect(urls).not.toContain('/api/v1/projects/p1/board');
    // The inbox rendered the fetched idea.
    expect(screen.getByText('remember my last filter')).toBeInTheDocument();
  });

  it('renders a graceful message when the ideas fetch fails but the project loads', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/ideas') ? { ok: false, status: 500, url } : { ok: true, url })
    );
    parseMock.mockImplementation(() => Promise.resolve({ success: true, data: view }));

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'ideas' }),
      })
    );
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
    expect(screen.getByText(/Couldn.t load ideas/i)).toBeInTheDocument();
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

  it('resolves a SLUG url and drives the sub-routes off the returned cuid (§19 t-35)', async () => {
    // The header fetches the slug; the plan then fetches the canonical id the
    // header returned (`view.id === 'p1'`), never `/projects/hce-hub/plan`.
    wireOk();

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'hce-hub' }),
        searchParams: Promise.resolve({}),
      })
    );
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/v1/projects/hce-hub'); // header off the slug
    expect(urls).toContain('/api/v1/projects/p1/plan'); // plan off the returned cuid
    expect(urls).not.toContain('/api/v1/projects/hce-hub/plan');
    expect(screen.getByText('Fork + brand')).toBeInTheDocument();
  });

  it('calls notFound when the header fetch throws (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(navMock.notFound).toHaveBeenCalled();
  });

  it('logs (not 404) a header fetch that fails with a 500, then notFound', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, url: '/api/v1/projects/p1' });

    await expect(
      ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(logger.error).toHaveBeenCalled();
  });

  it('renders a graceful message when the plan fetch throws (network error)', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/plan') ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true, url })
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

  it('logs (not 404) a board fetch that fails with a 500, then renders the header', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/board')
        ? Promise.resolve({ ok: false, status: 500, url })
        : Promise.resolve({ ok: true, url })
    );
    parseMock.mockImplementation(() => Promise.resolve({ success: true, data: view }));

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'board' }),
      })
    );
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalled();
  });

  it('honours ?view=log — fetches only the header (log is client-fetched)', async () => {
    wireOk();

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'log' }),
      })
    );
    expect(screen.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/v1/projects/p1');
    expect(urls).not.toContain('/api/v1/projects/p1/plan');
    expect(urls).not.toContain('/api/v1/projects/p1/board');
  });

  it('renders the header even when the board fetch throws (graceful board)', async () => {
    // Header ok; board fetch rejects → board=null, page still renders.
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/board')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ ok: true, url })
    );
    parseMock.mockImplementation(() => Promise.resolve({ success: true, data: view }));

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'board' }),
      })
    );
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
  });
});

describe('ProjectViewPage generateMetadata', () => {
  it('titles the tab with the project name + the active view (default Plan)', async () => {
    wireOk();
    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    });
    // The template appends " - HCE Hub"; the title itself starts with the project name.
    expect(meta.title).toBe('HCE Hub · Plan');
  });

  it('reflects ?view=board, ?view=ideas and ?view=log in the title', async () => {
    wireOk();
    expect(
      (
        await generateMetadata({
          params: Promise.resolve({ id: 'p1' }),
          searchParams: Promise.resolve({ view: 'board' }),
        })
      ).title
    ).toBe('HCE Hub · Board');
    expect(
      (
        await generateMetadata({
          params: Promise.resolve({ id: 'p1' }),
          searchParams: Promise.resolve({ view: 'ideas' }),
        })
      ).title
    ).toBe('HCE Hub · Ideas');
    expect(
      (
        await generateMetadata({
          params: Promise.resolve({ id: 'p1' }),
          searchParams: Promise.resolve({ view: 'log' }),
        })
      ).title
    ).toBe('HCE Hub · Log');
  });

  it('falls back to "Project" for a non-member / unknown id (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const meta = await generateMetadata({
      params: Promise.resolve({ id: 'gone' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe('Project');
  });
});
