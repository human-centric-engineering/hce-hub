import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `withdraw_task` Hub capability (f-authoring-fidelity §21 t-123) — call
 * work off, or bring it back. See `app/001-next-task.ts` for the seam + parity
 * conventions. The `functionDefinition` MUST equal
 * `WithdrawTaskCapability.functionDefinition` (pinned by write-tools.parity.test.ts).
 */
export const withdrawTaskFunctionDefinition = {
  name: 'withdraw_task',
  description:
    "Withdraw a task — say the work is not going to happen — or restore a withdrawn one with restore: true. Use it for a task that is mis-filed, a duplicate, a smoke artefact, or superseded before work started; never complete_task, which claims the work landed and counts toward its feature's completion. Withdrawn tasks disappear from the Plan, the Board, next_task and every progress count, keep their t-N (never reused), and stay findable via list_tasks { status: 'withdrawn' } and in the project journal — so a withdrawal is always reversible. A merged task cannot be withdrawn: it has already landed. Only the feature's owner or a project lead may. The result reports any unmerged tasks that depended on this one — their dependency on it stops blocking them, which is worth knowing before you leave it.",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to withdraw (or restore).' },
      reason: {
        type: 'string',
        description:
          'Why — e.g. "duplicate of t-88", "superseded by §38". Recorded in the journal.',
      },
      restore: {
        type: 'boolean',
        description: 'Set true to bring a withdrawn task back instead of withdrawing it.',
      },
      projectId: {
        type: 'string',
        description: 'Optional: the task must belong to this project (guards an id mix-up).',
      },
    },
    required: ['taskId'],
  },
};

/**
 * Code-owned half of the capability row — must track `WithdrawTaskCapability`, so
 * the seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation: it is
 * the schema every MCP client is shown (Sunrise #545).
 */
const WITHDRAW_TASK_IMPL = {
  executionType: 'internal',
  executionHandler: 'WithdrawTaskCapability',
  functionDefinition: withdrawTaskFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/033-withdraw-task',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding withdraw_task Hub capability...');

    // `update` re-syncs ONLY `functionDefinition` (a pure code projection the MCP
    // tool list serves), never `description` — that column is operator-owned and
    // editable from the admin UI, so rewriting it would clobber an operator's edit
    // on every `db:seed` (planning-retro B10).
    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'withdraw_task' },
      update: { isSystem: true, ...WITHDRAW_TASK_IMPL },
      create: {
        slug: 'withdraw_task',
        name: 'Withdraw Task',
        description:
          'Call a task off (mis-filed, duplicate, superseded) or restore it. Soft and reversible — the t-N is kept, the journal records why. Owner-tier; a merged task is refused.',
        category: 'coordination',
        ...WITHDRAW_TASK_IMPL,
        isActive: true,
        isSystem: true,
      },
    });

    await prisma.mcpExposedTool.upsert({
      where: { capabilityId: capability.id },
      update: {},
      create: {
        capabilityId: capability.id,
        isEnabled: true,
        customName: 'withdraw_task',
        readOnlyHint: false, // sets or clears Task.withdrawnAt
        // Reversible in-place: restore: true puts it back, so this is NOT a
        // destructive tool in the sense the hint warns about.
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded withdraw_task capability + MCP exposure');
  },
};

export default unit;
