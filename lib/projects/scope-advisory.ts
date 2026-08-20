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
 *
 * **Call it BEFORE the write.** `/code-review` caught this shipping the other way
 * round: run after the transaction commits and a transient failure on this extra
 * read is normalised by the dispatcher into `execution_error`, so `create_task`
 * reports failure for a task that already exists and has consumed a `t-N` — and an
 * agent that retries creates a duplicate. `start_task` sets the precedent, computing
 * its collision warnings ahead of the write. Belt and braces, a corpus read that
 * fails degrades to no warnings rather than propagating: an advisory must never be
 * able to fail the thing it advises on.
 */
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
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
  /** How many scope-declaring tasks it would collide with. */
  overlaps: number;
  /** How many scopes it was counted against — the denominator for `overlaps`. */
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

/** `**` or `*` alone — see the message branch below. */
const PURE_WILDCARD = /^\*{1,2}$/;

/**
 * Warnings for the entries that are too broad to be a signal, across one or many
 * tasks. Empty — and **free** — when every entry is specific enough.
 *
 * The predicate runs first and the corpus is loaded only if something failed it,
 * so the overwhelmingly common write costs no query at all. It is loaded **once**
 * for the whole batch rather than per task, because `plan_feature` writes a whole
 * feature's worth at a time and the corpus is identical for every one of them.
 */
export async function scopeBreadthWarnings(
  projectId: string,
  units: readonly ScopeUnit[],
  options: { excludeTaskIds?: readonly string[] } = {}
): Promise<ScopeBreadthWarning[]> {
  // De-duplicated per task: the same entry twice is one mistake, not two.
  const flagged = units.map((u) => [...new Set(u.filesScope.filter(isOverlyBroadScope))]);
  if (flagged.every((entries) => entries.length === 0)) return [];

  const exclude = options.excludeTaskIds?.filter(Boolean) ?? [];
  let corpus: string[][];
  try {
    const rows = await prisma.task.findMany({
      where: {
        feature: { projectId },
        // A task with no scope can never be collided with, so it does not belong
        // in the denominator either — "19 of 49 that declare a scope" is a true
        // ratio; "19 of 120 tasks" would understate it.
        filesScope: { isEmpty: false },
        ...(exclude.length > 0 ? { id: { notIn: [...exclude] } } : {}),
      },
      select: { filesScope: true },
    });
    corpus = rows.map((r) => r.filesScope);
  } catch (error) {
    // Degrade, never propagate: this runs on the write path and the write itself
    // is what the caller asked for. Logged rather than swallowed silently.
    logger.warn('Scope-breadth advisory skipped — corpus read failed', { projectId, error });
    return [];
  }

  return units.flatMap((unit, i) => {
    // A batch counts against its own siblings as well as the stored corpus.
    // Without this, planning five tasks that all declare `lib/**` on a project
    // with nothing else scoped reports "overlaps 0 of the 0 task(s)" five times —
    // the number goes empty exactly when the breadth is worst (`/code-review`).
    const siblings = units.filter((_, j) => j !== i).map((u) => [...u.filesScope]);
    const against = [...corpus, ...siblings].filter((scope) => scope.length > 0);

    return flagged[i].map((entry) => {
      const overlaps = against.filter((scope) => filesOverlap([entry], scope)).length;
      // A bare `**` is the broadest entry expressible and matches *nothing*:
      // `normalize` deliberately leaves a slash-less wildcard intact (t-114), so
      // `pathsOverlap('**', …)` is always false. Quoting "overlaps 0" here would
      // read as reassurance at the exact moment the scope is worst.
      const message = PURE_WILDCARD.test(entry.replace(/\/+$/, ''))
        ? `\`${entry}\` is not a usable scope: it names the entire repository, and the ` +
          `collision matcher does not expand a bare wildcard, so it produces no warnings ` +
          `at all — broad and useless at once. Name the files or directories you will ` +
          `actually touch. (Advisory only — the scope was saved as written.)`
        : `\`${entry}\` covers a whole top-level tree — it overlaps ${overlaps} of the ` +
          `${against.length} task(s) counted against it that declare a file scope. A ` +
          `collision warning that fires on most of the board is ignored exactly like one ` +
          `that never fires: name the files you will actually touch, or a directory at ` +
          `least two levels deep. (Advisory only — the scope was saved as written.)`;
      return { taskRef: unit.taskRef, entry, overlaps, scopedTasks: against.length, message };
    });
  });
}

/**
 * The audit-preview form of a warning list: the structural facts, minus the
 * generated prose (§33-sweep t-118, `/code-review`).
 *
 * `redactProvenance` in these capabilities builds its preview with a bare
 * `JSON.stringify(result)`, which bypasses `BaseCapability`'s deliberate 480-char
 * cap — set "so audit rows stay well under the JSON column size limit". Each
 * warning's `message` is ~430 generated characters, so a fifty-task plan with two
 * broad entries apiece would write tens of kilobytes of boilerplate into a durable
 * provenance row.
 *
 * Dropping `message` rather than truncating the whole result keeps every fact an
 * auditor would want — which task, which entry, how many overlaps — and loses only
 * a sentence that is reconstructable from them.
 */
export function compactWarnings(
  warnings: readonly ScopeBreadthWarning[]
): { taskRef: string | null; entry: string; overlaps: number }[] {
  return warnings.map(({ taskRef, entry, overlaps }) => ({ taskRef, entry, overlaps }));
}
