/**
 * Unit: JotIdeaButton (f-idea-capture §22 t-62) — the header quick-jot popover.
 * Opens, POSTs …/ideas, refreshes on success; surfaces a failed capture inline.
 * Radix Popover needs the jsdom pointer/scroll stubs to open (as member-select does).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { JotIdeaButton } from '@/components/hub/projects/ideas/jot-idea-button';

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('JotIdeaButton', () => {
  it('renders the trigger', () => {
    render(<JotIdeaButton projectId="p1" />);
    expect(screen.getByRole('button', { name: /Jot an idea/ })).toBeInTheDocument();
  });

  it('captures a jot (POST …/ideas) and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<JotIdeaButton projectId="p1" />);
    await user.click(screen.getByRole('button', { name: /Jot an idea/ }));
    await user.type(await screen.findByLabelText('Idea'), 'remember my last filter');
    await user.click(screen.getByRole('button', { name: 'Capture' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/ideas',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'remember my last filter' }),
      })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('surfaces a failed capture inline and does not refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const user = userEvent.setup();

    render(<JotIdeaButton projectId="p1" />);
    await user.click(screen.getByRole('button', { name: /Jot an idea/ }));
    await user.type(await screen.findByLabelText('Idea'), 'a jot');
    await user.click(screen.getByRole('button', { name: 'Capture' }));

    expect(await screen.findByText(/Couldn.t capture/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
