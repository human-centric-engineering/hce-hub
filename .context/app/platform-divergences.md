# Platform-divergence ledger

Every place HCE Hub has **edited a Sunrise-owned (platform) file** — the "keep-mine"
edits that can conflict when we `git merge vX.Y.Z` from upstream — plus any
**upstream asks** (fork-first seams awaiting an upstream issue/landing).

This is the fork's honest record of where it has stepped outside the designed seams.
It lives under `.context/app/` (fork-owned; Sunrise never writes here), so the ledger
itself never conflicts. Keep it current: **when you edit a platform-owned file, add a
row here in the same PR** — otherwise the edit is rediscovered (and maybe clobbered) at
the next upstream merge.

> **Not everything belongs here.** Editing a **fork-owned `lib/app/*` scaffold** (e.g.
> filling `lib/app/eslint.config.mjs`, `lib/app/public-nav.ts`, `lib/app/capabilities.ts`)
> is _not_ a divergence — those ship empty precisely to be filled and merge cleanly. Only
> log edits to files Sunrise **owns and keeps evolving** (core `lib/`, `app/api/v1`, core
> `components/`, `proxy.ts`, root config, platform tests, migration SQL, `CLAUDE.md` below
> the banner, etc.). See [`README.md`](./README.md) for the full ownership boundary.

## How to read a row

- **File** — the platform-owned path we edited.
- **Change** — what we did, minimally.
- **Why** — the forcing reason (usually: a fork-owned seam we filled has a downstream
  effect a platform file asserts/renders).
- **Merge action** — what to do when this file conflicts on an upstream sync.
- **Upstream** — `none` (fork-owned forever, no upstream change wanted) · `worth-noting`
  (a low-priority DX note to file once we can point to the pattern) · `issue #N` (filed) ·
  `landed vX.Y.Z` (delete this row).

---

## Carried edits to platform-owned files

| #   | File                                  | Change                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                | Merge action                                                                                                                                                                                  | Upstream                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tests/unit/lib/app/defaults.test.ts` | The `appEslintConfig` assertion now expects the fork's one intentional block (`[{ ignores: ['.context/app/planning/**'] }]`) instead of `[]`. | We filled the fork-owned `lib/app/eslint.config.mjs` seam to un-lint the design-handoff prototype `.jsx`. The Sunrise test asserts every `lib/app/*` seam ships **empty** — a vanilla-Sunrise self-guard that a fork necessarily diverges from the moment it fills a seam. The edit preserves the guard: any _stray additional_ block still fails. | Keep-mine on this assertion; take any upstream additions to the _other_ assertions. This file will diverge further as v1 fills more seams (public-nav next, capabilities, admin-nav, emails). | `worth-noting` — once 2–3 seams are filled (f-fork t-2, f-hub-capabilities), file a low-priority DX note: the header should say forks are expected to update these assertions, and/or split the pure-invariant assertions (those that survive filling) from the content/effect ones. Non-blocking. |
| 2   | `.prettierignore`                     | Appended a fork-owned block ignoring `.context/app/planning/`.                                                                                | The design handoff bundles prototype `.jsx`/`.css`/`.html` and the planning markdown uses column-aligned Obsidian tables/wikilinks Prettier collapses — authoring material with no build impact.                                                                                                                                                   | Keep-mine (an append at end). The file already establishes this pattern (remediation-ledger, `settings.local.json`), so upstream edits are additive too — conflict risk is low.               | `none` — fork-specific path; Sunrise has no reason to ignore it.                                                                                                                                                                                                                                   |

## Upstream asks (fork-first seams)

Fork-carried generic seams added _into_ a core file, awaiting an upstream issue + landing
(the `[[upstream-asks]]` concept from the feature-plan guide §8). Each row: seam file ·
upstream issue · owning feature · delete-when-it-lands action · status.

_None yet._ The v1 plan's tier analysis found **zero core→fork seams / zero upstream
gating** — the Hub builds entirely through existing fork-owned `lib/app/*` seams. If a
feature surfaces a genuine core-seam gap at build (the two watch-items — theme sync-seam,
per-project agent provisioning — _might_), record it here and make filing the issue that
feature's own Done-when.

---

## Changelog

- **2026-07-11** — Ledger created (PR #5, the planning + f-fork-claim docs PR). Seeded with
  the two edits that PR carried: the `defaults.test.ts` eslint assertion and the
  `.prettierignore` append.
