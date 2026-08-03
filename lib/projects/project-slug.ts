/**
 * Project slug derivation (f-selfhost-cutover §19 t-3).
 *
 * A project's `slug` is its shareable, durable, human URL key (`/projects/hce-hub`).
 * It is **globally unique** (projects are top-level, unlike per-project feature
 * slugs) and **stable + name-independent once set** — a rename must not break a
 * shared link, so `updateProject` never re-derives it. `createProject` derives one
 * from the name (the same lowercase-hyphen shape the migration backfilled with),
 * de-duplicated against existing slugs.
 */

/**
 * Slugify a project name: lowercase, non-alphanumeric runs → a single hyphen,
 * leading/trailing hyphens trimmed, capped at 100 chars. Returns `null` when the
 * name has no alphanumerics (→ the project keeps cuid-only URLs), mirroring the
 * migration backfill's `NULLIF(..., '')`.
 */
export function slugifyProjectName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, ''); // a trailing hyphen the slice may have exposed
  return slug.length > 0 ? slug : null;
}

/**
 * The regex the `slug` column accepts (matches `slugifyProjectName`'s output and
 * the per-project feature-slug shape): lowercase words joined by single hyphens.
 */
export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
