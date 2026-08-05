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
});
