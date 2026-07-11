# HCE Hub — fork playbook

**HCE Hub** is HCE Venture Studio's AI-native internal ops platform, built as a
**leaf-app fork** of [Sunrise](https://github.com/human-centric-engineering/sunrise).
This directory (`.context/app/`) is HCE Hub's own documentation tree — Sunrise
reserves it and never writes to it, so nothing here ever conflicts on an upstream
merge.

> This file is the fork's operating manual. The `CLAUDE.md` banner is the short
> version; this is the long version.

## The fork model

- **Independent repo, shared history.** HCE Hub is its own repository
  (`human-centric-engineering/hce-hub`) that shares Sunrise's full git history.
  It was forked at Sunrise **v0.6.0** (`ca622752`).
- **Remotes.** `origin` = HCE Hub, `upstream` = Sunrise. HCE Hub keeps its own
  tag namespace; Sunrise's tags are not pushed to `origin`.
- **Two tiers: Sunrise → app.** HCE Hub lives entirely in the reserved **`/app`**
  tier. The middle **`/framework`** tier is for framework-layer forks (e.g.
  Daybreak); HCE Hub does not use it.

## Ownership boundary

**HCE Hub-owned (edit freely):**

| Surface                                         | Notes                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lib/app/*`                                     | Fork-owned scaffolds Sunrise ships empty. Register into Sunrise's seams from here, driven by `initApp()`.               |
| `prisma/schema/app.prisma` + `app_…` migrations | Your models; migrations must touch only `app_*` tables.                                                                 |
| `.context/app/`                                 | This tree — HCE Hub's own docs.                                                                                         |
| `app/brand-theme.css`                           | Per-surface theming.                                                                                                    |
| Identity                                        | `package.json`, `README.md`, `CUSTOMIZATION.md`, `.env*`, brand env (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_LEGAL_NAME`). |
| New app files anywhere                          | Pages, API routes, `components/`.                                                                                       |

**Sunrise-owned (do NOT edit — extend through a seam):** core `lib/`, core
`app/api/v1`, core `components/`, `proxy.ts` + `lib/security/**`,
`lib/sunrise-version.ts`, `VERSIONING.md`, `CHANGELOG.md`, and `.context/**`
except `.context/app/`, plus the SQL of any Sunrise migration. If you must change
platform behaviour and no seam exists, keep the edit minimal (a one-line "keep
mine" is a cheap merge; a rewritten platform file is not) and file a follow-up to
add the seam upstream. **Every such edit gets a row in
[`platform-divergences.md`](./platform-divergences.md)** — the ledger of carried
platform-file edits (and any fork-first upstream asks), so they're reconciled at
merge time rather than rediscovered.

## The seams HCE Hub builds on

The v1 build leans on the orchestration layer and the `CapabilityContext.scope`
carrier that Sunrise 0.6.0 finished wiring across every dispatch site. The
fork-owned registration points:

- `lib/app/capabilities.ts` → `initAppCapabilities()` — register custom
  capabilities (project lookup, GitHub reconcile, per-user brief, …).
- `lib/app/context-contributors.ts` → `initAppContextContributors()` — inject
  per-turn `LOCKED CONTEXT` for a project sidekick.
- `lib/app/knowledge-access-contributors.ts` → widen a restricted agent's
  document set from a fork-owned relationship (per-project RAG grants).
- `lib/app/bootstrap.ts` → `initApp()` — one-time server boot (cron dispatchers,
  workers).
- `lib/app/protected-routes.ts` / `lib/app/public-nav.ts` / `lib/app/admin-nav.ts`
  — route protection + navigation.
- Inbound adapter registry — a GitHub webhook adapter whose `normalise()` derives
  `scope` (e.g. `{ projectId }`) from the verified payload.

Scope is a generic string map in core (`Record<string, string>`); HCE Hub maps it
to `{ projectId, … }`. Core never names a scope key.

## Version model

`package.json.version` is **HCE Hub's** app version (surfaced via
`lib/app-version.ts` → `/api/health` `version`), starting at `0.1.0`.
`lib/sunrise-version.ts` is the **Sunrise platform** version HCE Hub forked from —
merged through on upstream syncs, never edited directly. HCE Hub's own changelog,
when it releases, is a separate `CHANGELOG.hce-hub.md`, never Sunrise's
`CHANGELOG.md`.

## Pulling upstream Sunrise

Sunrise is the `upstream` remote. To adopt a release:

```bash
git fetch upstream --tags
git merge vX.Y.Z            # ordinary 3-way merge; keep-mine on any platform-file conflict
npm ci
npm run db:migrate:status  # then db:migrate:dev to apply newly-merged Sunrise migrations
```

## What v1 is

**Module 1 — Project Coordination:** Project / Feature / Task models
(`app_*` tables), a project-scoped sidekick agent reachable from web chat + MCP +
workflows, an intake workflow with `human_approval`, a GitHub PR-merged →
reconcile webhook, and a per-user morning brief. Deployed internally at
`hub.hce.studio`. Detailed requirements live outside the repo (studio Obsidian
vault); build-plan docs land under `.context/app/` as work starts.
