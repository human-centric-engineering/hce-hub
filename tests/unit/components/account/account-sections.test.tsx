/**
 * Tests for <AccountSections> (f-github-identity §23 t-75) — the consumer side of
 * the account-section seam. Pins that it renders nothing when the registry is
 * empty (vanilla Sunrise) and renders each registered section otherwise.
 *
 * Importing the component runs its module-load `initAppAccountSections()`, which
 * registers the fork's real section; `beforeEach` resets the registry so each
 * case starts from a known (empty) state and renders only its own dummies.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  registerAccountSection,
  __resetAccountSectionsForTests,
} from '@/lib/account-sections/registry';
import { AccountSections } from '@/components/account/account-sections';

beforeEach(() => __resetAccountSectionsForTests());

describe('AccountSections', () => {
  it('renders nothing when no sections are registered', () => {
    const { container } = render(<AccountSections />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each registered section, in order', () => {
    registerAccountSection({ id: 'two', order: 20, Component: () => <div>Section Two</div> });
    registerAccountSection({ id: 'one', order: 10, Component: () => <div>Section One</div> });
    const { getByText } = render(<AccountSections />);
    expect(getByText('Section One')).toBeInTheDocument();
    expect(getByText('Section Two')).toBeInTheDocument();
  });
});
