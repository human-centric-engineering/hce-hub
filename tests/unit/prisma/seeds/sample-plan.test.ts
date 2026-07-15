/**
 * Unit: the sample-plan seed (f-projects t-2).
 * Pure data fidelity + run() idempotency/invariant over a mocked prisma (B9).
 */
import { describe, it, expect, vi } from 'vitest';
import unit, {
  buildSamplePlan,
  SAMPLE_PROJECT,
  featureSeedId,
  taskSeedId,
} from '@/prisma/seeds/app/006-sample-plan';
import { cuidSchema } from '@/lib/validations/common';

describe('seed ids are cuid-shaped (so /projects/:id parseCuidParam accepts them)', () => {
  it('project + feature + task ids all pass cuidSchema', () => {
    expect(cuidSchema.safeParse(SAMPLE_PROJECT.id).success).toBe(true);
    expect(cuidSchema.safeParse(featureSeedId('f-projects')).success).toBe(true);
    expect(cuidSchema.safeParse(featureSeedId('f-morning-brief')).success).toBe(true);
    expect(cuidSchema.safeParse(taskSeedId('f-board-view', 0)).success).toBe(true);
  });
});

describe('buildSamplePlan (pure)', () => {
  const features = buildSamplePlan();
  const slugs = new Set(features.map((f) => f.slug));

  it('materialises all 15 v1 features with the right status split', () => {
    expect(features).toHaveLength(15);
    expect(features.filter((f) => f.status === 'shipped')).toHaveLength(7);
    expect(features.filter((f) => f.status === 'in_flight').map((f) => f.slug)).toEqual([
      'f-projects',
    ]);
    expect(features.filter((f) => f.status === 'planning')).toHaveLength(7);
  });

  it('carries the real dependency edges', () => {
    const shell = features.find((f) => f.slug === 'f-shell');
    expect(shell?.dependsOn).toEqual(['f-theme', 'f-access']);
    // every dependency points at a real feature in the set (referential integrity)
    for (const f of features) {
      for (const dep of f.dependsOn) expect(slugs.has(dep)).toBe(true);
    }
  });

  it('uses only valid task statuses', () => {
    const valid = new Set(['backlog', 'available', 'claimed', 'in_pr', 'merged']);
    for (const f of features) for (const t of f.tasks) expect(valid.has(t.status)).toBe(true);
  });
});

function mockCtx(lead: { id: string } | null) {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(lead) },
    project: { upsert: vi.fn().mockResolvedValue({}) },
    projectMember: { upsert: vi.fn().mockResolvedValue({}) },
    feature: { upsert: vi.fn().mockResolvedValue({}) },
    featureDependency: { upsert: vi.fn().mockResolvedValue({}) },
    task: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const logger = { info: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ctx: { prisma, logger } as any, prisma };
}

describe('run()', () => {
  it('seats the lead + a role=lead member row when a human exists, keyed by stable ids', async () => {
    const { ctx, prisma } = mockCtx({ id: 'human-1' });
    await unit.run(ctx);

    expect(prisma.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SAMPLE_PROJECT.id },
        create: expect.objectContaining({ id: SAMPLE_PROJECT.id, leadUserId: 'human-1' }),
      })
    );
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { projectId: SAMPLE_PROJECT.id, userId: 'human-1', role: 'lead' },
      })
    );
    expect(prisma.feature.upsert).toHaveBeenCalledTimes(15);
  });

  it('creates the project with no members when no human user exists yet', async () => {
    const { ctx, prisma } = mockCtx(null);
    await unit.run(ctx);

    expect(prisma.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ leadUserId: null }) })
    );
    expect(prisma.projectMember.upsert).not.toHaveBeenCalled();
  });
});
