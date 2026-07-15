/**
 * Repo-URL textarea helpers (f-project-admin t-2).
 * The forms edit repo URLs as one-per-line text; the API takes a string[].
 */

/** Split a textarea value into a trimmed, non-empty URL list. */
export function splitRepoUrls(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Join a URL list back into textarea text. */
export function joinRepoUrls(urls: string[]): string {
  return urls.join('\n');
}
