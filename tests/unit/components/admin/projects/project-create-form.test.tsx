import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: vi.fn() }),
}));
vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn(), delete: vi.fn(), patch: vi.fn(), get: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

import { apiClient } from '@/lib/api/client';
import { ProjectCreateForm } from '@/components/admin/projects/project-create-form';
import type { UserOption } from '@/components/admin/projects/types';

const users: UserOption[] = [{ id: 'u1', name: 'Ada', email: 'ada@x.io', image: null }];

beforeEach(() => vi.clearAllMocks());

describe('ProjectCreateForm', () => {
  it('renders the fields and the create button', () => {
    render(<ProjectCreateForm users={users} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument();
  });

  it('blocks submit and shows an error when no lead is chosen', async () => {
    const user = userEvent.setup();
    render(<ProjectCreateForm users={users} />);

    await user.type(screen.getByLabelText('Name'), 'Wayframer');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText(/choose a project lead/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates a project and navigates to its page on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'p1' });
    const user = userEvent.setup();
    render(<ProjectCreateForm users={users} />);

    await user.type(screen.getByLabelText('Name'), 'Wayframer');
    await user.click(screen.getByRole('combobox', { name: /lead/i }));
    await user.click(screen.getByRole('option', { name: /Ada/i }));
    await user.type(screen.getByLabelText('Repository URLs'), 'https://github.com/o/r');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/projects', {
        body: {
          name: 'Wayframer',
          hostPlatform: 'sunrise',
          leadUserId: 'u1',
          status: 'planning',
          repoUrls: ['https://github.com/o/r'],
        },
      });
    });
    expect(nav.push).toHaveBeenCalledWith('/admin/projects/p1');
  });

  it('lets the user change platform + status and surfaces an API error', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    vi.mocked(apiClient.post).mockRejectedValue(new APIClientError('Boom'));
    const user = userEvent.setup();
    render(<ProjectCreateForm users={users} />);

    await user.type(screen.getByLabelText('Name'), 'X');
    await user.click(screen.getByRole('combobox', { name: /host platform/i }));
    await user.click(screen.getByRole('option', { name: /Laravel/i }));
    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(screen.getByRole('option', { name: /^active$/i }));
    await user.click(screen.getByRole('combobox', { name: /lead/i }));
    await user.click(screen.getByRole('option', { name: /Ada/i }));
    await user.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('shows a generic message for a non-API failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<ProjectCreateForm users={users} />);

    await user.type(screen.getByLabelText('Name'), 'X');
    await user.click(screen.getByRole('combobox', { name: /lead/i }));
    await user.click(screen.getByRole('option', { name: /Ada/i }));
    await user.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText(/failed to create project/i)).toBeInTheDocument();
  });
});
