# Handoff: HCE Hub — v1 (Project Coordination module)

## Overview

This is the design handoff for the **HCE Hub** web UI — the user-facing working surface described in `v1-requirements.md` §13.1. It covers the module-composable shell and the Project Coordination module: **Hub home, project Plan view, project Board (Kanban), Intake flow, Morning brief, and the persistent Sidekick chat panel**, plus a deep-linkable **Task detail sheet**.

You (Claude Code) already have the full `v1-requirements.md`. **This document does not restate the product spec** — it documents the *design*: the visual system, the screens, and the interactions, so you can build them in the Sunrise codebase. Where a design decision encodes a requirement (e.g. pull-not-push, soft collisions, no gamification), it's flagged inline.

## About the design files

The files in this bundle are **design references created in HTML/React-via-Babel** — prototypes showing intended look and behaviour. **They are not production code to copy directly.** They deliberately use a standalone CSS file and browser-Babel JSX so they render without a build step.

Your task is to **recreate these designs in Sunrise's existing environment**: Next.js (App Router), React, **Tailwind 4**, and **shadcn/ui**, following the patterns already used across the Sunrise admin design system. The requirements doc (§13.5) is explicit that the Hub UI should feel like a *sibling* to Sunrise admin — same family, different room. Translate the tokens below into Sunrise's Tailwind theme rather than porting this CSS file verbatim.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, layout, and interactions are all intentional. Recreate pixel-faithfully using shadcn/ui primitives (Button, Badge, Avatar, Dialog/Sheet, Tabs, Select, Switch, Textarea, Tooltip, DropdownMenu — all already in the Sunrise repo under `components/ui/`) restyled to the token set below.

The one thing that is **not** prescriptive: the sample data (`data.jsx`). It's a plausible "building the Hub in the Hub" scenario used to exercise every state. Real data comes from the Prisma models in the spec.

---

## Design system / tokens

The Hub uses its own token layer that sits alongside Sunrise's. It is a **warm, low-chroma** palette — off-white paper, near-black ink, and a single clay accent used *sparingly* for ownership / help-wanted / sidekick presence. State colours are muted and earthy, never traffic-light saturated (spec §13.5: "No traffic-light overload").

### Colour — light ("warm") theme

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#faf8f3` | app background (warm paper) |
| `--bg-elev` | `#ffffff` | cards, raised surfaces |
| `--bg-sunken` | `#f3f0e8` | sidebar, expanded task rows, footers |
| `--bg-tint` | `#efebe0` | chips, hover fills, inline code |
| `--ink` | `#1a1a1a` | primary text |
| `--ink-soft` | `#3a3a38` | body text |
| `--ink-mute` | `#6e6b62` | secondary text, labels |
| `--ink-faint` | `#a09c91` | metadata, mono IDs |
| `--ink-ghost` | `#c8c4b8` | separators, empty markers |
| `--line` | `#e6e1d3` | default borders |
| `--line-soft` | `#efebe0` | inner dividers |
| `--line-strong` | `#d4cfc0` | hover borders |
| `--accent` | `#c45a3e` | clay — ownership left-border, help-wanted, sidekick avatar. **Use sparingly.** |
| `--accent-bg` | `#f6e6df` | help-wanted pill background |
| `--accent-ink` | `#8a3d29` | text on accent surfaces |

### Colour — status signals (semantic, muted)

Each state has a foreground + a tinted background. Same names used for both feature status and task status.

| Status | fg | bg | Meaning |
|---|---|---|---|
| merged / shipped | `#5d7a5b` (sage) | `#e7eddf` | landed |
| in-pr / in-flight | `#7a6a3d` (tobacco) | `#efe6cf` | open PR / building |
| claimed | `#4a5d7a` (slate-blue) | `#dee5ef` | in progress, no PR |
| blocked | `#8a4a4a` (brick) | `#efdedc` | waiting on upstream |
| available | `#3a3a38` | `#ebe6d8` | ready to pull |
| backlog / planning | `#6e6b62` | `#ece8de` | noted, not promoted |

A **"dim" (dark) theme** is fully specified in `styles.css` under `.theme-dim` — warm-dark, not blue-black (`--bg: #1a1916`). Port it as the Hub's dark mode.

### Typography

