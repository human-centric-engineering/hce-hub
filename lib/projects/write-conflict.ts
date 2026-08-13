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
 * loser re-reads and retries. So the capabilities map it to a retryable,
 * caller-facing `concurrent_modification` result rather than letting a raw Prisma
 * error escape as a 500 — "someone else got there first" is a very different
 * answer to an agent than "your request was invalid".
 *
 * `P2034` also covers plain deadlocks, which can occur at any isolation level, so
 * the mapping stays useful on the paths that don't request Serializable.
 *
 * Lives here rather than in `lib/db/utils.ts` because that file is Sunrise-owned
 * — this is Hub-specific handling for a Hub-specific write pattern, and it keeps
 * the platform file free of a fork's merge surface (CLAUDE.md, the golden rule).
 */

import { Prisma } from '@prisma/client';

/** Is this error Postgres refusing to serialize a transaction (or a deadlock)? */
export function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
