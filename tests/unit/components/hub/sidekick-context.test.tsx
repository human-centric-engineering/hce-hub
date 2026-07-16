/**
 * Unit: useSidekick default (f-task-sheet §11 t-3).
 *
 * Outside a `SidekickProvider` the state defaults to closed with a no-op
 * `setOpen`, so a consumer (the task sheet's "Ask sidekick") rendered in
 * isolation doesn't crash when invoked.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSidekick } from '@/components/hub/sidekick-context';

function Consumer() {
  const { open, setOpen } = useSidekick();
  return (
    <button onClick={() => setOpen(true)}>{open ? 'open' : 'closed'}</button>
  );
}

describe('useSidekick (no provider)', () => {
  it('defaults to closed with a no-op setOpen that does not throw', () => {
    render(<Consumer />);
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(() => fireEvent.click(screen.getByText('closed'))).not.toThrow();
  });
});