- **UI:** `Inter Tight` (weights 400/450/500/600). Headings use `-0.02em`/`-0.025em` letter-spacing. Note the **450** weight for body-ish emphasis.
- **Mono:** `JetBrains Mono` — used for IDs (`t-3`, `f-intake`), file paths, PR links (`hub#58`), timestamps, and all-caps micro-labels. This mono/sans pairing is a core part of the feel: metadata is always mono, content is always sans.
- Both are Google Fonts. Load via Sunrise's existing font pipeline.
- Scale: `h1` 28px/500, `h2` 20px/500, `h3` 16px/500, body 14px, small 13px, xs 12px, mono 12px, mono-sm 11px, micro-caps 10–11px uppercase `0.1em`.

### Spacing, radius, shadow

- Radius: `--radius-sm 4px`, `--radius 6px`, `--radius-lg 10px`.
- Shadows are very soft and layered (see `--shadow-sm/-shadow/-shadow-lg`) — used only on hover and on the task sheet, never as default card elevation. Cards separate by **border**, not shadow (Linear-like calm density, spec §13.5).
- Motion: `--duration-fast 120ms`, `--duration 200ms`, ease `cubic-bezier(0.2,0.7,0.2,1)`. No celebratory/animation flourishes (spec §13.5 anti-patterns) — transitions are for hover/expand/slide only.

---

## Shell / layout

**Three-column grid**: `240px sidebar | 1fr main | 380px sidekick`. The sidekick column collapses (grid becomes `240px 1fr`) when hidden. Sidebar and sidekick are `position: sticky; height: 100vh`.

### Sidebar (`shell.jsx` → `Sidebar`)
- Brand block: 26px ink square with "H", "HCE Hub" + `hub.hce.studio` sub.
- **Hub** section: Home, Morning brief.
- **Modules** section: Projects (active) + **Sales / Support / Knowledge stubbed** with a "soon" meta and disabled styling. This is the visible expression of the module-composable shell (spec §2, §15) — the nav is not hard-wired to Projects.
- When inside a project: a contextual section (Board, Intake, Activity, Knowledge base) + member avatars.
- Footer: current user + Admin link.

### Topbar (`shell.jsx` → `Topbar`)
- Breadcrumbs (Hub / Projects / {project} / {sub}), each segment clickable.
- A centred **⌘K trigger** ("Ask the sidekick or jump to…") — presented as a control; wire it to a command palette (not built in the prototype).
- Right: notification bell (no red badge — spec §13.5), sidekick toggle.

---

## Screens / views

### 1. Hub home / Projects (`surfaces.jsx` → `ProjectsList`)
- **Purpose:** project index scoped to the user's memberships (spec §13.1).
- **Layout:** page header (title + "New project"), then a responsive card grid `repeat(auto-fill, minmax(320px, 1fr))`, then a "Recent activity" table.
- **Project card:** name + platform tag (mono, e.g. `sunrise`, `laravel-forge`), lead avatar, description, footer with event count, a tiny CSS sparkline, and a member avatar-stack. Last grid cell is a dashed "New project" affordance.
- **Activity table:** timestamp (mono) · actor avatar (or sidekick mark) · text · kind label. Sidekick-authored rows use the clay "sk" mark.

### 2. Project — Plan view (`plan.jsx` → `PlanView`) — DEFAULT project view
- **Purpose:** feature-level view of the project, in optimal working order. This is the primary planning surface.
- **Summary line:** `N features · X/Y tasks merged · [n shipped][n in flight][n planning][n blocked]` as baseline-aligned toned pills, plus an italic hint: "Sorted by status, then dependency depth — top is most ready to advance."
- **Ordering:** features are sorted by status (`shipped→in-flight→planning→blocked`) then by **dependency depth** (topological — see `planOrder()` in `plan.jsx`). The ordering is a *recommendation*, never enforced (spec §3.5, §3.6).
- **Feature row** (grid: `ord | title | owner | status+progress | chevron`):
  - Ordinal `01`, `02`… (mono, tabular-nums)
  - Feature ID (mono) + title (15px/500) + optional help-wanted pill
  - Description (13px muted)
  - Dependency chips ("depends on f-data") and, if blocked, the blocked reason in brick colour
  - Owner avatar + first name
  - **Status pill with progress stacked underneath**: a 3px bar + `merged/total · N live` in mono. (This layout was iterated specifically — progress sits *under* the status pill, not in its own column.)
  - Chevron rotates 90° when expanded
