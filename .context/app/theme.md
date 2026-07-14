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
