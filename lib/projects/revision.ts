/**
 * Project revision — the change cursor behind live surfaces (f-realtime §36 t-125).
 *
 * One cheap, **exact** answer to "has anything in this project changed since token
 * X?". Live surfaces poll it and re-render only when the token moves, so a change
 * made over MCP, by the GitHub webhook, or by another member reaches an open Plan
 * without anyone reloading.
 *
 * ## Why not the journal
 *
 * `ProjectEvent` looks like the obvious cursor — it is append-only and already
 * indexed `[projectId, createdAt]`. It is **incomplete**: `update_feature`,
 * `update_task`, `capture_idea` and `update_idea` write no event at all, and
 * `reorderPhases` deliberately writes none. A journal-derived cursor would sit
 * still through a retitled feature, and would need hand-maintaining every time a
 * verb was added. (That gap is real but separate — Hub idea #30.)
 *
 * ## What the token is made of
 *
 * `(MAX(mutation timestamp), COUNT(*))` folded across every counted table:
 *
 * | change | max | count |
 * |---|---|---|
 * | insert | rises | rises |
 * | update | rises | — |
 * | delete | — | falls |
 * | delete + insert in one write | rises (the new row is newer) | — |
 *
 * Neither half is sufficient alone. Count alone misses every edit; max alone
 * misses a delete. A dependency **swap** is the case that needs both: replacing
 * one edge with another leaves the count identical, and `update_feature` skips
 * `tx.feature.update()` entirely when only `dependsOn` changed (`data` is empty),
 * so the parent row's `updatedAt` does not move either. Only the edge table's own
 * `createdAt` sees it.
 *
 * The mutation timestamp is `updatedAt` for tables whose rows are edited and
 * `createdAt` for tables whose rows are only ever created and deleted — for those,
 * `createdAt` *is* the mutation timestamp, so an `updatedAt` would be dead weight.
 *
 * ## What this cursor cannot see
 *
 * Two honest limits, both found in review, neither worth building around yet.
 *
 * **Core `user` edits.** The manifest covers `app_*` tables; `user` is Sunrise's.
 * Project surfaces render names and avatars from it via `user-refs.ts`, so a member
 * who renames themselves goes on showing the old name until something else in the
 * project changes, or the page is reloaded. Erasure is mostly covered by accident
 * rather than by design: `eraseUser()` deletes the `user` row, `app_project_member`
 * cascades from it, and the membership count drops — so the token does move for any
 * erased member of the project. It would NOT move for an erased non-member still
 * named on a task, since those FKs are nulled by `ON DELETE SET NULL` in the
 * database, which bypasses Prisma's `@updatedAt` and changes no count.
 *
 * **The clock is the application's, not the database's.** Prisma sets `@updatedAt`
 * and `@default(now())` in the Node process, so `MAX` is only as monotonic as the
 * agreement between instances. On a multi-instance deploy, an *update* written by
 * an instance whose clock lags another's can fail to raise `MAX`, and is then
 * invisible until the next change. Inserts and deletes are unaffected — they move
 * the count. Making this exact would need a database-side default, which
 * `@updatedAt` cannot express and a trigger would hide from the schema entirely.
 *
 * ## The one term that grows
 *
 * Eleven of the twelve `COUNT(*)`s are over small, bounded sets. `app_project_event`
 * is not: the journal only ever appends, so its count is O(events in project) on
 * every poll — an index-only scan of the whole `[projectId, createdAt]` range, on
 * the most frequently hit endpoint in the app. Sub-millisecond at the Hub's current
 * size and fine for a long time yet, but it is the term to watch, and the only one
 * that does not stay flat.
 *
 * It is counted rather than tracked by `MAX(createdAt)` alone because deletes have
 * to register somewhere, and dropping the count would be the "nothing renders old
 * events anyway" reasoning this manifest explicitly refuses. If it ever does matter,
 * the fix is a bounded delete signal for this table — not an exception to the rule.
 *
 * ## The forgettability property
 *
 * Prisma sets `@updatedAt` on every `update` it issues. That is the whole reason
 * this design beat a hand-bumped counter: a new verb cannot forget to move the
 * cursor, because it never had to remember. What IS hand-written is the table list
 * below — so it is guarded rather than trusted, the same way
 * `lib/app/data-export.ts` is (`tests/unit/lib/projects/revision.test.ts` walks
 * `app.prisma` and fails on a table nobody has ruled on).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { requireProjectAccess } from '@/lib/projects/access';
import { computeETag } from '@/lib/api/etag';

/**
 * Every `app_*` table, and whether a change to it can make a project surface
 * stale. Kept exhaustive so the omissions read as decisions.
 *
 * **The ruling is structural, not editorial.** A table counts iff its rows *belong
 * to* a project — that is, following its foreign keys in the owning direction
 * arrives at `Project`. Not "iff some surface renders it today": rendering is a
 * judgement that rots the moment a surface is added, while ownership is a fact the
 * schema states. That is why `app_focus_directive` counts despite having no reader
 * and no writer anywhere in the app; when v1.x gives it one, nothing here has to be
 * remembered.
 *
 * The **direction** is the whole rule, and an earlier wording ("reachable downward")
 * was vague enough that a reviewer read it the other way and concluded `app_sprint`
 * should count. It should not: a `FocusDirective` names a sprint, so the sprint is a
 * shared parent that outlives the project, not something the project owns. Deleting
 * a project takes its directives and leaves every sprint standing. The guard test
 * now walks those foreign keys and asserts the manifest agrees in **both**
 * directions, so the rule is enforced rather than merely written down.
 *
 * `'counted'` — folded into the revision; needs a fragment in {@link SOURCE_SQL}.
 * `'not-project-scoped'` — no path down from a `Project`, so no project surface
 * can go stale because of it.
 */
