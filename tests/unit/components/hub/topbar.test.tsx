/**
 * Topbar tests (f-shell t-2) — route-derived breadcrumbs + controls + toggle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/projects') }));

import { usePathname } from 'next/navigation';
import { Topbar } from '@/components/hub/topbar';

describe('Topbar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/projects');
  });

  it('renders route-derived breadcrumbs (Hub linked, current unlinked)', () => {
    render(<Topbar sidekickOpen={false} onToggleSidekick={() => {}} />);
    expect(screen.getByRole('link', { name: 'Hub' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('renders the ⌘K trigger, bell, and sidekick toggle', () => {
    render(<Topbar sidekickOpen={false} onToggleSidekick={() => {}} />);
    expect(screen.getByText(/ask the sidekick/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle sidekick' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('calls onToggleSidekick when the toggle is clicked', async () => {
    const onToggle = vi.fn();
    render(<Topbar sidekickOpen={false} onToggleSidekick={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidekick' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
