import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectStatusBadge } from '@/components/admin/projects/project-status-badge';

describe('ProjectStatusBadge', () => {
  it('renders the status label', () => {
    render(<ProjectStatusBadge status="archived" />);
    expect(screen.getByText('archived')).toBeInTheDocument();
  });

  it('renders an unknown status without crashing', () => {
    render(<ProjectStatusBadge status="weird" />);
    expect(screen.getByText('weird')).toBeInTheDocument();
  });
});
