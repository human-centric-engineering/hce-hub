# Soft collisions

Two people can work overlapping ground in the Hub. Nothing locks a task
([v1-requirements](./planning/v1-requirements.md) §5, pull-not-push) — instead the
surfaces you read before and while you work **warn** you that someone else's open
claim touches the files you are about to touch, and leave the decision to you.

> A soft collision is a **signal, never a block**. Nothing it says prevents any
> action: you can start, claim, or reassign straight through one. A false positive
> costs a warning; a false negative costs silence.

## What it compares

Every task can declare a `filesScope` — the paths it expects to touch — at planning
time (`plan_feature`), at creation (`create_task`), or later (`update_task`). It is
a hint, not enforced: nothing checks it against the diff.

An entry is a repo-relative path, optionally ending in a `/**` or `/*` wildcard
meaning "everything under here". Two entries overlap when, after the wildcard is
normalised away, they are the same path or one is a directory prefix of the other:

| A                                  | B                                              | Overlap |
| ---------------------------------- | ---------------------------------------------- | ------- |
| `components/hub/projects/board/**` | `components/hub/projects/board/board-view.tsx` | ✓       |
| `components/hub/projects/**`       | `components/hub/projects/board/**`             | ✓       |
| `components/hub/projects/board`    | `components/hub/projects/board/board-view.tsx` | ✓       |
| `components/hub/projects/board/**` | `components/hub/projects/plan/**`              | ✗       |
| `lib/user/**`                      | `lib/users/**`                                 | ✗       |

Deliberately simple, and deliberately not a glob engine
([`lib/projects/collision.ts`](../../lib/projects/collision.ts)):

- **Only a trailing `*` or `**` segment is stripped.** A partial pattern like
  `lib/*.ts` is left intact and matches only itself. Guessing at it could quietly
  mean "all of `lib`", and silence is the cheaper failure.
- **Brackets and parentheses are literal.** Next.js dynamic segments (`[id]`) and
  route groups (`(hub)`) are real directory names here, and are the commonest shape
  in the Hub's own scopes. Nothing expands them.

Until §33-sweep t-114 the comparison was literal, so a `dir/**` entry matched only a
byte-identical one — two tasks warned each other purely for writing the same string,
while neither noticed a task naming an actual file in that directory. Scopes written
before that fix were repaired by it, not re-authored.

## Where it shows

Three surfaces, sharing one predicate but answering slightly different questions.

| Surface                                         | Shows                                                  | Includes your own claims? |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------- |
| **Board card** (`board.ts` → `task-card.tsx`)   | An ambient pulsing marker: "overlaps _<other task>_"   | Yes                       |
| **Task sheet** — _Overlapping claims_           | The task, who holds it, and which declared paths clash | Yes, labelled `yours`     |
| **`start_task` / `claim_task`** advisory return | A warning per overlapping claim                        | **No**                    |

The MCP verbs exclude your own open claims because they answer "is somebody
_already here_?" at the moment you take a task over. The two visual surfaces
include them, and the sheet labels them `yours`: two of your own tasks in flight
over the same files is a real merge conflict ahead, and in a single-member project
filtering them out would leave the feature showing nothing at all.

The sheet does **not** require the task to hold an open claim of its own — that is
the point of putting it there. The sheet is the surface you read _before_ starting,
which is the moment the warning can still change what you do. It goes quiet once a
task has merged: the work has landed, so there is nothing left to coordinate.

Nothing renders when nothing overlaps. There is no empty "no collisions" state —
that would be noise on almost every task.

## Authoring a useful scope

The matcher works; **breadth** is now the only thing that costs you. A scope of
`lib/**` warns against every task touching `lib/`, and a warning that fires on
everything is ignored exactly like one that fires on nothing.

Rules, and the reasoning behind them, are in
[the plan-authoring guide §5b](./planning/feature-plan-authoring-guide.md) — the
short version being **never declare `tests/**`**, and name the directory you will
genuinely work in.

## Related

- [Task assignment](./task-assignment.md) — releasing a task closes its open claim,
  so a put-down task stops warning whoever picks it up next.
- [Task reads](./task-reads.md) — `get_task` returns `filesScope` over MCP.
