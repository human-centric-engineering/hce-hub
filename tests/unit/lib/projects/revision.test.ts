/**
 * Tests: the project revision cursor (f-realtime §36 t-125)
 *
 * Two jobs, and the first is the load-bearing one.
 *
 * **The manifest guard.** `PROJECT_REVISION_TABLES` is hand-written, and a table
 * missing from it fails in the worst possible direction: the endpoint keeps
 * returning 200s, the token simply stops moving for that table, and every open
 * surface goes quietly stale. Nothing else in the system would notice. So the
 * schema is walked and the manifest checked against it, the same net
 * `tests/unit/lib/app/data-export.test.ts` casts over the export seam.
 *
 * **The fold.** That `(max, count)` catches all four kinds of change — and in
 * particular that the count half is real, since a delete moves nothing else.
 *
 * What these CANNOT check is that the SQL is correct against a real database:
 * vitest runs on happy-dom with no live DB, and `$queryRaw` is mocked here. That
 * is `npm run smoke:project-revision`'s job — it drives a real mutation through
 * every counted table and asserts the token moved.
 *
 * @see lib/projects/revision.ts · scripts/smoke/project-revision.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

vi.mock('@/lib/db/client', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('@/lib/projects/access', () => ({ requireProjectAccess: vi.fn() }));

import { prisma } from '@/lib/db/client';
import { requireProjectAccess } from '@/lib/projects/access';
import { NotFoundError } from '@/lib/api/errors';
import {
  getProjectRevision,
  PROJECT_REVISION_TABLES,
  COUNTED_REVISION_TABLES,
} from '@/lib/projects/revision';

const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const requireAccess = requireProjectAccess as ReturnType<typeof vi.fn>;

const PID = 'cmjbv4i3x00003wsloputgwul';
const SCHEMA = path.join(process.cwd(), 'prisma/schema/app.prisma');

/** Every `app_*` table the Hub's schema actually maps. */
function mappedTables(): string[] {
  const matches = readFileSync(SCHEMA, 'utf8').matchAll(/@@map\("(app_[a-z_]+)"\)/g);
  return [...matches].map((m) => m[1]).sort();
}

/** The SQL text of the single query the module issues. */
function issuedSql(): string {
  const [fragment] = queryRaw.mock.calls[0] as [Prisma.Sql];
  return fragment.sql;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAccess.mockResolvedValue(undefined);
  queryRaw.mockResolvedValue([{ ts: new Date('2026-08-21T10:00:00.000Z'), n: 42n }]);
});

