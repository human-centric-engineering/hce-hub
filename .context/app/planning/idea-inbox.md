---
status: holding-pen
opened: 2026-08-06
parent: next-phase-brief.md
---

# HCE Hub — idea inbox (interim)

The lossless holding pen for ideas, tweaks, and bugs captured **before**
`f-idea-capture` and the `bug`-kind task exist. This is the **markdown-first
prototype of the studio idea inbox** the [[next-phase-brief]] flags as an open
fork — captured here so nothing's lost, and to be the **first real dataset** when
the machinery lands: ideas become captures (then promote-to-current-phase), bugs
become `bug`-kind tasks ([[bug-handling]]). Once migrated in, this file retires —
the same markdown→Hub move as the chubproject cutover.

**Triage key:** `phase-feature` (a real feature for this phase) · `quick-win`
(small, do soon) · `bug` (a defect → `bug`-kind task per [[bug-handling]]) ·
`park` (genuinely later).

## Captured 2026-08-06 (Simon's post-it)

1. **Add GitHub to user profiles → connect activity** · `phase-feature`
   This _is_ the deferred §14 identity mapping (`merged_by → Hub user`), and it's
   load-bearing for [[next-phase-brief#3. Onboard Sunrise as a Hub project|Sunrise-as-a-project]]
   (issues/PRs have GitHub authors). **Constraint:** don't edit Sunrise's core
   `User` — use a fork-owned satellite (`app_user_github`: `userId → githubLogin`).

2. **Add an invited user to projects before they accept** · `phase-feature`
   Pre-provision membership so a new user sees something on first login. Directly
   relevant to onboarding John.

3. **Can't log out without visiting admin** · `bug` (→ Platform feature)
   Make the username/avatar in the side nav clickable → logout. Shell-level, so it
   hangs on the standing "Platform / Maintenance" feature, not a specific feature.

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
