/**
 * ConnectPanel tests (f-mcp-project-scope §31 t-D).
 *
 * Covers the one-key-per-project model: loads the caller's single key (or the
 * generate CTA), generate (no body) → one-time secret + `.mcp.json` snippet with the
 * live key + copy feedback, regenerate → fresh secret, revoke → back to the CTA, the
 * repoUrls display, and the error paths. Service authz is covered in the API + service
 * tests; this pins the panel's wiring to the t-C endpoints.
 *
 * @see components/hub/projects/connect/connect-panel.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from '@/lib/api/client';
import { ConnectPanel } from '@/components/hub/projects/connect/connect-panel';

const get = apiClient.get as ReturnType<typeof vi.fn>;
const post = apiClient.post as ReturnType<typeof vi.fn>;
const del = apiClient.delete as ReturnType<typeof vi.fn>;

const KEY = {
  id: 'key-1',
  name: 'Bo · HCE Hub',
  keyPrefix: 'smcp_abcd12',
  lastUsedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const BASE = '/api/v1/projects/p1/mcp-keys';

function renderPanel(repoUrls: string[] = ['git@github.com:x/hce-hub.git']) {
  return render(
    <ConnectPanel projectId="p1" projectName="HCE Hub" serverName="hce-hub" repoUrls={repoUrls} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ keys: [] });
});

describe('ConnectPanel', () => {
  it('shows the existing key (auto-named) when one exists', async () => {
    get.mockResolvedValue({ keys: [KEY] });
    renderPanel();
    await waitFor(() => expect(screen.getByText('Bo · HCE Hub')).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith(BASE);
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('shows the generate CTA when there is no key', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText(/No key yet/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
  });

  it('lists the project repos, and shows a hint when none are linked', async () => {
    renderPanel(['git@github.com:x/hce-hub.git']);
    await waitFor(() =>
      expect(screen.getByText('git@github.com:x/hce-hub.git')).toBeInTheDocument()
    );

    renderPanel([]);
    await waitFor(() => expect(screen.getByText(/none linked yet/i)).toBeInTheDocument());
  });

  it('generates a key with NO body and shows the secret + .mcp.json snippet with the live key', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      name: 'Bo · HCE Hub',
      keyPrefix: 'smcp_new012',
      plaintext: 'smcp_SECRET',
    });
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Generate key' }));

    await user.click(screen.getByRole('button', { name: 'Generate key' }));

    // Posted with no body — one-per-project, auto-named server-side.
    expect(post).toHaveBeenCalledWith(BASE);
    await waitFor(() => expect(screen.getByText('smcp_SECRET')).toBeInTheDocument());
    const snippet = screen.getByText(/mcpServers/);
    expect(snippet.textContent).toContain('/api/v1/mcp');
    expect(snippet.textContent).toContain('Bearer smcp_SECRET');
  });

  it('regenerates the existing key and shows the fresh secret', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ keys: [KEY] });
    post.mockResolvedValue({
      name: 'Bo · HCE Hub',
      keyPrefix: 'smcp_zzz999',
      plaintext: 'smcp_FRESH',
    });
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }));

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(post).toHaveBeenCalledWith(`${BASE}/key-1/rotate`);
    await waitFor(() => expect(screen.getByText('smcp_FRESH')).toBeInTheDocument());
  });

  it('revokes the key (after confirm) and returns to the generate CTA', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ keys: [KEY] });
    del.mockResolvedValue(undefined);
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }));

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    expect(del).toHaveBeenCalledWith(`${BASE}/key-1`);
    await waitFor(() => expect(screen.getByText(/No key yet/i)).toBeInTheDocument());
  });

  it('gives copy feedback ("Copied!") and writes the secret to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    post.mockResolvedValue({ name: 'Bo · HCE Hub', keyPrefix: 'smcp_p', plaintext: 'smcp_SECRET' });
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Generate key' }));
    await user.click(screen.getByRole('button', { name: 'Generate key' }));
    await waitFor(() => screen.getByText('smcp_SECRET'));

    await user.click(screen.getByRole('button', { name: 'Copy key' }));
    expect(writeText).toHaveBeenCalledWith('smcp_SECRET');
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Copy \.mcp\.json/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Bearer smcp_SECRET'));
  });

  it('surfaces a message when the key fails to load', async () => {
    get.mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Couldn.t load your key/i)).toBeInTheDocument());
  });

  it('surfaces a message when generate fails', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Generate key' }));
    await user.click(screen.getByRole('button', { name: 'Generate key' }));
    await waitFor(() => expect(screen.getByText(/Couldn.t generate the key/i)).toBeInTheDocument());
  });

  it('surfaces a message when regenerate fails', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ keys: [KEY] });
    post.mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }));
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    await waitFor(() =>
      expect(screen.getByText(/Couldn.t regenerate the key/i)).toBeInTheDocument()
    );
  });

  it('surfaces a message when revoke fails, and the key stays', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ keys: [KEY] });
    del.mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.getByText(/Couldn.t revoke the key/i)).toBeInTheDocument());
    expect(screen.getByText('Bo · HCE Hub')).toBeInTheDocument();
  });
});
