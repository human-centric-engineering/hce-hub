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
    // ORDER IS THE ASSERTION, not an artifact of how the array was typed. A
    // browser takes the LAST icon declaration it can render, so the ICO has to
    // come first as the floor (Safari has no SVG-favicon support) and the SVG
    // last for the browsers that do — and which also honour its
    // prefers-color-scheme block. Swap these two and every modern browser
    // silently drops to the raster, losing dark-mode adaptation with no error.
    expect(declaredIcons().map((i) => i.url)).toEqual(['/favicon.ico', '/favicon.svg']);
  });

  it('points every declared icon at a file that exists', () => {
    for (const { url } of declaredIcons()) {
      expect(existsSync(join(process.cwd(), 'public', url))).toBe(true);
    }
  });

  it('declares the sizes the ICO really carries', () => {
    const declared = declaredIcons().find((i) => i.url === '/favicon.ico');
    expect(declared?.sizes).toBeDefined();
    // `sizes` is what stops Chrome assuming 16x16 and upscaling. It is also the
    // one claim here that can rot without anyone touching this file: the ICO is
    // generated from the SVG, so re-generating it at a different set of sizes
    // leaves the declaration describing a file that no longer matches.
    const claimed = declared?.sizes?.split(' ').map((s) => Number(s.split('x')[0]));
    expect(claimed).toEqual(icoSizes(join(process.cwd(), 'public/favicon.ico')));
  });

  it('ships an SVG that can actually adapt to the OS theme', () => {
    // The only reason to link the SVG at all is that an ICO cannot follow the
    // system theme. If this block is ever dropped the SVG still renders, still
    // passes every other assertion here, and quietly stops being worth linking.
    const svg = readFileSync(join(process.cwd(), 'public/favicon.svg'), 'utf8');
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
  });
});
