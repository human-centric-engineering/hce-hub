/**
 * Project journal writer (f-journal §17 t-1).
 *
 * `recordProjectEvent` appends one row to the `ProjectEvent` stream — the Hub's
 * own consumer-facing event source (self-hosting §1). Two families of caller
 * write through it: the existing capabilities emit **auto-events** on a state
 * change (`task_created`, `task_claimed`, `help_wanted`), and §17 t-2's authored
 * verbs write `decision` / `note` entries.
 *
 * **Transactional by design — not fire-and-forget.** Unlike `logAdminAction`
 * (observability; a dropped audit row is tolerable), a `ProjectEvent` is the
 * Hub's *authoritative* record (the system of record after the §19 cutover), so
 * a dropped event is lost history. The writer therefore takes a **transaction
 * client** and is called *inside* the same `executeTransaction` as the state
 * change it records: the event exists **iff** that change committed. (Callers
 * that are themselves the whole write — `record_decision` — can pass the base
 * `prisma` client, which satisfies the same type.)
 *
 * Scope is `projectId` (always) + optional `featureId` / `taskId` — the soft
 * pointers the read layer filters on. `createdAt` is accepted so §19's import
 * seed can backdate history (it overrides the `@default(now())`).
 */
import type { Prisma, PrismaClient, ProjectEventKind } from '@prisma/client';

/**
 * The client shape `executeTransaction` hands its callback — Prisma's
 * interactive-transaction client (the full client minus the connection /
 * tx-control methods it strips). The base `prisma` client has a superset of
 * these methods, so it is also assignable: an authored verb that is itself the
 * whole write (`record_decision`) can pass `prisma` directly.
 */
type ProjectEventClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export interface RecordProjectEventInput {
  projectId: string;
  kind: ProjectEventKind;
  /** Scope: the feature this event concerns (null ⇒ project/epic-level). */
  featureId?: string | null;
  /** Scope: the task this event concerns (null ⇒ feature- or project-level). */
  taskId?: string | null;
  /** The human actor (SET NULL on erasure). Null for agent- or system-authored. */
  actorUserId?: string | null;
  /** The agent actor (a Sunrise AiAgent id); no FK. Arrives with f-sidekick §12. */
  actorAgentId?: string | null;
  /** Authored-kind heading (a decision title / ship-narrative heading). */
  title?: string | null;
  /** Markdown body (authored entries + ship narratives). */
  body?: string | null;
  /** Kind-specific structured detail, e.g. `{ status }` / `{ helpWanted }`. */
  metadata?: Prisma.InputJsonValue;
  /** Explicit timestamp for backdated imports (§19); defaults to now(). */
  createdAt?: Date;
}

/**
 * Append a `ProjectEvent`. Pass the active transaction client so the event is
 * atomic with the state change it records; returns the new event's id.
 */
export async function recordProjectEvent(
  client: ProjectEventClient,
  input: RecordProjectEventInput
): Promise<{ id: string }> {
  return client.projectEvent.create({
    data: {
      projectId: input.projectId,
      featureId: input.featureId ?? null,
      taskId: input.taskId ?? null,
      kind: input.kind,
      actorUserId: input.actorUserId ?? null,
      actorAgentId: input.actorAgentId ?? null,
      title: input.title ?? null,
      body: input.body ?? null,
      // Omit when absent so the column stays SQL NULL (no Prisma.JsonNull dance).
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      // Omit when absent so the @default(now()) applies; set to backdate (§19).
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
    select: { id: true },
  });
}
