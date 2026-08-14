import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '@/lib/api/errors';

const { findMany, completeTask, resolveHubUserByGithubId } = vi.hoisted(() => ({
  findMany: vi.fn(),
  completeTask: vi.fn(),
  resolveHubUserByGithubId: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({ prisma: { task: { findMany } } }));
vi.mock('@/lib/projects/task-actions', () => ({ completeTask }));
vi.mock('@/lib/projects/github/identity', () => ({ resolveHubUserByGithubId }));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { reconcilePullRequestEvent } from '@/lib/projects/github/reconcile';

const PR_URL = 'https://github.com/human-centric-engineering/hce-hub/pull/94';

/** A minimal merged-PR-close payload, optionally carrying a `merged_by` actor. */
function mergedClose(url: string = PR_URL, mergedBy?: { login: string; id: number }): unknown {
  return {
    action: 'closed',
    pull_request: { html_url: url, merged: true, ...(mergedBy ? { merged_by: mergedBy } : {}) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  completeTask.mockResolvedValue({ taskId: 't', status: 'merged', warnings: [] });
});

describe('reconcilePullRequestEvent — no-op cases', () => {
  it('ignores a payload that is not pull_request-shaped', async () => {
    const r = await reconcilePullRequestEvent({ zen: 'GitHub ping', hook_id: 1 });
    expect(r).toEqual({ handled: false, prUrl: null, matched: 0, reconciled: 0, skipped: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('ignores a non-closed action (opened / synchronize)', async () => {
    const r = await reconcilePullRequestEvent({
      action: 'opened',
      pull_request: { html_url: PR_URL, merged: false },
    });
    expect(r.handled).toBe(false);
    expect(r.prUrl).toBe(PR_URL);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('ignores a close that was NOT merged', async () => {
    const r = await reconcilePullRequestEvent({
      action: 'closed',
      pull_request: { html_url: PR_URL, merged: false },
    });
    expect(r.handled).toBe(false);
    expect(completeTask).not.toHaveBeenCalled();
  });
});

describe('reconcilePullRequestEvent — merged PR reconciliation', () => {
  it('completes a single linked task, credited to its claimant', async () => {
    findMany.mockResolvedValue([{ id: 'task-1', claimedByUserId: 'user-A' }]);

    const r = await reconcilePullRequestEvent(mergedClose());

    expect(findMany).toHaveBeenCalledWith({
      where: { prUrl: PR_URL },
      select: { id: true, claimedByUserId: true },
    });
    // 4-arg call: (doer, taskId, expectedProjectId=undefined, mergedBy=undefined here).
    expect(completeTask).toHaveBeenCalledExactlyOnceWith('user-A', 'task-1', undefined, undefined);
    expect(r).toEqual({ handled: true, prUrl: PR_URL, matched: 1, reconciled: 1, skipped: 0 });
  });

  it('completes EVERY task linked to the same PR (multi-task delivery)', async () => {
    findMany.mockResolvedValue([
      { id: 't-41', claimedByUserId: 'user-A' },
      { id: 't-42', claimedByUserId: 'user-A' },
      { id: 't-43', claimedByUserId: 'user-B' },
    ]);

    const r = await reconcilePullRequestEvent(mergedClose());

    expect(completeTask).toHaveBeenCalledTimes(3);
    expect(completeTask).toHaveBeenCalledWith('user-A', 't-41', undefined, undefined);
    expect(completeTask).toHaveBeenCalledWith('user-A', 't-42', undefined, undefined);
    expect(completeTask).toHaveBeenCalledWith('user-B', 't-43', undefined, undefined);
    expect(r).toMatchObject({ handled: true, matched: 3, reconciled: 3, skipped: 0 });
  });

  it('reports handled with zero matches when no task links the PR', async () => {
    findMany.mockResolvedValue([]);
    const r = await reconcilePullRequestEvent(mergedClose());
    expect(r).toEqual({ handled: true, prUrl: PR_URL, matched: 0, reconciled: 0, skipped: 0 });
    expect(completeTask).not.toHaveBeenCalled();
  });
});

describe('reconcilePullRequestEvent — merged_by attribution (f-github-identity §23)', () => {
  it('resolves merged_by by numeric id and passes it additively to completeTask', async () => {
    findMany.mockResolvedValue([{ id: 'task-1', claimedByUserId: 'user-A' }]);
    resolveHubUserByGithubId.mockResolvedValue('hub-user-X');

    await reconcilePullRequestEvent(mergedClose(PR_URL, { login: 'octocat', id: 583231 }));

    // Id-first, as a string (the immutable identity key).
    expect(resolveHubUserByGithubId).toHaveBeenCalledWith('583231');
    // Doer (user-A) is unchanged; the merger rides in the 4th arg.
    expect(completeTask).toHaveBeenCalledWith('user-A', 'task-1', undefined, {
      userId: 'hub-user-X',
      githubLogin: 'octocat',
    });
  });

  it('passes a null userId when the merger is not a linked Hub user (external)', async () => {
    findMany.mockResolvedValue([{ id: 'task-1', claimedByUserId: 'user-A' }]);
    resolveHubUserByGithubId.mockResolvedValue(null);

    await reconcilePullRequestEvent(mergedClose(PR_URL, { login: 'ext-contributor', id: 999 }));

    expect(completeTask).toHaveBeenCalledWith('user-A', 'task-1', undefined, {
      userId: null,
      githubLogin: 'ext-contributor',
    });
  });

  it('resolves the merger ONCE for a multi-task PR, not per task', async () => {
    findMany.mockResolvedValue([
      { id: 't-1', claimedByUserId: 'user-A' },
      { id: 't-2', claimedByUserId: 'user-B' },
    ]);
    resolveHubUserByGithubId.mockResolvedValue('hub-user-X');

    await reconcilePullRequestEvent(mergedClose(PR_URL, { login: 'octocat', id: 1 }));

    expect(resolveHubUserByGithubId).toHaveBeenCalledTimes(1);
  });

  it('passes no attribution (and never resolves) when merged_by is absent', async () => {
    findMany.mockResolvedValue([{ id: 'task-1', claimedByUserId: 'user-A' }]);

    await reconcilePullRequestEvent(mergedClose());

    expect(resolveHubUserByGithubId).not.toHaveBeenCalled();
    expect(completeTask).toHaveBeenCalledWith('user-A', 'task-1', undefined, undefined);
  });

  it('does NOT resolve the merger when no Hub task links the PR (webhook hot path)', async () => {
    findMany.mockResolvedValue([]); // most merges on a connected repo have no Hub task

    await reconcilePullRequestEvent(mergedClose(PR_URL, { login: 'octocat', id: 1 }));

    expect(resolveHubUserByGithubId).not.toHaveBeenCalled();
    expect(completeTask).not.toHaveBeenCalled();
  });
});

describe('reconcilePullRequestEvent — resilience', () => {
  it('skips an unclaimed task without calling completeTask', async () => {
    // Reachable for real since §32 t-89 (born-unassigned enhancements + release),
    // where before the create cascade made it impossible. The task stays open on
    // the board rather than being closed under an invented doer.
    findMany.mockResolvedValue([{ id: 'task-1', claimedByUserId: null }]);
    const r = await reconcilePullRequestEvent(mergedClose());
    expect(completeTask).not.toHaveBeenCalled();
    expect(r).toMatchObject({ handled: true, matched: 1, reconciled: 0, skipped: 1 });
  });

  it('skips a task whose claimant is no longer a member (NotFoundError), continuing the rest', async () => {
    findMany.mockResolvedValue([
      { id: 'gone', claimedByUserId: 'ex-member' },
      { id: 'ok', claimedByUserId: 'user-A' },
    ]);
    completeTask.mockImplementation(async (userId: string) => {
      if (userId === 'ex-member') throw new NotFoundError('Task gone not found');
      return { taskId: 'ok', status: 'merged', warnings: [] };
    });

    const r = await reconcilePullRequestEvent(mergedClose());

    expect(r).toMatchObject({ handled: true, matched: 2, reconciled: 1, skipped: 1 });
    expect(completeTask).toHaveBeenCalledTimes(2);
  });

  it('propagates a non-NotFound error (e.g. a DB failure) rather than swallowing it', async () => {
    findMany.mockResolvedValue([{ id: 'task-1', claimedByUserId: 'user-A' }]);
    completeTask.mockRejectedValue(new Error('connection reset'));
    await expect(reconcilePullRequestEvent(mergedClose())).rejects.toThrow('connection reset');
  });
});
