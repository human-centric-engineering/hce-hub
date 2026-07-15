import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectsGrid } from '@/components/hub/projects/projects-grid';
import type { ProjectCard } from '@/components/hub/projects/types';

const card: ProjectCard = {
  id: 'p1',
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
  status: 'active',
  createdAt: '',
  memberCount: 2,
  featureCount: 5,
  lead: null,
};

describe('ProjectsGrid', () => {
  it('renders a card per project; shows the New-project affordance only for admins', () => {
    const { rerender } = render(<ProjectsGrid projects={[card]} canCreate />);
    expect(screen.getByText('HCE Hub')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new project/i })).toHaveAttribute(
      'href',
      '/admin/projects/new'
    );

    rerender(<ProjectsGrid projects={[card]} canCreate={false} />);
    expect(screen.getByText('HCE Hub')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new project/i })).not.toBeInTheDocument();
  });

  it('shows the affordance in the empty state for an admin', () => {
    render(<ProjectsGrid projects={[]} canCreate />);
    expect(screen.getByRole('link', { name: /new project/i })).toBeInTheDocument();
  });

  it('shows a plain empty message (no admin link) for a non-admin with no projects', () => {
    render(<ProjectsGrid projects={[]} canCreate={false} />);
    expect(screen.getByText(/not a member of any projects/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new project/i })).not.toBeInTheDocument();
  });
});
