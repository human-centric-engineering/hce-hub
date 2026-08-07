/**
 * Unit: ManagePhasesDialog (f-phases §22 t3) — create / rename / reorder phases
 * over the REST routes, refreshing the server surface on success and surfacing a
 * failed write. The status Select renders (combobox) but isn't driven here (jsdom
 * pointer limits); its PATCH path is the same `call` the rename input exercises.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import {
  ManagePhasesDialog,
  reorderedIds,
  type ManagedPhase,
} from '@/components/hub/projects/plan/manage-phases-dialog';

const phases: ManagedPhase[] = [
  { id: 'ph1', name: 'Foundations', status: 'complete', ordinal: 0, featureCount: 3 },
  { id: 'ph2', name: 'UI Spine', status: 'active', ordinal: 1, featureCount: 4 },
];

const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });
const open = () => fireEvent.click(screen.getByRole('button', { name: /Manage phases/ }));

beforeAll(() => {
  // Radix Select needs these to open in jsdom.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('ManagePhasesDialog', () => {
  it('opens and lists the project’s phases', () => {
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    expect(screen.getByDisplayValue('Foundations')).toBeInTheDocument();
    expect(screen.getByDisplayValue('UI Spine')).toBeInTheDocument();
  });

  it('creates a phase (POST) and refreshes', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();

    fireEvent.change(screen.getByLabelText('New phase name'), { target: { value: 'Onboarding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/phases',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Onboarding' }) })
    );
  });

  it('renames a phase (PATCH) on blur when changed', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();

    const input = screen.getByDisplayValue('Foundations');
    fireEvent.change(input, { target: { value: 'Base' } });
    fireEvent.blur(input);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/phases/ph1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Base' }) })
    );
  });

  it('does not PATCH on blur when the name is unchanged', () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    fireEvent.blur(screen.getByDisplayValue('Foundations'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders a keyboard-accessible drag handle per phase', () => {
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    expect(screen.getByRole('button', { name: 'Reorder Foundations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder UI Spine' })).toBeInTheDocument();
  });

  it('surfaces an error and does not refresh when a write fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    fireEvent.change(screen.getByLabelText('New phase name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/went wrong/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the empty state with no phases', () => {
    render(<ManagePhasesDialog projectId="p1" phases={[]} />);
    open();
    expect(screen.getByText(/No phases yet/)).toBeInTheDocument();
  });

  it('renders a status Select per phase', () => {
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    expect(within(screen.getByRole('dialog')).getAllByRole('combobox')).toHaveLength(phases.length);
  });

  it('changes a phase status via the Select (PATCH status) and refreshes', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();

    // The first row is Foundations (complete) → set it to parked.
    await user.click(screen.getByRole('combobox', { name: 'Status: complete' }));
    await user.click(await screen.findByRole('option', { name: 'parked' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/phases/ph1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'parked' }) })
    );
  });

  it('creates via the Enter key', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    const input = screen.getByLabelText('New phase name');
    fireEvent.change(input, { target: { value: 'Onboarding' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('does nothing when Enter is pressed on a blank new-name input', () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    fireEvent.keyDown(screen.getByLabelText('New phase name'), { key: 'Enter' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renames via the Enter key on a phase name input', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ManagePhasesDialog projectId="p1" phases={phases} />);
    open();
    const input = screen.getByDisplayValue('UI Spine');
    fireEvent.change(input, { target: { value: 'Interface' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/phases/ph2',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Interface' }) })
    );
  });
});

describe('reorderedIds (drag → new batch order)', () => {
  it('moves an id from its slot to the drop target, shifting the rest', () => {
    // Drag ph3 (last) over ph1 (first) → ph3 leads.
    expect(reorderedIds(['ph1', 'ph2', 'ph3'], 'ph3', 'ph1')).toEqual(['ph3', 'ph1', 'ph2']);
    // Drag ph1 (first) over ph2 → they swap neighbours.
    expect(reorderedIds(['ph1', 'ph2', 'ph3'], 'ph1', 'ph2')).toEqual(['ph2', 'ph1', 'ph3']);
  });

  it('is a no-op for the same id or an unknown id', () => {
    expect(reorderedIds(['ph1', 'ph2'], 'ph1', 'ph1')).toEqual(['ph1', 'ph2']);
    expect(reorderedIds(['ph1', 'ph2'], 'ph1', 'ghost')).toEqual(['ph1', 'ph2']);
  });
});