export const PROJECT_REVISION_TABLES = {
  app_project: 'counted', // name, status, slug, repo urls, lead, counters
  app_project_member: 'counted', // the member stack, and who may see any of this
  app_phase: 'counted', // the Plan's bands
  app_feature: 'counted', // every Plan row
  app_feature_dependency: 'counted', // waiting-on chips; swap-safe only via createdAt
  app_indicative_task: 'counted', // the pre-plan sketch under an indicative feature
  app_task: 'counted', // Board cards, task rows, the task sheet
  app_task_dependency: 'counted', // what makes a task read `blocked`
  app_task_claim: 'counted', // the Board's claimer lane and collision warnings
  app_idea: 'counted', // the Ideas inbox
  app_project_event: 'counted', // the Log tab, and every activity timeline
  app_focus_directive: 'counted', // futures scaffolding — reachable, so counted (see above)

  // Owned by nothing a project owns, so no project surface can go stale because of
  // them. Neither has an FK-owning relation of its own — which is what the guard
  // test checks, so neither is excluded on anyone's say-so.
  app_sprint: 'not-project-scoped', // org-wide; a directive points AT a sprint, so it is a shared parent
  app_user_github: 'not-project-scoped', // a satellite of `user`, not of a project
} as const satisfies Record<string, 'counted' | 'not-project-scoped'>;

/** The tables ruled `'counted'` — derived, so it can never disagree with the manifest. */
type CountedTable = {
  [K in keyof typeof PROJECT_REVISION_TABLES]: (typeof PROJECT_REVISION_TABLES)[K] extends 'counted'
    ? K
    : never;
}[keyof typeof PROJECT_REVISION_TABLES];

/**
 * How each counted table reports `(ts, n)` for one project.
 *
 * `satisfies Record<CountedTable, …>` is the point: mark a table `'counted'` above
 * and this object fails to compile until it has a fragment. Every fragment is a
 * **literal** `Prisma.sql` template with `${projectId}` as a bound parameter —
 * nothing here is assembled from a variable identifier, so there is no string
 * concatenation for a reviewer to have to trust.
 *
 * Each join column is indexed: `app_feature(projectId)`, `app_task(featureId)`,
 * `app_task_claim(taskId)`, and the leading column of the `@@unique` on both edge
 * tables.
 */
