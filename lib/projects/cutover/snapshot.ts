/**
 * Cutover — assemble the plan + history into a transfer snapshot (§19 t-2).
 *
 * Pure: `buildCutoverSnapshot(leadUserId)` turns `plan-data.ts` (the 19 features
 * at their real statuses + shipped tasks) and `history-data.ts` (the backdated
 * decisions) into a `ProjectTransfer` — the exact shape the shipped
 * `importProject` (§19 t-1) upserts. `import-plan` resolves the lead's real user
 * id and feeds it here, then loads the result.
 *
 * Two families of `ProjectEvent` are emitted with **explicit backdated
 * `createdAt`** (the reason the cutover is a coded load, not the `now()`-stamping
 * MCP verbs): a `feature_shipped` per shipped feature (from its `shippedAt`) and
 * a `decision` per history entry.
 */

import type { ProjectTransfer, ProjectSnapshotData } from '@/lib/projects/transfer/schema';
import { PROJECT_TRANSFER_VERSION } from '@/lib/projects/transfer/schema';
import {
  buildCutoverPlan,
  CUTOVER_PROJECT,
  cid,
  featureId,
  taskId,
  featureDepId,
  indicativeId,
} from '@/lib/projects/cutover/plan-data';
import { buildCutoverHistory } from '@/lib/projects/cutover/history-data';

type Data = ProjectSnapshotData;

/**
 * Build the cutover snapshot. `leadUserId` is the real Hub lead (resolved by
 * `import-plan`); it owns every shipped/in-flight feature and authors the
 * events. `memberId` is the id to use for the lead's membership row — pass an
 * **existing** membership's id so the upsert updates it in place rather than
 * colliding on the `(projectId, userId)` unique (the retired `006` seed created
 * that row with a non-deterministic id); defaults to a stable id for a fresh DB.
 * `exportedAt` is injectable for deterministic tests.
 */
export function buildCutoverSnapshot(
  leadUserId: string,
  memberId = cid('member', 'lead'),
  exportedAt = '2026-07-22T12:00:00.000Z'
): ProjectTransfer {
  const features = buildCutoverPlan();

  const featureRows: Data['features'] = features.map((f) => ({
    id: featureId(f.slug),
    projectId: CUTOVER_PROJECT.id,
    slug: f.slug,
    title: f.title,
    description: f.description,
    doneWhen: f.doneWhen ?? null,
    references: f.references ?? null,
    ownerUserId: f.unowned ? null : leadUserId,
    status: f.status,
    planningStage: f.planningStage ?? (f.tasks.length > 0 ? 'planned' : 'indicative'),
    helpWanted: f.helpWanted ?? false,
    createdAt: f.createdAt,
  }));

  const featureDependencies: Data['featureDependencies'] = features.flatMap((f) =>
    f.dependsOn.map((dep) => ({
      id: featureDepId(f.slug, dep),
      featureId: featureId(f.slug),
      dependsOnFeatureId: featureId(dep),
    }))
  );

  const indicativeTasks: Data['indicativeTasks'] = features.flatMap((f) =>
    (f.indicativeTasks ?? []).map((text, i) => ({
      id: indicativeId(f.slug, i),
      featureId: featureId(f.slug),
      order: i,
      text,
    }))
  );

  // Real tasks get a project-wide number 1..N in feature order (f-refs invariant),
  // default their assignee to the feature owner, and record the claimant for any
  // task past `available`.
  const tasks: Data['tasks'] = [];
  let taskNumber = 0;
  for (const f of features) {
    const owner = f.unowned ? null : leadUserId;
    for (const [i, t] of f.tasks.entries()) {
      taskNumber += 1;
      const claimed = t.status === 'claimed' || t.status === 'in_pr' || t.status === 'merged';
      tasks.push({
        id: taskId(f.slug, i),
        featureId: featureId(f.slug),
        number: taskNumber,
        title: t.title,
        description: null,
        doneWhen: null,
        status: t.status,
        filesScope: [],
        assigneeUserId: owner,
        claimedByUserId: claimed ? owner : null,
        prUrl: t.prUrl ?? null,
        createdAt: f.shippedAt ?? f.createdAt,
      });
    }
  }

  // feature_shipped events — one per shipped feature, backdated to shippedAt.
  const shipEvents: Data['events'] = features
    .filter((f) => f.status === 'shipped' && f.shippedAt)
    .map((f) => ({
      id: cid('evship', f.slug),
      projectId: CUTOVER_PROJECT.id,
      featureId: featureId(f.slug),
      taskId: null,
      kind: 'feature_shipped' as const,
      actorUserId: leadUserId,
      actorAgentId: null,
      title: null,
      body: `${f.title} shipped — ${f.description}${
        f.tasks.length ? ` (${f.tasks.map((t) => t.prUrl).filter(Boolean).length} PRs)` : ''
      }`,
      metadata: { prUrls: f.tasks.map((t) => t.prUrl).filter((u): u is string => Boolean(u)) },
      createdAt: f.shippedAt as string,
    }));

  // decision events — one per decisions-log entry, backdated.
  const decisionEvents: Data['events'] = buildCutoverHistory().map((d, i) => ({
    id: cid('evdec', i),
    projectId: CUTOVER_PROJECT.id,
    featureId: d.featureSlug ? featureId(d.featureSlug) : null,
    taskId: null,
    kind: 'decision' as const,
    actorUserId: leadUserId,
    actorAgentId: null,
    title: d.title,
    body: d.body,
    metadata: null,
    createdAt: d.date,
  }));

  const data: Data = {
    project: {
      id: CUTOVER_PROJECT.id,
      name: CUTOVER_PROJECT.name,
      hostPlatform: CUTOVER_PROJECT.hostPlatform,
      status: 'active',
      repoUrls: ['https://github.com/human-centric-engineering/hce-hub'],
      leadUserId,
      knowledgeTagId: null,
      sidekickAgentId: null,
      taskCounter: taskNumber,
      createdAt: CUTOVER_PROJECT.createdAt,
    },
    members: [
      {
        id: memberId,
        userId: leadUserId,
        role: 'lead',
        addedAt: CUTOVER_PROJECT.createdAt,
        userHint: null,
      },
    ],
    features: featureRows,
    featureDependencies,
    indicativeTasks,
    tasks,
    taskDependencies: [],
    taskClaims: [],
    events: [...shipEvents, ...decisionEvents],
  };

  return { schemaVersion: PROJECT_TRANSFER_VERSION, exportedAt, data };
}