- **Expand interaction:** clicking a feature row with tasks expands an inset table (bg-sunken) with column headers (id / task / claimed by / pr / status) and one `TaskRow` per task. Rows are hover-highlighted and open the Task sheet on click. One feature (`f-intake`) is expanded by default.
- Shipped features render at `opacity: 0.78` to recede.

### 3. Project — Board view (`board.jsx` → `ProjectBoard`)
- **Purpose:** what's in flight right now, by person. Toggled from Plan via a segmented **Tabs** control ("Plan {N} | Board {N}").
- **Layout:** a grid with a sticky header row. Columns: `Owner (200px) | Available | Claimed | In PR | Merged | Backlog`, each `minmax(0, 1fr)` so widths stay identical across every lane. Column headers have a count chip and a subtitle (e.g. Available = "deps met · anyone can claim").
- **Swim lanes by person:** one row per project member (sorted by task count), lane head = large avatar + name + role + owned-feature ID chips.
- **Task card:** title (13px) as headline, then a mono ref row `f-intake · t-1`, then a meta row (claimer avatar, collision marker, PR link). **Filenames are intentionally NOT on the card** (removed as visual noise — they live in the task sheet).
  - `is-mine` cards get a 2px clay left border.
  - Cards with a soft collision get a subtle bottom gradient + a pulsing "collision" marker.
- **Column routing rule (important):** a task's *effective* column is computed, not just its raw status. A task with `status: available` but unmerged dependencies is shown in **Backlog**, not Available (see `effectiveStatus()` in `board.jsx`). Available means genuinely pullable. Unclaimed tasks route into their **feature owner's** lane (there is no separate "unclaimed" lane) — ownership stays visible; anyone can still claim (pull-not-push).
- **Collision treatment is soft and ambient** (spec §5, §13.5) — a quiet marker with a slow pulse, never a hard lock or alarm.

### 4. Intake (`intake.jsx` → `Intake`)
- **Purpose:** requirements doc → AI-proposed feature list → human approval gate (spec §4, §12).
- **Layout:** two panes side-by-side (`1fr 1fr`, full height). Left = requirements source (mono textarea, "parsed" pill). Right = proposed features.
- **Right pane:** sidekick "sk" mark header with progress ("8 drafted · N approved"), Re-run + "Approve N →" actions. A status banner explains the confidence model. Then a list of proposed feature cards: ID, title, **confidence tag** (high=sage / medium=tobacco), rationale, dependency chips, and per-card **Approve / Edit** buttons. Approving turns the card sage-tinted at reduced opacity.
- A dashed callout at the bottom models the sidekick raising a clarifying question before approval ("One question before you approve…") — the human_approval gate is a conversation, not just a button.

### 5. Morning brief (`surfaces.jsx` → `Brief`)
- **Purpose:** per-person daily brief that "reads like a thoughtful colleague's note, not a stand-up status report" (spec §13.5). This screen is the tone litmus test.
- **Layout:** single centred column, max 720px. Date eyebrow, large greeting ("Morning, Simon."), one-line summary.
- **Sections** are prose-first: *Overnight* (what changed, in sentences with inline names/code), *What you might pull* (a small list of tasks — clickable to the sheet — framed as options, "no pressure to take it"), *Soft collisions* (ambient), *Across the studio* (other projects, briefly). Ends with a quiet "Want to plan the day?" sidekick affordance and a delivery footer.
- **No counts-as-pressure, no "overdue", no streaks.** Numbers appear only as information.

### 6. Sidekick panel (`sidekick.jsx` → `Sidekick`)
- **Purpose:** persistent, project-scoped chat companion, present on every project surface (spec §6, §13.1). Same agent exposed via MCP from Claude Code.
- **Layout:** fixed 380px right column. Header (clay "sk" avatar with online dot, "Sidekick", "scoped: {project}"). Scrollable message stream. Input footer with suggestion chips, a textarea+send row, and a mono note "also available via MCP from claude code · haiku-4-5".
- **Message types:** plain bubbles (sidekick left / user right), **list cards** (recommended tasks with a "why" line — clickable to the sheet), **proposal cards** (a state change awaiting approval, with Approve / Not now — the `human_approval` gate rendered inline, spec §3.6), and **task-context cards** (compact task pill injected when the user clicks "Ask sidekick" on a task).
- Canned responses live in `SK_RESPONSES`; a real build streams from the agent.

