/**
 * App subject-data export seam (GDPR Art. 15).
 *
 * **Fork-owned scaffold** — Sunrise ships this returning nothing and does NOT
 * change it after release, so your edits here merge cleanly on upgrade (the
 * stable contract is this file's `collectAppSubjectData` export, not its body).
 * Treat it like the other `lib/app/*` seams.
 *
 * Auto-wired: `exportUserData()` (`lib/privacy/export-user.ts`) calls this and
 * folds the result into the `app` section of the export bundle, so both the
 * self-service and admin export endpoints pick it up with no core edit.
 *
 * Declare every app-owned table that holds data about a person. Core covers its
 * own tables via `lib/privacy/export-sources.ts`; it cannot see yours.
 *
 * ```ts
 * export async function collectAppSubjectData({ userId }: AppSubjectQuery): Promise<AppSubjectData> {
 *   const [invoices, bookings] = await Promise.all([
 *     prisma.appInvoice.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
 *     prisma.appBooking.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
 *   ]);
 *   return { invoices, bookings };
 * }
 * ```
 *
 * **Why a plain function and not a registry.** The erasure sibling
 * (`lib/privacy/erasure-hooks.ts`) is a boot-time registry, and this seam
 * deliberately is not. Erasure fails loudly if a hook never registers — the
 * rows are still there afterwards. An export fails *silently*: an unregistered
 * collector yields a bundle that looks complete and is not, and neither the
 * subject nor the operator can tell. A static import cannot be missed.
 *
 * **Keep it complete.** The core guard test (`export-sources.test.ts`) diffs
 * `prisma/schema/*.prisma` against the core manifest so a new core table can't
 * quietly narrow the export. Your tables need the same protection, and core
 * cannot write it for you — the pattern worth copying is a constant listing the
 * tables you export plus a test that greps your own schema file for
 * `@@map("app_…")` and asserts each mapped table appears in it. Then adding a
 * table without extending the export fails your build instead of shipping a
 * short answer to a data subject.
 *
 * A table holding no personal data (lookup tables, org config with no person in
 * it) is fine to leave out — but say so in a comment where you list them, so
 * the omission reads as a decision rather than an oversight.
 *
 * Full guide: .context/privacy/data-export.md · CUSTOMIZATION.md §4
 */

import { prisma } from '@/lib/db/client';

/** Identity of the subject being exported. */
export interface AppSubjectQuery {
  /** Id of the data subject. */
  userId: string;
  /** The subject's email — for app tables keyed by address rather than user id. */
  email: string;
}

/**
 * App-owned subject data, keyed by section name. Each section lands under
 * `app.<section>` in the export bundle. Values must be JSON-serialisable.
 */
export type AppSubjectData = Record<string, unknown>;

/**
 * Every `app_*` table, and whether it holds data about a person. Kept exhaustive
 * so the omissions read as decisions — the seam's "keep it complete" rule. The
 * fork guard test (`tests/unit/lib/app/data-export.test.ts`) greps
 * `prisma/schema/app.prisma` for `@@map("app_…")` and fails if a table is
 * missing from this record, so adding a model without ruling on it breaks the
 * build rather than shipping a data subject a short answer.
 *
 * `'exported'` — the subject's own rows land in the bundle.
 * `'no-personal-data'` — plan/coordination structure with no person in it.
 */
export const HUB_SUBJECT_TABLES = {
  // The person's own footprint.
  app_project_member: 'exported', // which projects they belong to, and as what
  app_task_claim: 'exported', // their claim history, including released claims
  app_project_event: 'exported', // decisions and notes they authored
  app_task: 'exported', // tasks assigned to or claimed by them
  app_project: 'exported', // projects they lead
  app_feature: 'exported', // features they own
  app_focus_directive: 'exported', // directives they declared
  app_idea: 'exported', // ideas they captured (their free-text jots)
  app_user_github: 'exported', // their linked GitHub identity (login + avatar)

  // Plan structure — no user column at all. A dependency edge, an indicative
  // task, a sprint or a phase describes the work, not a person; the people
  // attached to that work are reached through the tables above.
  app_feature_dependency: 'no-personal-data',
  app_indicative_task: 'no-personal-data',
  app_task_dependency: 'no-personal-data',
  app_sprint: 'no-personal-data',
  app_phase: 'no-personal-data',
} as const satisfies Record<string, 'exported' | 'no-personal-data'>;

/**
 * Collect the Hub's data about one subject.
 *
 * Scoped to rows that are *about this person* — their memberships, their claims,
 * the entries they authored, the work attributed to them. Deliberately NOT every
 * row in a project they can see: a colleague's task is that colleague's data,
 * and Art. 15 is a right to one's own.
 */
export async function collectAppSubjectData({ userId }: AppSubjectQuery): Promise<AppSubjectData> {
  const [
    memberships,
    taskClaims,
    authoredEvents,
    tasks,
    projectsLed,
    featuresOwned,
    directives,
    ideas,
    githubIdentity,
  ] = await Promise.all([
    prisma.projectMember.findMany({ where: { userId }, orderBy: { addedAt: 'asc' } }),
    prisma.taskClaim.findMany({ where: { userId }, orderBy: { claimedAt: 'asc' } }),
    prisma.projectEvent.findMany({
      where: { actorUserId: userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.task.findMany({
      // Assigned to, claimed by (did the work), or merged by them (f-github-identity §23).
      where: {
        OR: [{ assigneeUserId: userId }, { claimedByUserId: userId }, { mergedByUserId: userId }],
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.project.findMany({ where: { leadUserId: userId }, orderBy: { createdAt: 'asc' } }),
    prisma.feature.findMany({ where: { ownerUserId: userId }, orderBy: { createdAt: 'asc' } }),
    prisma.focusDirective.findMany({
      where: { declaredByUserId: userId },
      orderBy: { declaredAt: 'asc' },
    }),
    prisma.idea.findMany({ where: { createdByUserId: userId }, orderBy: { createdAt: 'asc' } }),
    // 1:1 satellite — their linked GitHub identity (0 or 1 rows). Kept as a
    // findMany so every app-export section is uniformly a list (empty when none).
    prisma.userGithubIdentity.findMany({ where: { userId } }),
  ]);

  return {
    projectMemberships: memberships,
    taskClaims,
    authoredEvents,
    tasks,
    projectsLed,
    featuresOwned,
    focusDirectives: directives,
    ideas,
    githubIdentity,
  };
}
