/**
 * HubShell component tests (f-shell t-1)
 *
 * The spare-but-real three-column frame: brand + footer (user + conditional
 * Admin link) + main. Navigation sections, topbar controls, and the sidekick
 * column land in t-2.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HubShell } from '@/components/hub/hub-shell';

const baseUser = {
  name: 'Simon Holmes',
  email: 'simon@example.com',
  image: null,
  role: 'USER' as string | null,
};

describe('HubShell', () => {
  it('renders the user, avatar initials, a home-linked brand, and children', () => {
    const { container } = render(
      <HubShell user={baseUser}>
        <div data-testid="content">main</div>
      </HubShell>
    );

    expect(screen.getByText('Simon Holmes')).toBeInTheDocument();
    expect(screen.getByText('SH')).toBeInTheDocument(); // avatar fallback initials
    expect(container.querySelector('a[href="/"]')).not.toBeNull(); // brand → Hub home
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('shows the Admin link only for admins', () => {
    const { rerender } = render(<HubShell user={baseUser}>c</HubShell>);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();

    rerender(<HubShell user={{ ...baseUser, role: 'ADMIN' }}>c</HubShell>);
    const adminLink = screen.getByRole('link', { name: 'Admin' });
    expect(adminLink).toHaveAttribute('href', '/admin');
  });
});
