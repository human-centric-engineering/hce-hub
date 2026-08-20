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

| Surface                                       | Shows                                                  | Includes your own claims? |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------- |
| **Board card** (`board.ts` → `task-card.tsx`) | An ambient pulsing marker naming the other task        | Yes                       |
| **Task sheet** — _Overlapping claims_         | The task, who holds it, and which declared paths clash | Yes, labelled `yours`     |
| **`start_task`** advisory return              | A warning per overlapping claim                        | **No**                    |

`start_task` is the only verb that returns these — `detectFileOverlapWarnings` has
exactly one caller. It excludes your own open claims because it answers a different
question: "is somebody _already here_?", asked at the moment you take a task over.

The two visual surfaces include them, and the sheet labels them `yours`. Two of your
own tasks in flight over the same files is a real merge conflict ahead, and in a
single-member project filtering them out would leave the feature showing nothing at
all.

The sheet does **not** require the task to hold an open claim of its own — that is
the point of putting it there. The sheet is the surface you read _before_ starting,
which is the moment the warning can still change what you do.

## When it goes quiet

A collision warning earns its place only when the reader can act on it. It is
suppressed when they cannot:

- **Nothing overlaps**, or the task declares no `filesScope`. There is no empty
  "no collisions" state — that would be noise on almost every task.
- **The task has merged.** The work has landed; there is nothing left to
  coordinate.
- **The task is `blocked`** (owner, 2026-08-20). An unmerged dependency already
  stops it, that stop is the stronger signal, and on the sheet it is rendered
  directly below — often naming the very task the collision would have named.

One thing that deliberately does **not** go quiet:

- **A task pushed to `active` past an unmerged dependency.** `computeEffectiveStatus`
  keeps a started task `active` whatever its dependencies say, so someone who
  pushed through the block is exactly who needs telling — sequence them, batch
  them into one branch if they are both yours, or coordinate if one is not.

**Only the sheet needs that blocked rule**, and the reason is an invariant rather
than a design choice. The Board's marker is computed purely from open claims;
`startTask` is the only writer of a `TaskClaim` and sets the task `active` in the
same transaction, while `applyAssignment` (standing a task down) and `completeTask`
close the claim as the task leaves `active`. So an open claim implies `active`,
`blocked` only ever arises from `claimed`, and **a blocked card can never carry a
marker in the first place**. The same invariant means a blocked task is absent from
everyone _else's_ collisions too — holding no claim, there is nothing for the
Board's pairwise pass or the sheet's query to find.

The sheet is the exception precisely because it does **not** require the task to
hold a claim of its own. That is what makes it the surface you can read _before_
starting, and it is why it is the one place the rule has anything to suppress.

## Authoring a useful scope

The matcher works; **breadth** is now the only thing that costs you. A scope of
`lib/**` warns against every task touching `lib/`, and a warning that fires on
everything is ignored exactly like one that fires on nothing.

**The write path tells you** (§33-sweep t-118). `create_task`, `update_task` and
`plan_feature` return a `scopeWarnings` array naming any entry that covers a whole
top-level tree, and how many scope-declaring tasks in the project it would collide
with — the number is what makes the case. A batch write attributes each warning to
its task via `taskRef`.

It is **advisory, never a rejection**, matching the rest of this feature: the scope
is saved exactly as written, and an entry that genuinely is that broad may stay. It
also costs nothing on a normal write — the corpus is only read if an entry has
already failed the predicate.

Breadth is measured **after normalisation**, so `app`, `app/` and `app/**` are one
rule rather than three, and one surviving segment is the line. A file at the repo
root (`package.json`) is one segment but narrow, and is not flagged; a dot-prefixed
extensionless name (`.context` the directory, `.npmrc` the file) is ambiguous by
name alone and is deliberately read as a directory, since over-warning costs a line
and under-warning ships the silent over-broad scope.

Rules and reasoning for authors are in
[the plan-authoring guide §5b](./planning/feature-plan-authoring-guide.md).

## Related

- [Task assignment](./task-assignment.md) — releasing a task closes its open claim,
  so a put-down task stops warning whoever picks it up next.
- [Task reads](./task-reads.md) — `get_task` returns `filesScope` over MCP.