describe('the revision manifest', () => {
  it('has ruled on every app_* table in the schema', () => {
    const onDisk = mappedTables();
    const ruled = Object.keys(PROJECT_REVISION_TABLES).sort();

    const missing = onDisk.filter((t) => !ruled.includes(t));
    const stale = ruled.filter((t) => !onDisk.includes(t));

    expect(
      missing,
      'app_* table with no entry in PROJECT_REVISION_TABLES — decide whether a change ' +
        'to it can make a project surface stale, then add it as "counted" (with a ' +
        'fragment in SOURCE_SQL) or "not-project-scoped"'
    ).toEqual([]);
    expect(stale, 'PROJECT_REVISION_TABLES entry for a table that no longer exists').toEqual([]);
  });

  it('counts every table that carries a projectId column', () => {
    // The rule the previous test cannot enforce: a table MAY be excluded, but not
    // if the schema itself says it hangs off a project. Read from the schema
    // rather than from the record, so a mislabelled table fails here rather than
    // being taken at its word.
    const contents = readFileSync(SCHEMA, 'utf8');
    const wronglyExcluded: string[] = [];

    for (const block of contents.split(/^model /m).slice(1)) {
      const table = /@@map\("(app_[a-z_]+)"\)/.exec(block)?.[1];
      if (!table) continue;

      const hasProjectId = /^\s+projectId\s+String/m.test(block);
      const ruling = PROJECT_REVISION_TABLES[table as keyof typeof PROJECT_REVISION_TABLES];

      if (hasProjectId && ruling !== 'counted') wronglyExcluded.push(table);
    }

    expect(
      wronglyExcluded,
      'table has a projectId column but is marked not-project-scoped — a change to it ' +
        'can make that project’s surfaces stale'
    ).toEqual([]);
  });

  it('has a query fragment for exactly the counted tables', () => {
    const counted = Object.entries(PROJECT_REVISION_TABLES)
      .filter(([, ruling]) => ruling === 'counted')
      .map(([table]) => table)
      .sort();

    expect([...COUNTED_REVISION_TABLES].sort()).toEqual(counted);
  });

  it('joins every counted table into the query it issues', async () => {
    // Walks the manifest rather than listing tables, so a table counted tomorrow
    // is covered without touching this test — and a fragment that was written but
    // never folded into the UNION fails here instead of silently contributing
    // nothing to the token.
    await getProjectRevision('u1', PID);
    const sql = issuedSql();

    for (const table of COUNTED_REVISION_TABLES) {
      expect(sql, `${table} has a fragment but never reaches the query`).toContain(`"${table}"`);
    }
  });

  it('excludes the not-project-scoped tables from the query', async () => {
    await getProjectRevision('u1', PID);
    const sql = issuedSql();

    const excluded = Object.entries(PROJECT_REVISION_TABLES)
      .filter(([, ruling]) => ruling !== 'counted')
      .map(([table]) => table);

    // Guard against the check above being vacuous: there has to BE an exclusion.
    expect(excluded.length).toBeGreaterThan(0);
    for (const table of excluded) {
      expect(sql).not.toContain(`FROM "${table}"`);
    }
  });

  it('binds the project id as a parameter, never into the SQL text', async () => {
    await getProjectRevision('u1', PID);
    const [fragment] = queryRaw.mock.calls[0] as [Prisma.Sql];

    expect(fragment.sql).not.toContain(PID);
    expect(fragment.values).toContain(PID);
    // One bound copy per counted table — every fragment scopes itself.
    expect(fragment.values.filter((v) => v === PID)).toHaveLength(COUNTED_REVISION_TABLES.length);
  });
});

describe('getProjectRevision', () => {
  it('gates on membership before touching the database', async () => {
    requireAccess.mockRejectedValue(new NotFoundError(`Project ${PID} not found`));

    await expect(getProjectRevision('stranger', PID)).rejects.toThrow(NotFoundError);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns the same token for an unchanged project', async () => {
    const a = await getProjectRevision('u1', PID);
    const b = await getProjectRevision('u1', PID);
    expect(b.revision).toBe(a.revision);
  });

  it('moves the token when the newest timestamp moves (an edit)', async () => {
    const before = await getProjectRevision('u1', PID);

    queryRaw.mockResolvedValue([{ ts: new Date('2026-08-21T10:00:01.000Z'), n: 42n }]);
    const after = await getProjectRevision('u1', PID);

    expect(after.revision).not.toBe(before.revision);
  });

  it('moves the token when only the row count changes (a delete)', async () => {
    // The half a max-only cursor misses entirely: deleting a row leaves every
    // remaining timestamp exactly where it was.
    const before = await getProjectRevision('u1', PID);

    queryRaw.mockResolvedValue([{ ts: new Date('2026-08-21T10:00:00.000Z'), n: 41n }]);
    const after = await getProjectRevision('u1', PID);

    expect(after.revision).not.toBe(before.revision);
  });

  it('reports when the project last changed, as an ISO string', async () => {
    const { changedAt } = await getProjectRevision('u1', PID);
    expect(changedAt).toBe('2026-08-21T10:00:00.000Z');
  });

  it('survives a project with no rows in any counted table', async () => {
    queryRaw.mockResolvedValue([{ ts: null, n: null }]);
    const revision = await getProjectRevision('u1', PID);

    expect(revision.changedAt).toBeNull();
    expect(revision.revision).toMatch(/^W\/"/);
  });

  it('never lets the BigInt count reach the payload', async () => {
    // Postgres COUNT/SUM come back as BigInt, which JSON.stringify throws on. If
    // one leaked into the DTO the route would 500 rather than fail a type-check.
    const revision = await getProjectRevision('u1', PID);
    expect(() => JSON.stringify(revision)).not.toThrow();
  });
});
