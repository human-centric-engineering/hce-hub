import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectsList } from '@/components/admin/projects/projects-list';
import type { ProjectRow } from '@/components/admin/projects/types';

const rows: ProjectRow[] = [
  {
    id: 'p1',
    name: 'Wayframer',
    hostPlatform: 'laravel-forge',
    status: 'active',
    createdAt: '2026-07-15T00:00:00.000Z',
    memberCount: 3,
    lead: { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
  },
];

describe('ProjectsList', () => {
  it('renders an empty state with a create link when there are no projects', () => {
    render(<ProjectsList projects={[]} />);
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create the first one/i })).toHaveAttribute(
      'href',
      '/admin/projects/new'
    );
  });

  it('renders a project row with the platform label, member count, lead and status', () => {
    render(<ProjectsList projects={rows} />);
    expect(screen.getByRole('link', { name: 'Wayframer' })).toHaveAttribute(
      'href',
      '/admin/projects/p1'
    );
    expect(screen.getByText('Laravel / Forge')).toBeInTheDocument(); // slug → label
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new project/i })).toHaveAttribute(
      'href',
      '/admin/projects/new'
    );
  });

  it('renders "Unassigned" when a project has no lead', () => {
    render(<ProjectsList projects={[{ ...rows[0], lead: null }]} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });
});
