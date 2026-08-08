---
status: holding-pen
opened: 2026-08-06
parent: next-phase-brief.md
---

# HCE Hub — idea inbox (interim)

The lossless holding pen for ideas, tweaks, and bugs captured **before**
`f-idea-capture` and the `bug`-kind task exist. This is the **markdown-first
prototype of the studio idea inbox** the [next-phase-brief](./next-phase-brief.md) flags as an open
fork — captured here so nothing's lost, and to be the **first real dataset** when
the machinery lands: ideas become captures (then promote-to-current-phase), bugs
become `bug`-kind tasks ([bug-handling](./bug-handling.md)). Once migrated in, this file retires —
the same markdown→Hub move as the chubproject cutover.

**Triage key:** `phase-feature` (a real feature for this phase) · `quick-win`
(small, do soon) · `bug` (a defect → `bug`-kind task per [bug-handling](./bug-handling.md)) ·
`park` (genuinely later).

## Captured 2026-08-06 (Simon's post-it)

1. **Add GitHub to user profiles → connect activity** · `phase-feature`
   This _is_ the deferred §14 identity mapping (`merged_by → Hub user`), and it's
   load-bearing for [Sunrise-as-a-project](./next-phase-brief.md#3-onboard-sunrise-as-a-hub-project)
   (issues/PRs have GitHub authors). **Constraint:** don't edit Sunrise's core
   `User` — use a fork-owned satellite (`app_user_github`: `userId → githubLogin`).

2. **Add an invited user to projects before they accept** · `phase-feature`
   Pre-provision membership so a new user sees something on first login. Directly
   relevant to onboarding John.

3. **Can't log out without visiting admin** · `bug` (→ Platform feature)
   Make the username/avatar in the side nav clickable → **logout + a link to
   `/profile` (and `/settings`)** (owner, 2026-08-06). Shell-level, so it hangs on
   the standing "Platform / Maintenance" feature. The profile link and
   `f-github-identity` share the existing `/profile` surface.

4. **Add Daybreak to host-platform options** · `quick-win`
   One option in the new-project form's platform list (`hostPlatform`).

5. **Activity-log decisions saved as markdown, not rendered** · `bug` (→ `f-journal`)
   Reuse the existing safe renderer (`components/hub/markdown.tsx`, from §21) in the
   log view. A clean `bug`-kind task on `f-journal`.

6. **Board "merged" column: cap 5/person + per-person show-more** · `phase-feature` / fold
   Real UX gap (48 merged tasks bury everyone). Fold into `f-phases` if it reworks
   the board, else a small standalone.

**Note:** none of these are futures-level `park` items — it's near-term concrete
work, so the dogfood value is mostly in the **capture → promote-to-current-phase**
flow, plus two `bug`-kind tasks. Timing call still open (owner): fix bugs #3/#5 as
a quick standalone PR now, or hold them as the first captures once the machinery
lands. Low priority either way (single-user for now).

## Captured 2026-08-06 (engineering — deferred code-review findings)

Debt surfaced by `/code-review` and consciously **not** fixed in the PR that found
it (rationale in each PR's follow-up commit). Parked here so the deferral is a
tracked decision, not a lost commit-body line. These are `bug`-kind tasks on the
feature they belong to once [bug-handling](./bug-handling.md) lands.

7. **`read_only` project role would silently gain write** · `park` (security-adjacent) · from PR #107 (f-phases t1)
   Member-tier Hub write verbs (`create_phase`, `update_phase`, `create_feature`, …)
   gate on `canAccessProject` returning any membership (`basis !== null`), not on a
   `contribute` tier. `ProjectRole` reserves `read_only` (`app.prisma`) but never
   issues it, so there's no exposure **today** — but the day a `read_only` member row
   exists, that user can write. Fix belongs in **`canAccessProject`** (one funnel,
   all callers — not per-capability) at the same time `read_only` is actually
   introduced; doing it per-verb now would be inconsistent and wouldn't even close it
   (the funnel passes any member for `contribute`). Gate: introducing `read_only`.

8. **Phase-delete race in `update_feature` → generic error, not `invalid_phase`** · `quick-win` · from PR #107 (f-phases t1)
   `update_feature`'s `phaseId` (and its existing `dependsOnFeatureIds`) validate
   existence with a `findFirst`/`findMany` *before* the transactional write, so a row
   deleted in the window throws Prisma `P2025` out of `execute()` instead of the clean
   `invalid_phase` / `invalid_dependency` result. Rare and non-harmful (a worse error
   message on a delete-race), and consistent across both fields — so the fix is a
   **central `P2025` → friendly-capability-error** helper covering both, not a
   phase-only patch.

9. **A feature stays `in_flight` when all its tasks are `merged` — no auto-close** · `enhancement` · from f-phases close-out
   A feature doesn't transition to `shipped` when its last task merges; `ship_feature`
   is a manual, deliberate close-out (it writes the ship narrative). Owner noted it
   "should automatically close." Recommendation: surface a **"shippable" signal /
   prompt** — a derived "all tasks merged, ready to ship" state (e.g. in `next_task`
   or a dashboard list, or a soft nudge) — rather than silently auto-shipping, which
   would skip the narrative. The narrative is the point of the manual step, so
   assist the close-out, don't remove it.
