/**
 * Unit: MemberSelect (f-task-assignment §22 t2) — the shared avatar+name member
 * dropdown behind the task-sheet assignee picker and the feature-page "reassign
 * remaining" affordance. Pins: options render avatar + first name; a bound value
 * shows on the trigger; onSelect fires the chosen id; a one-shot picker shows the
 * placeholder; `invalid` surfaces a `!` + title without swallowing the failure.
 * Radix Select needs the jsdom pointer/scroll stubs to open (as phase-picker does).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberSelect } from '@/components/hub/projects/member-select';
import type { UserRef } from '@/components/hub/projects/types';

const members: UserRef[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null },
  { id: 'u2', name: 'Bo Diaz', email: 'b@x.io', image: null },
];

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('MemberSelect', () => {
  it('shows the placeholder for a one-shot picker (no value)', () => {
    render(
      <MemberSelect
        members={members}
        onSelect={() => {}}
        placeholder="Choose a member…"
        ariaLabel="Pick"
      />
    );
    expect(screen.getByRole('combobox', { name: 'Pick' })).toHaveTextContent('Choose a member…');
  });

  it('mirrors the bound value (first name) on the trigger', () => {
    render(
      <MemberSelect
        members={members}
        value="u1"
        onSelect={() => {}}
        placeholder="Unassigned"
        ariaLabel="Assignee"
      />
    );
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Ada');
  });

  it('renders each member as an option and fires onSelect with the chosen id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MemberSelect
        members={members}
        onSelect={onSelect}
        placeholder="Choose a member…"
        ariaLabel="Pick"
      />
    );
    await user.click(screen.getByRole('combobox'));
    // Avatar-fallback initials sit alongside the first name in each option.
    await user.click(await screen.findByRole('option', { name: /Bo/ }));
    expect(onSelect).toHaveBeenCalledWith('u2');
  });

  it('surfaces a failed write on the trigger (! + invalidTitle), never silent', () => {
    render(
      <MemberSelect
        members={members}
        value="u1"
        onSelect={() => {}}
        placeholder="Unassigned"
        ariaLabel="Assignee"
        invalid
        invalidTitle="Could not reassign — try again."
        validTitle="Assign this task to a member"
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Assignee' });
    expect(trigger).toHaveTextContent('!');
    expect(trigger).toHaveAttribute('title', 'Could not reassign — try again.');
  });
});
