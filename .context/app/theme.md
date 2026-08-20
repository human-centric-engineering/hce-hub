# HCE Hub theme — the token layer

> The fork-owned token reference for HCE Hub's visual system. The theme lives in
> **`app/brand-theme.css`** (one file), scoped to the **`consumer`** surface. It
> fills Sunrise's `data-surface` seam — see
> [`.context/ui/surface-theming.md`](../ui/surface-theming.md) for the mechanism
> and [`planning/f-theme.md`](./planning/f-theme.md) for the build + decisions.
> Design source of truth: the design handoff `styles.css`.

## What it is

A **warm, low-chroma** palette — off-white paper, near-black ink, one clay accent
used _sparingly_ — with a mono/sans type pairing (metadata mono, content sans).
It is applied to every Hub surface (`consumer`) and **not** to `/admin`, which
stays on Sunrise defaults so the Hub reads as a _sibling_ to Sunrise admin
(v1-requirements §13.5).

## Two layers of tokens

1. **Remapped shadcn semantic tokens** (`--color-background`, `--color-foreground`,
   `--color-primary`, `--color-muted`, `--color-border`, `--color-card`, `--color-ring`,
   `--color-destructive`, …). Because every shadcn primitive (Button, Badge, Tabs,
   Sheet, Select, Switch, Tooltip) resolves its colours from these, the whole
   primitive set restyles **for free** on the consumer surface — no component edits.
   Use the normal shadcn utilities (`bg-background`, `text-foreground`, `bg-primary`,
   `border`, `bg-muted`, …) and they come out warm.

2. **Hub-native tokens** — no shadcn equivalent; consume them **directly** in Hub
   components (via `var(--…)` or an inline style):

   | Group                       | Tokens                                                                                                             |
   | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | Surfaces                    | `--bg`, `--bg-elev`, `--bg-sunken`, `--bg-tint`                                                                    |
   | Ink                         | `--ink`, `--ink-soft`, `--ink-mute`, `--ink-faint`, `--ink-ghost`                                                  |
   | Lines                       | `--line`, `--line-soft`, `--line-strong`                                                                           |
   | Accent (clay — sparingly)   | `--accent`, `--accent-soft`, `--accent-bg`, `--accent-ink`                                                         |
   | Status signals (fg + `-bg`) | `--signal-merged`, `--signal-pr`, `--signal-claimed`, `--signal-blocked`, `--signal-available`, `--signal-backlog` |
   | Radius                      | `--radius-sm` (4px), `--radius` (6px), `--radius-lg` (10px)                                                        |
   | Shadow                      | `--shadow-sm`, `--shadow`, `--shadow-lg` (soft, layered — hover/sheet only)                                        |
   | Type                        | `--font-ui` (Inter Tight), `--font-mono` (JetBrains Mono), `--font-display`                                        |
   | Motion                      | `--duration-fast` (120ms), `--duration` (200ms), `--ease`                                                          |

   **Clay is deliberately NOT shadcn's `--color-accent`** (which stays a muted hover
   fill) — clay is ownership / help-wanted / sidekick presence, used sparingly.

## Dark mode ("dim")

Warm-dark, not blue-black (`--color-background: #1a1916`). The dark scope is the
**compound** selector `[data-surface='consumer'].dark` — both `data-surface` and
`.dark` sit on `<html>`. Every token is re-declared for dim.

## Fonts

**Self-hosted** in `public/fonts/` (Inter Tight variable; JetBrains Mono 400/500/600),
declared with `@font-face` in `brand-theme.css`. This is required by the CSP
(`font-src 'self'` blocks Google Fonts) and keeps the theme platform-touch-free.
Inter Tight is a variable font, so the design's 450 ("body-ish emphasis") weight
resolves. Body text on the consumer surface uses `--font-ui`; apply `var(--font-mono)`
per-component for IDs, paths, PR links, timestamps, and micro-labels.

## Favicon

`public/favicon.svg` + `public/favicon.ico` carry the same mark as
[`components/brand/brand-mark.tsx`](../../components/brand/brand-mark.tsx) — the ink
square with a mono "H" — redrawn for a 16px canvas. Colours are this file's tokens:

| Scheme | Square    | "H"       |
| ------ | --------- | --------- |
| light  | `#1a1a1a` | `#faf8f3` |
| dark   | `#e8e6e1` | `#1a1916` |

**The tab follows the OS, not the in-app toggle, and the two can disagree.** A favicon
has exactly one signal available to it — `prefers-color-scheme` — while the Hub's own
theme is user-selectable: `localStorage.theme` drives a `light`/`dark` class on `<html>`
(the inline script in `app/layout.tsx`, kept in sync by `hooks/use-theme`), and only
_falls back_ to the OS preference when nothing is stored. So a user on a light-mode OS
who switches the Hub to dim gets a dim sidebar and a light-cut tab. That is a limit of
the format, not a bug to chase: nothing in a favicon can read the app's `localStorage`.

Three things about it are deliberate and easy to undo by accident:

- **The "H" is a path, not type.** A favicon is a standalone document with no access to
  `public/fonts/`, so JetBrains Mono is not available to it. The outline is a touch
  heavier than the real SemiBold cut — hairlines vanish at 16px.
- **Light lives on presentation attributes; dark lives in the `<style>` block.** CSS
  beats presentation attributes, so the `prefers-color-scheme` rules win where they are
  honoured — and a renderer that ignores the `<style>` block entirely still gets correct
  light colours instead of defaulting both shapes to black.
- **The ICO is generated from the SVG**, at 16/32/48/128, light only (an ICO cannot
  adapt). Regenerate it if you change the mark, or the two drift silently. 16/32/48 are
  what tab strips ask for; **128 is not decorative** — Safari has no SVG-favicon support,
  so its bookmark tile and Windows' pinned shortcuts (which want 64–256px) fall back to
  the largest raster we ship, and upstream's single 128×128 entry is what they were
  getting before. Dropping it would have been a quiet downgrade on exactly the surfaces
  the SVG cannot reach.

Both are linked from the root `metadata.icons` in `app/layout.tsx` — a keep-mine edit
to a platform file, because Sunrise declares no `icons` and never links its own SVG
([divergence rows 24 + 25](./platform-divergences.md), upstream `sunrise#640`). Only
the ICO would be found without it, by root-path convention.

**`sizes` there is a selection hint, not a manifest.** It is what a browser compares when
choosing _between_ the two links, and the SVG declares none — read as "scalable, any
size". So the ICO declares a single `32x32` even though the file carries four sizes.
Widening that declaration to the file's real contents hands Chrome's size-matching a
large concrete raster to prefer over the SVG, which costs the dark-mode adaptation that
is the only reason the SVG is linked — silently, with every gate still green. Narrow that
declaration if you must; do not widen it.

## Rules of thumb

- **Cards separate by border, not shadow** (Linear-like calm density, §13.5).
  Shadows are hover/sheet only.
- **No traffic-light saturation** — status colours are muted and earthy.
- **No celebratory motion** — transitions are for hover/expand/slide only.
- **Never edit `app/globals.css`** — redeclare in `brand-theme.css` so upstream
  palette changes still flow through the tokens you didn't touch.

## Where it's consumed

Per-screen styling lands with each UI-spine feature (`f-shell`, `f-projects`,
`f-plan-view`, `f-board-view`, `f-task-sheet`, `f-sidekick`, `f-morning-brief`) —
f-theme ships only the _foundation_ + the auth-page paint + the brand mark.
