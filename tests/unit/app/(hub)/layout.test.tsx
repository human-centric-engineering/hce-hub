/**
 * Hub Layout Auth Boundary Tests (f-shell t-1)
 *
 * `app/(hub)/layout.tsx` is the single auth gate for the whole `(hub)` group
 * (`/`, `/projects`, `/brief`) — `/` can't be edge-protected in `proxy.ts`, so
 * the group self-guards here. Testing it once covers the boundary for every Hub
 * RSC page (mirrors the admin-layout boundary test). Identity comes from the
 * session (no user DB read), so the shell is driven by `session.user`.
 *
 * Branches covered:
 * - No session → clearInvalidSession('/')
 * - Authenticated → renders the shell with the session user
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import HubLayout from '@/app/(hub)/layout';
import { createMockSession } from '@/tests/types/mocks';

vi.mock('@/lib/auth/utils', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth/clear-session', () => ({
  clearInvalidSession: vi.fn((url: string) => {
    throw new Error(`CLEAR_SESSION:${url}`);
  }),
}));
vi.mock('@/components/hub/hub-shell', () => ({
  HubShell: ({ user, children }: { user: { name: string }; children: React.ReactNode }) => (
    <div data-testid="hub-shell" data-user={user.name}>
      {children}
    </div>
  ),
}));

import { getServerSession } from '@/lib/auth/utils';
import { clearInvalidSession } from '@/lib/auth/clear-session';

describe('HubLayout (auth guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the session and redirects when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    await expect(HubLayout({ children: <div /> })).rejects.toThrow('CLEAR_SESSION:/');
    expect(clearInvalidSession).toHaveBeenCalledWith('/');
  });

  it('renders the shell with the session user for an authenticated visitor', async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      createMockSession({ user: { id: 'u1', name: 'Simon Holmes' } })
    );

    const tree = await HubLayout({ children: <div data-testid="hub-child">home</div> });
    render(tree);

    expect(clearInvalidSession).not.toHaveBeenCalled(); // test-review:accept no_arg_called — happy path must not redirect
    expect(screen.getByTestId('hub-shell')).toHaveAttribute('data-user', 'Simon Holmes');
    expect(screen.getByTestId('hub-child')).toBeInTheDocument();
  });
});
