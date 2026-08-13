import { z } from 'zod';

/**
 * App-defined server environment variables.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly when you pull an upstream
 * version (the stable contract is this file's export, not its body). Treat it
 * like the landing page: a starting point you're expected to modify.
 *
 * `lib/env.ts` merges this into the same fail-fast startup parse as the core
 * vars; server-side only. Extend, e.g.:
 *   `export const appEnvSchema = z.object({ STRIPE_SECRET_KEY: z.string().min(1) });`
 *
 * Full guide: CUSTOMIZATION.md §4 · .context/environment/overview.md
 */
export const appEnvSchema = z.object({
  /**
   * Shared secret for the GitHub PR webhook (`/api/v1/webhooks/github`,
   * f-github-sync §14). Set the SAME value here (deployment env) and as the
   * "Secret" on each repo's webhook; the route verifies GitHub's
   * `X-Hub-Signature-256` (HMAC-SHA256 over the raw body) against it.
   *
   * Optional — when unset, the route returns 503 and no PR-merge reconciliation
   * happens, so the feature stays dormant until a deployment opts in. GitHub
   * can't reach `.test`/localhost, so this is a prod-only activation.
   */
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),

  /**
   * GitHub OAuth app credentials for the member GitHub **linking** flow
   * (f-github-identity §23) — a signed-in user links their GitHub identity so
   * their activity (`merged_by`, authorship) can be attributed. This is NOT a
   * sign-in provider: it never creates or authenticates an account.
   *
   * Optional — when EITHER is unset the linking routes return 503 and the feature
   * stays dormant, like `GITHUB_WEBHOOK_SECRET` above. Set BOTH (deployment env),
   * paired with a GitHub OAuth app whose Authorization callback URL is
   * `${BETTER_AUTH_URL}/api/v1/users/me/github/callback`. The access token the
   * flow obtains is used once to read the GitHub id/login and then discarded —
   * never stored.
   */
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
});
