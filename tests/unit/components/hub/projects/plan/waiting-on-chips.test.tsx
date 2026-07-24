/**
 * Unit: WaitingOnChips (f-status-model §20 t-37) — the shared "waiting on <dep>"
 * reason line for a blocked feature.
 * @see components/hub/projects/plan/waiting-on-chips.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WaitingOnChips } from '@/components/hub/projects/plan/waiting-on-chips';

describe('WaitingOnChips', () => {
  it('renders a chip per unshipped dependency, keyed by slug', () => {
    render(
      <WaitingOnChips
        waitingOn={[
          { slug: 'f-a', title: 'Feature A' },
          { slug: 'f-b', title: 'Feature B' },
        ]}
      />
    );
    expect(screen.getByText('waiting on')).toBeInTheDocument();
    expect(screen.getByText('f-a')).toBeInTheDocument();
    expect(screen.getByText('f-b')).toBeInTheDocument();
  });

  it('falls back to the title when a dependency has no slug', () => {
    render(<WaitingOnChips waitingOn={[{ slug: null, title: 'Unnamed dep' }]} />);
    expect(screen.getByText('Unnamed dep')).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to wait on', () => {
    const { container } = render(<WaitingOnChips waitingOn={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies the caller-supplied wrapper spacing', () => {
    render(<WaitingOnChips waitingOn={[{ slug: 'f-x', title: 'X' }]} className="mt-2" />);
    expect(screen.getByText('waiting on').parentElement).toHaveClass('mt-2');
  });
});
