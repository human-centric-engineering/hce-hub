/**
 * Tests for `lib/projects/github/identity.ts` — the GitHub identity ↔ Hub user
 * satellite service (f-github-identity §23 t-73). Pins the upsert-by-userId
 * (link/re-link idempotency), the conflict-error translation, disconnect, and the
 * security-relevant resolver contract: **id only** — the immutable numeric id is
 * the trustworthy match key; a mutable/recyclable login is deliberately never one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { ConflictError } from '@/lib/api/errors';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    userGithubIdentity: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/db/client');
const {
  getGithubIdentity,
  upsertGithubIdentity,
  disconnectGithubIdentity,
  resolveHubUserByGithubId,
} = await import('@/lib/projects/github/identity');

const findUnique = prisma.userGithubIdentity.findUnique as ReturnType<typeof vi.fn>;
const upsert = prisma.userGithubIdentity.upsert as ReturnType<typeof vi.fn>;
const deleteMany = prisma.userGithubIdentity.deleteMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('getGithubIdentity', () => {
  it('reads the caller-scoped row by userId', async () => {
    findUnique.mockResolvedValue({ id: 'gi1', userId: 'u1', githubLogin: 'octocat' });
    const res = await getGithubIdentity('u1');
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(res).toEqual({ id: 'gi1', userId: 'u1', githubLogin: 'octocat' });
  });

  it('returns null when the user has no link', async () => {
    findUnique.mockResolvedValue(null);
    expect(await getGithubIdentity('u1')).toBeNull();
  });
});

describe('upsertGithubIdentity', () => {
  it('upserts by userId — creates or refreshes the same row (one per user)', async () => {
    upsert.mockResolvedValue({ id: 'gi1' });
    await upsertGithubIdentity('u1', {
      githubUserId: '12345',
      githubLogin: 'octocat',
      avatarUrl: 'a',
    });

    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1' });
    expect(arg.create).toEqual({
      userId: 'u1',
      githubUserId: '12345',
      githubLogin: 'octocat',
      avatarUrl: 'a',
    });
    // A re-link (rename) updates login/avatar on the existing row, not the id key path.
    expect(arg.update).toEqual({ githubUserId: '12345', githubLogin: 'octocat', avatarUrl: 'a' });
  });

  it('normalises a missing avatar to null', async () => {
    upsert.mockResolvedValue({ id: 'gi1' });
    await upsertGithubIdentity('u1', { githubUserId: '12345', githubLogin: 'octocat' });
    expect(upsert.mock.calls[0][0].create.avatarUrl).toBeNull();
  });

  it('translates a unique-constraint hit into a ConflictError, not a raw Prisma 500', async () => {
    // Re-linking to a GitHub account already owned by another Hub user violates
    // the unique githubUserId/githubLogin constraint.
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    upsert.mockRejectedValue(p2002);
    await expect(
      upsertGithubIdentity('u1', { githubUserId: '200', githubLogin: 'taken' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rethrows a non-P2002 database error unchanged', async () => {
    const other = new Error('connection reset');
    upsert.mockRejectedValue(other);
    await expect(
      upsertGithubIdentity('u1', { githubUserId: '200', githubLogin: 'x' })
    ).rejects.toBe(other);
  });
});

describe('disconnectGithubIdentity', () => {
  it('deletes the caller row and is a no-op when there is none', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    await disconnectGithubIdentity('u1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('resolveHubUserByGithubId — id only, by design', () => {
  it('resolves the Hub user by the immutable numeric id', async () => {
    findUnique.mockResolvedValue({ userId: 'u1' });
    const res = await resolveHubUserByGithubId('12345');
    expect(res).toBe('u1');
    expect(findUnique).toHaveBeenCalledWith({
      where: { githubUserId: '12345' },
      select: { userId: true },
    });
  });

  it('returns null when the id is not linked to any Hub user', async () => {
    findUnique.mockResolvedValue(null);
    expect(await resolveHubUserByGithubId('999')).toBeNull();
  });

  it('never queries by login — a mutable/recyclable username is not a match key', async () => {
    findUnique.mockResolvedValue(null);
    await resolveHubUserByGithubId('12345');
    // Exactly one lookup, and it is the id lookup — no login fallback exists.
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ githubLogin: expect.anything() }),
      })
    );
  });
});
