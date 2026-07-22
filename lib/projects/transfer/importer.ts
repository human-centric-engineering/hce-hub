/**
 * Project transfer — importer (f-selfhost-cutover §19 t-1).
 *
 * Validates a snapshot (`lib/projects/transfer/schema.ts`) and **upserts by id**
 * inside one transaction — idempotent (re-import updates, never duplicates) and
 * FK-safe (project → members → features → edges → tasks → edges → claims →
 * events). Preserves each row's `id` + `createdAt`, so a same-environment
 * round-trip is identical and a backdated cutover import keeps its history.
 *
 * **User references are resolved, never fabricated.** `User` rows are core and
 * not the Hub's to create (self-hosting §5). Every satellite FK → `"user"` is a
 * real DB constraint, so a dangling reference would *reject* the insert — the
 * importer resolves each to an existing target user (by id, or for members by
 * the `userHint` email on a cross-environment import) and otherwise **nulls the
 * optional refs** / **skips the required ones** (members, task claims), each
 * with a warning. On the Hub's own dev → prod path the ids are stable, so
 * everything resolves; a foreign import degrades gracefully.
 */

import { Prisma } from '@prisma/client';
import { executeTransaction } from '@/lib/db/utils';
import { projectTransferSchema } from '@/lib/projects/transfer/schema';

export interface ImportResult {
  project: 'created' | 'updated';
  members: { created: number; updated: number; skipped: number };
  features: { created: number; updated: number };
  featureDependencies: { created: number; updated: number };
  indicativeTasks: { created: number; updated: number };
  tasks: { created: number; updated: number };
  taskDependencies: { created: number; updated: number };
  taskClaims: { created: number; updated: number; skipped: number };
  events: { created: number; updated: number };
  warnings: string[];
}

/** A nullable JSON column: SQL NULL when absent, the value otherwise. */
const jsonInput = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : v;

/**
 * Import a project snapshot. Throws `ZodError` on a malformed payload or an
 * unsupported `schemaVersion`. Returns per-collection created/updated (+ skipped
 * where a required user couldn't be resolved) and any warnings.
 */
