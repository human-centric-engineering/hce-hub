/**
 * How often a live project surface polls (f-realtime §36).
 *
 * **This exists to be imported twice.** The client poller sets its interval from it,
 * and `lib/app/rate-limit.ts` derives the `hub-revision` cap from it — 20 tabs at
 * this cadence, doubled for off-cadence polls. Those two numbers have to agree, and
 * for one commit they did not: the cadence was written out separately in each file
 * (`5_000` and `5`) with nothing linking them, despite a comment in one promising
 * "if t-126 ships a different cadence, this moves with it" and a doc claiming the
 * cap was derived. Halving the cadence would have silently blown the cap and 429'd
 * every poller, with no user-visible symptom (`/code-review`).
 *
 * Deliberately dependency-free — no React, no server imports — because one side is
 * a client component and the other runs in the middleware.
 */

/** The poll interval, in milliseconds. */
export const PROJECT_POLL_INTERVAL_MS = 5_000;

/** The same figure in seconds, for rate-limit arithmetic. */
export const PROJECT_POLL_INTERVAL_SECONDS = PROJECT_POLL_INTERVAL_MS / 1000;
