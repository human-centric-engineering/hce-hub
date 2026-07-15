/**
 * Sidebar tests (f-shell t-2)
 *
 * Registry-driven nav + active state + footer. The load-bearing case is the
 * **composability proof**: a newly registered module appears in the nav with no
 * edit to this component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Star } from 'lucide-react';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/') }));

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/hub/sidebar';
import { registerHubModule } from '@/lib/app/hub-modules';

const user = { name: 'Simon Holmes', image: null, role: 'USER' as string | null };

describe('Sidebar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/');
  });

  it('renders the user, initials, and Hub + Modules nav', () => {
    render(<Sidebar user={user} />);
    expect(screen.getByText('Simon Holmes')).toBeInTheDocument();
    expect(screen.getByText('SH')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    // stubbed modules render as non-link "soon" items
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sales' })).not.toBeInTheDocument();
  });

  it('marks the active route with aria-current', () => {
    vi.mocked(usePathname).mockReturnValue('/projects');
    render(<Sidebar user={user} />);
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('shows the Admin link only for admins', () => {
    const { rerender } = render(<Sidebar user={user} />);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();

    rerender(<Sidebar user={{ ...user, role: 'ADMIN' }} />);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('renders a newly registered module with no shell edit (composability proof)', () => {
    registerHubModule({
      slug: 'test-composability',
      label: 'Composability Test',
      icon: Star,
      href: '/ct',
      status: 'active',
    });
    render(<Sidebar user={user} />);
    expect(screen.getByRole('link', { name: 'Composability Test' })).toHaveAttribute('href', '/ct');
  });
});
