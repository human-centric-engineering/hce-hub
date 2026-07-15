/**
 * Unit: the dev-only demo-collaborators seed (f-projects t-2).
 * The load-bearing assertion is the production gate — no fabricated users in prod.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import unit from '@/prisma/seeds/app/007-demo-collaborators';

function mockCtx() {
  const prisma = {
    user: { upsert: vi.fn().mockResolvedValue({}) },
    projectMember: { upsert: vi.fn().mockResolvedValue({}) },
    feature: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const logger = { info: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ctx: { prisma, logger } as any, prisma };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('007-demo-collaborators', () => {
  it('early-returns in production — never fabricates users', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { ctx, prisma } = mockCtx();
    await unit.run(ctx);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.projectMember.upsert).not.toHaveBeenCalled();
  });

  it('seeds demo users + members outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { ctx, prisma } = mockCtx();
    await unit.run(ctx);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.projectMember.upsert).toHaveBeenCalledTimes(2);
    // decorates ownership + a claim on the seeded rows
    expect(prisma.feature.updateMany).toHaveBeenCalled();
    expect(prisma.task.updateMany).toHaveBeenCalled();
  });
});
