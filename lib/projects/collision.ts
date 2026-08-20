/**
 * Soft-collision detection for task claims.
 *
 * The Hub never hard-locks a task (v1-requirements §5): two people *can* work
 * overlapping ground. Instead, claiming surfaces **soft warnings** — "someone
 * else has an open claim touching files you're about to touch" — so a human can
 * decide. This module is the pure overlap logic; the DB query + the claim write
 * live in the `claim_task` capability.
 *
 * A file-scope entry is a repo-relative path, optionally ending in a `/**` or
 * `/*` wildcard standing for "everything under here" (a hint, not enforced).
 * Overlap is deliberately simple and forgiving: normalise a trailing wildcard
 * away, then treat two entries as overlapping when they are the same path or
 * one is a directory prefix of the other. It is a *signal*, not a conflict
 * analysis — a false positive costs a warning, a false negative costs silence.
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

/**
 * Strip trailing slashes, then any trailing wildcard segments, so `dir/**` and
 * `dir/*` both collapse to `dir` and the prefix rule below does the rest.
 *
 * **The wildcard strip is what makes this module do anything** (§33-sweep
 * t-114). Without it the comparison was literal, so a `dir/**` scope could
 * match another `dir/**` and a bare `dir` — but never `dir/file.ts`, the case
 * the warning exists for. Two tasks warned each other only when their scope
 * strings were byte-identical, which is why `tests/**` collided with every task
 * carrying it while catching nothing real.
 *
 * Only a segment that is entirely `*` or `**`, and only at the end. Not a
 * shortcut: `*` is the only glob character the Hub's scopes actually use, and
 * the two bracket-ish shapes that *look* like patterns — Next.js dynamic
 * segments (`[id]`) and route groups (`(hub)`) — are **literal directory names
 * on disk**. Expanding those would mis-handle the single most common entry
 * shape in the backlog. A partial pattern like `*.ts` is likewise left intact
 * rather than guessed at; it matches only itself, which is silence, not noise.
 *
 * A bare `**` has no leading slash and so is left alone, rather than collapsing
 * to the empty string that `pathsOverlap` reads as "no path at all".
 */
function normalize(path: string): string {
  return path.replace(/\/+$/, '').replace(/(?:\/\*{1,2})+$/, '');
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
