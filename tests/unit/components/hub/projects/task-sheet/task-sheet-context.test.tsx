/**
 * Unit: useTaskSheet default (f-task-sheet §11 t-2).
 *
 * Outside a `TaskSheetProvider` the controls default to no-ops so a Plan row /
 * Board card rendered in isolation (or in its own test) doesn't crash when
 * clicked — it simply does nothing.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';

function Consumer() {
  const { open, close } = useTaskSheet();
  return (
    <>
      <button onClick={() => open('t1')}>open</button>
      <button onClick={() => close()}>close</button>
    </>
  );
}

describe('useTaskSheet (no provider)', () => {
  it('returns no-op controls that do not throw when invoked', () => {
    render(<Consumer />);
    expect(() => {
      fireEvent.click(screen.getByText('open'));
      fireEvent.click(screen.getByText('close'));
    }).not.toThrow();
  });
});
