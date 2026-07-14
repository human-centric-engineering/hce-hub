/**
 * Hub Home tests (f-shell t-1)
 *
 * `/` — the reclaimed Hub home. A light landing in t-1: a welcome + the
 * Projects module entry.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HubHome from '@/app/(hub)/page';

describe('HubHome', () => {
  it('renders the welcome and a Projects entry linking to /projects', () => {
    render(<HubHome />);

    expect(screen.getByRole('heading', { name: /welcome to the hub/i })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /projects/i });
    expect(link).toHaveAttribute('href', '/projects');
  });
});
