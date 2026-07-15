/**
 * Integration: New Project page (server component).
 * @see app/admin/projects/new/page.tsx
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/projects/admin-page-data', () => ({
  getSelectableUsers: vi.fn(),
  getProjectDetail: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

import { getSelectableUsers } from '@/lib/projects/admin-page-data';
import NewProjectPage from '@/app/admin/projects/new/page';

beforeEach(() => vi.clearAllMocks());

describe('NewProjectPage', () => {
  it('renders the create form', async () => {
    vi.mocked(getSelectableUsers).mockResolvedValue([
      { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
    ]);

    render(await NewProjectPage());
    expect(screen.getByRole('heading', { name: /new project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument();
  });
});
