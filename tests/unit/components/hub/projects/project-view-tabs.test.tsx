import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectViewTabs } from '@/components/hub/projects/project-view-tabs';

describe('ProjectViewTabs', () => {
  it('links each tab with the ?view= param off the projectRef and marks the active one', () => {
    // projectRef is the shareable slug (§19) — tabs navigate to the human URL.
    render(<ProjectViewTabs projectRef="hce-hub" active="board" />);

    const plan = screen.getByRole('tab', { name: 'Plan' });
    const board = screen.getByRole('tab', { name: 'Board' });

    expect(plan).toHaveAttribute('href', '/projects/hce-hub?view=plan');
    expect(board).toHaveAttribute('href', '/projects/hce-hub?view=board');
    expect(board).toHaveAttribute('aria-selected', 'true');
    expect(plan).toHaveAttribute('aria-selected', 'false');
  });
});
