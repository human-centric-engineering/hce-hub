/**
 * Unit: project transfer export ↔ import round-trip (f-selfhost-cutover §19 t-1).
 * @see lib/projects/transfer/exporter.ts · lib/projects/transfer/importer.ts
 *
 * The load-bearing test: exporter and importer run against **one shared
 * in-memory Prisma fake**, so `import(snapshot) → export` proves round-trip
 * identity (ids + createdAt + every field survive) — plus the user-resolution
 * paths (missing → null/skip + warn; cross-env email re-resolution).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

type Row = Record<string, unknown>;
interface DelegateArgs {
  where?: Record<string, unknown>;
  select?: Record<string, boolean>;
  data?: Row;
  create?: Row;
  update?: Row;
}

const store = vi.hoisted(() => {
  const tables: Record<string, Map<string, Record<string, unknown>>> = {};
  for (const n of [
    'project',
    'projectMember',
    'feature',
    'featureDependency',
    'indicativeTask',
    'task',
    'taskDependency',
    'taskClaim',
    'projectEvent',
    'user',
  ]) {
    tables[n] = new Map();
  }
  return { tables };
});

function hasIn(v: unknown): v is { in: unknown[] } {
  return (
    typeof v === 'object' && v !== null && 'in' in v && Array.isArray((v as { in: unknown[] }).in)
  );
}
function matchWhere(row: Row, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) =>
    hasIn(cond) ? cond.in.includes(row[k]) : row[k] === cond
  );
}
function pick(row: Row, select: Record<string, boolean>): Row {
  const o: Row = {};
  for (const k of Object.keys(select)) if (select[k]) o[k] = row[k];
  return o;
}
function normalize(data: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v === Prisma.DbNull || v === Prisma.JsonNull ? null : v;
  }
  return out;
}
function delegate(name: string) {
  const t = store.tables[name];
  return {
    findUnique: async ({ where, select }: DelegateArgs) => {
      const r = (where?.id !== undefined && t.get(where.id as string)) || null;
      return r && select ? pick(r, select) : r;
    },
    findMany: async ({ where, select }: DelegateArgs = {}) =>
      [...t.values()]
        .filter((r) => matchWhere(r, where))
        .map((r) => (select ? pick(r, select) : r)),
    create: async ({ data }: DelegateArgs) => {
      const row = normalize(data as Row);
      t.set(row.id as string, row);
      return row;
    },
    update: async ({ where, data }: DelegateArgs) => {
      const row = { ...t.get(where!.id as string), ...normalize(data as Row) };
      t.set(where!.id as string, row);
      return row;
    },
    upsert: async ({ where, create, update }: DelegateArgs) => {
      const id = where!.id as string;
      if (t.has(id)) {
        const row = { ...t.get(id), ...normalize(update as Row) };
        t.set(id, row);
        return row;
      }
      const row = normalize(create as Row);
      t.set(row.id as string, row);
      return row;
    },
    delete: async ({ where }: DelegateArgs) => {
      const r = t.get(where!.id as string);
      t.delete(where!.id as string);
      return r;
    },
  };
}
function makeFake(): Record<string, ReturnType<typeof delegate>> {
  const client: Record<string, ReturnType<typeof delegate>> = {};
  // Derive model names from the hoisted store (not a top-level const) so the
  // vi.mock factory can call this during the SUT import without a TDZ hazard.
  for (const n of Object.keys(store.tables)) client[n] = delegate(n);
  return client;
}

vi.mock('@/lib/db/client', () => ({ prisma: makeFake() }));
vi.mock('@/lib/db/utils', () => ({
  executeTransaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(makeFake()),
}));

import { importProject } from '@/lib/projects/transfer/importer';
import { exportProject, ProjectNotFoundError } from '@/lib/projects/transfer/exporter';
import type { ProjectTransfer } from '@/lib/projects/transfer/schema';

function seedUser(id: string, email: string, name: string): void {
  store.tables.user.set(id, { id, email, name });
}

/** A representative snapshot: 2 features (B→A dep), 2 tasks (B→A dep), a claim,
 * an indicative sketch, and 2 events (one backdated). Every user ref is `user-1`.
 * Arrays are pre-sorted by id so the exporter's deterministic order matches. */
