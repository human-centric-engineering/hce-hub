/**
 * Unit: ClaimFeatureButton (f-feature-planning §18 t-4). POSTs the shared claim
 * route and, on success, refreshes the server surface; surfaces a failed write
 * (never silent). Two variants (primary / inline).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { ClaimFeatureButton } from '@/components/hub/projects/feature-view/claim-feature-button';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('ClaimFeatureButton', () => {
  it('POSTs the claim route and refreshes on success (primary)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClaimFeatureButton projectId="p1" featureId="f1" />);
    fireEvent.click(screen.getByRole('button', { name: /Claim feature/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/p1/features/f1/claim', {
      method: 'POST',
    });
  });

  it('surfaces an error and does not refresh when the claim fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<ClaimFeatureButton projectId="p1" featureId="f1" />);
    fireEvent.click(screen.getByRole('button', { name: /Claim feature/ }));

    expect(await screen.findByText(/Couldn.t claim just now/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders a compact "Claim" for the inline variant', () => {
    render(<ClaimFeatureButton projectId="p1" featureId="f1" variant="inline" />);
    expect(screen.getByRole('button', { name: 'Claim this feature' })).toHaveTextContent('Claim');
  });
});
