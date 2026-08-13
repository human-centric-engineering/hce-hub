/**
 * Tests for `lib/projects/github/identity.ts` — the GitHub identity ↔ Hub user
 * satellite service (f-github-identity §23 t-73). Pins the upsert-by-userId
 * (link/re-link idempotency), disconnect, and the security-relevant resolver
 * contract: **id-first, login fallback** — the numeric id is the trustworthy,
 * rename-proof match key that `merged_by` attribution relies on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  resolveHubUserByGithub,
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
});

describe('disconnectGithubIdentity', () => {
  it('deletes the caller row and is a no-op when there is none', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    await disconnectGithubIdentity('u1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('resolveHubUserByGithub — id-first, login fallback', () => {
  it('matches on the immutable numeric id first (ignores login when id resolves)', async () => {
    findUnique.mockResolvedValueOnce({ userId: 'u1' }); // by githubUserId
    const res = await resolveHubUserByGithub({ id: '12345', login: 'renamed' });
    expect(res).toBe('u1');
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { githubUserId: '12345' },
      select: { userId: true },
    });
  });

  it('falls back to login when the id does not resolve', async () => {
    findUnique
      .mockResolvedValueOnce(null) // by githubUserId
      .mockResolvedValueOnce({ userId: 'u2' }); // by githubLogin
    const res = await resolveHubUserByGithub({ id: '999', login: 'octocat' });
    expect(res).toBe('u2');
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { githubLogin: 'octocat' },
      select: { userId: true },
    });
  });

  it('resolves by login alone when no id is present', async () => {
    findUnique.mockResolvedValueOnce({ userId: 'u3' });
    const res = await resolveHubUserByGithub({ login: 'octocat' });
    expect(res).toBe('u3');
    expect(findUnique).toHaveBeenCalledWith({
      where: { githubLogin: 'octocat' },
      select: { userId: true },
    });
  });

  it('returns null when neither id nor login is linked', async () => {
    findUnique.mockResolvedValue(null);
    expect(await resolveHubUserByGithub({ id: '999', login: 'ghost' })).toBeNull();
  });

  it('returns null for an empty actor without querying', async () => {
    expect(await resolveHubUserByGithub({})).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
