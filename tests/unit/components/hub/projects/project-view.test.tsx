import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectView } from '@/components/hub/projects/project-view';
import type { ProjectViewDTO } from '@/components/hub/projects/types';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';

const planFixture: ProjectPlanDTO = {
  projectId: 'p1',
  features: [
    {
      id: 'f1',
      title: 'A real feature',
      description: null,
      status: 'planning',
      helpWanted: false,
      owner: null,
      dependsOn: [],
      tasks: [],
      progress: { merged: 0, total: 0, live: 0 },
    },
  ],
};

function makeProject(overrides: Partial<ProjectViewDTO> = {}): ProjectViewDTO {
  return {
    id: 'p1',
    name: 'HCE Hub',
    hostPlatform: 'sunrise',
    status: 'active',
    repoUrls: [],
    leadUserId: 'u1',
    createdAt: '',
    lead: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null },
    members: [
      {
        userId: 'u1',
        role: 'lead',
        user: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
      },
      { userId: 'gone', role: 'member', user: null },
    ],
    memberCount: 2,
    featureCount: 15,
    taskCount: 12,
    ...overrides,
  };
}

describe('ProjectView', () => {
  it('renders the header, counts, and member stack (null member as a dash)', () => {
    render(<ProjectView project={makeProject()} activeTab="plan" />);
    expect(screen.getByRole('heading', { name: 'HCE Hub' })).toBeInTheDocument();
    expect(screen.getByText('Sunrise')).toBeInTheDocument();
    expect(screen.getByText(/15 features · 12 tasks/)).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument(); // lead initials
    expect(screen.getByText('—')).toBeInTheDocument(); // erased member fallback
  });

  it('mounts the Plan view on the plan tab when a plan is supplied', () => {
    render(<ProjectView project={makeProject()} activeTab="plan" plan={planFixture} />);
    expect(screen.getByText('A real feature')).toBeInTheDocument();
  });

  it('shows a graceful message on the plan tab when the plan failed to load', () => {
    render(<ProjectView project={makeProject()} activeTab="plan" plan={null} />);
    expect(screen.getByText(/Couldn.t load the plan/i)).toBeInTheDocument();
  });

  it('shows the Board scaffold copy on the board tab', () => {
    render(<ProjectView project={makeProject()} activeTab="board" />);
    expect(screen.getByText(/Board view/i)).toBeInTheDocument();
  });

  it('falls back to the raw slug for an unknown platform and renders member avatar images', () => {
    render(
      <ProjectView
        project={makeProject({
          hostPlatform: 'wat',
          members: [
            {
              userId: 'u1',
              role: 'lead',
              user: { id: 'u1', name: 'Ada', email: 'a@x.io', image: 'https://x/a.png' },
            },
          ],
        })}
        activeTab="plan"
      />
    );
    expect(screen.getByText('wat')).toBeInTheDocument();
  });

  it('collapses a large member roster to a +N chip', () => {
    const members = Array.from({ length: 8 }, (_, i) => ({
      userId: `u${i}`,
      role: 'member' as const,
      user: { id: `u${i}`, name: `User ${i}`, email: `u${i}@x.io`, image: null },
    }));
    render(<ProjectView project={makeProject({ members, memberCount: 8 })} activeTab="plan" />);
    expect(screen.getByText('+3')).toBeInTheDocument(); // 8 - 5 shown
  });
});
