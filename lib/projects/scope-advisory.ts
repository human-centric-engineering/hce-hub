/**
 * Authoring-time advisory for an over-broad `filesScope` entry (§33-sweep t-118).
 *
 * §33-sweep t-114 made soft-collision matching work, and in doing so made
 * **breadth the entire cost** of a scope entry. The owner hit it within the hour
 * on t-106 ("The Hub has no favicon"), which declared `app/**` + `public/**` for a
 * change that touches three files: *"That opens up a massive collision tree where
 * none exists… We need to do better and have better guidance when creating tasks."*
 *
 * **Advisory, never a rejection** (owner, 2026-08-20). Refusing a scope would be
 * the odd one out in a system whose whole collision model is advisory-never-a-lock,
 * and it would block work that genuinely is that broad. This says the number out
 * loud and lets the author decide.
 *
 * It also adds **no input parameter**, which is deliberate: a capability's seeded
 * `functionDefinition` carries `name` / `description` / `parameters` — inputs only,
 * no response schema — so warning through the *return value* leaves it untouched
 * and skips the deploy → `db:seed` → reconnect ritual (idea #13). Keep the rule in
 * handler logic; putting it in `filesScope`'s Zod `.describe()` would drag that
 * ritual back in, because `.describe()` lives inside `parameters`.
 */
import { prisma } from '@/lib/db/client';
import { filesOverlap, isOverlyBroadScope } from '@/lib/projects/collision';

/** One over-broad entry, with the number that makes the case against it. */
export interface ScopeBreadthWarning {
  /**
   * Which task the entry belongs to, for a batch write — `plan_feature` creates
   * many at once, and an unattributed list of warnings is unreadable. `null` when
   * the caller only wrote one task and its response already names it.
   */
  taskRef: string | null;
  /** The offending entry, exactly as authored. */
  entry: string;
  /** How many scope-declaring tasks in the project it would collide with. */
  overlaps: number;
  /** How many tasks declare a scope at all — the denominator for `overlaps`. */
  scopedTasks: number;
  /** The advisory, ready to show a human or hand to an agent. */
  message: string;
}

/** One task's declared scope, as handed to the advisory. */
export interface ScopeUnit {
  /** `t-N`, a batch-local ref, or `null` for a single-task write. */
  taskRef: string | null;
  filesScope: readonly string[];
}

/**
 * Warnings for the entries that are too broad to be a signal, across one or many
 * tasks. Empty — and **free** — when every entry is specific enough.
 *
 * The predicate runs first and the corpus is loaded only if something failed it,
 * so the overwhelmingly common write costs no query at all. It is loaded **once**
 * for the whole batch rather than per task, because `plan_feature` writes a whole
 * feature's worth at a time and the corpus is identical for every one of them.
 *
 * When a broad entry *is* present the count is the point: "overlaps 19 of 49"
 * argues where "this looks broad" does not.
 */
export async function scopeBreadthWarnings(
  projectId: string,
  units: readonly ScopeUnit[],
  options: { excludeTaskIds?: readonly string[] } = {}
): Promise<ScopeBreadthWarning[]> {
  // De-duplicated per task: the same entry twice is one mistake, not two.
  const flagged = units
    .map((u) => ({
      taskRef: u.taskRef,
      entries: [...new Set(u.filesScope.filter(isOverlyBroadScope))],
    }))
    .filter((u) => u.entries.length > 0);
  if (flagged.length === 0) return [];

  const exclude = options.excludeTaskIds?.filter(Boolean) ?? [];
  const scoped = await prisma.task.findMany({
    where: {
      feature: { projectId },
      // A task with no scope can never be collided with, so it does not belong in
      // the denominator either — "19 of 49 that declare a scope" is a true ratio;
      // "19 of 120 tasks" would understate it.
      filesScope: { isEmpty: false },
      ...(exclude.length > 0 ? { id: { notIn: [...exclude] } } : {}),
    },
    select: { filesScope: true },
  });

  return flagged.flatMap(({ taskRef, entries }) =>
    entries.map((entry) => {
      const overlaps = scoped.filter((t) => filesOverlap([entry], t.filesScope)).length;
      return {
        taskRef,
        entry,
        overlaps,
        scopedTasks: scoped.length,
        message:
          `\`${entry}\` covers a whole top-level tree — it overlaps ${overlaps} of the ` +
          `${scoped.length} task(s) in this project that declare a file scope. A collision ` +
          `warning that fires on most of the board is ignored exactly like one that never ` +
          `fires: name the files you will actually touch, or a directory at least two ` +
          `levels deep. (Advisory only — the scope was saved as written.)`,
      };
    })
  );
}
