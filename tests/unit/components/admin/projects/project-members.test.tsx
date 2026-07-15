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
import { ProjectMembers } from '@/components/admin/projects/project-members';
import type { ProjectMemberRow, UserOption } from '@/components/admin/projects/types';

const users: UserOption[] = [
  { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
  { id: 'u2', name: 'Bob', email: 'bob@x.io', image: null },
  { id: 'u3', name: 'Cara', email: 'cara@x.io', image: null },
];
const members: ProjectMemberRow[] = [
  { userId: 'u1', role: 'lead', addedAt: '', user: users[0] },
  { userId: 'u2', role: 'member', addedAt: '', user: users[1] },
];

function renderMembers() {
  return render(<ProjectMembers projectId="p1" members={members} leadUserId="u1" users={users} />);
}

beforeEach(() => vi.clearAllMocks());

describe('ProjectMembers', () => {
  it('lists members and disables removing the lead', () => {
    renderMembers();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByTitle(/reassign the lead before removing/i)).toBeDisabled();
    expect(screen.getByTitle('Remove member')).toBeEnabled();
  });

  it('removes a non-lead member', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderMembers();

    await user.click(screen.getByTitle('Remove member'));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/admin/projects/p1/members/u2');
    });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('adds a member selected from the picker (excludes existing members)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderMembers();

    await user.click(screen.getByRole('combobox'));
    // Only Cara (u3) is addable — u1/u2 are already members.
    await user.click(screen.getByRole('option', { name: /Cara/i }));
    await user.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/projects/p1/members', {
        body: { userId: 'u3' },
      });
    });
  });

  it('renders a former member (null user) and surfaces a remove error', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    vi.mocked(apiClient.delete).mockRejectedValue(new APIClientError('cannot remove'));
    const user = userEvent.setup();
    render(
      <ProjectMembers
        projectId="p1"
        leadUserId="u1"
        users={users}
        members={[
          { userId: 'u1', role: 'lead', addedAt: '', user: users[0] },
          { userId: 'gone', role: 'member', addedAt: '', user: null },
        ]}
      />
    );

    expect(screen.getByText(/former member/i)).toBeInTheDocument();
    await user.click(screen.getByTitle('Remove member'));
    expect(await screen.findByText('cannot remove')).toBeInTheDocument();
  });

  it('surfaces an add error', async () => {
    const { APIClientError } = await import('@/lib/api/client');
    vi.mocked(apiClient.post).mockRejectedValue(new APIClientError('already a member'));
    const user = userEvent.setup();
    renderMembers();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /Cara/i }));
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByText('already a member')).toBeInTheDocument();
  });
});
