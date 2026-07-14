import { BRAND } from '@/lib/brand';

/**
 * BrandMark — the header/footer brand slot.
 *
 * **Fork-owned scaffold** — Sunrise ships this rendering `BRAND.name` as text
 * and does NOT change it after release, so your edits here merge cleanly on
 * upgrade (the stable contract is this file's export, not its body). Treat it
 * like the landing page: a starting point you're expected to modify.
 *
 * A header brand is a *render* concern an env string can't express (image vs.
 * styled wordmark, sizing, `alt`, dark/light variants), so the seam is a
 * component. Replace only this file's body to render a logo, e.g.
 *
 * ```tsx
 * import Image from 'next/image';
 * import { BRAND } from '@/lib/brand';
 *
 * export function BrandMark() {
 *   return (
 *     <Image src="/logo.svg" alt={BRAND.name} width={120} height={28} priority />
 *   );
 * }
 * ```
 *
 * Lives in `components/` (not `lib/app/`) because the `lib/app/**` ESLint
 * boundary bans runtime `next/*` imports and a logo commonly needs `next/image`.
 *
 * `BRAND.name` stays the identity/accessibility string (`alt` / `aria-label`)
 * even when a fork renders a mark.
 *
 * HCE Hub (f-theme): renders the design handoff's brand mark — a 26px ink
 * square with a mono "H" — plus the "HCE Hub" wordmark. Colours resolve from
 * the theme tokens (`bg-foreground` / `text-background`), so it reads warm on
 * the consumer surface and inverts correctly in dim mode. The "H" is
 * `aria-hidden`; the accessible name is `BRAND.name` on the wrapper.
 *
 * Full guide: CUSTOMIZATION.md §2.
 */
export function BrandMark(): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label={BRAND.name}>
      <span
        aria-hidden="true"
        className="bg-foreground text-background grid h-[26px] w-[26px] place-items-center rounded-md text-[13px] font-semibold"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}
      >
        H
      </span>
      <span className="text-[15px] font-medium tracking-[-0.015em]">{BRAND.name}</span>
    </span>
  );
}
