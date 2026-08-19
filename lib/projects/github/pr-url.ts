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
 * Owner and repo exclude `/` and whitespace so a crafted path cannot smuggle
 * extra segments into the API URL this feeds.
 */
const PR_URL = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#]|$)/;

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
  return { owner, repo, number };
}
