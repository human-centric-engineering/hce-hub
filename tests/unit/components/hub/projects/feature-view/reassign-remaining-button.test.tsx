/**
 * Unit: ReassignRemainingButton (f-task-assignment §22 t2, design call 3) — hands a
 * feature's remaining (unmerged) tasks to another member. Collapsed by default;
 * reveals a member Select on click. PATCHes the feature assignee route, refreshes
 * on success, and reports the outcome (or a failure) without silently swallowing
 * it. Radix Select needs jsdom pointer/scroll stubs to open (see
 * phase-picker.test.tsx).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { ReassignRemainingButton } from '@/components/hub/projects/feature-view/reassign-remaining-button';
import type { UserRef } from '@/components/hub/projects/types';

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

describe('ReassignRemainingButton', () => {
  it('is collapsed initially, reveals the picker on click, and Cancel collapses it without a fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReassignRemainingButton projectId="p1" featureId="f1" members={members} />);

    expect(screen.getByRole('button', { name: 'Reassign remaining tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reassign remaining tasks' }));
    expect(screen.getByText('Choose a member…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reassign remaining tasks' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('picking a member PATCHes the feature assignee route, refreshes, and reports the count', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { reassigned: 2, warnings: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReassignRemainingButton projectId="p1" featureId="f1" members={members} />);

    await user.click(screen.getByRole('button', { name: 'Reassign remaining tasks' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/features/f1/assignee',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ assigneeUserId: 'u2' }),
      })
    );
    // Collapses back and reports the outcome.
    expect(screen.getByText('Reassigned 2 tasks.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the "nothing to reassign" line when reassigned is 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { reassigned: 0, warnings: [] } }),
      })
    );
    const user = userEvent.setup();
    render(<ReassignRemainingButton projectId="p1" featureId="f1" members={members} />);

    await user.click(screen.getByRole('button', { name: 'Reassign remaining tasks' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    expect(await screen.findByText('Nothing to reassign — no open tasks.')).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('mentions active handoffs in the outcome line when warnings > 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { reassigned: 1, warnings: [{ kind: 'already_claimed' }] } }),
      })
    );
    const user = userEvent.setup();
    render(<ReassignRemainingButton projectId="p1" featureId="f1" members={members} />);

    await user.click(screen.getByRole('button', { name: 'Reassign remaining tasks' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    const outcome = await screen.findByText(/Reassigned 1 task\./);
    expect(outcome).toHaveTextContent(
      '1 were being actively worked — those handoffs were flagged.'
    );
  });

  // BUG: `setOpen(false)` only runs on the success path (source line 64) — on a
  // failed write, `open` stays `true`, so render keeps returning the picker
  // branch (source line 73+), which has no `{failed && …}` block at all; that
  // paragraph lives only in the collapsed `!open` branch. The failure is
  // therefore invisible until the user separately clicks Cancel, contradicting
  // the component's own `// never silent` comment (source line 67) and its
  // file-level docstring ("a failed write is surfaced, never swallowed"). This
  // assertion encodes the documented behaviour and is expected to fail against
  // the current source — see the SUSPECTED CODE BUG note in the task report.
  it('shows an error line and does not refresh on a failed write', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const user = userEvent.setup();
    render(<ReassignRemainingButton projectId="p1" featureId="f1" members={members} />);

    await user.click(screen.getByRole('button', { name: 'Reassign remaining tasks' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Bob/ }));

    expect(await screen.findByText('Couldn’t reassign just now — try again.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