const SOURCE_SQL = {
  app_project: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_project" t WHERE t."id" = ${projectId}`,
  app_project_member: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_project_member" t WHERE t."projectId" = ${projectId}`,
  app_phase: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_phase" t WHERE t."projectId" = ${projectId}`,
  app_feature: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_feature" t WHERE t."projectId" = ${projectId}`,
  app_idea: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_idea" t WHERE t."projectId" = ${projectId}`,
  app_project_event: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."createdAt") AS ts, COUNT(*) AS n FROM "app_project_event" t WHERE t."projectId" = ${projectId}`,
  app_focus_directive: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_focus_directive" t WHERE t."projectId" = ${projectId}`,
  app_feature_dependency: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."createdAt") AS ts, COUNT(*) AS n FROM "app_feature_dependency" t JOIN "app_feature" f ON f."id" = t."featureId" WHERE f."projectId" = ${projectId}`,
  app_indicative_task: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."createdAt") AS ts, COUNT(*) AS n FROM "app_indicative_task" t JOIN "app_feature" f ON f."id" = t."featureId" WHERE f."projectId" = ${projectId}`,
  app_task: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_task" t JOIN "app_feature" f ON f."id" = t."featureId" WHERE f."projectId" = ${projectId}`,
  app_task_dependency: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."createdAt") AS ts, COUNT(*) AS n FROM "app_task_dependency" t JOIN "app_task" k ON k."id" = t."taskId" JOIN "app_feature" f ON f."id" = k."featureId" WHERE f."projectId" = ${projectId}`,
  app_task_claim: (projectId: string) =>
    Prisma.sql`SELECT MAX(t."updatedAt") AS ts, COUNT(*) AS n FROM "app_task_claim" t JOIN "app_task" k ON k."id" = t."taskId" JOIN "app_feature" f ON f."id" = k."featureId" WHERE f."projectId" = ${projectId}`,
} satisfies Record<CountedTable, (projectId: string) => Prisma.Sql>;

/**
 * The counted tables, taken from the fragments rather than re-listed. Exported so
 * the guard test can *walk* the set instead of hard-coding it — a hand-written
 * copy beside a derived one is the drift this whole module exists to avoid.
 *
 * The cast is narrowing `Object.keys`'s unavoidable `string[]`, and it is *proven*
 * rather than asserted: the `satisfies Record<CountedTable, …>` above accepts no
 * key outside the union and demands every key in it, so these keys cannot be
 * anything else. Not the "cast on external data" the repo forbids — this object is
 * a literal three lines up.
 */
export const COUNTED_REVISION_TABLES = Object.keys(SOURCE_SQL) as CountedTable[];

/** What a caller gets back. */
export interface ProjectRevisionDTO {
  projectId: string;
  /**
   * An opaque token that changes iff something in the project changed. Also the
   * response's `ETag`, so a poller can hand it straight back as `If-None-Match`.
   * Treat it as opaque — the composition above is free to change.
   */
  revision: string;
  /**
   * The **newest mutation timestamp** across the counted tables, or `null` for a
   * project with no rows in any of them.
   *
   * Diagnostic only — it is here so a `curl` of this endpoint explains itself. Do
   * **not** render it as "updated N ago": by the table above, a delete moves the
   * count and not the max, so straight after someone deletes a task and watches the
   * board change, this would still report minutes ago. `revision` is the field that
   * answers "did anything change"; this one answers the narrower "when was the most
   * recent row written or edited" (`/code-review` round 2).
   */
  changedAt: string | null;
}

/**
 * Read `projectId`'s revision for `userId`.
 *
 * Two queries: the membership check, then one `UNION ALL` over the counted
 * sources. Deliberately does NOT load the `Project` row — this is the most
 * frequently hit endpoint in the app and nothing here needs it.
 *
 * Throws `NotFoundError` (→ 404) for a non-member or unknown project, via the
 * f-access funnel — never a 403, which would confirm the project exists.
 */
export async function getProjectRevision(
  userId: string,
  projectId: string
): Promise<ProjectRevisionDTO> {
  await requireProjectAccess(userId, projectId);

  const sources = Object.values(SOURCE_SQL).map((fragment) => fragment(projectId));
  const [row] = await prisma.$queryRaw<Array<{ ts: Date | null; n: bigint | null }>>(
    Prisma.sql`SELECT MAX(s.ts) AS ts, SUM(s.n)::bigint AS n FROM (${Prisma.join(
      sources,
      ' UNION ALL '
    )}) s`
  );

  const changedAt = row?.ts ?? null;
  // `n` is a BigInt (Postgres COUNT/SUM) — stringified before it goes anywhere
  // near JSON, which cannot serialise one.
  const count = String(row?.n ?? 0n);

  return {
    projectId,
    revision: computeETag({ changedAt, count }),
    changedAt: changedAt?.toISOString() ?? null,
  };
}
