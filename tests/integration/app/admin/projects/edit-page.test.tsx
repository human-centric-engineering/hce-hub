/**
 * Integration: Edit Project page (server component).
 * @see app/admin/projects/[id]/page.tsx
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const navMock = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/lib/projects/admin-page-data', () => ({
  getSelectableUsers: vi.fn(),
  getProjectDetail: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: navMock.notFound,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

import { getSelectableUsers, getProjectDetail } from '@/lib/projects/admin-page-data';
import EditProjectPage from '@/app/admin/projects/[id]/page';

const detail = {
  id: 'p1',
  name: 'Wayframer',
  hostPlatform: 'sunrise',
  status: 'active' as const,
  repoUrls: [],
  leadUserId: 'u1',
  knowledgeTagId: 'tag1',
  createdAt: '',
  lead: { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
  members: [
    {
      userId: 'u1',
      role: 'lead' as const,
      addedAt: '',
      user: { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
    },
  ],
  knowledgeTag: { id: 'tag1', slug: 'project-p1', name: 'Wayframer' },
};

beforeEach(() => vi.clearAllMocks());

describe('EditProjectPage', () => {
  it('renders the project with its sections and knowledge tag', async () => {
    vi.mocked(getProjectDetail).mockResolvedValue(detail);
    vi.mocked(getSelectableUsers).mockResolvedValue([detail.lead]);

    render(await EditProjectPage({ params: Promise.resolve({ id: 'p1' }) }));

    expect(screen.getByRole('heading', { name: 'Wayframer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /members/i })).toBeInTheDocument();
    expect(screen.getByText('project-p1')).toBeInTheDocument();
  });

  it('shows the no-tag message when the project has no knowledge tag', async () => {
    vi.mocked(getProjectDetail).mockResolvedValue({
      ...detail,
      knowledgeTagId: null,
      knowledgeTag: null,
    });
    vi.mocked(getSelectableUsers).mockResolvedValue([detail.lead]);

    render(await EditProjectPage({ params: Promise.resolve({ id: 'p1' }) }));
    expect(screen.getByText(/no knowledge tag attached/i)).toBeInTheDocument();
  });

  it('calls notFound when the project is missing', async () => {
    vi.mocked(getProjectDetail).mockResolvedValue(null);
    vi.mocked(getSelectableUsers).mockResolvedValue([]);

    await expect(EditProjectPage({ params: Promise.resolve({ id: 'gone' }) })).rejects.toThrow(
      /NEXT_NOT_FOUND/
    );
    expect(navMock.notFound).toHaveBeenCalled();
  });
});
