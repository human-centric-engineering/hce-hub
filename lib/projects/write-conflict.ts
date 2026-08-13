/**
 * Serialization-failure predicate for the Hub's graph-writing verbs
 * (f-authoring-fidelity §21 t-87).
 *
 * `update_task` and `update_feature` read the project's dependency graph, prove
 * it stays acyclic, and write the new edges — all inside one transaction at
 * `isolationLevel: 'Serializable'`. Postgres runs those under SSI: rather than
 * blocking, it lets conflicting transactions proceed and aborts one at commit if
 * the pair could not have been produced by any serial order. Prisma surfaces that
 * as `P2034` ("write conflict or deadlock — please retry").
 *
 * That is an **expected outcome of a correct concurrent write**, not a fault: the
 * loser re-runs and usually wins. Hence `withWriteConflictRetry` — without it the
 * `concurrent_modification` message ("re-read and retry") would be advice to an
 * LLM agent rather than a mechanism, and a routine abort would silently drop an
 * edit that was never wrong.
 *
 * **Why aborts are likelier than the row counts suggest.** The graph read is a
 * filtered scan of the dependency table with no index serving its predicate, so
 * Postgres seq-scans it and SSI takes a *relation-level* predicate lock. Both
 * `update_*` verbs read and write that one relation, so two concurrent edge edits
 * can abort each other **even in different projects**. Retrying absorbs that;
 * the transaction body is idempotent (re-read, re-prove, replace), so a re-run is
 * safe and sees the winner's committed edges.
 *
 * **Scope note — this does NOT catch deadlocks.** Prisma's docs describe `P2034`
 * as "write conflict or deadlock", but `@prisma/adapter-pg` (the adapter this app
 * constructs in `lib/db/client.ts`) maps only SQLSTATE `40001` to
 * `TransactionWriteConflict`; `40P01` (`deadlock_detected`) falls through its
 * default branch and never becomes `P2034`. A genuine deadlock therefore escapes
 * as an unhandled error. Accepted rather than papered over: these transactions
 * touch one owner row's edges in a fixed order, so they don't deadlock among
 * themselves, and detecting `40P01` would mean reaching past the adapter into the
 * raw driver error — fragile, for an event that doesn't arise here.
 *
 * Lives here rather than in `lib/db/utils.ts` because that file is Sunrise-owned
 * — this is Hub-specific handling for a Hub-specific write pattern, and it keeps
 * the platform file free of a fork's merge surface (CLAUDE.md, the golden rule).
 */

import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logging';

/** Is this error Postgres refusing to serialize a transaction (SQLSTATE 40001)? */
export function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

/** Total attempts, so `MAX_ATTEMPTS - 1` retries after the first abort. */
const MAX_ATTEMPTS = 3;

/**
 * Run `work`, re-running it if Postgres aborts it as a write conflict.
 *
 * Only `isWriteConflict` errors are retried — a `DependencyCycleError`, a
 * validation failure, or a dropped connection propagates on the first throw, so
 * a genuinely rejected edge set is never retried into a different answer.
 *
 * No backoff: an SSI abort means the conflicting transaction has already
 * committed or rolled back, so there is nothing to wait for, and the retry is
 * competing with at most a handful of Hub writers. If the final attempt also
 * aborts, the error escapes for the caller to map to `concurrent_modification`.
 */
export async function withWriteConflictRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isWriteConflict(err)) throw err;
      logger.warn('Write conflict — retrying transaction', { attempt, maxAttempts: MAX_ATTEMPTS });
    }
  }
}
