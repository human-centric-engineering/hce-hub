/**
 * Soft-collision detection for task claims.
 *
 * The Hub never hard-locks a task (v1-requirements §5): two people *can* work
 * overlapping ground. Instead, claiming surfaces **soft warnings** — "someone
 * else has an open claim touching files you're about to touch" — so a human can
 * decide. This module is the pure overlap logic. The queries that feed it live
 * with their surfaces: `task-actions.ts` (`start_task`'s advisory return),
 * `board.ts` (the card marker) and `task-detail.ts` (the sheet's section).
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
  const trimmed = path.replace(/\/+$/, '');
  const stripped = trimmed.replace(/(?:\/\*{1,2})+$/, '');
  // Never let a whole-path wildcard collapse to the empty string. `pathsOverlap`
  // reads '' as "no path" for the equality branch, but the PREFIX branch would
  // still fire — `'/a'.startsWith('' + '/')` is true — so a rooted `/**` would
  // silently match every absolute entry. Found by `/security-review` while
  // proving the (correctness-only) blast radius of this strip.
  return stripped === '' ? trimmed : stripped;
}

/** Do two path/glob entries overlap — same path, or one a directory prefix of the other? */
export function pathsOverlap(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  // An entry that normalises to nothing — `''` or `'/'` — is "no path", and no
  // path overlaps anything. Guarded HERE rather than in `normalize` because this
  // catches every route to empty at once. The equality branch used to carry the
  // check itself (`na.length > 0`), which read like a guard but only covered half
  // the function: the PREFIX branch has no such test and `'/lib/x'.startsWith('/')`
  // is true, so an empty entry matched every absolute path. `filesScope` is a
  // plain `z.array(z.string())` with no `.min(1)`, so `['', 'lib/a.ts']` is a
  // storable scope and this is reachable, not hypothetical (`/code-review`).
  if (na === '' || nb === '') return false;
  if (na === nb) return true;
  return na.startsWith(nb + '/') || nb.startsWith(na + '/');
}

/** Do two file-scope sets share any overlapping entry? */
export function filesOverlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => pathsOverlap(x, y)));
}

/**
 * The entries of `a` that overlap something in `b` — `filesOverlap`'s witness,
 * for surfaces that must say *which* paths collided rather than merely that
 * something did (§33-sweep t-109's task sheet).
 *
 * Returns `a`'s side deliberately. `a` is the task being read, so its own
 * declared entries are the ones its reader recognises and can act on; echoing
 * the other claim's scope back would name paths this task never declared.
 *
 * Kept beside `filesOverlap` because the two must agree: any change to the
 * predicate belongs in `pathsOverlap`, which both delegate to, never in one of
 * these. `filesOverlap` stays a short-circuiting `some` rather than a
 * `length > 0` on this, because the Board runs it over every pair of open
 * claims.
 */
export function overlappingPaths(a: string[], b: string[]): string[] {
  return a.filter((x) => b.some((y) => pathsOverlap(x, y)));
}

/**
 * Does this segment name a FILE rather than a directory? Judged from the string
 * alone — the Hub tracks projects other than this repository, so nothing here can
 * stat a filesystem.
 *
 * Two signals, both conventions rather than guarantees:
 *
 *  - **An extension.** `package.json` and `proxy.ts` have one; `tests` and
 *    `.context` do not. The dot must be at index > 0, or every dotfile name would
 *    read as an extension of the empty string.
 *  - **A capitalised extensionless name.** `Dockerfile`, `LICENSE`, `Makefile`,
 *    `Procfile`, `CODEOWNERS`. Both `Dockerfile` and `LICENSE` sit in this repo's
 *    root, and without this they read as whole top-level trees (`/code-review`).
 *    Directories are conventionally lower-case — every extensionless directory at
 *    this repo's root is (`app`, `lib`, `tests`, `public`, `prisma`, `scripts`,
 *    `types`, `emails`, `hooks`, `components`) — so the case carries the signal
 *    where the extension cannot.
 *
 * A lower-case extensionless dotfile (`.npmrc`) still reads as a directory. That
 * ambiguity is genuine and deliberate: see `isOverlyBroadScope`.
 */
function looksLikeFile(segment: string): boolean {
  if (segment.lastIndexOf('.') > 0) return true;
  const first = segment.replace(/^\.+/, '').charAt(0);
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase();
}

/**
 * Is this file-scope entry so broad that it stops being a signal? (§33-sweep t-118)
 *
 * `filesScope` drives soft collisions, and after t-114 made the matcher work,
 * **breadth is the entire cost**. Measured on the Hub's own corpus: a task scoped
 * `lib/**` collides with 86% of every task that declares a scope, `app/**` with
 * 39%. A warning that fires on two in five tasks is ignored exactly like one that
 * fires on none — which is the state t-114 just spent a task escaping.
 *
 * **The test is breadth after normalisation, not "is it a glob".** `normalize()`
 * strips a trailing wildcard, so `app`, `app/` and `app/**` are the same entry and
 * overlap identically. A glob-only rule would miss the bare form — and the bare
 * form is the common one here, because §5b's *previous* advice told authors to
 * "prefer a bare directory to a `dir/**` glob". Six entries in the corpus are a
 * bare `tests`, on t-43 through t-48.
 *
 * One surviving segment means a whole top-level tree. Two or more (`lib/projects/**`,
 * `app/(hub)/**`) is a real signal and stays silent.
 *
 * **A root-level FILE is narrow, and the only way to tell one from a directory is
 * its name.** The Hub tracks projects other than this repository, so the predicate
 * cannot look at a filesystem — it only ever sees the string. That leaves
 * dot-prefixed extensionless names (`.npmrc` the file vs `.context` the directory)
 * genuinely ambiguous, and this deliberately reads them as directories: over-warning
 * on a `.npmrc` costs one advisory line a human dismisses, while under-warning on a
 * `.context` ships exactly the silent over-broad scope this exists to catch.
 */
export function isOverlyBroadScope(entry: string): boolean {
  const normalized = normalize(entry);
  // '' is "no path at all" — a different defect, and `pathsOverlap` already
  // refuses to match on it. Not this predicate's business to also complain.
  if (normalized === '') return false;
  if (normalized.includes('/')) return false;
  return !looksLikeFile(normalized);
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
