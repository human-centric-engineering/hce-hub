/**
 * Unit: KindTag (f-bug-handling §22-02; `enhancement` added by f-work-kinds §32 t-88)
 * — the shared kind cue for the row/tag surfaces (Plan row · feature page · task
 * sheet). A quiet label + tooltip, no red/pulse, and nothing at all for the
 * unmarked default.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KindTag, TASK_KIND_CUE } from '@/components/hub/projects/kind-tag';
import type { TaskKind } from '@/components/hub/projects/plan/types';

describe('KindTag', () => {
  it('renders the "bug" label with the explanatory tooltip', () => {
    render(<KindTag kind="bug" />);
    const tag = screen.getByText('bug');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute('title', 'A bug — a fix on the feature it broke');
  });

  it('renders the "enhancement" label with the explanatory tooltip', () => {
    render(<KindTag kind="enhancement" />);
    const tag = screen.getByText('enhancement');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute(
      'title',
      'An enhancement — an improvement to a feature that already shipped'
    );
  });

  it('renders nothing for feature_work — the unmarked default', () => {
    const { container } = render(<KindTag kind="feature_work" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reads an enhancement in a quieter register than a bug, never louder', () => {
    // Anti-urgency: an improvement to shipped work is a classification, not a
    // signal, so it sits below the bug's brick rather than escalating past it.
    expect(TASK_KIND_CUE.bug?.color).toBe('var(--signal-blocked)');
    expect(TASK_KIND_CUE.enhancement?.color).toBe('var(--ink-mute)');
  });

  /**
   * Drives off the cue map rather than a hand-list, so a kind added to `TaskKind`
   * later is covered here without anyone remembering to add a case. The gap t-88
   * closed was exactly that: `enhancement` shipped into the enum and rendered
   * nowhere, because every site tested for `bug` alone.
   */
  it('renders a visible, self-explaining tag for every kind that has a cue', () => {
    for (const [kind, cue] of Object.entries(TASK_KIND_CUE)) {
      if (!cue) continue;
      const { container, unmount } = render(<KindTag kind={kind as TaskKind} />);
      const tag = screen.getByText(cue.label);
      expect(cue.label.length).toBeGreaterThan(0);
      expect(tag).toHaveAttribute('title', cue.title);
      expect(container.querySelector('svg')).toBeInTheDocument();
      unmount();
    }
  });
});
