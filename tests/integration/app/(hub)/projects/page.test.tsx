/**
 * Integration: Hub projects list page (server component).
 * @see app/(hub)/projects/page.tsx
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({ serverFetch: vi.fn(), parseApiResponse: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import ProjectsPage from '@/app/(hub)/projects/page';

const fetchMock = serverFetch as ReturnType<typeof vi.fn>;
const parseMock = parseApiResponse as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('ProjectsPage', () => {
  it('renders the member’s projects', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'p1',
          name: 'HCE Hub',
          hostPlatform: 'sunrise',
          status: 'active',
          createdAt: '',
          memberCount: 2,
          featureCount: 5,
          lead: null,
        },
      ],
    });

    render(await ProjectsPage());
    expect(screen.getByRole('link', { name: /HCE Hub/ })).toHaveAttribute('href', '/projects/p1');
  });

  it('renders the empty grid (just the affordance) when the fetch fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(await ProjectsPage());
    expect(screen.getByRole('link', { name: /new project/i })).toBeInTheDocument();
  });

  it('renders empty when the API reports failure', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: false });
    render(await ProjectsPage());
    expect(screen.getByRole('link', { name: /new project/i })).toBeInTheDocument();
  });

  it('renders empty when serverFetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    render(await ProjectsPage());
    expect(screen.getByRole('link', { name: /new project/i })).toBeInTheDocument();
  });
});
