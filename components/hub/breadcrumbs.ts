/**
 * Breadcrumb derivation for the Hub topbar (f-shell + f-projects).
 *
 * Pure and **route-driven** (the composable-shell guardrail): crumbs are derived
 * generically from the pathname, so a new route/module gets breadcrumbs with no
 * topbar edit. A small label map prettifies known static segments; a per-call
 * `overrides` map lets a page supply the real label for a dynamic segment (a
 * project id → the project name, via `BreadcrumbLabel`); anything unmatched
 * falls through as the raw segment.
 *
 * A dynamic id leaf (a segment directly under a `DYNAMIC_PARENT`, e.g.
 * `/projects/<id>`) renders as **pending** (a skeleton) until its override
 * resolves — the topbar renders above the page, so on first paint it can't yet
 * know the name; showing a placeholder beats flashing the raw id. Genuinely
 * static unknown segments are NOT pending (the guardrail holds).
 */

export interface Crumb {
  /** Empty while `pending` — the topbar renders a skeleton instead. */
  label: string;
  /** Absent on the current (last) crumb — it is not a link. */
  href?: string;
  /** A dynamic id awaiting its label (render a skeleton, not the raw id). */
  pending?: boolean;
}

const SEGMENT_LABELS: Record<string, string> = {
  projects: 'Projects',
  brief: 'Morning brief',
  // The feature-page path `/projects/<id>/features/<slug>` (f-feature-planning
  // §18); `/projects/<id>/features` redirects back to the project.
  features: 'Features',
};

/**
 * Segments whose direct children are dynamic ids (so an un-overridden child leaf
 * is a "pending label", not a real crumb). Add a module's collection segment
 * here when its detail route carries a name-bearing id.
 */
const DYNAMIC_PARENTS = new Set<string>(['projects']);

/**
 * `/projects/abc` → `[Hub(/), Projects(/projects), abc]`; `/` → `[Hub]`.
 * `overrides` (segment → label) wins over the static map, which wins over the
 * raw segment; an un-overridden id leaf under a `DYNAMIC_PARENT` is `pending`.
 */
export function deriveBreadcrumbs(
  pathname: string,
  overrides: Record<string, string> = {}
): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  // Root crumb: a link only when we're below it.
  const crumbs: Crumb[] = [{ label: 'Hub', href: segments.length > 0 ? '/' : undefined }];

  let href = '';
  segments.forEach((segment, i) => {
    href += `/${segment}`;
    const isLast = i === segments.length - 1;

    // `Object.hasOwn` guard (both maps): a bare `MAP[segment]` would return an
    // inherited `Object.prototype` member (a function/object, not a string) for a
    // segment like `constructor`/`toString`/`__proto__` — e.g. a project id of
    // `toString` at `/projects/toString` — making `label` an invalid React child.
    if (Object.hasOwn(overrides, segment)) {
      crumbs.push({ label: overrides[segment], href: isLast ? undefined : href });
    } else if (Object.hasOwn(SEGMENT_LABELS, segment)) {
      crumbs.push({ label: SEGMENT_LABELS[segment], href: isLast ? undefined : href });
    } else if (i > 0 && DYNAMIC_PARENTS.has(segments[i - 1])) {
      // A dynamic id under a known parent, not yet labelled → skeleton, not the id.
      crumbs.push({ label: '', href: isLast ? undefined : href, pending: true });
    } else {
      crumbs.push({ label: segment, href: isLast ? undefined : href });
    }
  });

  return crumbs;
}
