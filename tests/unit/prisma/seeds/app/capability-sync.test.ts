/**
 * Regression guard for the capability-seed sync bug (f-phases §22 t2 fix).
 *
 * A capability seed's `AiCapability` upsert must re-sync `functionDefinition` on
 * the **update** branch, not only on create — otherwise a schema change to an
 * already-seeded tool (like adding `phaseId` to `update_feature`) never reaches
 * the DB, so the MCP tool list keeps advertising the stale schema. The parity
 * tests pin class↔seed-constant; this pins seed-constant↔the update write.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SeedContext } from '@/prisma/runner';
import updateFeatureUnit, {
  updateFeatureFunctionDefinition,
} from '@/prisma/seeds/app/018-update-feature';
import nextTaskUnit, { nextTaskFunctionDefinition } from '@/prisma/seeds/app/001-next-task';
import createPhaseUnit, {
  createPhaseFunctionDefinition,
} from '@/prisma/seeds/app/019-create-phase';
import createTaskUnit, { createTaskFunctionDefinition } from '@/prisma/seeds/app/002-create-task';
import assignTaskUnit, { assignTaskFunctionDefinition } from '@/prisma/seeds/app/021-assign-task';
import reassignFeatureTasksUnit, {
  reassignFeatureTasksFunctionDefinition,
} from '@/prisma/seeds/app/022-reassign-feature-tasks';

function runContext() {
  const upsert = vi.fn().mockResolvedValue({ id: 'cap1' });
  const mcpUpsert = vi.fn().mockResolvedValue({ id: 'tool1' });
  const ctx = {
    prisma: { aiCapability: { upsert }, mcpExposedTool: { upsert: mcpUpsert } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as SeedContext;
  return { ctx, upsert };
}

describe('capability seeds re-sync functionDefinition on update', () => {
  it('018-update-feature: update branch writes the full definition, including phaseId', async () => {
    const { ctx, upsert } = runContext();
    await updateFeatureUnit.run(ctx);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ slug: 'update_feature' });
    // The update branch — not just create — must carry the current schema.
    expect(arg.update.functionDefinition).toEqual(updateFeatureFunctionDefinition);
    expect(arg.update.functionDefinition.parameters.properties).toHaveProperty('phaseId');
  });

  it('001-next-task: the sync is systemic, not a one-off for update_feature', async () => {
    const { ctx, upsert } = runContext();
    await nextTaskUnit.run(ctx);
    expect(upsert.mock.calls[0][0].update.functionDefinition).toEqual(nextTaskFunctionDefinition);
  });

  it('019-create-phase: new capability seeds carry the sync too', async () => {
    const { ctx, upsert } = runContext();
    await createPhaseUnit.run(ctx);
    expect(upsert.mock.calls[0][0].update.functionDefinition).toEqual(
      createPhaseFunctionDefinition
    );
  });

  it('002-create-task: the update branch carries the current schema, including kind', async () => {
    const { ctx, upsert } = runContext();
    await createTaskUnit.run(ctx);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ slug: 'create_task' });
    expect(arg.update.functionDefinition).toEqual(createTaskFunctionDefinition);
    // The f-bug-handling addition must reach the DB copy the MCP tool list serves.
    expect(arg.update.functionDefinition.parameters.properties).toHaveProperty('kind');
  });

  it('021-assign-task: the new capability seed re-syncs on the update branch', async () => {
    const { ctx, upsert } = runContext();
    await assignTaskUnit.run(ctx);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ slug: 'assign_task' });
    expect(arg.update.functionDefinition).toEqual(assignTaskFunctionDefinition);
    expect(arg.update.functionDefinition.parameters.properties).toHaveProperty('assigneeUserId');
  });

  it('022-reassign-feature-tasks: the new capability seed re-syncs on the update branch', async () => {
    const { ctx, upsert } = runContext();
    await reassignFeatureTasksUnit.run(ctx);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ slug: 'reassign_feature_tasks' });
    expect(arg.update.functionDefinition).toEqual(reassignFeatureTasksFunctionDefinition);
    expect(arg.update.functionDefinition.parameters.properties).toHaveProperty('featureId');
  });
});
