/**
 * Root-layout icon metadata (§33-sweep t-106).
 *
 * `app/layout.tsx` is coverage-exempt (it is a layout), so nothing else here
 * watches it — and every way this can break is **silent**. Delete the `icons`
 * block, rename an asset, or regenerate the ICO at different sizes, and the
 * build stays green, the page still renders, and the only symptom is the wrong
 * picture on a browser tab that nobody looks at while working.
 *
 * So these assertions deliberately cross from "what the metadata says" to "what
 * is actually on disk". A test that only read the object back would pass on a
 * declaration pointing at a file that no longer exists.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { metadata } from '@/app/layout';

/** `metadata.icons` is a broad union; narrow to the array form this layout uses. */
function declaredIcons(): { url: string; sizes?: string; type?: string }[] {
  const icons = metadata.icons;
  // `URL` has to be excluded by hand: `metadata.icons` is `string | URL | Icon[] |
  // Icons`, and a `URL` instance passes `typeof x === 'object'` happily.
  if (
    icons === null ||
    icons === undefined ||
    typeof icons !== 'object' ||
    Array.isArray(icons) ||
    icons instanceof URL
  ) {
    throw new Error('expected metadata.icons to be an Icons object');
  }
  const icon = icons.icon;
  if (!Array.isArray(icon)) throw new Error('expected metadata.icons.icon to be an array');
  return icon.map((entry) => {
    if (typeof entry !== 'object' || entry === null || !('url' in entry)) {
      throw new Error('expected each icon entry to be a descriptor object');
    }
    return {
      url: String(entry.url),
      sizes: typeof entry.sizes === 'string' ? entry.sizes : undefined,
      type: typeof entry.type === 'string' ? entry.type : undefined,
    };
  });
}

/**
 * The sizes an ICO actually contains, read out of its directory table.
 * Header: reserved(2) type(2) count(2), then one 16-byte entry per image whose
 * first byte is the width (0 meaning 256).
 */
function icoSizes(path: string): number[] {
  const buf = readFileSync(path);
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => buf.readUInt8(6 + 16 * i) || 256);
}

describe('root layout icon metadata', () => {
  it('declares the ICO before the SVG, so the fallback chain resolves', () => {
    // ORDER IS THE ASSERTION. A browser takes the LAST icon declaration it can
    // render, so the ICO has to come first as the floor (Safari has no
    // SVG-favicon support) and the SVG last for the browsers that do — and which
    // also honour its prefers-color-scheme block. Swap these two and every modern
    // browser silently drops to the raster, losing dark-mode adaptation with no
    // error anywhere.
    //
    // Asserted as two indices rather than `toEqual([ico, svg])`, which would also
    // pin the icon COUNT. Adding a third entry (an apple-touch-icon, say) is a
    // perfectly good change that has nothing to do with this invariant, and it
    // would fail here under a name and comment that are entirely about ordering —
    // sending the next reader hunting for an ordering bug that isn't there.
    const urls = declaredIcons().map((i) => i.url);
    expect(urls).toContain('/favicon.ico');
    expect(urls).toContain('/favicon.svg');
    expect(urls.indexOf('/favicon.ico')).toBeLessThan(urls.indexOf('/favicon.svg'));
  });

  it('points every declared icon at a file that exists', () => {
    for (const { url } of declaredIcons()) {
      expect(existsSync(join(process.cwd(), 'public', url))).toBe(true);
    }
  });

  it('only claims ICO sizes the file really contains', () => {
    const declared = declaredIcons().find((i) => i.url === '/favicon.ico');
    expect(declared?.sizes).toBeDefined();
    // SUBSET, not equality. `sizes` is a selection hint the browser compares
    // between links — not a manifest of the file — so the declaration is
    // deliberately narrower than the ICO's contents (one `32x32` against a file
    // carrying 16/32/48/128). An equality assertion would read as a drift guard
    // while actually forbidding that gap, and would fail the moment someone adds
    // a frame for a bookmark tile.
    //
    // What still has to hold is the direction that can rot silently: the ICO is
    // generated from the SVG, so regenerating it without a size we advertise
    // leaves the declaration pointing at something the file no longer has.
    const claimed = declared?.sizes?.split(' ').map((s) => Number(s.split('x')[0])) ?? [];
    const present = icoSizes(join(process.cwd(), 'public/favicon.ico'));
    expect(claimed.length).toBeGreaterThan(0);
    for (const size of claimed) expect(present).toContain(size);
  });

  it('ships an SVG that can actually adapt to the OS theme', () => {
    // The only reason to link the SVG at all is that an ICO cannot follow the
    // system theme. If this block is ever dropped the SVG still renders, still
    // passes every other assertion here, and quietly stops being worth linking.
    const svg = readFileSync(join(process.cwd(), 'public/favicon.svg'), 'utf8');
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
  });
});
