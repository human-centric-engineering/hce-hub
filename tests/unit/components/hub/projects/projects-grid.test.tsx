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
  it('renders a card per project plus the New-project affordance', () => {
    render(<ProjectsGrid projects={[card]} />);
    expect(screen.getByText('HCE Hub')).toBeInTheDocument();
    const newLink = screen.getByRole('link', { name: /new project/i });
    expect(newLink).toHaveAttribute('href', '/admin/projects/new');
  });

  it('shows only the affordance when the member has no projects', () => {
    render(<ProjectsGrid projects={[]} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /new project/i })).toBeInTheDocument();
  });
});
