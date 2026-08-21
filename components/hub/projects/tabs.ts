/**
 * The project-view tab registry (§33-sweep t-111) — one declaration the union,
 * the `?view=` resolution, the page `<title>`, the data fetch, the bugs strip and
 * the tab control all derive from.
 *
 * **What this replaces, and why it mattered.** The tab set used to live in seven
 * independent places, and two pairs of them could disagree without anything
 * failing:
 *
 *  - The page **metadata** ternary and the **body** switch each mapped `?view=`
 *    to a tab on their own. A tab could therefore render one thing and title the
 *    page another — a silent drift, not a build error.
 *  - The bugs-strip guard was a **negative** list (`!== 'log' && !== 'ideas' &&
 *    !== 'connect'`) and the body switch's final `else` was the Log. So a new tab
 *    silently inherited the bugs strip AND silently rendered the Log. Both
 *    defaults were the wrong way round: a tab nobody has thought about yet should
 *    get *nothing*, not somebody else's body.
 *
 * Both are now positive declarations on the spec, so the question is asked at the
 * point of adding a tab rather than discovered afterwards.
 *
 * **The cost this removes is per-tab-added, forever** — the reason to do it at
 * five tabs rather than at fifteen.
 */

/**
 * What one tab declares.
 *
 * Deliberately *data*, not components: a tab body is a React element with its own
 * props and cannot be derived from a table. What the registry owns is everything
 * that CAN drift — the label, the payload, the strip — and the body is made
 * exhaustive against this union instead, so a missing one is a compile error.
 */
export interface ProjectTabSpec {
  /** The `?view=` value, the union member, and the React key. */
  readonly key: string;
  /**
   * Shown on the tab control **and** in the page `<title>` — one string with two
   * consumers, which is the specific drift that motivated the registry.
   */
  readonly label: string;
  /**
   * The server payload the page must fetch before rendering this tab, or `null`
   * for a tab that fetches its own (the Log and Connect are client-fetched —
   * filterable and self-service respectively).
   */
  readonly payload: 'plan' | 'board' | 'ideas' | null;
  /**
   * Does the active-bugs strip belong above this tab's body? True for the work
   * surfaces (Plan, Board). The Log is the history stream and Ideas/Connect are
   * different axes entirely, so the strip would be noise there.
   */
  readonly showsBugStrip: boolean;
}

/**
 * Order is the rendered tab order. `as const satisfies` is doing real work: the
 * `as const` keeps the keys as literals (so `ProjectTab` below is the exact union
 * rather than `string`) while `satisfies` still type-checks each row against the
 * spec. A plain `: ProjectTabSpec[]` annotation would widen `key` to `string` and
 * quietly cost every consumer its exhaustiveness.
 */
export const PROJECT_TABS = [
  { key: 'plan', label: 'Plan', payload: 'plan', showsBugStrip: true },
  { key: 'board', label: 'Board', payload: 'board', showsBugStrip: true },
  { key: 'ideas', label: 'Ideas', payload: 'ideas', showsBugStrip: false },
  { key: 'log', label: 'Log', payload: null, showsBugStrip: false },
  { key: 'connect', label: 'Connect', payload: null, showsBugStrip: false },
] as const satisfies readonly ProjectTabSpec[];

/** The `?view=` values, derived from the registry — never written out by hand. */
export type ProjectTab = (typeof PROJECT_TABS)[number]['key'];

/**
 * Plan is the default, so a bare `/projects/<ref>` and a `?phase=` deep link both
 * land on it without a `?view=`.
 */
export const DEFAULT_PROJECT_TAB: ProjectTab = 'plan';

/**
 * `?view=` → tab. Anything unrecognised (absent, typo'd, hand-edited, or a stale
 * link to a tab that has since been removed) falls back to the default rather
 * than 404ing — a bad `?view=` is a cosmetic mistake, not a missing page.
 */
export function resolveProjectTab(view: string | undefined): ProjectTab {
  const match = PROJECT_TABS.find((tab) => tab.key === view);
  return match ? match.key : DEFAULT_PROJECT_TAB;
}

/**
 * The spec for a tab. The `throw` is unreachable by construction — `ProjectTab`
 * is derived from `PROJECT_TABS`, so every value of the type has a row — and is
 * here only because narrowing a `find` without either this or a non-null
 * assertion is not possible. Preferred over `!` so a future refactor that broke
 * the derivation would fail loudly rather than hand back `undefined`.
 */
export function projectTabSpec(tab: ProjectTab): ProjectTabSpec {
  const spec = PROJECT_TABS.find((entry) => entry.key === tab);
  if (!spec) throw new Error(`Unknown project tab: ${tab}`);
  return spec;
}
