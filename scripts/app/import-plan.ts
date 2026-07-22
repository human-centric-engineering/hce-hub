/**
 * HCE Hub — the cutover load: materialise this build into the Hub (§19 t-2).
 *
 * The one-shot that makes the Hub its own system of record (self-hosting §5
 * path C): resolves the real lead, builds the backdated cutover snapshot
 * (`lib/projects/cutover`), and loads it through the shipped `importProject`
 * (§19 t-1) — idempotent, and **reusing the sample project's stable id** so it
 * *upgrades the retired `006` seed's project in place* (no duplicate). Run it
 * once at cutover, then `app:project:export` a baseline snapshot.
 *
 * Usage:
 *   npm run app:project:import-plan          # first human user = lead
 *   npm run app:project:import-plan -- <email>   # a specific lead
 *
 * First run on a dev DB that still holds the *retired* `006` sample project:
 * clear it first (`db:reset` — the seed no longer recreates it — or delete the
 * `chubproject` project), because that seed created the lead's membership with a
 * non-deterministic id whose (project, user) key collides with this load's. A
 * clean DB and every subsequent re-run are conflict-free + idempotent.
 */

import { prisma } from '@/lib/db/client';
import { humanWhere } from '@/lib/auth/account';
import { importProject } from '@/lib/projects/transfer/importer';
import { buildCutoverSnapshot } from '@/lib/projects/cutover/snapshot';

async function main(): Promise<void> {
  const email = process.argv[2];
  const lead = await prisma.user.findFirst({
    where: email ? { email } : { ...humanWhere, NOT: { email: { endsWith: '@demo.hce.local' } } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });

  if (!lead) {
    console.error(
      email
        ? `✗ No user with email ${email}. Sign in first, or omit the arg to use the first human user.`
        : '✗ No human user found — sign in to the Hub once, then re-run (the lead must exist to own the imported features).'
    );
    process.exit(1);
  }

  console.log(`Importing the HCE Hub build plan with lead ${lead.email} …`);
  const snapshot = buildCutoverSnapshot(lead.id);
  const r = await importProject(snapshot);

  console.log(`✓ Cutover import complete (project ${r.project})`);
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
    console.error('✗ app:project:import-plan failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
