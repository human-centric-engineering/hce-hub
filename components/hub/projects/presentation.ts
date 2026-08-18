/**
 * Shared presentation helpers for the projects UI (f-projects t-2).
 * Kept in one place so the card and the project-view can't drift.
 */
/** Quiet status → Badge variant (§13.5 — no traffic-light overload). */
export const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  planning: 'secondary',
  archived: 'outline',
};

/** Up-to-two-letter initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * ISO → `"11 Aug 2026"`. **Locale-free and UTC**, so it is SSR-stable.
 *
 * Both properties are load-bearing, and `toLocaleDateString` breaks both. The
 * locale one: a Vercel Node server resolves `undefined` to `en-US` and emits
 * "Aug 11" while an `en-GB` browser emits "11 Aug" — a hydration text mismatch
 * on every rendered date, in exactly our deployment. The timezone one is worse
 * than cosmetic: our timestamps are stamped at UTC, so a viewer at a negative
 * offset formatting `2026-08-01T00:00:00Z` in local time sees **31 Jul** — the
 * wrong day, silently.
 *
 * Always carries the year rather than dropping it in the current one: the
 * conditional would itself be non-deterministic across a year boundary (server
 * and client evaluating "now" either side of midnight), and for a milestone the
 * year is the part you actually compare.
 *
 * Extracted here from `ideas/idea-row.tsx`, which had already solved this and
 * carried the same reasoning in a one-line comment (f-phase-history §33 t-99).
 */
export function utcShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
