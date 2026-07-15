/**
 * Projects placeholder test (f-shell t-2) — routed to by the Projects nav until
 * f-projects replaces it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectsPlaceholder from '@/app/(hub)/projects/page';

describe('ProjectsPlaceholder', () => {
  it('renders the Projects heading', () => {
    render(<ProjectsPlaceholder />);
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
  });
});
