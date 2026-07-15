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
