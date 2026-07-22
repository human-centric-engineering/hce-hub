/**
 * HCE Hub — export one project's coordination graph to a snapshot file
 * (f-selfhost-cutover §19 t-1).
 *
 * The durable backup tap for the Hub-as-system-of-record: run it before a
 * `db:reset` (then re-import) or to promote a project **dev → prod**.
 *
 * Usage:
 *   npm run app:project:export -- <projectId> [outFile]
 *   # outFile defaults to ./<projectId>.snapshot.json; "-" writes to stdout
 */

import { writeFileSync } from 'node:fs';
import { prisma } from '@/lib/db/client';
import { exportProject, ProjectNotFoundError } from '@/lib/projects/transfer/exporter';

async function main(): Promise<void> {
  const projectId = process.argv[2];
  const outFile = process.argv[3] ?? `./${projectId}.snapshot.json`;
  if (!projectId) {
    console.error('Usage: npm run app:project:export -- <projectId> [outFile|-]');
    process.exit(1);
  }

  const snapshot = await exportProject(projectId);
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const { data } = snapshot;
  const counts =
    `${data.features.length} features · ${data.tasks.length} tasks · ` +
    `${data.events.length} events · ${data.members.length} members`;

  if (outFile === '-') {
    process.stdout.write(json);
  } else {
    writeFileSync(outFile, json);
    console.log(`✓ Exported "${data.project.name}" (${counts}) → ${outFile}`);
  }
}

main()
  .catch((err) => {
    if (err instanceof ProjectNotFoundError) {
      console.error(`✗ ${err.message}`);
    } else {
      console.error('✗ app:project:export failed:', err);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
