/**
 * Integration: Hub project-view page (server component).
 * @see app/(hub)/projects/[id]/page.tsx
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

const fetchMock = serverFetch as ReturnType<typeof vi.fn>;
const parseMock = parseApiResponse as ReturnType<typeof vi.fn>;

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

beforeEach(() => vi.clearAllMocks());

describe('ProjectViewPage', () => {
  it('renders the project view, defaulting to the Plan tab', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: true, data: view });

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
  });

  it('honours ?view=board', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: true, data: view });

    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'board' }),
      })
    );
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
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
