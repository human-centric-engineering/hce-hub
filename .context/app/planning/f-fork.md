---
name: f-fork
feature: 01 / f-fork
status: in flight        # not started | in flight | blocked | shipped
owner: Simon
opened: 2026-07-10
plan: .context/app/planning/plan.md
spec: .context/app/planning/v1-requirements.md
---

# f-fork — fork + brand + auth-only shell

*Feature 01 on [[plan]]. Binding design: [[v1-requirements]] §13.1 (public-surface stripping), §13.5 (tone); [[CUSTOMIZATION|building-on-sunrise]] §2 (branding), §6 (auth-only + removing public pages).*

## Intent

Make the fork read and behave as **HCE Hub, an internal auth-only app**: HCE brand identity in the chrome, Sunrise's stock *marketing* surfaces (landing, About) and the *embed/public-chat* product removed from the user-facing surface, and every route behind login. This is the home the rest of v1 is built in. It is deliberately *not* the theme (that's `f-theme`) or the shell (that's `f-shell`) — just enough to boot as a branded, signed-in-only Sunrise app.

## Reconciliation with current repo reality   (required — done first)

Verified against the working tree (Sunrise v0.6.0 base + fork PR #4), July 2026.

- **PR #4 already landed the identity sub-task.** `plan`'s t-1 ("initial fork setup") is **done**: `package.json` (`name: hce-hub`, `version: 0.1.0`), `NEXT_PUBLIC_APP_NAME="HCE Hub"`, the `CLAUDE.md` fork banner, `README.md`, and `.context/app/README.md` are all in. **No platform-owned files were changed.** → *So f-fork's remaining work is the auth-only strip + brand mark, not the repo setup.*
- **The `lib/app/*` scaffolds are all at Sunrise defaults** — `brand-mark.tsx` still returns `BRAND.name` as bare text; `bootstrap.ts` `initApp()` is empty; `public-nav.ts` lists are all `null`; `protected-routes.ts` is `[]`. → *PR #4 set only the app **name**; the brand **mark** and every seam are untouched and mine to fill.*
- **`.context/app/upstream.md` is redundant.** `plan`'s t-1 asked for an upstream-merge procedure doc; `.context/app/README.md` ("Pulling upstream Sunrise") already documents it. → **Decision:** don't create a separate `upstream.md`; the README section is authoritative. (One-line rationale: ship-nothing-a-fork-must-maintain-twice.)
- **"Strip public surfaces" ≠ "delete legal pages," and ≠ "delete platform API routes."** The binding spec ([[v1-requirements#13.1|§13.1]]) names exactly three things to remove: *marketing landing, public chat endpoints, embeddable widget.* The `plan` bullet's looser "marketing/legal public pages" over-reaches §13.1. Grounding each:
  - **Marketing pages** (`app/(public)/page.tsx` landing, `app/(public)/about/`) — leaf pages; deleting a page folder is a sanctioned, Next-native "keep-mine (deleted)" operation ([[CUSTOMIZATION|building-on-sunrise]] §6). Safe to strip.
  - **Legal pages** (`/privacy`, `/terms`, `/contact`) — **keep.** They're linked from **platform-owned** always-render surfaces: the cookie banner (`components/cookie-consent/cookie-banner.tsx` → `/privacy`) and the error pages (`app/error.tsx`, `app/global-error.tsx` → `/contact`). Keeping them means **zero edits to those platform files** (the alternative — delete + repoint — is exactly the merge-hostile platform edit the disciplines warn against, [[planning-retro]] B5). An internal tool still benefits from a privacy/contact page. Re-skinning their *copy* is a later, optional thin-shim job, not f-fork.
  - **Embed widget + public chat** (`app/api/v1/embed/*` — `widget.js`, `widget-config`, `embed/chat`; and `app/api/v1/chat`) — these are **platform API routes**, not leaf pages, and there is **no public chat/embed *page*** in the tree (confirmed). **Decision: leave them dormant, do not delete.** They are token/visibility-gated (embed needs an agent with embed visibility + a minted token; none will exist in the Hub) so they are inert, not an open anonymous surface. Deleting platform API infra is merge-hostile and risks breaking code that references it — and the **sidekick (`f-sidekick`) will likely reuse the consumer-chat API**, so deleting `app/api/v1/chat` now would be actively wrong. Revisit the exact chat surface in `f-sidekick`. *(Open question OQ-1 — the one item worth an owner nod, below.)*
- **Auth-only needs no `proxy.ts` edit.** [[CUSTOMIZATION|building-on-sunrise]] §6: it's folder placement + `lib/app/protected-routes.ts` + redirecting `/`. The core `protectedRoutes` (`/dashboard`, `/settings`, `/profile`) stay as Sunrise ships them. `/` is the one route the proxy can't prefix-protect → reduce `app/(public)/page.tsx` to `redirect('/dashboard')` (signed-out: `/` → `/dashboard` → `/login`). `f-shell` later reclaims `/` as the real protected Hub home; this redirect is the interim.
- **Boot/boundary hygiene is already satisfied.** `bootstrap.ts` is wired by `instrumentation.ts` (empty `initApp()` is correct — f-fork adds no boot work); the `lib/app/**` ESLint boundary ships enforced in the root config; there are no Hub env vars yet (so `env.ts` stays empty; `NEXT_PUBLIC_LEGAL_NAME` is a public env read via `lib/brand.ts`, not `appEnvSchema`). **No `app:ci-checks` script is warranted yet** — the boundary is already enforced and a leaf fork has no framework tier to check. → *So "boot + boundary hygiene" is not its own PR; it collapses into each task's Done-when as a build/boot smoke.*

**Tier / seam hypotheses (confirmed from behaviour):**
- **Tier:** pure leaf-app. Owns `lib/app/*`, `components/brand/`, `app/(public)/*` deletions, `.env`. Fills nothing in `/framework`.
- **Seams:** all **fork→core** and fork-owned (brand-mark slot, `public-nav.ts`, `protected-routes.ts`). **Zero core→fork seams. Zero upstream asks.** (Contrast Daybreak's `f-bootstrap`, which built the `initApp` core→fork seam — that work is already shipped upstream and inherited here.)

## Promoted tasks

Right-sized down from `plan`'s 4 indicative bullets to **2 PRs** (identity-setup already shipped in PR #4; boot/boundary hygiene folds into Done-when per [[planning-retro]] B1). Both depend only on the claim PR; independent, so orderable either way — strip first reads as the headline "auth-only shell."

| ID  | Task | Files | Deps | Done-when | Status | PR |
|-----|------|-------|------|-----------|--------|----|
| t-1 | **Auth-only shell** — delete `app/(public)/about/`; reduce `app/(public)/page.tsx` landing to `redirect('/dashboard')`; keep `/privacy` `/terms` `/contact` + `(public)/layout.tsx` (legal, no platform-link edits); register nothing new in `protected-routes.ts` yet (no new section exists — `/dashboard` is already core-protected); leave embed/chat API routes dormant (OQ-1). | `app/(public)/page.tsx`, `app/(public)/about/` (del), `lib/app/protected-routes.ts` (confirm empty ok) | — | signed-out visitor is bounced to `/login` from `/` and every route; no marketing landing/About reachable; `/privacy` `/contact` still resolve (banner/error links don't 404); build + boot green signed-in; `lib/app/**` boundary green; `/pre-pr` → `/security-review` → `/code-review` green | available | — |
| t-2 | **HCE brand identity** — `brand-mark.tsx` → an HCE "H" mark (simple styled square/wordmark, neutral pre-theme — `f-theme` refines tokens); `public-nav.ts` curated for an internal app (drop the marketing header nav — set `publicNavItems` to an internal-appropriate list or `[]`; footer legal cluster left to platform default so Cookie Preferences + kept legal links still render); set `NEXT_PUBLIC_LEGAL_NAME` in `.env*`. | `components/brand/brand-mark.tsx`, `lib/app/public-nav.ts`, `.env.example`/`.env.local` | — | header/footer read "HCE Hub" with the H mark; `BRAND.name` remains the `alt`/`aria-label`; footer copyright attributes to `NEXT_PUBLIC_LEGAL_NAME`; no marketing nav on the auth/legal chrome; gates green | backlog | — |

*Standing steps in every Done-when:* gates before the PR opens (`/pre-pr`, `/security-review`, `/code-review`); `npm run format && npm run format:check` before push; open PRs with `gh pr create --repo human-centric-engineering/hce-hub` (bare `gh` targets Sunrise upstream).

## Test strategy

f-fork is deletion + config + one redirect + one presentational component — thin test surface, no new DB, no new API logic.
- **Rely on `/pre-pr`** (type-check, lint, format, full existing suite + coverage, drift) as the floor — deletions/redirects must not regress it.
- **`BrandMark`** gets a light render test only *if* it grows conditional logic (dark/light variants); a bare mark needs none — a snapshot adds brittleness without signal.
- **The load-bearing check is a manual/boot smoke, not a unit test:** signed-out `/` and a protected path both redirect to `/login`; `/privacy` and `/contact` still resolve. (vitest = happy-dom, no live DB — no route-level auth integration test belongs here.)

## Open questions

- **Resolved inline:**
  - *Delete legal pages?* → **No, keep `/privacy` `/terms` `/contact`.** §13.1 only mandates removing marketing + chat + embed; keeping legal avoids editing the platform cookie-banner/error files ([[planning-retro]] B5). Re-skin copy later via thin-shim if wanted.
  - *Separate `upstream.md`?* → **No** — `.context/app/README.md` already carries it.
  - *`app:ci-checks` now?* → **No** — boundary already enforced; nothing leaf-specific to check yet.
  - *Redirect `/` vs move it protected?* → **Redirect to `/dashboard`** for now; `f-shell` reclaims `/` as the real Hub home.
- **OQ-1 — RESOLVED (owner, 2026-07-10): leave embed + public chat dormant, don't delete.** They're gated/inert (no embed-enabled agent will exist), deleting platform API infra is merge-hostile, and `f-sidekick` will likely reuse consumer-chat. "Removed from the surface" = not mounted/enabled, not files deleted. → t-1 makes **no** change to `app/api/v1/embed/*` or `app/api/v1/chat`.

## Upstream follow-ups / seam ledger

**None.** f-fork touches no core→fork seam and files no upstream issue — pure leaf-app work through fork-owned scaffolds + sanctioned leaf-page deletions. (If OQ-1 is resolved as hard-delete, that's still leaf deletions + `app/api/v1` platform-file deletions — a keep-mine-deleted merge cost, not an upstream ask.)

## Decisions log   (append-only, newest first)

- **2026-07-10 — OQ-1 resolved by owner: embed/public-chat stay dormant, not deleted.** t-1 makes no change to `app/api/v1/embed/*` or `app/api/v1/chat`; the exact sidekick chat surface is settled in `f-sidekick`.
- **2026-07-10 — Right-sized f-fork to 2 PRs.** PR #4 shipped the identity sub-task; boot/boundary hygiene is already satisfied by the scaffolds → folds into Done-when. Remaining = auth-only strip (t-1) + brand identity (t-2).
- **2026-07-10 — Keep the legal pages; leave embed/chat dormant.** Grounded in §13.1 (which mandates removing only marketing + chat + embed) + the B5 "don't edit platform-owned files" discipline. The only owner-facing call is OQ-1 (dormant vs delete embed/chat).
- **2026-07-10 — Auth-only via folder placement + `/` redirect, no `proxy.ts` edit** ([[CUSTOMIZATION|building-on-sunrise]] §6). `f-shell` reclaims `/` later.
