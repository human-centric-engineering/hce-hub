import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectCard } from '@/components/hub/projects/project-card';
import type { ProjectCard as ProjectCardData } from '@/components/hub/projects/types';

const base: ProjectCardData = {
  id: 'p1',
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
  status: 'active',
  createdAt: '2026-07-15T00:00:00.000Z',
  memberCount: 3,
  featureCount: 15,
  lead: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
};

describe('ProjectCard', () => {
  it('links to the project view and shows name, platform, counts, lead', () => {
    render(<ProjectCard project={base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/projects/p1');
    expect(screen.getByText('HCE Hub')).toBeInTheDocument();
    expect(screen.getByText('Sunrise')).toBeInTheDocument(); // slug → label
    expect(screen.getByText(/15 features · 3 members/)).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument(); // avatar fallback initials
  });

  it('renders "Unassigned lead" and singular labels', () => {
    render(<ProjectCard project={{ ...base, lead: null, memberCount: 1, featureCount: 1 }} />);
    expect(screen.getByText('Unassigned lead')).toBeInTheDocument();
    expect(screen.getByText(/1 feature · 1 member/)).toBeInTheDocument();
  });

  it('falls back to the raw slug for an unknown platform and renders a lead avatar image', () => {
    render(
      <ProjectCard
        project={{
          ...base,
          hostPlatform: 'wat',
          lead: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: 'https://x/a.png' },
        }}
      />
    );
    expect(screen.getByText('wat')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
