/**
 * Unit: AssigneePicker (f-task-assignment §22 t2) — PATCHes the assignee route on
 * pick, hands the write's soft warnings back via `onReassigned`, and reverts the
 * optimistic pick + flags the trigger on a failed write. Radix Select needs jsdom
 * pointer/scroll stubs to open, added below (see phase-picker.test.tsx).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AssigneePicker } from '@/components/hub/projects/task-sheet/assignee-picker';
import type { UserRef } from '@/components/hub/projects/types';
import type { CollisionWarning } from '@/components/hub/projects/task-sheet/types';

const alice: UserRef = { id: 'u1', name: 'Alice Adams', email: 'alice@example.com' };
const bob: UserRef = { id: 'u2', name: 'Bob Brown', email: 'bob@example.com' };
const members = [alice, bob];

beforeAll(() => {
  // Radix Select relies on these; jsdom doesn't implement them.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('AssigneePicker', () => {
  it('renders members as options and shows the current assignee first name on the trigger', async () => {
    const onReassigned = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        projectId="p1"
        taskId="t1"
        assignee={alice}
        members={members}
        onReassigned={onReassigned}
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Assignee' });
    expect(trigger).toHaveTextContent('Alice');

    await user.click(trigger);
    expect(await screen.findByRole('option', { name: /Alice/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bob/ })).toBeInTheDocument();
  });

  it('picking a different member PATCHes the assignee route and calls onReassigned with the returned warnings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { warnings: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onReassigned = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        projectId="p1"
        taskId="t1"
        assignee={alice}
        members={members}
        onReassigned={onReassigned}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    await waitFor(() => expect(onReassigned).toHaveBeenCalledWith([]));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/tasks/t1/assignee',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ assigneeUserId: 'u2' }),
      })
    );
  });

  it('surfaces a non-empty warnings array from the write via onReassigned', async () => {
    const warnings: CollisionWarning[] = [{ kind: 'already_claimed', message: 'Heads up' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { warnings } }),
      })
    );
    const onReassigned = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        projectId="p1"
        taskId="t1"
        assignee={alice}
        members={members}
        onReassigned={onReassigned}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    await waitFor(() => expect(onReassigned).toHaveBeenCalledWith(warnings));
  });

  it('picking the already-selected member is a no-op — no fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onReassigned = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        projectId="p1"
        taskId="t1"
        assignee={alice}
        members={members}
        onReassigned={onReassigned}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: /Alice/ }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onReassigned).not.toHaveBeenCalled();
  });

  it('reverts the optimistic pick and flags the trigger on a failed write (non-ok response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const onReassigned = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        projectId="p1"
        taskId="t1"
        assignee={alice}
        members={members}
        onReassigned={onReassigned}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    expect(await screen.findByText('!')).toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: 'Assignee' });
    await waitFor(() =>
      expect(trigger).toHaveAttribute('title', 'Could not reassign — try again.')
    );
    // Reverted to the original assignee — not the failed pick.
    expect(trigger).toHaveTextContent('Alice');
    expect(onReassigned).not.toHaveBeenCalled();
  });

  it('reverts the optimistic pick and flags the trigger when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const onReassigned = vi.fn();
    const user = userEvent.setup();
    render(
      <AssigneePicker
        projectId="p1"
        taskId="t1"
        assignee={alice}
        members={members}
        onReassigned={onReassigned}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    expect(await screen.findByText('!')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Alice');
    expect(onReassigned).not.toHaveBeenCalled();
  });
});
