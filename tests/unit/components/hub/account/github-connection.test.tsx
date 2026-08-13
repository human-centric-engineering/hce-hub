/**
 * Tests for the GitHub connection account section (f-github-identity §23 t-75).
 * Covers the three link states (unconfigured / connect CTA / connected), the
 * disconnect-after-confirm + reload, the post-redirect `?github=` status message,
 * and the load-error path. The OAuth round-trip itself is a full navigation
 * (an `<a href>`), verified by the link target.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from '@/lib/api/client';
import { GithubConnection } from '@/components/hub/account/github-connection';

const get = apiClient.get as ReturnType<typeof vi.fn>;
const del = apiClient.delete as ReturnType<typeof vi.fn>;

const connected = {
  connected: true,
  githubLogin: 'octocat',
  avatarUrl: 'https://a/o.png',
  connectedAt: '2026-08-13T00:00:00.000Z',
  configured: true,
};
const disconnected = {
  connected: false,
  githubLogin: null,
  avatarUrl: null,
  connectedAt: null,
  configured: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/settings');
});

describe('GithubConnection', () => {
  it('shows the Connect CTA (a full-navigation link) when configured but not connected', async () => {
    get.mockResolvedValue(disconnected);
    render(<GithubConnection />);
    const link = await screen.findByRole('link', { name: /connect github/i });
    // A plain <a> so the OAuth redirect runs (not client-side routing).
    expect(link).toHaveAttribute('href', '/api/v1/users/me/github/connect');
  });

  it('shows the connected identity + a Disconnect action', async () => {
    get.mockResolvedValue(connected);
    render(<GithubConnection />);
    await waitFor(() => expect(screen.getByText('@octocat')).toBeInTheDocument());
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('shows "unavailable" and no Connect link when the deployment is unconfigured', async () => {
    get.mockResolvedValue({ ...disconnected, configured: false });
    render(<GithubConnection />);
    await waitFor(() => expect(screen.getByText(/isn.t available/i)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /connect/i })).not.toBeInTheDocument();
  });

  it('keeps the Disconnect control for a linked user even if the deployment is now unconfigured', async () => {
    // configured:false must NOT hide a still-linked identity — unlink needs no OAuth config.
    get.mockResolvedValue({ ...connected, configured: false });
    render(<GithubConnection />);
    await waitFor(() => expect(screen.getByText('@octocat')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.queryByText(/isn.t available/i)).not.toBeInTheDocument();
  });

  it('tolerates a non-URL avatar without breaking the section', async () => {
    // The schema validates the avatar URL and degrades a bad value to null.
    get.mockResolvedValue({ ...connected, avatarUrl: 'javascript:alert(1)' });
    render(<GithubConnection />);
    await waitFor(() => expect(screen.getByText('@octocat')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('disconnects after confirming, then returns to the Connect CTA', async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce(connected).mockResolvedValueOnce(disconnected);
    del.mockResolvedValue(undefined);
    render(<GithubConnection />);
    await waitFor(() => screen.getByText('@octocat'));

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(del).toHaveBeenCalledWith('/api/v1/users/me/github');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /connect github/i })).toBeInTheDocument()
    );
  });

  it('surfaces the post-redirect status message from ?github= and strips the param', async () => {
    window.history.replaceState({}, '', '/settings?github=connected');
    get.mockResolvedValue(connected);
    render(<GithubConnection />);
    await waitFor(() => expect(screen.getByText('GitHub account connected.')).toBeInTheDocument());
    // The param is removed so a refresh can't re-show a now-stale banner.
    expect(window.location.search).toBe('');
  });

  it('clears the status banner on disconnect (no "connected" above a Connect CTA)', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/settings?github=connected');
    get.mockResolvedValueOnce(connected).mockResolvedValueOnce(disconnected);
    del.mockResolvedValue(undefined);
    render(<GithubConnection />);
    await waitFor(() => expect(screen.getByText('GitHub account connected.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /connect github/i })).toBeInTheDocument()
    );
    expect(screen.queryByText('GitHub account connected.')).not.toBeInTheDocument();
  });

  it('surfaces the already-linked status distinctly', async () => {
    window.history.replaceState({}, '', '/settings?github=already-linked');
    get.mockResolvedValue(disconnected);
    render(<GithubConnection />);
    await waitFor(() =>
      expect(screen.getByText(/already linked to another Hub user/i)).toBeInTheDocument()
    );
  });

  it('shows an error message when the state fails to load', async () => {
    get.mockRejectedValue(new Error('boom'));
    render(<GithubConnection />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn.t load your GitHub connection/i)).toBeInTheDocument()
    );
  });
});
