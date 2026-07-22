/**
 * Project transfer — exporter (f-selfhost-cutover §19 t-1).
 *
 * Serialises one project's whole coordination graph to a versioned snapshot
 * (`lib/projects/transfer/schema.ts`). Read-only; deterministic — every
 * collection is sorted by `id` and dates are emitted as ISO strings, so
 * `export → import → export` is **byte-stable** (the round-trip identity the
 * durability + dev→prod guarantees rest on).
 *
 * Members carry a non-authoritative `userHint` (`{ email, name }`) so a
 * different-environment import can re-resolve them by email — never to mint a
 * `User`.
 */

import { prisma } from '@/lib/db/client';
import {
  PROJECT_TRANSFER_VERSION,
  type ProjectTransfer,
  type ProjectSnapshotData,
} from '@/lib/projects/transfer/schema';

/** Thrown when the project to export does not exist. */
export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

const iso = (d: Date): string => d.toISOString();
// Locale-independent code-unit ordering (not `localeCompare`, whose collation is
// ICU/locale-sensitive) so the sort — hence the whole snapshot — is byte-stable
// across environments. Branch-free; ids are unique so the 0 case never sorts.
const byId = <T extends { id: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => Number(a.id > b.id) - Number(a.id < b.id));

/**
 * Build the full snapshot for `projectId`. Throws `ProjectNotFoundError` if the
 * project doesn't exist. `now` is injectable so the `exportedAt` stamp is
 * testable (the row data is otherwise deterministic).
 */
export async function exportProject(
  projectId: string,
  now: Date = new Date()
): Promise<ProjectTransfer> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ProjectNotFoundError(projectId);

  const [members, features, events] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId } }),
    prisma.feature.findMany({ where: { projectId } }),
    prisma.projectEvent.findMany({ where: { projectId } }),
  ]);

  const featureIds = features.map((f) => f.id);
  const [featureDependencies, indicativeTasks, tasks] = await Promise.all([
    prisma.featureDependency.findMany({ where: { featureId: { in: featureIds } } }),
    prisma.indicativeTask.findMany({ where: { featureId: { in: featureIds } } }),
    prisma.task.findMany({ where: { featureId: { in: featureIds } } }),
  ]);

  const taskIds = tasks.map((t) => t.id);
  const [taskDependencies, taskClaims] = await Promise.all([
    prisma.taskDependency.findMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskClaim.findMany({ where: { taskId: { in: taskIds } } }),
  ]);

  // Member hints — resolve the referenced users once for cross-environment
  // re-resolution by email (never authoritative).
  const memberUserIds = [...new Set(members.map((m) => m.userId))];
  const users = memberUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const data: ProjectSnapshotData = {
    project: {
      id: project.id,
      name: project.name,
      hostPlatform: project.hostPlatform,
      status: project.status,
      repoUrls: project.repoUrls,
      leadUserId: project.leadUserId,
      knowledgeTagId: project.knowledgeTagId,
      sidekickAgentId: project.sidekickAgentId,
      taskCounter: project.taskCounter,
      createdAt: iso(project.createdAt),
    },
    members: byId(members).map((m) => {
      const u = userById.get(m.userId);
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        addedAt: iso(m.addedAt),
        userHint: u ? { email: u.email, name: u.name } : null,
      };
    }),
    features: byId(features).map((f) => ({
      id: f.id,
      projectId: f.projectId,
      slug: f.slug,
      title: f.title,
      description: f.description,
      doneWhen: f.doneWhen,
      references: f.references ?? null,
      ownerUserId: f.ownerUserId,
      status: f.status,
      planningStage: f.planningStage,
      helpWanted: f.helpWanted,
      // phaseId intentionally omitted — see schema.ts (Phase not transferred).
      createdAt: iso(f.createdAt),
    })),
    featureDependencies: byId(featureDependencies).map((d) => ({
      id: d.id,
      featureId: d.featureId,
      dependsOnFeatureId: d.dependsOnFeatureId,
    })),
    indicativeTasks: byId(indicativeTasks).map((it) => ({
      id: it.id,
      featureId: it.featureId,
      order: it.order,
      text: it.text,
    })),
    tasks: byId(tasks).map((t) => ({
      id: t.id,
      featureId: t.featureId,
      number: t.number,
      title: t.title,
      description: t.description,
      doneWhen: t.doneWhen,
      status: t.status,
      filesScope: t.filesScope,
      assigneeUserId: t.assigneeUserId,
      claimedByUserId: t.claimedByUserId,
      prUrl: t.prUrl,
      createdAt: iso(t.createdAt),
    })),
    taskDependencies: byId(taskDependencies).map((d) => ({
      id: d.id,
      taskId: d.taskId,
      dependsOnTaskId: d.dependsOnTaskId,
    })),
    taskClaims: byId(taskClaims).map((c) => ({
      id: c.id,
      taskId: c.taskId,
      userId: c.userId,
      claimedAt: iso(c.claimedAt),
      releasedAt: c.releasedAt ? iso(c.releasedAt) : null,
    })),
    events: byId(events).map((e) => ({
      id: e.id,
      projectId: e.projectId,
      featureId: e.featureId,
      taskId: e.taskId,
      kind: e.kind,
      actorUserId: e.actorUserId,
      actorAgentId: e.actorAgentId,
      title: e.title,
      body: e.body,
      metadata: e.metadata ?? null,
      createdAt: iso(e.createdAt),
    })),
  };

  return { schemaVersion: PROJECT_TRANSFER_VERSION, exportedAt: iso(now), data };
}
