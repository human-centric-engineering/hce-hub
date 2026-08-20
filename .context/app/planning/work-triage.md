---
status: convention
opened: 2026-08-13
parent: bug-handling.md
---

# HCE Hub — work triage

How the Hub handles the **stage after the first build** — test, use, improve,
iterate — where work arrives one signal at a time instead of decomposing from a
spec. Settled 2026-08-13. Extends [bug-handling](./bug-handling.md) from defects
to the whole intake; built as §32 `f-work-kinds` and §33 `f-phase-history`.

The guiding aim is unchanged: keep work _in the flow_ and easy to prioritise
without importing Jira. Nothing here adds ceremony to a one-PR change.

## Why this exists

The v1 flow is **plan-driven**: a spec decomposes top-down into Phase → Feature →
Task and you execute the tree. That works because at plan time you roughly know
the shape of the whole thing.

The stage after it is **signal-driven**: work arrives one item at a time, from
use, in no particular order, at unknown size. You cannot decompose it up front
because you do not know what is coming. What you need instead is a **funnel** — a
cheap intake, a triage step that classifies, and a small number of destinations.

This is how HCE builds generally: an initial idea/spec, get the base in, then
move forward organically by finding the gaps. Phase 2 is the worked example — it
was declared as "the things needed for Sunrise management" and became the
machinery for managing product development, with idea jots appearing as a concept
halfway through. That drift is the stage working correctly, not a planning miss.

## The model in one line

**An improvement is an `enhancement`-kind Task on the feature that owns the
surface** — the same shape as a bug, differing only in what it says about the
parent and in whether a phase chose it.

## The diagnosis that got here

`Task.kind` welded together two independent facts:

1. **What the work is** — defect vs. change. A _provenance_ fact.
2. **Whether it counts toward the parent's completion** — an _accounting_ fact.

So a task-sized improvement on a shipped feature had to be filed as `bug` to
avoid denting its progress bar, falsifying the provenance the model is built on
("you can see which shipped work is generating defects"). The vocabulary had
already cracked in practice — [idea-inbox](./idea-inbox.md) item 9 was tagged
`enhancement`, a key that doesn't exist in that doc's own triage vocabulary.

**The fix separated them at the ship boundary rather than adding a second carve-out.**
A feature's completion is a historical fact sealed at `ship_feature`, not a live
ratio, so `computeFeatureProgress` counts only pre-ship tasks. Any post-ship task
is off the completion axis regardless of kind, and future kinds behave correctly
for free. `kind` is then purely descriptive — the enum's "every value earns code"
rule becomes "every value earns **rendering and filtering**".

## Triage — two orthogonal questions

At triage, ask two questions that do **not** depend on each other. Fusing them is
the mistake the old single `kind` enum encoded.

|                | one PR → **Task**                            | a capability → **Feature**                 |
| -------------- | -------------------------------------------- | ------------------------------------------ |
| **defect**     | `bug` on the feature that broke               | rare — usually means it was under-scoped   |
| **change**     | `enhancement` on the feature that owns it     | Feature: active phase, or the Ideas Park   |

Then a third question, only if it's a Task: **which feature?**

### Q1 · Defect or change — provenance only

This no longer decides anything about completion. It records what the work says
about its parent, and drives the `next_task` bias (`bug` is preferred among
equally-ready tasks; `enhancement` sits at normal weight — a third tier would be
priority-creep, and the Hub has no priority field by design).

### Q2 · Task or feature — size, never kind

**This is the same gate as everywhere else** (HB1 / HB3 — separability of value,
not line count), and it is emphatically _not_ bug-vs-enhancement. The three
reasons [bug-handling](./bug-handling.md) gives for a bug being a Task rather than
a Feature — ownership with context, provenance, phase-independence — apply to an
improvement verbatim.

- **One PR on a surface an existing feature owns** → a Task on that feature.
- **Needs its own owner, dependency edges, or a ship narrative** → a Feature.

A Feature carries ceremony a one-PR change doesn't want. Don't create a tiny
feature per idea.

### Q3 · Which feature — causation, not location

> **A task hangs on the feature whose change caused it — the one you would revert
> or amend to fix it. Not the surface it is visible on.**

The tell is that "which surface?" has no answer for a defect that straddles two,
whereas _"what would I revert?"_ always does. Applied:

- A new feature's behaviour misfires on an older feature's surface → it belongs to
  the **new** feature. The older surface is where you _see_ it, not what broke.
- A pre-existing defect that the new work merely exposed → the **older** feature.
- Genuinely ambiguous → **the newer feature owns it.** It altered a working
  system, and its owner has the freshest context. Same instinct as `git bisect`.

**This is a filing convention with a cheap undo, not a modelling problem.**
`Task.featureId` is one FK, phase lives on the _feature_ so nothing moves, and
mis-filing is a single reassign. The rule needs to be fast, not perfect — don't
let it become a deliberation.

