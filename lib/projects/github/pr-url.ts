/**
 * Parsing a GitHub pull-request URL into its `owner / repo / number` parts
 * (§33-sweep t-117).
 *
 * `Task.prUrl` is free text — it is set by `set_pr` over MCP and by the inline
 * form on the task sheet, neither of which constrains it beyond `sanitizeUrl`.
 * Anything reading it back and acting on it therefore has to parse defensively.
 *
 * Lives in `lib/` rather than inside the backfill script for the reason
 * `check-drift.ts` keeps its probes in `lib/db/drift-probes.ts`: the script is a
 * thin operator wrapper, and the part that can be *wrong* belongs where it can be
 * tested. Being wrong here is not cosmetic — a loose match would resolve some
 * other repository's PR and write its merge date onto a Hub task.
 */

/**
 * Anchored deliberately. An unanchored pattern matches
 * `https://evil.example/?x=https://github.com/o/r/pull/1`, which would send the
 * lookup somewhere the URL never pointed. `^` is the whole defence.
 *
 * Owner and repo are restricted to GitHub's own character set rather than merely
 * "not a slash". A looser `[^/\s]+` still cannot change the HOST of the API URL
 * these feed — that is fixed at `api.github.com` — but it does admit `#` and `?`,
 * which turn the rest of the path into a fragment or query and silently request a
 * DIFFERENT resource than the URL named. That resolves to a 404 rather than a
 * wrong write, so it fails loudly; the point is that a parser should not produce
 * a ref it cannot honour in the first place.
 *
 * `www.` is optional and the match is case-insensitive because BOTH are real URLs
 * a person can paste: `set_pr` accepts any `https://…`, so `https://www.github.com/…`
 * and `https://GitHub.com/…` are storable and would otherwise be permanently
 * unbackfillable — re-reported as unparseable on every future run.
 */
const PR_URL =
  /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)(?:[/?#]|$)/i;

/**
 * A path segment of nothing but dots (`.`, `..`, `...`) — legal in the character
 * class above, but the URL parser RESOLVES it: `repos/o/../pulls/1` normalises to
 * `repos/pulls/1`, a different endpoint than the task's URL named. Same class of
 * problem as `#` and `?`, and the same answer — refuse to produce the ref.
 */
const ALL_DOTS = /^\.+$/;

export interface PullRequestRef {
  owner: string;
  repo: string;
  /** The PR number as written — digits only, safe to interpolate into a path. */
  number: string;
}

/**
 * The `owner / repo / number` a GitHub PR URL names, or `null` when it does not
 * name one. `null` means "cannot look this up", never "look it up loosely".
 */
export function parsePullRequestUrl(url: string | null | undefined): PullRequestRef | null {
  if (!url) return null;
  const match = PR_URL.exec(url);
  if (!match) return null;
  const [, owner, repo, number] = match;
  if (ALL_DOTS.test(owner) || ALL_DOTS.test(repo)) return null;
  return { owner, repo, number };
}
