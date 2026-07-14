/**
 * SidekickColumn placeholder test (f-shell t-2) — the column shell; real chat
 * arrives in f-sidekick.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidekickColumn } from '@/components/hub/sidekick-column';

describe('SidekickColumn', () => {
  it('renders the sidekick header and placeholder copy', () => {
    render(<SidekickColumn />);
    expect(screen.getByText('Sidekick')).toBeInTheDocument();
    expect(screen.getByText(/arrives in a later feature/i)).toBeInTheDocument();
  });
});
