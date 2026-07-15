/**
 * Integration: Admin Projects list page (server component).
 * @see app/admin/projects/page.tsx
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({ serverFetch: vi.fn(), parseApiResponse: vi.fn() }));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import ProjectsAdminPage from '@/app/admin/projects/page';

const fetchMock = serverFetch as ReturnType<typeof vi.fn>;
const parseMock = parseApiResponse as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('ProjectsAdminPage', () => {
  it('renders the fetched projects', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p1',
          name: 'Wayframer',
          hostPlatform: 'sunrise',
          status: 'active',
          createdAt: '2026-07-15T00:00:00.000Z',
          memberCount: 2,
          lead: { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
        },
      ],
    });

    render(await ProjectsAdminPage());
    expect(screen.getByRole('link', { name: 'Wayframer' })).toBeInTheDocument();
  });

  it('renders the empty state when the fetch fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    render(await ProjectsAdminPage());
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('renders the empty state when the API reports failure', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: false });
    render(await ProjectsAdminPage());
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('renders the empty state when serverFetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    render(await ProjectsAdminPage());
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });
});
