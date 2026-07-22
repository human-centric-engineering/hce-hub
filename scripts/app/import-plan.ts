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
 * Idempotent + conflict-free on a fresh DB and every re-run (it reconciles the
 * lead's membership id in place — see the note in `buildCutoverSnapshot`). On a
 * dev DB that still holds the *retired* `006`/`007` seed data, the retired demo
 * collaborators linger as members (harmless — an additive load doesn't remove
 * them; `db:reset` clears them, since the seed no longer recreates the project).
 */

import { prisma } from '@/lib/db/client';
import { humanWhere } from '@/lib/auth/account';
import { importProject } from '@/lib/projects/transfer/importer';
import { buildCutoverSnapshot } from '@/lib/projects/cutover/snapshot';
import { CUTOVER_PROJECT } from '@/lib/projects/cutover/plan-data';

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
  // Reuse an existing lead membership's id (e.g. one the retired 006 seed created
  // with a non-deterministic id) so the upsert updates it in place instead of
  // colliding on the (projectId, userId) unique. Fresh DBs use the default id.
  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: CUTOVER_PROJECT.id, userId: lead.id } },
    select: { id: true },
  });
  const snapshot = buildCutoverSnapshot(lead.id, existingMember?.id);
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
