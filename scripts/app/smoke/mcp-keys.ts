/**
 * HCE Hub — member self-service MCP keys smoke (f-mcp-project-scope §31 t-C).
 *
 * Proves the DB-enforced behaviour of `lib/projects/mcp-keys.ts` that mocked unit
 * tests cannot — the parts that only exist against real Postgres:
 *   - the `scope` JSON column round-trips: a **slug** passed in is resolved through
 *     the membership funnel and the **canonical cuid** is what lands in the row;
 *   - `keyHash` (a SHA of the secret), NOT the plaintext, is what's stored;
 *   - the locked scope set (`tools:list` + `tools:execute`) is written verbatim;
 *   - ownership + project isolation hold against real `createdBy` + JSON-scope rows:
 *     another member's key, or a key in another project, is `not_found` on
 *     rotate / revoke — and is left untouched;
 *   - rotate replaces the hash; revoke deletes the row.
 *
 * The mocked tests pin the branching; this is the functional end-to-end proof.
 * Runs against the real dev/CI Postgres. Skips cleanly (exit 0) when no DB is
 * reachable. Self-cleaning: creates only `smoke-hub-mcpkeys-*` rows and removes
 * whatever it created on every path.
 *
 * Run with:
 *   npm run app:smoke:mcp-keys
 */

import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';
import { McpScope } from '@/types/mcp';
import {
  createProjectMcpKey,
  listProjectMcpKeys,
  rotateProjectMcpKey,
  revokeProjectMcpKey,
} from '@/lib/projects/mcp-keys';

const PREFIX = 'smoke-hub-mcpkeys';
const stamp = Date.now();

async function dbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function expectNotFound(fn: () => Promise<unknown>, msg: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    check(err instanceof NotFoundError, msg);
    return;
  }
  throw new Error(`assertion failed: expected NotFoundError — ${msg}`);
}

