/**
 * Unit: BugTag (f-bug-handling §22-02) — the shared bug cue for the row/tag surfaces
 * (Plan row · feature page · task sheet). A quiet label + tooltip, no red/pulse.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BugTag } from '@/components/hub/projects/bug-tag';

describe('BugTag', () => {
  it('renders the "bug" label with the explanatory tooltip', () => {
    render(<BugTag />);
    const tag = screen.getByText('bug');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute('title', 'A bug — a fix on the feature it broke');
  });
});