### 7. Task detail sheet (`task-sheet.jsx` → `TaskSheet`)
- **Purpose:** full task detail without losing context. Opens from Plan rows, Board cards, the brief, and sidekick list cards.
- **Pattern (recommended for the real build):** a **side sheet + URL deep-link**, not a modal and not a separate page. It slides in from the right (`220ms` slide) over a light scrim. **Crucially, when the sidekick is open the sheet anchors to the LEFT of the sidekick column** (`right: 392px`) so you can read a task and talk to the sidekick about it at the same time — this was a specific design requirement. On narrower viewports the sheet narrows to keep both visible.
- **URL:** the prototype uses `#task=t-3`; in Next.js use a parallel/intercepting route or a `?task=` search param so the sheet is shareable and survives refresh. Copy-link and Esc-to-close are wired.
- **Contents:** header (task ID + clickable feature ref, copy-link, close), title, status + claimer + PR pill, **action row** (Claim / Open PR / Open in Claude Code / Ask sidekick — Claim is disabled with a "Blocked by deps" state when deps are unmet), description, **files in scope** ("declared, not enforced" — soft, spec §5), a two-column **dependency graph** (blocked by / blocks, each row clickable to jump to that task), an **activity timeline**, and a **sidekick notes** block with status-aware commentary.

---

## Interactions & behaviour summary

- **Plan ⇄ Board** toggle via Tabs; view is part of the route so it's linkable.
- **Feature expand/collapse** on the Plan view (chevron rotates, inset table reveals).
- **Task sheet** opens from four surfaces; deep-linked by URL; Esc / scrim closes; repositions beside the sidekick when open.
- **"Ask sidekick"** from the task sheet opens the sidekick (if closed) and injects a task-context card + a status-aware reply.
- **Sidekick proposals** always route through an Approve / Not-now gate — nothing the sidekick changes is applied silently (spec §3.6).
- **Claiming** is a pull action available from any lane; unmet-dependency tasks are visibly not-yet-available. No auto-assignment, ever (spec §3.2).
- All hover states use `--line-strong` borders and/or `--bg-tint` fills; transitions `120ms`.

## State (for the real build)
Drive everything off the Prisma models in the spec (§10): Project, ProjectMember, Feature, FeatureDependency, Task, TaskDependency, TaskClaim. Derived/UI state: current route (module / project / view / task), sidekick visibility, theme (warm/dim), density (comfortable/compact), and "viewing as" user (for the brief + is-mine highlighting). The prototype keeps these in React state + a tweaks panel; the real app gets route + auth + server data.

## Tweaks panel
`tweaks-panel.jsx` + the panel in `app.jsx` are a **prototype affordance only** (theme, density, sidekick toggle, collision toggle, viewing-as, jump-to). Do **not** ship it — but the toggles it exposes (theme, density) map to real settings.

## Assets
No image assets. Icons are a small inline-SVG set in `primitives.jsx` (`Icon`) — replace with Sunrise's existing icon library (lucide-react per shadcn). Fonts: Inter Tight + JetBrains Mono (Google Fonts). The brand mark is a CSS square with "H".

## Files in this bundle

Design source (React-via-Babel + one CSS file):
- `HCE Hub.html` — entry point; load order for all modules
- `styles.css` — **the full token set + every component style**; the source of truth for the visual system (incl. `.theme-dim`)
- `data.jsx` — sample data (people, projects, features, tasks, collisions, activity) — illustrative only
- `primitives.jsx` — `Icon`, `Avatar`, `StatusPill`, `HelpFlag`, `Kbd`
- `shell.jsx` — `Sidebar`, `Topbar`
- `plan.jsx` — `PlanView` (+ `planOrder` topological sort)
- `board.jsx` — `ProjectBoard` (+ `effectiveStatus` column routing)
- `intake.jsx` — `Intake`
- `surfaces.jsx` — `Brief`, `ProjectsList`
- `sidekick.jsx` — `Sidekick`
- `task-sheet.jsx` — `TaskSheet` (+ `useHashTask`)
- `app.jsx` — routing + composition + tweaks wiring

To view the prototype: open `HCE Hub.html` in a browser. Use the Tweaks panel (bottom-right) to jump between surfaces and toggle theme/density.

Not design sources (ignore): `app-print.jsx`, `HCE Hub-print.html`, `HCE Hub (standalone).html`, `HCE Hub-bundle-src.html`, `tweaks-panel.jsx`.
