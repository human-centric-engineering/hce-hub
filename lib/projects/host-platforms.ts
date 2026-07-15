/**
 * Host-platform descriptors (v1-requirements §7).
 *
 * Each project records the platform it's hosted on. v1 supports **`sunrise`**
 * for real; the other platforms are present as *stubbed descriptors* — a label
 * plus `supported: false` — so an admin can record a project's platform (and
 * intake/planning context can branch on it later) without any of them being
 * built out. This list is the single source of truth: the create/update Zod
 * schema restricts `hostPlatform` to these slugs (`isKnownHostPlatform`), and
 * the admin UI (t-2) renders the labels. Adding a real platform later is a row
 * here + flipping `supported` — the §7 extension seam.
 *
 * (f-project-admin, feature 05.)
 */

export interface HostPlatformDescriptor {
  /** Stored on `Project.hostPlatform`. Lowercase-hyphen slug. */
  slug: string;
  /** Human label for the admin UI. */
  label: string;
  /** True only for platforms v1 builds planning context for. Stubs are `false`. */
  supported: boolean;
}

export const HOST_PLATFORMS: readonly HostPlatformDescriptor[] = [
  { slug: 'sunrise', label: 'Sunrise', supported: true },
  { slug: 'laravel-forge', label: 'Laravel / Forge', supported: false },
  { slug: 'nextjs-other', label: 'Next.js (other)', supported: false },
  { slug: 'none', label: 'None / not hosted', supported: false },
] as const;

/** The known slugs, in descriptor order — the Zod-restriction set. */
export const HOST_PLATFORM_SLUGS: readonly string[] = HOST_PLATFORMS.map((p) => p.slug);

/** True iff `slug` is a known host platform (supported or stubbed). */
export function isKnownHostPlatform(slug: string): boolean {
  return HOST_PLATFORMS.some((p) => p.slug === slug);
}

/** The descriptor for `slug`, or `undefined` if unknown. */
export function getHostPlatform(slug: string): HostPlatformDescriptor | undefined {
  return HOST_PLATFORMS.find((p) => p.slug === slug);
}
