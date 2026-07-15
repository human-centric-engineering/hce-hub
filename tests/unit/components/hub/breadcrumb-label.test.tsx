import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  BreadcrumbLabel,
  BreadcrumbLabelProvider,
  useBreadcrumbLabels,
} from '@/components/hub/breadcrumb-label';

function Probe() {
  return <div data-testid="ov">{JSON.stringify(useBreadcrumbLabels())}</div>;
}

describe('breadcrumb-label', () => {
  it('returns no overrides outside a provider (and BreadcrumbLabel is a safe no-op)', () => {
    render(
      <>
        <BreadcrumbLabel segment="p1" label="Hub" />
        <Probe />
      </>
    );
    expect(screen.getByTestId('ov')).toHaveTextContent('{}');
  });

  it('registers a segment label while mounted and clears it on unmount', async () => {
    const { rerender } = render(
      <BreadcrumbLabelProvider>
        <BreadcrumbLabel segment="chubproject" label="HCE Hub" />
        <Probe />
      </BreadcrumbLabelProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('ov')).toHaveTextContent('{"chubproject":"HCE Hub"}')
    );

    // Unmount the label (navigate away) → override cleared.
    rerender(
      <BreadcrumbLabelProvider>
        <Probe />
      </BreadcrumbLabelProvider>
    );
    await waitFor(() => expect(screen.getByTestId('ov')).toHaveTextContent('{}'));
  });
});
