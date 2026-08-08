/**
 * Unit: PhasePicker (f-phases §22 t3) — files a feature under a phase (or unfiles
 * it) via the assign route, refreshing on success and flagging a failed write.
 * Radix Select needs jsdom pointer/scroll stubs to open, added below.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { PhasePicker } from '@/components/hub/projects/plan/phase-picker';

const phases = [
  { id: 'ph1', name: 'Foundations' },
  { id: 'ph2', name: 'UI Spine' },
];

beforeAll(() => {
  // Radix Select relies on these; jsdom doesn't implement them.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('PhasePicker', () => {
  it('shows the current phase name', () => {
    render(<PhasePicker projectId="p1" featureId="f1" currentPhaseId="ph1" phases={phases} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Foundations');
  });

  it('shows "No phase" when the feature is unfiled', () => {
    render(<PhasePicker projectId="p1" featureId="f1" currentPhaseId={null} phases={phases} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('No phase');
  });

  it('files the feature under a chosen phase (PATCH) and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PhasePicker projectId="p1" featureId="f1" currentPhaseId="ph1" phases={phases} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'UI Spine' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/features/f1/phase',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ phaseId: 'ph2' }) })
    );
  });

  it('unfiles when "No phase" is chosen (phaseId null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PhasePicker projectId="p1" featureId="f1" currentPhaseId="ph1" phases={phases} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'No phase' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/features/f1/phase',
      expect.objectContaining({ body: JSON.stringify({ phaseId: null }) })
    );
  });

  it('flags a failed assign and does not refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const user = userEvent.setup();
    render(<PhasePicker projectId="p1" featureId="f1" currentPhaseId="ph1" phases={phases} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'UI Spine' }));

    expect(await screen.findByText('!')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
