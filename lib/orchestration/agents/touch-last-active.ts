import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';

/**
 * Bump `AiAgent.lastActiveAt` for the given agent. Fire-and-forget — the
 * caller never awaits this and any failure is swallowed (logged at debug).
 * The signal drives the default sort on the admin agents list and is non-
 * load-bearing for correctness; a missed bump just means the agent ranks
 * slightly lower on the next page load.
 *
 * Call sites are the conversation create/update funnels and the cost-log
 * writer — see `lib/orchestration/llm/cost-tracker.ts`,
 * `lib/orchestration/chat/streaming-handler.ts`, and
 * `lib/orchestration/inbound/conversation-resolver.ts`.
 */
export function touchAgentLastActive(agentId: string | null | undefined, at?: Date): void {
  if (!agentId) return;
  const lastActiveAt = at ?? new Date();
  try {
    void prisma.aiAgent
      .update({ where: { id: agentId }, data: { lastActiveAt } })
      .catch((err: unknown) => {
        logger.debug('touchAgentLastActive failed (non-fatal)', {
          agentId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  } catch (err) {
    // Defends against synchronous throws (e.g. tests with an incomplete
    // prisma mock where `prisma.aiAgent` is undefined). Production never
    // hits this branch — it's belt-and-braces because the helper's
    // contract is "never throws".
    logger.debug('touchAgentLastActive sync failure (non-fatal)', {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
