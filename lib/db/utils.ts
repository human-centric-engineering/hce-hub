import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';

/**
 * Database utility functions
 */

/**
 * Check if database connection is working
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connection failed', error);
    return false;
  }
}

/**
 * Disconnect from database
 * Call this when shutting down the application
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Get database health status
 * Useful for health check endpoints
 */
export async function getDatabaseHealth(): Promise<{
  connected: boolean;
  latency?: number;
}> {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      connected: true,
      latency,
    };
  } catch (error) {
    logger.error('Database health check failed', error);
    return {
      connected: false,
    };
  }
}

/**
 * Execute a database transaction
 * Wrapper for Prisma interactive transactions.
 *
 * Example:
 * ```ts
 * await executeTransaction(async (tx) => {
 *   await tx.user.create({ data: { ... } })
 *   await tx.post.create({ data: { ... } })
 * })
 * ```
 *
 * The optional `options` argument is forwarded verbatim to
 * `prisma.$transaction` and mirrors Prisma's interactive-transaction options:
 * - `timeout` — max ms the callback may run before the transaction expires
 *   (Prisma default: 5000)
 * - `maxWait` — max ms to wait for a connection from the pool
 *   (Prisma default: 2000)
 * - `isolationLevel` — transaction isolation level
 *
 * ```ts
 * await executeTransaction(work, { timeout: 20_000, maxWait: 10_000 })
 * ```
 *
 * Raising `timeout` buys headroom for genuinely heavy callbacks (e.g. a bulk
 * import where each round-trip to a remote/pooled Postgres costs 10–30 ms), but
 * it is a ceiling, not a fix. Prefer reducing round-trips first — batch with
 * `createMany` / `createManyAndReturn` in your own transaction code — and reach
 * for a higher `timeout` only when the work is irreducibly large.
 */
export async function executeTransaction<T>(
  callback: (
    tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
  ) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  return await prisma.$transaction(callback, options);
}

/**
 * Is this error Postgres refusing to serialize a transaction?
 *
 * Under `isolationLevel: 'Serializable'` Postgres uses SSI: rather than blocking,
 * it lets conflicting transactions run and aborts one at commit if the pair could
 * not have been produced by any serial order. Prisma surfaces that as `P2034`
 * ("write conflict or deadlock — please retry").
 *
 * This is an **expected outcome of a correct concurrent write**, not a fault: the
 * loser simply re-reads and retries. Callers should map it to a retryable,
 * caller-facing result rather than letting a raw Prisma error escape — a
 * serialization failure means "someone else got there first", which is very
 * different from "your request was invalid".
 */
export function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