export async function importProject(raw: unknown): Promise<ImportResult> {
  const { data } = projectTransferSchema.parse(raw);

  const result: ImportResult = {
    project: 'created',
    members: { created: 0, updated: 0, skipped: 0 },
    features: { created: 0, updated: 0 },
    featureDependencies: { created: 0, updated: 0 },
    indicativeTasks: { created: 0, updated: 0 },
    tasks: { created: 0, updated: 0 },
    taskDependencies: { created: 0, updated: 0 },
    taskClaims: { created: 0, updated: 0, skipped: 0 },
    events: { created: 0, updated: 0 },
    warnings: [],
  };

  await executeTransaction(async (tx) => {
    // --- Resolve user references against the target environment -------------
    const referencedUserIds = new Set<string>();
    const add = (id: string | null): void => {
      if (id) referencedUserIds.add(id);
    };
    add(data.project.leadUserId);
    data.members.forEach((m) => add(m.userId));
    data.features.forEach((f) => add(f.ownerUserId));
    data.tasks.forEach((t) => {
      add(t.assigneeUserId);
      add(t.claimedByUserId);
    });
    data.taskClaims.forEach((c) => add(c.userId));
    data.events.forEach((e) => add(e.actorUserId));

    const directHits = new Set(
      referencedUserIds.size
        ? (
            await tx.user.findMany({
              where: { id: { in: [...referencedUserIds] } },
              select: { id: true },
            })
          ).map((u) => u.id)
        : []
    );

    // Cross-environment: re-resolve unresolved *members* by their hint email
    // (the only refs carrying a hint). Builds an original-id → target-id remap.
    const remap = new Map<string, string>();
    directHits.forEach((id) => remap.set(id, id));

    const hintEmails = [
      ...new Set(
        data.members
          .filter((m) => !remap.has(m.userId) && m.userHint?.email)
          .map((m) => m.userHint!.email as string)
      ),
    ];
    if (hintEmails.length) {
      const byEmail = new Map(
        (
          await tx.user.findMany({
            where: { email: { in: hintEmails } },
            select: { id: true, email: true },
          })
        ).map((u) => [u.email, u.id])
      );
      for (const m of data.members) {
        if (!remap.has(m.userId) && m.userHint?.email) {
          const target = byEmail.get(m.userHint.email);
          if (target) remap.set(m.userId, target);
        }
      }
    }

    const warned = new Set<string>();
    /** Resolve an optional satellite FK: keep if resolvable, else null + warn. */
    const resolveNullable = (id: string | null, ctx: string): string | null => {
      if (id === null) return null;
      const target = remap.get(id);
      if (target) return target;
      if (!warned.has(id)) {
        warned.add(id);
        result.warnings.push(`User ${id} not found in target — nulled its ${ctx} reference(s).`);
      }
      return null;
    };

    // --- Pre-fetch existing ids (for created-vs-updated counting) -----------
    const toIdSet = (rows: { id: string }[]): Set<string> => new Set(rows.map((r) => r.id));

    const existingProject = await tx.project.findUnique({
      where: { id: data.project.id },
      select: { id: true },
    });
    result.project = existingProject ? 'updated' : 'created';
    const [
      exMembers,
      exFeatures,
      exFeatureDeps,
      exIndicative,
      exTasks,
      exTaskDeps,
      exClaims,
      exEvents,
    ] = await Promise.all([
      tx.projectMember
        .findMany({ where: { id: { in: data.members.map((m) => m.id) } }, select: { id: true } })
        .then(toIdSet),
      tx.feature
        .findMany({ where: { id: { in: data.features.map((f) => f.id) } }, select: { id: true } })
        .then(toIdSet),
      tx.featureDependency
        .findMany({
          where: { id: { in: data.featureDependencies.map((d) => d.id) } },
          select: { id: true },
        })
        .then(toIdSet),
      tx.indicativeTask
        .findMany({
          where: { id: { in: data.indicativeTasks.map((i) => i.id) } },
          select: { id: true },
        })
        .then(toIdSet),
      tx.task
        .findMany({ where: { id: { in: data.tasks.map((t) => t.id) } }, select: { id: true } })
        .then(toIdSet),
      tx.taskDependency
        .findMany({
          where: { id: { in: data.taskDependencies.map((d) => d.id) } },
          select: { id: true },
        })
        .then(toIdSet),
      tx.taskClaim
        .findMany({ where: { id: { in: data.taskClaims.map((c) => c.id) } }, select: { id: true } })
        .then(toIdSet),
      tx.projectEvent
        .findMany({ where: { id: { in: data.events.map((e) => e.id) } }, select: { id: true } })
        .then(toIdSet),
    ]);

    // --- Upsert, FK-safe order ---------------------------------------------
    const p = data.project;
    await tx.project.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        hostPlatform: p.hostPlatform,
        status: p.status,
        repoUrls: p.repoUrls,
        leadUserId: resolveNullable(p.leadUserId, 'project lead'),
        knowledgeTagId: p.knowledgeTagId,
        sidekickAgentId: p.sidekickAgentId,
        taskCounter: p.taskCounter,
        createdAt: new Date(p.createdAt),
      },
      update: {
        name: p.name,
        hostPlatform: p.hostPlatform,
        status: p.status,
        repoUrls: p.repoUrls,
        leadUserId: resolveNullable(p.leadUserId, 'project lead'),
        knowledgeTagId: p.knowledgeTagId,
        sidekickAgentId: p.sidekickAgentId,
        taskCounter: p.taskCounter,
        createdAt: new Date(p.createdAt),
      },
    });

    for (const m of data.members) {
      const userId = remap.get(m.userId) ?? null;
      if (!userId) {
        result.members.skipped++;
        result.warnings.push(`Member ${m.id}: user ${m.userId} not found — membership skipped.`);
        continue;
      }
      await tx.projectMember.upsert({
        where: { id: m.id },
        create: { id: m.id, projectId: p.id, userId, role: m.role, addedAt: new Date(m.addedAt) },
        update: { projectId: p.id, userId, role: m.role, addedAt: new Date(m.addedAt) },
      });
      if (exMembers.has(m.id)) result.members.updated++;
      else result.members.created++;
    }

    for (const f of data.features) {
      const base = {
        slug: f.slug,
        title: f.title,
        description: f.description,
        doneWhen: f.doneWhen,
        references: jsonInput(f.references),
        ownerUserId: resolveNullable(f.ownerUserId, 'feature owner'),
        status: f.status,
        planningStage: f.planningStage,
        helpWanted: f.helpWanted,
        phaseId: f.phaseId,
        createdAt: new Date(f.createdAt),
      };
      await tx.feature.upsert({
        where: { id: f.id },
        create: { id: f.id, projectId: f.projectId, ...base },
        update: base,
      });
      if (exFeatures.has(f.id)) result.features.updated++;
      else result.features.created++;
    }

    for (const d of data.featureDependencies) {
      await tx.featureDependency.upsert({
        where: { id: d.id },
        create: { id: d.id, featureId: d.featureId, dependsOnFeatureId: d.dependsOnFeatureId },
        update: { featureId: d.featureId, dependsOnFeatureId: d.dependsOnFeatureId },
      });
      if (exFeatureDeps.has(d.id)) result.featureDependencies.updated++;
      else result.featureDependencies.created++;
    }

    for (const it of data.indicativeTasks) {
      await tx.indicativeTask.upsert({
        where: { id: it.id },
        create: { id: it.id, featureId: it.featureId, order: it.order, text: it.text },
        update: { featureId: it.featureId, order: it.order, text: it.text },
      });
      if (exIndicative.has(it.id)) result.indicativeTasks.updated++;
      else result.indicativeTasks.created++;
    }

    for (const t of data.tasks) {
      const base = {
        number: t.number,
        title: t.title,
        description: t.description,
        doneWhen: t.doneWhen,
        status: t.status,
        filesScope: t.filesScope,
        assigneeUserId: resolveNullable(t.assigneeUserId, 'task assignee'),
        claimedByUserId: resolveNullable(t.claimedByUserId, 'task claimant'),
        prUrl: t.prUrl,
        createdAt: new Date(t.createdAt),
      };
      await tx.task.upsert({
        where: { id: t.id },
        create: { id: t.id, featureId: t.featureId, ...base },
        update: base,
      });
      if (exTasks.has(t.id)) result.tasks.updated++;
      else result.tasks.created++;
    }

    for (const d of data.taskDependencies) {
      await tx.taskDependency.upsert({
        where: { id: d.id },
        create: { id: d.id, taskId: d.taskId, dependsOnTaskId: d.dependsOnTaskId },
        update: { taskId: d.taskId, dependsOnTaskId: d.dependsOnTaskId },
      });
      if (exTaskDeps.has(d.id)) result.taskDependencies.updated++;
      else result.taskDependencies.created++;
    }

    for (const c of data.taskClaims) {
      const userId = remap.get(c.userId) ?? null;
      if (!userId) {
        result.taskClaims.skipped++;
        result.warnings.push(`Task claim ${c.id}: user ${c.userId} not found — claim skipped.`);
        continue;
      }
      const base = {
        taskId: c.taskId,
        userId,
        claimedAt: new Date(c.claimedAt),
        releasedAt: c.releasedAt ? new Date(c.releasedAt) : null,
      };
      await tx.taskClaim.upsert({
        where: { id: c.id },
        create: { id: c.id, ...base },
        update: base,
      });
      if (exClaims.has(c.id)) result.taskClaims.updated++;
      else result.taskClaims.created++;
    }

    for (const e of data.events) {
      const base = {
        projectId: e.projectId,
        featureId: e.featureId,
        taskId: e.taskId,
        kind: e.kind,
        actorUserId: resolveNullable(e.actorUserId, 'event actor'),
        actorAgentId: e.actorAgentId,
        title: e.title,
        body: e.body,
        metadata: jsonInput(e.metadata),
        createdAt: new Date(e.createdAt),
      };
      await tx.projectEvent.upsert({
        where: { id: e.id },
        create: { id: e.id, ...base },
        update: base,
      });
      if (exEvents.has(e.id)) result.events.updated++;
      else result.events.created++;
    }
  });

  return result;
}
