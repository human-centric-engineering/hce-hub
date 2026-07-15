import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectViewTabs } from '@/components/hub/projects/project-view-tabs';

describe('ProjectViewTabs', () => {
  it('links both tabs with the ?view= param and marks the active one', () => {
    render(<ProjectViewTabs projectId="p1" active="board" />);

    const plan = screen.getByRole('tab', { name: 'Plan' });
    const board = screen.getByRole('tab', { name: 'Board' });

    expect(plan).toHaveAttribute('href', '/projects/p1?view=plan');
    expect(board).toHaveAttribute('href', '/projects/p1?view=board');
    expect(board).toHaveAttribute('aria-selected', 'true');
    expect(plan).toHaveAttribute('aria-selected', 'false');
  });
});
