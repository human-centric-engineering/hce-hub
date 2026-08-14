/**
 * Unit: KindTag (f-bug-handling §22-02; `enhancement` added by f-work-kinds §32 t-88)
 * — the shared kind cue for the row/tag surfaces (Plan row · feature page · task
 * sheet). A quiet label + tooltip, no red/pulse, and nothing at all for the
 * unmarked default.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskKind as PrismaTaskKind } from '@prisma/client';
import { KindTag, TASK_KIND_CUE, taskKindCue } from '@/components/hub/projects/kind-tag';
import type { TaskKind } from '@/components/hub/projects/plan/types';

/**
 * The cue map is total over `TaskKind` — but `TaskKind` is *hand-mirrored* from the
 * Prisma enum (client components can't import `@prisma/client`), so on its own the
 * compiler only guards the second link of the chain. Add `chore` to the enum and
 * the capability parity tests force the MCP schemas to advertise it, rows land in
 * the DB, and this stale union keeps the cue map "total" without erroring —
 * reproducing the exact t-88 bug, now with `taskKindCue`'s guard turning it into a
 * designed silence. This closes the first link, in the same spirit as the
 * enum-pinned checks in `create-task.test.ts` / `update-task.test.ts`.
 */
describe('TaskKind ↔ TASK_KIND_CUE parity', () => {
  it('carries a cue entry for every kind in the Prisma enum, and no stale ones', () => {
    expect(Object.keys(TASK_KIND_CUE).sort()).toEqual(Object.values(PrismaTaskKind).sort());
  });
});

describe('KindTag', () => {
  it('renders the "bug" label with the explanatory tooltip', () => {
    render(<KindTag kind="bug" />);
    const tag = screen.getByText('bug');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute('title', 'A bug — a fix on the feature it broke');
  });

  /**
   * This file is the one place the exact tag word is pinned; the four surface tests
   * assert on the tooltip instead, so the label stays free to change (owner: it is
   * provisional) without touching them. An `enhancement` reads "new" so it occupies
   * the same visual slot as "bug" — hence the tooltip carrying what "new" is new
   * relative to.
   */
  it('renders the "new" label with the tooltip that names the kind behind it', () => {
    render(<KindTag kind="enhancement" />);
    const tag = screen.getByText('new');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute(
      'title',
      'An enhancement — new work on a feature that already shipped'
    );
  });

  it('keeps the enhancement label within a character of the bug label', () => {
    // The point of "new" over "enhancement": at "bug"'s width the two kinds sit in
    // the same slot, instead of one shunting the title right and truncating it.
    const bug = TASK_KIND_CUE.bug?.label ?? '';
    const enhancement = TASK_KIND_CUE.enhancement?.label ?? '';
    expect(Math.abs(enhancement.length - bug.length)).toBeLessThanOrEqual(1);
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
   * `TaskKind` is hand-mirrored from the Prisma enum and the DTO reaches these
   * components through an unchecked cast, so a value outside the union type-checks
   * its way in here. A bare index would reach the prototype chain — `'constructor'`
   * returns a truthy function with no `.Icon`, which throws inside React and takes
   * the surrounding Plan down. Degrade to unmarked instead.
   */
  it('treats an off-union kind as unmarked rather than throwing', () => {
    for (const rogue of ['constructor', 'toString', 'not_a_kind']) {
      expect(taskKindCue(rogue as TaskKind)).toBeNull();
      const { container, unmount } = render(<KindTag kind={rogue as TaskKind} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
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