async function main(): Promise<void> {
  if (!(await dbReachable())) {
    console.log('app:smoke:mcp-keys skipped — no database reachable.');
    return;
  }

  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    // Two members of project P; A is also a member of project Q. C is a non-member.
    const [memberA, memberB, nonMember] = await Promise.all([
      prisma.user.create({
        data: { name: `${PREFIX} A`, email: `${PREFIX}-a-${stamp}@example.com` },
      }),
      prisma.user.create({
        data: { name: `${PREFIX} B`, email: `${PREFIX}-b-${stamp}@example.com` },
      }),
      prisma.user.create({
        data: { name: `${PREFIX} C`, email: `${PREFIX}-c-${stamp}@example.com` },
      }),
    ]);
    createdUserIds.push(memberA.id, memberB.id, nonMember.id);

    const projectP = await prisma.project.create({
      data: { name: `${PREFIX} P`, slug: `${PREFIX}-p-${stamp}`, hostPlatform: 'sunrise' },
    });
    const projectQ = await prisma.project.create({
      data: { name: `${PREFIX} Q`, slug: `${PREFIX}-q-${stamp}`, hostPlatform: 'sunrise' },
    });
    createdProjectIds.push(projectP.id, projectQ.id);

    await prisma.projectMember.createMany({
      data: [
        { projectId: projectP.id, userId: memberA.id, role: 'member' },
        { projectId: projectP.id, userId: memberB.id, role: 'member' },
        { projectId: projectQ.id, userId: memberA.id, role: 'member' },
      ],
    });

    // 1. Mint via the project SLUG — the stored scope must be the canonical cuid.
    const minted = await createProjectMcpKey(memberA.id, projectP.slug!);
    check(
      typeof minted.plaintext === 'string' && minted.plaintext.length > 0,
      'create returns a plaintext secret'
    );

    const rowA = await prisma.mcpApiKey.findUnique({
      where: { id: minted.key.id },
      select: {
        keyHash: true,
        keyPrefix: true,
        scope: true,
        scopes: true,
        createdBy: true,
        name: true,
      },
    });
    check(rowA !== null, 'minted key row exists');
    check(
      JSON.stringify(rowA?.scope) === JSON.stringify({ projectId: projectP.id }),
      'scope stores the canonical cuid (slug in → cuid persisted)'
    );
    check(
      rowA?.scopes?.length === 2 &&
        rowA.scopes.includes(McpScope.TOOLS_LIST) &&
        rowA.scopes.includes(McpScope.TOOLS_EXECUTE),
      'scopes locked to tools:list + tools:execute'
    );
    check(rowA?.createdBy === memberA.id, 'createdBy is the minting member');
    check(
      rowA?.name === `${PREFIX} A · ${PREFIX} P`,
      'name is auto-derived "<member> · <project>"'
    );
    check(
      rowA?.keyHash !== minted.plaintext && (rowA?.keyHash?.length ?? 0) >= 32,
      'keyHash is a hash, not the plaintext'
    );

    // A second key for the SAME project is refused (one per project).
    let refused = false;
    try {
      await createProjectMcpKey(memberA.id, projectP.id);
    } catch {
      refused = true;
    }
    check(refused, 'a second key for the same project is refused');

    // 2. A key by member A in project Q, and a key by member B in project P —
    //    neither should surface in A's list for project P.
    const keyAinQ = await createProjectMcpKey(memberA.id, projectQ.id);
    const keyBinP = await createProjectMcpKey(memberB.id, projectP.id);

    const listA_P = await listProjectMcpKeys(memberA.id, projectP.id);
    check(
      listA_P.length === 1 && listA_P[0].id === minted.key.id,
      "list returns only the caller's keys scoped to this project"
    );

    // 3. A non-member cannot mint (funnel 404).
    await expectNotFound(
      () => createProjectMcpKey(nonMember.id, projectP.id),
      'non-member mint is not_found'
    );

    // 4. Ownership isolation — B cannot rotate/revoke A's key (and it's untouched).
    await expectNotFound(
      () => rotateProjectMcpKey(memberB.id, projectP.id, minted.key.id),
      "another member's key rotate is not_found"
    );
    await expectNotFound(
      () => revokeProjectMcpKey(memberB.id, projectP.id, minted.key.id),
      "another member's key revoke is not_found"
    );
    check(
      (
        await prisma.mcpApiKey.findUnique({
          where: { id: minted.key.id },
          select: { keyHash: true },
        })
      )?.keyHash === rowA?.keyHash,
      "another member's failed ops left A's key untouched"
    );

    // 5. Cross-project isolation — A cannot manage the P-scoped key via project Q.
    await expectNotFound(
      () => rotateProjectMcpKey(memberA.id, projectQ.id, minted.key.id),
      'wrong-project rotate is not_found'
    );

    // 6. Rotate (as the owner, in the right project) replaces the hash.
    const rotated = await rotateProjectMcpKey(memberA.id, projectP.id, minted.key.id);
    check(rotated.plaintext !== minted.plaintext, 'rotate returns a fresh, different plaintext');
    check(rotated.previousPrefix === rowA?.keyPrefix, 'rotate reports the previous prefix');
    const rowAfterRotate = await prisma.mcpApiKey.findUnique({
      where: { id: minted.key.id },
      select: { keyHash: true },
    });
    check(rowAfterRotate?.keyHash !== rowA?.keyHash, 'rotate replaced the stored keyHash');

    // 7. Revoke (as the owner) deletes the row.
    await revokeProjectMcpKey(memberA.id, projectP.id, minted.key.id);
    check(
      (await prisma.mcpApiKey.findUnique({ where: { id: minted.key.id } })) === null,
      'revoke deletes the key row'
    );

    // Sanity: the other two keys are still present (revoke was surgical).
    check(
      (await prisma.mcpApiKey.count({
        where: { id: { in: [keyAinQ.key.id, keyBinP.key.id] } },
      })) === 2,
      'the other project/member keys were untouched'
    );

    console.log('\n✓ app:smoke:mcp-keys passed');
  } finally {
    // Self-clean: keys first (createdBy is SET NULL on user delete → would orphan),
    // then memberships, projects, users.
    if (createdUserIds.length)
      await prisma.mcpApiKey
        .deleteMany({ where: { createdBy: { in: createdUserIds } } })
        .catch(() => undefined);
    if (createdProjectIds.length)
      await prisma.projectMember
        .deleteMany({ where: { projectId: { in: createdProjectIds } } })
        .catch(() => undefined);
    if (createdProjectIds.length)
      await prisma.project
        .deleteMany({ where: { id: { in: createdProjectIds } } })
        .catch(() => undefined);
    if (createdUserIds.length)
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('\n✗ app:smoke:mcp-keys failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
