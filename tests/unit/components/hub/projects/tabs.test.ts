/**
 * Unit: the project-view tab registry (§33-sweep t-111).
 * @see components/hub/projects/tabs.ts
 *
 * `id-page-tabs.test.tsx` proves the four *consumers* stay in step with the
 * registry. This covers the registry's own helpers, including the two branches
 * nothing else reaches: `resolveProjectTab`'s fallback and `projectTabSpec`'s
 * guard. Both are error paths, so transitive coverage through a page test never
 * touches them — which is precisely when a "defensive" branch turns out to do
 * nothing.
 */
import { describe, it, expect } from 'vitest';

import {
  PROJECT_TABS,
  DEFAULT_PROJECT_TAB,
  resolveProjectTab,
  projectTabSpec,
  type ProjectTab,
} from '@/components/hub/projects/tabs';

describe('PROJECT_TABS', () => {
  it('has no duplicate keys', () => {
    // A duplicate would not fail to compile, and `find` would silently return
    // the first — so one row's label/payload/strip would be unreachable while
    // the tab control still rendered both.
    const keys = PROJECT_TABS.map((tab) => tab.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares a label for every tab', () => {
    // The label is the one field with two consumers (the control and the page
    // title), so an empty one degrades both at once and reads as a render bug.
    for (const tab of PROJECT_TABS) expect(tab.label.trim().length).toBeGreaterThan(0);
  });

  it('defaults to a tab that actually exists', () => {
    expect(PROJECT_TABS.map((tab) => tab.key)).toContain(DEFAULT_PROJECT_TAB);
  });
});

describe('resolveProjectTab', () => {
  it('resolves every declared key to itself', () => {
    for (const tab of PROJECT_TABS) expect(resolveProjectTab(tab.key)).toBe(tab.key);
  });

  it.each([
    ['undefined (a bare /projects/<ref> or a ?phase= deep link)', undefined],
    ['an empty string', ''],
    ['an unknown view', 'gantt'],
    ['a near-miss on a real key', 'Plan'],
  ])('falls back to the default for %s', (_label, view) => {
    // Deliberately forgiving: a typo'd, hand-edited or stale `?view=` is a
    // cosmetic mistake, not a missing page, so it lands on the default rather
    // than 404ing or rendering an empty body. `'Plan'` is here because the match
    // is case-SENSITIVE — worth pinning rather than leaving to chance.
    expect(resolveProjectTab(view)).toBe(DEFAULT_PROJECT_TAB);
  });
});

describe('projectTabSpec', () => {
  it('returns the row for every declared key', () => {
    for (const tab of PROJECT_TABS) expect(projectTabSpec(tab.key)).toBe(tab);
  });

  it('throws rather than returning undefined for a key with no row', () => {
    // Unreachable through the type — `ProjectTab` is derived FROM the registry —
    // so reaching the guard needs a cast, and that is exactly why it is worth a
    // test. The guard exists for the refactor that breaks the derivation, and an
    // untested throw is indistinguishable from the `!` it was chosen over, which
    // would hand back `undefined` and fail later at a property access with no
    // clue where the bad key came from.
    expect(() => projectTabSpec('gantt' as ProjectTab)).toThrow(/Unknown project tab/);
  });
});