**Cross-cutting / orphan work** that belongs to no single feature hangs on the
standing **"Platform / Maintenance"** feature — adopted on demand, never
`ship_feature`d. (Not yet created in this project as of 2026-08-13; nothing has
needed it.)

## Chosen vs. unchosen — the line that settles rendering

> **The active-fixes strip is for _unchosen_ work. The phase band is for _chosen_
> work.**

A bug is **reactive** — it arrives and demands fixing regardless of the phase, and
no phase committed to it. An enhancement is **chosen** — scoped into a phase by a
decision, and that decision is real planning information.

`Task.phaseId` records it: a nullable **commitment marker** meaning _the phase
that chose to do this work_, when that differs from its feature's phase. Null =
inherit (today's behaviour exactly), so the field is inert at rest.

| kind           | default        | why                                                     |
| -------------- | -------------- | ------------------------------------------------------- |
| `feature_work` | null           | committed via its feature; that phase is the answer      |
| `bug`          | null           | reactive; surfaces on the active-fixes strip             |
| `enhancement`  | **set**        | setting it _is_ the act of choosing it into the phase    |

It generalises: this marks chosen work regardless of kind. A bug you deliberately
scope into a phase gets committed the same way — that's just not the default.

**It does not weaken the no-rewrite guarantee.** A feature's phase is still solely
`Feature.phaseId`; task phase never propagates upward, so a feature still cannot be
dragged forward by its tasks. What changed is the mechanism ("there is no field"
→ "the field exists and doesn't propagate"), not the property.

**Rendering:** a committed task appears **inline in its phase band, in readiness
order**, distinguished by kind tag and origin breadcrumb — never as a trailing
sub-band, because an enhancement can be a blocker for a feature new to the phase
and `planOrder()` would sort it below the thing it blocks. The relationship
renders at **both ends**: the phase shows the borrow, and the origin feature shows
"N tasks committed to \<phase\>", so a feature owner is never blind to work
happening on their feature.

## The funnel

**1 · Capture** — everything enters as an untyped `Idea`
([idea-capture](../idea-capture.md)): bug, improvement, half-thought alike. **Do
not triage at capture time.** Capture is pre-commitment; triaging mid-flow defeats
the parking gesture.

**2 · Triage** — the three questions above.

**3 · Destinations** — five, all already built:

- a Task on an existing feature (`bug` or `enhancement`)
- a Task on the standing Platform / Maintenance feature
- a Feature in the active phase
- a Feature in the Ideas Park (parked — shaped, waiting on appetite not clarity)
- dropped (reversible archive; **never deleted**)

A sixth outcome is not a destination but an act: a **deferred decision** — real,
decided, with a named trigger — belongs in the journal via `record_decision`, not
in the inbox pretending to be work.

**4 · Pull** — `next_task` biases bugs up among equally-ready tasks. Pulled, never
pushed.

## Cadence

Triage at a boundary, not continuously: **phase open, feature close-out, or when
the inbox crosses ~10.** The failure mode isn't mis-filing, it's items quietly
never being filed — `idea-inbox.md` #3 (no logout affordance) sat in a markdown
holding pen for a week after `f-idea-capture` shipped, in a file whose own header
said it would retire once the machinery landed.

## Phases carry intent

A phase states **what it is for, and what would make it complete.** A convention,
deliberately not a phase-level `doneWhen`: Phase serves three semantics from one
model (epic / release band / idea park), and a completion contract is nonsense for a
park. A field meaningful in one of three modes is a field left blank. Promote it to a
real field only if two or three phases prove the convention too weak — the same
defer-until-it-earns-it discipline applied to the `Issue` and `Release` models.

**The convention lives on `Phase.summary`** since §33-sweep t-104 — one plain line,
which is what the Plan band renders and the only intent the manage dialog edits
(*"the summary IS the intent"*, owner, 2026-08-20). `Phase.description` still holds
the long-form detail the Hub's own phases accumulated — completion conditions,
sequencing decisions — and is still writable over `update_phase`, but has no UI
writer and no reader beyond the band's `summary ?? description` fallback until §37
`f-phase-page`. See [phases](../phases.md).

Phase membership changes, renames and status changes are **journalled** (§33), so
a move appends rather than overwrites. That is what makes re-scoping a phase
mid-flight safe — the answer to "this rewrites history" is to give it a history to
write to, not to restrict the move.

## Not (yet) here

- **A first-class `Issue` / `Bug` model** — still deferred to its named trigger:
  onboarding Sunrise's real GitHub issues ([bug-handling](./bug-handling.md)).
  Now the concern of the **Sunrise Management** phase.
- **A priority field** — priority is a `next_task` bias; `help-wanted` is the
  escape valve.
- **Auto-ship on last-task-merge** — dropped, not deferred. `ship_feature` is
  where the close-out thinking and its decisions happen; see the project journal.
- **A phase-aware `next_task` bias** — favouring the active phase becomes more
  attractive once tasks carry commitments; a separate decision about pull
  behaviour ([futures](./futures.md)).
