/**
 * HubShell tests (f-shell t-2)
 *
 * The restructured shell owns the sidekick-open state + grid; sidebar/topbar
 * content is covered by their own tests, so they're stubbed here to isolate the
 * shell's toggle behaviour.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/hub/sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('@/components/hub/topbar', () => ({
  Topbar: ({
    sidekickOpen,
    onToggleSidekick,
  }: {
    sidekickOpen: boolean;
    onToggleSidekick: () => void;
  }) => (
    <button data-testid="toggle" data-open={String(sidekickOpen)} onClick={onToggleSidekick}>
      toggle
    </button>
  ),
}));
vi.mock('@/components/hub/sidekick-column', () => ({
  SidekickColumn: () => <div data-testid="sidekick" />,
}));

import { HubShell } from '@/components/hub/hub-shell';

const user = {
  name: 'Simon Holmes',
  email: 'simon@example.com',
  image: null,
  role: 'USER' as string | null,
};

describe('HubShell', () => {
  it('renders sidebar, topbar, and children; sidekick closed by default', () => {
    render(
      <HubShell user={user}>
        <div data-testid="child">main</div>
      </HubShell>
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('toggle')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('sidekick')).not.toBeInTheDocument();
  });

  it('toggles the sidekick column open', async () => {
    render(
      <HubShell user={user}>
        <div />
      </HubShell>
    );
    await userEvent.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('sidekick')).toBeInTheDocument();
    expect(screen.getByTestId('toggle')).toHaveAttribute('data-open', 'true');
  });
});
