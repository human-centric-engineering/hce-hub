# Withdrawing a task

Not every task should be finished. A task can be **mis-filed**, a **duplicate**, a
**smoke artefact**, **superseded** before anyone started it, or simply created by an
agent that misread an instruction. None of those are "completed" — and until
`withdraw_task` there was no way to say so.

The gap had teeth. [f-authoring-fidelity](./planning/f-authoring-fidelity.md)'s own
rule is that the MCP verbs are how the record gets corrected **from the Hub, never
the DB**, and yet three `SMOKE t-107` tasks on dev had to be removed with a raw
`DELETE` — the one act that rule forbids. `complete_task` was never the alternative:
it claims the work landed, which is a lie that also lands the task in the Merged
column and inside its feature's completion count.

## The model — an instant, not a status

Withdrawal is `Task.withdrawnAt`, a nullable timestamp. It is **not** a
`TaskStatus` value, and that is a deliberate choice with four consequences:

- It matches the shipped siblings — `Task.mergedAt`, `Feature.shippedAt`,
  `Phase.completedAt`, `TaskClaim.releasedAt`.
- It keeps [the status model](./planning/f-status-model.md)'s architecture intact:
  the stored enum is **data**, and overlays are **derived**. `blocked` was the first
  computed-only status; `withdrawn` is the second.
- **Restore is free.** Null the column and the prior effective status re-derives
  itself — `claimed`, `active` or `blocked`, whichever it was. A stored status value
  would have had to remember what it displaced.
- It records **when**, which a status cannot.

`EffectiveStatus` therefore gains `withdrawn`, computed in `computeEffectiveStatus`
(`lib/projects/task-status.ts`) like every other read.

**`t-N` is never freed or reused.** The number stays with the withdrawn row, so
journal entries and PR descriptions that name it keep pointing at something real.

## Where withdrawn work goes

| Surface                   | Withdrawn work                                              |
| ------------------------- | ----------------------------------------------------------- |
| Plan, Board, feature page | **gone** — excluded in the query                            |
| `next_task`               | **never offered** — excluded in the query                   |
| `computeFeatureProgress`  | **not counted**, in any of its seven counters               |
| active-bugs strip         | **gone** (it reads the same excluded set)                   |
| soft-collision warnings   | **silenced**, its own and everyone else's — see below       |
| `list_tasks`              | hidden **unless** you pass `status: 'withdrawn'`            |
| `get_task`                | **always readable**                                         |
| project journal           | **permanent** — `task_withdrawn` + the reason in `metadata` |

The last three are what keep a withdrawal reversible: you cannot restore a task you
can no longer name. This mirrors `IdeaStatus.dropped`, which `list_ideas` returns and
calls the reversible archive.

The exclusion is done in the **query**, not after the fact, for a specific reason:
`computeFeatureProgress`'s `unstartedSinceShip` is derived _negatively_ ("whatever
`live`/`blocked` don't already show"), so a withdrawn post-ship task that reached it
would be counted as **new**. Dropping the row before it arrives is what makes that
safe. See [work kinds](./work-kinds.md).

## The rules

**A merged task can never be withdrawn.** It is history and it has a PR;
`withdraw_task` refuses with `already_merged`. A merged task _can_ still be
**restored**, so a task withdrawn and then completed out-of-band isn't stuck.

**An already-`active` task can be.** Withdrawing is a decision about whether the work
should happen at all, which is not the same question as whether someone has started
it. (Contrast `blocked`, which deliberately never displaces `active`.)

**A withdrawn dependency stops blocking.** It can never reach `merged` — that is what
withdrawing it means — so treating it as outstanding would leave every dependent
permanently blocked, with deleting the edge as the only escape. Because that is a
decision with downstream reach, `withdraw_task` returns the **unmerged tasks that
depended on it** in `affectedDependents`. Advisory, never a refusal — the Hub does
not block a write — but it is the one consequence you cannot see from the task in
front of you.

**Withdrawing does not release the task's `TaskClaim`.** That is deliberate — leaving
the stored status _and_ the claim untouched is exactly what makes restore free — but
it has a consequence worth stating: an `active` task that is withdrawn still holds an
open claim. So the two soft-collision readers (`board.ts` and `task-detail.ts`)
exclude withdrawn tasks from the claim query, or that claim would go on warning
everyone else off its files indefinitely, for work nobody will ever do.

The sheet also stops warning about the withdrawn task's _own_ file overlaps, joining
`merged` and `blocked` as a third silence: "be careful of these files" adds nothing
to "this work is not happening". Unlike those two it is the strongest can't-start
signal of the set. See [soft collisions](./soft-collisions.md).

**Owner tier**, matching `update_task`: the feature's owner or a project lead. A
non-member is `not_found` (never `forbidden` — no enumeration); a member who isn't
the owner is `forbidden`.

## The verb

```
withdraw_task { taskId, reason?, restore?, projectId? }
  → { taskId, number, withdrawn, affectedDependents }
```

`reason` is free text and goes to the **journal**, not the admin audit log — the
journal is project-scoped and access-controlled, and a reason can name a person or a
customer. The capability declares `processesPii = true` for the same reason, and
redacts the reason to a length in its provenance record.

Both directions journal one `ProjectEventKind.task_withdrawn`, with `restored` in the
metadata — the `task_assigned` precedent (one kind, two moves, read the metadata)
rather than spending an enum value per direction.

**Where the reason is actually readable:** `list_events` returns `metadata`, so an
agent reading the journal sees it. The Log UI renders the verb only — "withdrew the
task" / "restored the task" — because event metadata is not rendered for _any_
auto-kind (`task_assigned` behaves identically). Fine while this is an MCP-first
verb; worth revisiting if the Log ever becomes where people look for the why.

Idempotent both ways: withdrawing a withdrawn task, or restoring a live one, is a
no-op that still reports the dependents.

## Not covered

**Features.** They already have somewhere to go — a phase with
`PhaseStatus.parked` — and tasks had nothing. That asymmetry is the whole reason this
is task-only. If a mis-created feature ever needs removing, the shape here is settled
to copy.

**Hard delete.** `ProjectEvent.taskId` is a soft pointer with no FK, so removing the
row strands journal entries; and the `t-N` counter would gain reusable gaps. Both
[idea #23 and #25](./idea-capture.md) reached the same conclusion independently.

**A UI control.** MCP-first, following §21's own precedent for `update_task`. The
agent path is where mis-filed work is created, so it is where the correction belongs
first.
