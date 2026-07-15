/**
 * Breadcrumb derivation for the Hub topbar (f-shell).
 *
 * Pure and **route-driven** (the composable-shell guardrail): crumbs are derived
 * generically from the pathname, so a new route/module gets breadcrumbs with no
 * topbar edit. A small label map prettifies known segments; unknown segments
 * fall through as-is (e.g. a project id — `f-projects` can override the leaf
 * label with the real project name once it has the data).
 */

export interface Crumb {
  label: string;
  /** Absent on the current (last) crumb — it is not a link. */
  href?: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  projects: 'Projects',
  brief: 'Morning brief',
};

/** `/projects/abc` → `[Hub(/), Projects(/projects), abc]`; `/` → `[Hub]`. */
export function deriveBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  // Root crumb: a link only when we're below it.
  const crumbs: Crumb[] = [{ label: 'Hub', href: segments.length > 0 ? '/' : undefined }];

  let href = '';
  segments.forEach((segment, i) => {
    href += `/${segment}`;
    const isLast = i === segments.length - 1;
    crumbs.push({
      // `Object.hasOwn` guard: a bare `SEGMENT_LABELS[segment]` would return an
      // inherited `Object.prototype` member (a function/object, not a string) for
      // a segment like `constructor`/`toString`/`__proto__` — e.g. a project id of
      // `toString` at `/projects/toString` — making `label` an invalid React child.
      label: Object.hasOwn(SEGMENT_LABELS, segment) ? SEGMENT_LABELS[segment] : segment,
      href: isLast ? undefined : href,
    });
  });

  return crumbs;
}