function makeSnapshot(): ProjectTransfer {
  return {
    schemaVersion: 1,
    exportedAt: '2026-07-22T00:00:00.000Z',
    data: {
      project: {
        id: 'p1',
        name: 'HCE Hub',
        hostPlatform: 'sunrise',
        status: 'active',
        repoUrls: ['https://github.com/x/y'],
        leadUserId: 'user-1',
        knowledgeTagId: null,
        sidekickAgentId: null,
        taskCounter: 2,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
      members: [
        {
          id: 'm1',
          userId: 'user-1',
          role: 'lead',
          addedAt: '2026-07-01T00:00:00.000Z',
          userHint: { email: 'u1@example.com', name: 'User One' },
        },
      ],
      features: [
        {
          id: 'feat-a',
          projectId: 'p1',
          slug: 'f-a',
          title: 'Feature A',
          description: 'first',
          doneWhen: 'A is done',
          references: [{ label: 'ref', target: 'https://example.com' }],
          ownerUserId: 'user-1',
          status: 'shipped',
          planningStage: 'planned',
          helpWanted: false,
          createdAt: '2026-07-02T00:00:00.000Z',
        },
        {
          id: 'feat-b',
          projectId: 'p1',
          slug: 'f-b',
          title: 'Feature B',
          description: null,
          doneWhen: null,
          references: null,
          ownerUserId: 'user-1',
          status: 'planning',
          planningStage: 'indicative',
          helpWanted: true,
          createdAt: '2026-07-03T00:00:00.000Z',
        },
      ],
      featureDependencies: [{ id: 'fdep-1', featureId: 'feat-b', dependsOnFeatureId: 'feat-a' }],
      indicativeTasks: [{ id: 'ind-1', featureId: 'feat-b', order: 0, text: 'a sketch step' }],
      tasks: [
        {
          id: 'task-a',
          featureId: 'feat-a',
          number: 1,
          title: 'Task A',
          description: null,
          doneWhen: null,
          status: 'merged',
          filesScope: ['lib/x.ts'],
          assigneeUserId: 'user-1',
          claimedByUserId: null,
          prUrl: 'https://pr/1',
          createdAt: '2026-07-04T00:00:00.000Z',
        },
        {
          id: 'task-b',
          featureId: 'feat-a',
          number: 2,
          title: 'Task B',
          description: 'second',
          doneWhen: 'B merged',
          status: 'claimed',
          filesScope: [],
          assigneeUserId: 'user-1',
          claimedByUserId: 'user-1',
          prUrl: null,
          createdAt: '2026-07-05T00:00:00.000Z',
        },
      ],
      taskDependencies: [{ id: 'tdep-1', taskId: 'task-b', dependsOnTaskId: 'task-a' }],
      taskClaims: [
        {
          id: 'claim-1',
          taskId: 'task-b',
          userId: 'user-1',
          claimedAt: '2026-07-05T00:00:00.000Z',
          releasedAt: null,
        },
      ],
      events: [
        {
          id: 'ev-1',
          projectId: 'p1',
          featureId: null,
          taskId: null,
          kind: 'decision',
          actorUserId: 'user-1',
          actorAgentId: null,
          title: 'a call',
          body: 'because',
          metadata: null,
          createdAt: '2026-07-06T00:00:00.000Z',
        },
        {
          id: 'ev-2',
          projectId: 'p1',
          featureId: 'feat-a',
          taskId: null,
          kind: 'feature_shipped',
          actorUserId: null,
          actorAgentId: null,
          title: null,
          body: 'shipped A',
          metadata: { prUrl: 'https://pr/1' },
          createdAt: '2020-01-02T03:04:05.000Z', // backdated
        },
      ],
    },
  };
}

beforeEach(() => {
  for (const t of Object.values(store.tables)) t.clear();
});

describe('project transfer round-trip', () => {
  it('import → export reproduces the snapshot byte-for-byte (ids + createdAt preserved)', async () => {
    seedUser('user-1', 'u1@example.com', 'User One');
    const snap = makeSnapshot();

    const res = await importProject(snap);
    expect(res.project).toBe('created');
    expect(res.warnings).toEqual([]);
    expect(res.features.created).toBe(2);
    expect(res.tasks.created).toBe(2);
    expect(res.events.created).toBe(2);
    expect(res.members.created).toBe(1);

    const out = await exportProject('p1');
    expect(out.data).toEqual(snap.data);
    // Explicit: the backdated event kept its timestamp.
    expect(out.data.events.find((e) => e.id === 'ev-2')?.createdAt).toBe(
      '2020-01-02T03:04:05.000Z'
    );
  });

  it('re-import is idempotent — second run updates in place, export still matches', async () => {
    seedUser('user-1', 'u1@example.com', 'User One');
    const snap = makeSnapshot();
    await importProject(snap);

    const res2 = await importProject(snap);
    expect(res2.project).toBe('updated');
    expect(res2.features.updated).toBe(2);
    expect(res2.features.created).toBe(0);
    expect(res2.tasks.updated).toBe(2);

    const out = await exportProject('p1');
    expect(out.data).toEqual(snap.data);
  });

  it('a missing user nulls optional refs and skips required ones, with warnings', async () => {
    // No users seeded → nothing resolves.
    const res = await importProject(makeSnapshot());
    expect(res.members.skipped).toBe(1);
    expect(res.members.created).toBe(0);
    expect(res.taskClaims.skipped).toBe(1);
    expect(res.warnings.length).toBeGreaterThan(0);

    const out = await exportProject('p1');
    expect(out.data.project.leadUserId).toBeNull(); // optional FK nulled
    expect(out.data.features.every((f) => f.ownerUserId === null)).toBe(true);
    expect(out.data.members).toHaveLength(0); // required-user member skipped
    expect(out.data.taskClaims).toHaveLength(0); // required-user claim skipped
    // The optional task refs nulled too.
    expect(
      out.data.tasks.every((t) => t.assigneeUserId === null && t.claimedByUserId === null)
    ).toBe(true);
  });

  it('re-resolves a member (and its refs) by hint email on a different environment', async () => {
    // The original id `user-1` is absent; a target user shares its hint email.
    seedUser('user-9', 'u1@example.com', 'Someone Else');
    const res = await importProject(makeSnapshot());
    expect(res.members.created).toBe(1);
    expect(res.members.skipped).toBe(0);
    expect(res.warnings).toEqual([]);

    const out = await exportProject('p1');
    expect(out.data.members[0].userId).toBe('user-9');
    // The remap applies to all refs — the feature owner resolves too.
    expect(out.data.features.every((f) => f.ownerUserId === 'user-9')).toBe(true);
    expect(out.data.project.leadUserId).toBe('user-9');
  });

  it('exportProject throws ProjectNotFoundError for an unknown id', async () => {
    await expect(exportProject('nope')).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('importProject rejects an unsupported schemaVersion', async () => {
    const bad = { ...makeSnapshot(), schemaVersion: 99 };
    await expect(importProject(bad)).rejects.toThrow();
  });

  it('export tolerates a member whose user is gone and serialises a released claim', async () => {
    // Seed the store directly (no user row for the member; a released claim).
    const d = (s: string): Date => new Date(s);
    store.tables.project.set('p2', {
      id: 'p2',
      name: 'P2',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: null,
      knowledgeTagId: null,
      sidekickAgentId: null,
      taskCounter: 1,
      createdAt: d('2026-07-01T00:00:00.000Z'),
    });
    store.tables.projectMember.set('m2', {
      id: 'm2',
      projectId: 'p2',
      userId: 'ghost', // no matching user row
      role: 'member',
      addedAt: d('2026-07-01T00:00:00.000Z'),
    });
    store.tables.feature.set('feat-x', {
      id: 'feat-x',
      projectId: 'p2',
      slug: null,
      title: 'X',
      description: null,
      doneWhen: null,
      references: null,
      ownerUserId: null,
      status: 'planning',
      planningStage: 'indicative',
      helpWanted: false,
      phaseId: null,
      createdAt: d('2026-07-02T00:00:00.000Z'),
    });
    store.tables.task.set('task-x', {
      id: 'task-x',
      featureId: 'feat-x',
      number: 1,
      title: 'TX',
      description: null,
      doneWhen: null,
      status: 'available',
      filesScope: [],
      assigneeUserId: null,
      claimedByUserId: null,
      prUrl: null,
      createdAt: d('2026-07-03T00:00:00.000Z'),
    });
    store.tables.taskClaim.set('claim-x', {
      id: 'claim-x',
      taskId: 'task-x',
      userId: 'ghost',
      claimedAt: d('2026-07-03T00:00:00.000Z'),
      releasedAt: d('2026-07-04T00:00:00.000Z'),
    });

    const out = await exportProject('p2');
    expect(out.data.members[0].userHint).toBeNull(); // user gone → no hint
    expect(out.data.taskClaims[0].releasedAt).toBe('2026-07-04T00:00:00.000Z');
  });
});
