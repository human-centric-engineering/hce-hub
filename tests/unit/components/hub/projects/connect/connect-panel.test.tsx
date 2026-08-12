/**
 * ConnectPanel tests (f-mcp-project-scope §31 t-D).
 *
 * Covers: loads the caller's keys on mount, the empty state, the repoUrls display,
 * generate → one-time secret + `.mcp.json` snippet (with the live key), rotate →
 * fresh secret, revoke → row removed, and the load-failure message. The service
 * authz (membership / ownership / forced scope) is covered in the API + service
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
  name: 'my laptop',
  keyPrefix: 'smcp_abcd12',
  scopes: ['tools:list', 'tools:execute'],
  expiresAt: null,
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
  it('loads the caller keys from the project key endpoint on mount', async () => {
    get.mockResolvedValue({ keys: [KEY] });
    renderPanel();
    await waitFor(() => expect(screen.getByText('my laptop')).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith(BASE);
  });

  it('shows the empty state when there are no keys', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText(/No keys yet/i)).toBeInTheDocument());
  });

  it('lists the project repos, and shows a hint when none are linked', async () => {
    renderPanel(['git@github.com:x/hce-hub.git']);
    await waitFor(() =>
      expect(screen.getByText('git@github.com:x/hce-hub.git')).toBeInTheDocument()
    );

    get.mockResolvedValue({ keys: [] });
    renderPanel([]);
    await waitFor(() => expect(screen.getByText(/none linked yet/i)).toBeInTheDocument());
  });

  it('generates a key and shows the one-time secret + a .mcp.json snippet with the live key', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      name: 'my laptop',
      keyPrefix: 'smcp_new012',
      plaintext: 'smcp_SECRET',
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/No keys yet/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Generate key' }));
    await user.type(screen.getByLabelText('Name'), 'my laptop');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    // Posted with just the name — scope/scopes are forced server-side.
    expect(post).toHaveBeenCalledWith(BASE, { body: { name: 'my laptop' } });

    // The one-time secret + the paste-ready config are shown.
    await waitFor(() => expect(screen.getByText('smcp_SECRET')).toBeInTheDocument());
    const snippet = screen.getByText(/mcpServers/);
    expect(snippet.textContent).toContain('/api/v1/mcp');
    expect(snippet.textContent).toContain('Bearer smcp_SECRET');
  });

  it('rotates a key and shows the fresh secret', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ keys: [KEY] });
    post.mockResolvedValue({
      name: 'my laptop',
      keyPrefix: 'smcp_zzz999',
      plaintext: 'smcp_FRESH',
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText('my laptop')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Rotate' }));

    expect(post).toHaveBeenCalledWith(`${BASE}/key-1/rotate`);
    await waitFor(() => expect(screen.getByText('smcp_FRESH')).toBeInTheDocument());
  });

  it('revokes a key (after confirm) and drops it from the list', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ keys: [KEY] });
    del.mockResolvedValue(undefined);
    renderPanel();
    await waitFor(() => expect(screen.getByText('my laptop')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    // Confirm in the alert dialog.
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    expect(del).toHaveBeenCalledWith(`${BASE}/key-1`);
    await waitFor(() => expect(screen.queryByText('my laptop')).not.toBeInTheDocument());
  });

  it('surfaces a message when the keys fail to load', async () => {
    get.mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Couldn.t load your keys/i)).toBeInTheDocument());
  });
});
