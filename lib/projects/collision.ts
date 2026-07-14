/**
 * Soft-collision detection for task claims.
 *
 * The Hub never hard-locks a task (v1-requirements §5): two people *can* work
 * overlapping ground. Instead, claiming surfaces **soft warnings** — "someone
 * else has an open claim touching files you're about to touch" — so a human can
 * decide. This module is the pure overlap logic; the DB query + the claim write
 * live in the `claim_task` capability.
 *
 * File-scope entries are paths or globs (a hint, not enforced). v1 overlap is a
 * deliberately simple, forgiving heuristic: two entries overlap if they're the
 * same path or one contains the other as a directory prefix. It's a *signal*,
 * not a precise conflict analysis — false positives are cheap (a warning), false
 * negatives just mean no warning.
 */

/** An open claim on another task, as seen when computing collisions. */
export interface OpenClaim {
  userId: string;
  claimedAt: Date;
  taskId: string;
  taskTitle: string;
  filesScope: string[];
}

/** A soft-collision warning surfaced to the claimer — never a block. */
export interface CollisionWarning {
  kind: 'already_claimed' | 'file_overlap';
  message: string;
  /** The other user involved (the prior claimant / the overlapping claimant). */
  userId: string;
  /** The overlapping task (for `file_overlap`). */
  taskId?: string;
  claimedAt?: Date;
}

/** Strip trailing slashes for comparison. */
function normalize(path: string): string {
  return path.replace(/\/+$/, '');
}

/** Do two path/glob entries overlap — same path, or one a directory prefix of the other? */
export function pathsOverlap(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return na.length > 0;
  return na.startsWith(nb + '/') || nb.startsWith(na + '/');
}

/** Do two file-scope sets share any overlapping entry? */
export function filesOverlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => pathsOverlap(x, y)));
}

/**
 * Warnings for open claims on *other* tasks whose file scope overlaps the task
 * being claimed. Empty when the claiming task declares no file scope (nothing
 * to overlap) or nothing overlaps.
 */
export function detectFileOverlapWarnings(
  claimingFiles: string[],
  openClaims: OpenClaim[]
): CollisionWarning[] {
  if (claimingFiles.length === 0) return [];
  return openClaims
    .filter((c) => filesOverlap(claimingFiles, c.filesScope))
    .map((c) => ({
      kind: 'file_overlap' as const,
      userId: c.userId,
      taskId: c.taskId,
      claimedAt: c.claimedAt,
      message: `Heads-up: an open claim on "${c.taskTitle}" touches overlapping files.`,
    }));
}
