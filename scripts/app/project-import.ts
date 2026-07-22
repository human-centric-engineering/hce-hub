/**
 * HCE Hub — import a project snapshot (f-selfhost-cutover §19 t-1).
 *
 * Upserts a snapshot produced by `app:project:export` — idempotent (re-import
 * updates in place) and FK-safe. The re-hydration half of the backup ritual
 * (after a `db:reset`) and the dev → prod promotion step.
 *
 * Usage:
 *   npm run app:project:import -- <file.snapshot.json>
 */

import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db/client';
import { importProject } from '@/lib/projects/transfer/importer';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run app:project:import -- <file.snapshot.json>');
    process.exit(1);
  }

  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const r = await importProject(raw);

  console.log(`✓ Imported project (${r.project})`);
  console.log(
    `  features ${r.features.created}c/${r.features.updated}u · ` +
      `tasks ${r.tasks.created}c/${r.tasks.updated}u · ` +
      `events ${r.events.created}c/${r.events.updated}u · ` +
      `members ${r.members.created}c/${r.members.updated}u/${r.members.skipped}s`
  );
  if (r.warnings.length) {
    console.warn(`  ⚠ ${r.warnings.length} warning(s):`);
    for (const w of r.warnings) console.warn(`    - ${w}`);
  }
}

main()
  .catch((err) => {
    console.error('✗ app:project:import failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
