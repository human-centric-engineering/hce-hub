/**
 * Tests: the Hub's subject-data export seam (GDPR Art. 15)
 *
 * The core guard (`tests/unit/lib/privacy/export-sources.test.ts`) diffs the
 * schema against the CORE manifest; it cannot rule on fork tables, and its
 * relation-less heuristic misses ours anyway (our models carry intra-Hub
 * `@relation`s, so a `claimedByUserId` scalar is invisible to it). This file is
 * the fork's own net, the one `lib/app/data-export.ts` asks every fork to write:
 * grep `app.prisma` for `@@map("app_…")` and fail if a table has never been
 * ruled on.
 *
 * Adding an `app_*` model without deciding whether a data subject receives its
 * rows now breaks the build, instead of silently shipping a short answer.
 *
 * @see lib/app/data-export.ts · .context/privacy/data-export.md
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { HUB_SUBJECT_TABLES } from '@/lib/app/data-export';

const SCHEMA = path.join(process.cwd(), 'prisma/schema/app.prisma');

/** Every `app_*` table the Hub's schema actually maps. */
function mappedTables(): string[] {
  const contents = readFileSync(SCHEMA, 'utf8');
  const matches = contents.matchAll(/@@map\("(app_[a-z_]+)"\)/g);
  return [...matches].map((m) => m[1]).sort();
}

describe('Hub subject-data export', () => {
  it('has ruled on every app_* table in the schema', () => {
    const onDisk = mappedTables();
    const ruled = Object.keys(HUB_SUBJECT_TABLES).sort();

    const missing = onDisk.filter((t) => !ruled.includes(t));
    const stale = ruled.filter((t) => !onDisk.includes(t));

    expect(
      missing,
      'app_* table with no entry in HUB_SUBJECT_TABLES — decide whether a data ' +
        'subject receives its rows, then add it as "exported" or "no-personal-data"'
    ).toEqual([]);
    expect(stale, 'HUB_SUBJECT_TABLES entry for a table that no longer exists').toEqual([]);
  });

  it('every table holding a user column is marked exported', () => {
    // The rule the previous test cannot enforce: a table CAN be marked
    // no-personal-data, but not if it carries a user id. Reads the schema rather
    // than trusting the record, so mislabelling a table fails here.
    const contents = readFileSync(SCHEMA, 'utf8');
    const wronglyExcluded: string[] = [];

    for (const block of contents.split(/^model /m).slice(1)) {
      const table = /@@map\("(app_[a-z_]+)"\)/.exec(block)?.[1];
      if (!table) continue;

      const hasUserColumn = /^\s+\w*[Uu]serId\s+String/m.test(block);
      const ruling = HUB_SUBJECT_TABLES[table as keyof typeof HUB_SUBJECT_TABLES];

      if (hasUserColumn && ruling !== 'exported') wronglyExcluded.push(table);
    }

    expect(
      wronglyExcluded,
      'table carries a user-id column but is marked no-personal-data'
    ).toEqual([]);
  });
});
