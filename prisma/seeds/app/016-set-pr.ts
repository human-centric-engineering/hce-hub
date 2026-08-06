import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `set_pr` Hub capability (f-github-sync §14 t-1) — link a task to its
 * pull request. See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `SetPrCapability.functionDefinition` (pinned by
 * set-pr.parity.test.ts).
 */
export const setPrFunctionDefinition = {
  name: 'set_pr',
  description:
    "Link a task to its pull request: attach or replace the task's PR URL. Any project member may set it on a task in a feature they can see. Does NOT change status — linking a PR is not merging it (a merged PR is reconciled separately). Idempotent: re-linking the same URL is safe.",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to link a PR to.' },
      prUrl: { type: 'string', description: 'The pull-request URL to attach to the task.' },
      projectId: {
        type: 'string',
        description: 'Optional: the task must belong to this project (guards an id mix-up).',
      },
    },
    required: ['taskId', 'prUrl'],
  },
};

const unit: SeedUnit = {
  name: 'app/016-set-pr',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding set_pr Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'set_pr' },
      update: { isSystem: true, functionDefinition: setPrFunctionDefinition },
      create: {
        slug: 'set_pr',
        name: 'Set PR',
        description:
          "Link a task to its pull request: set or replace the task's PR URL. Any member; no status change; audited.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'SetPrCapability',
        functionDefinition: setPrFunctionDefinition,
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
        customName: 'set_pr',
        readOnlyHint: false, // mutates: writes Task.prUrl + journals task_pr_linked
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded set_pr capability + MCP exposure');
  },
};

export default unit;
