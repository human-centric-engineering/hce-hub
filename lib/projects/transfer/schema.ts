/**
 * Project transfer — snapshot schema (f-selfhost-cutover §19 t-1).
 *
 * A versioned, Zod-validated snapshot of **one project's whole coordination
 * graph** — `Project` + members + features + their dependency edges + indicative
 * tasks + tasks + their dependency edges + claims + the `ProjectEvent` journal.
 * The durable medium for the Hub-as-system-of-record: it survives `db:reset`
 * (export → import) and moves **dev → prod** (export → import), which a
 * `prisma/seeds/` unit cannot (a seed re-materialises a *frozen* baseline; live
 * state is authored in the DB — self-hosting §5, owner decision 2026-07-21).
 *
 * Shape mirrors Sunrise's `lib/orchestration/backup/schema.ts` (versioned
 * envelope + `ImportResult` importer), re-derived for a **project-scoped** graph
 * with two differences its config-backup doesn't have (feature-plan-authoring
 * §5 — re-derive the borrowed rationale): (1) every row carries its **`id` +
 * `createdAt`** verbatim so backdated history and stable links **round-trip
 * identically** (the config backup re-keys by slug); (2) `User` rows are never
 * the Hub's to create, so members carry a **non-authoritative `userHint`** for
 * cross-environment re-resolution — never used to mint a user.
 *
 * Dates are ISO-8601 strings on the wire (JSON has no Date); the exporter emits
 * `.toISOString()`, the importer parses back to `Date`. JSON columns
 * (`Feature.references`, `ProjectEvent.metadata`) pass through opaque.
 */

import { z } from 'zod';

/** ISO-8601 timestamp on the wire (parsed to `Date` on import). */
const isoDate = z.string();

/** Opaque JSON column (`Feature.references`, `ProjectEvent.metadata`). */
const jsonValue = z.unknown().nullable();

const projectStatus = z.enum(['planning', 'active', 'archived']);
const projectRole = z.enum(['lead', 'member']);
const featureStatus = z.enum(['planning', 'in_flight', 'blocked', 'shipped']);
const planningStage = z.enum(['indicative', 'planned']);
const taskStatus = z.enum(['backlog', 'available', 'claimed', 'in_pr', 'merged']);
const projectEventKind = z.enum([
  'feature_created',
  'feature_claimed',
  'feature_planned',
  'feature_shipped',
  'feature_blocked',
  'feature_unblocked',
  'task_created',
  'task_claimed',
  'task_pr_linked',
  'task_merged',
  'help_wanted',
  'member_added',
  'decision',
  'note',
]);

export const projectSnapshot = z.object({
  id: z.string(),
  name: z.string(),
  hostPlatform: z.string(),
  status: projectStatus,
  repoUrls: z.array(z.string()),
  leadUserId: z.string().nullable(),
  knowledgeTagId: z.string().nullable(),
  sidekickAgentId: z.string().nullable(),
  taskCounter: z.number().int(),
  createdAt: isoDate,
});

export const memberSnapshot = z.object({
  id: z.string(),
  userId: z.string(),
  role: projectRole,
  addedAt: isoDate,
  /**
   * Non-authoritative hint for re-resolving the member on a *different*
   * environment (dev → prod) where the `userId` may not exist. Used **only** to
   * look up an existing user by email — never to create one. Absent on same-env
   * round-trips (the id resolves directly).
   */
  userHint: z
    .object({ email: z.string().nullable(), name: z.string().nullable() })
    .nullable()
    .optional()
    .default(null),
});

export const featureSnapshot = z.object({
  id: z.string(),
  projectId: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  doneWhen: z.string().nullable(),
  references: jsonValue,
  ownerUserId: z.string().nullable(),
  status: featureStatus,
  planningStage,
  helpWanted: z.boolean(),
  phaseId: z.string().nullable(),
  createdAt: isoDate,
});

export const featureDependencySnapshot = z.object({
  id: z.string(),
  featureId: z.string(),
  dependsOnFeatureId: z.string(),
});

export const indicativeTaskSnapshot = z.object({
  id: z.string(),
  featureId: z.string(),
  order: z.number().int(),
  text: z.string(),
});

export const taskSnapshot = z.object({
  id: z.string(),
  featureId: z.string(),
  number: z.number().int().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  doneWhen: z.string().nullable(),
  status: taskStatus,
  filesScope: z.array(z.string()),
  assigneeUserId: z.string().nullable(),
  claimedByUserId: z.string().nullable(),
  prUrl: z.string().nullable(),
  createdAt: isoDate,
});

export const taskDependencySnapshot = z.object({
  id: z.string(),
  taskId: z.string(),
  dependsOnTaskId: z.string(),
});

export const taskClaimSnapshot = z.object({
  id: z.string(),
  taskId: z.string(),
  userId: z.string(),
  claimedAt: isoDate,
  releasedAt: isoDate.nullable(),
});

export const eventSnapshot = z.object({
  id: z.string(),
  projectId: z.string(),
  featureId: z.string().nullable(),
  taskId: z.string().nullable(),
  kind: projectEventKind,
  actorUserId: z.string().nullable(),
  actorAgentId: z.string().nullable(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  metadata: jsonValue,
  createdAt: isoDate,
});

/**
 * Schema version history:
 *   v1 — the initial project-graph snapshot (§19 t-1).
 */
export const projectTransferSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: isoDate,
  data: z.object({
    project: projectSnapshot,
    members: z.array(memberSnapshot),
    features: z.array(featureSnapshot),
    featureDependencies: z.array(featureDependencySnapshot),
    indicativeTasks: z.array(indicativeTaskSnapshot),
    tasks: z.array(taskSnapshot),
    taskDependencies: z.array(taskDependencySnapshot),
    taskClaims: z.array(taskClaimSnapshot),
    events: z.array(eventSnapshot),
  }),
});

export type ProjectTransfer = z.infer<typeof projectTransferSchema>;
export type ProjectSnapshotData = ProjectTransfer['data'];
export type MemberSnapshot = z.infer<typeof memberSnapshot>;
export type FeatureSnapshot = z.infer<typeof featureSnapshot>;
export type TaskSnapshot = z.infer<typeof taskSnapshot>;
export type EventSnapshot = z.infer<typeof eventSnapshot>;

/** Current on-wire schema version. */
export const PROJECT_TRANSFER_VERSION = 1 as const;
