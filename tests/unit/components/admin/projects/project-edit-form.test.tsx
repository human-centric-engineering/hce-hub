import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
import { ProjectEditForm } from '@/components/admin/projects/project-edit-form';
import type { ProjectDetailDTO, UserOption } from '@/components/admin/projects/types';

const users: UserOption[] = [
  { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
  { id: 'u2', name: 'Bob', email: 'bob@x.io', image: null },
];
const project: ProjectDetailDTO = {
  id: 'p1',
  name: 'Wayframer',
  hostPlatform: 'sunrise',
  status: 'active',
  repoUrls: ['https://github.com/o/r'],
  leadUserId: 'u1',
  knowledgeTagId: 'tag1',
  createdAt: '',
  lead: users[0],
  members: [],
  knowledgeTag: { id: 'tag1', slug: 'project-p1', name: 'Wayframer' },
};

beforeEach(() => vi.clearAllMocks());

describe('ProjectEditForm', () => {
  it('prefills the name and repo URLs', () => {
    render(<ProjectEditForm project={project} users={users} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Wayframer');
    expect(screen.getByLabelText('Repository URLs')).toHaveValue('https://github.com/o/r');
  });

  it('saves changes via PATCH', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProjectEditForm project={project} users={users} />);

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Wayframer 2');
    // Drive each select to exercise its onValueChange handler.
    await user.click(screen.getByRole('combobox', { name: /host platform/i }));
    await user.click(screen.getByRole('option', { name: /Laravel/i }));
    await user.click(screen.getByRole('combobox', { name: /^lead$/i }));
    await user.click(screen.getByRole('option', { name: /Bob/i }));
    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(screen.getByRole('option', { name: /planning/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/api/v1/admin/projects/p1',
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'Wayframer 2',
            hostPlatform: 'laravel-forge',
            leadUserId: 'u2',
            status: 'planning',
          }),
        })
      );
    });
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it('surfaces a save error', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    vi.mocked(apiClient.patch).mockRejectedValue(new APIClientError('Nope'));
    const user = userEvent.setup();
    render(<ProjectEditForm project={project} users={users} />);

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });

  it('surfaces an archive error', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    vi.mocked(apiClient.delete).mockRejectedValue(new APIClientError('No archive'));
    const user = userEvent.setup();
    render(<ProjectEditForm project={project} users={users} />);

    await user.click(screen.getByRole('button', { name: /^archive$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    expect(await screen.findByText('No archive')).toBeInTheDocument();
  });

  it('shows generic messages for non-API failures (save + archive)', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new Error('x'));
    const user = userEvent.setup();
    render(<ProjectEditForm project={project} users={users} />);

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/failed to save project/i)).toBeInTheDocument();

    vi.mocked(apiClient.delete).mockRejectedValue(new Error('y'));
    await user.click(screen.getByRole('button', { name: /^archive$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    expect(await screen.findByText(/failed to archive project/i)).toBeInTheDocument();
  });

  it('archives via DELETE after confirming', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProjectEditForm project={project} users={users} />);

    await user.click(screen.getByRole('button', { name: /^archive$/i }));
    // Confirm in the dialog (scope to the alertdialog — the trigger shares the label).
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/admin/projects/p1');
    });
  });

  it('hides the archive control for an already-archived project', () => {
    render(<ProjectEditForm project={{ ...project, status: 'archived' }} users={users} />);
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });
});
