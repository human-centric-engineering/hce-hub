/**
 * One-off migration (t-65) — replace the synthetic project id `chubproject` with a
 * real cuid.
 *
 * **Why (not hygiene).** `getAccessibleProjectByRef` resolves `OR: [{ id }, { slug }]`.
 * `chubproject` is *slug-shaped* (lowercase, no hyphens), so it shares the slug
 * namespace — a future project could take `chubproject` as its slug and make that URL
 * ambiguous. A real cuid makes the two namespaces disjoint. Scope is the **project row
 * only**; feature/task ids stay synthetic (a recorded decision).
 *
 * **Safe by construction.** All six child tables (`app_project_member`, `app_feature`,
 * `app_phase`, `app_focus_directive`, `app_project_event`, `app_idea`) declare
 * `ON UPDATE CASCADE` on their `projectId` FK, so Postgres rewrites the children
 * itself in one statement. Tasks hang off `featureId` — untouched. This script:
 *   1. takes a transfer-export backup first (round-trips → a real restore path),
 *   2. mints a Prisma-native cuid via a throwaway row (guaranteed `z.cuid()`-valid),
 *   3. runs the cascading UPDATE inside a transaction and **verifies** every child
 *      moved and none was stranded — any mismatch rolls the whole thing back,
 *   4. tidies the knowledge-tag slug if it named the old id (non-FK, cosmetic).
 *
 * Idempotent: refuses (cleanly) if the project id is already a real cuid.
 *
 * Usage: `npm run app:project:migrate-id`
 * Dry-run it on dev first; then run it on prod with prod creds. `AdminAuditLog`
 * rows keep the old id verbatim (correct for an immutable log) — pre-change audit
 * filters on the new id won't match, by design.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/db/client';
import { exportProject } from '@/lib/projects/transfer/exporter';

const SYNTHETIC_ID = 'chubproject';

/** Per-table child counts for the six `projectId` FK tables (all ON UPDATE CASCADE). */
type ChildCounts = Record<
  'members' | 'features' | 'phases' | 'directives' | 'events' | 'ideas',
  number
>;

async function countChildren(
  tx: Pick<
    typeof prisma,
    'projectMember' | 'feature' | 'phase' | 'focusDirective' | 'projectEvent' | 'idea'
  >,
  projectId: string
): Promise<ChildCounts> {
  const [members, features, phases, directives, events, ideas] = await Promise.all([
    tx.projectMember.count({ where: { projectId } }),
    tx.feature.count({ where: { projectId } }),
    tx.phase.count({ where: { projectId } }),
    tx.focusDirective.count({ where: { projectId } }),
    tx.projectEvent.count({ where: { projectId } }),
    tx.idea.count({ where: { projectId } }),
  ]);
  return { members, features, phases, directives, events, ideas };
}

async function main(): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: SYNTHETIC_ID }, { slug: 'hce-hub' }] },
    select: { id: true, slug: true, name: true, knowledgeTagId: true },
  });
  if (!project) {
    console.error(`✗ No project found (id=${SYNTHETIC_ID} / slug=hce-hub).`);
    process.exit(1);
  }
  if (project.id !== SYNTHETIC_ID) {
    console.log(
      `✓ Already migrated — project id is ${project.id} (not the synthetic ${SYNTHETIC_ID}). Nothing to do.`
    );
    return;
  }

  // 1. Backup: a transfer export (the shipped round-trip format, a real restore path).
  const snapshot = await exportProject(SYNTHETIC_ID);
  mkdirSync('backups', { recursive: true });
  const backupPath = `backups/project-${SYNTHETIC_ID}.json`;
  writeFileSync(backupPath, JSON.stringify(snapshot, null, 2));
  console.log(`✓ Backup written: ${backupPath} (${JSON.stringify(snapshot).length} bytes)`);

  const newId = await prisma.$transaction(async (tx) => {
    // 2. Mint a Prisma-native cuid via a throwaway row (rolled into this tx, so it
    //    never persists and is discarded on any failure below).
    const tmp = await tx.project.create({
      data: { name: '__migrate_id_tmp__', hostPlatform: 'sunrise' },
      select: { id: true },
    });
    const id = tmp.id;
    await tx.project.delete({ where: { id: tmp.id } });

    // 3. The cascading UPDATE — Postgres rewrites the six children via ON UPDATE CASCADE.
    const before = await countChildren(tx, SYNTHETIC_ID);
    await tx.$executeRaw`UPDATE "app_project" SET "id" = ${id} WHERE "id" = ${SYNTHETIC_ID}`;
    const after = await countChildren(tx, id);
    const stranded = await countChildren(tx, SYNTHETIC_ID);

    // Verify: every child moved (before == after) and none stayed on the old id.
    for (const key of Object.keys(before) as (keyof ChildCounts)[]) {
      if (before[key] !== after[key] || stranded[key] !== 0) {
        throw new Error(
          `Verification failed for ${key}: before=${before[key]} after=${after[key]} stranded=${stranded[key]} — rolling back.`
        );
      }
    }
    console.log('✓ Child rows cascaded + verified:', JSON.stringify(before));

    // 4. Tidy the knowledge-tag slug (non-FK, cosmetic) if it named the old id.
    if (project.knowledgeTagId) {
      const tag = await tx.knowledgeTag.findUnique({
        where: { id: project.knowledgeTagId },
        select: { slug: true },
      });
      if (tag?.slug === `project-${SYNTHETIC_ID}`) {
        await tx.knowledgeTag.update({
          where: { id: project.knowledgeTagId },
          data: { slug: `project-${id}` },
        });
        console.log(`✓ Knowledge-tag slug retitled: project-${SYNTHETIC_ID} → project-${id}`);
      }
    }

    return id;
  });

  console.log(
    `\n✓ Done. Project id ${SYNTHETIC_ID} → ${newId}.` +
      `\n  Resolves at /projects/${project.slug ?? '(no slug)'} and at its new id.` +
      `\n  Next: re-point saved MCP notes at the new id; import-plan now refuses re-runs (t-65 guard).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
