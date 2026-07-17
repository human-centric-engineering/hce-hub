/**
 * Unit: `recordProjectEvent` — the journal writer (f-journal §17 t-1).
 *
 * Pins the writer's own contract independent of its callers: it appends one row
 * with the given scope/kind/actor, omits `metadata`/`createdAt` when absent (so
 * the column stays NULL / the `@default(now())` applies), honours an explicit
 * `createdAt` for §19's backdated import, and returns the new event id. The
 * client is passed in (a transaction client at the call sites), so the test
 * supplies a fake one and asserts the create payload.
 */
import { describe, it, expect, vi } from 'vitest';
import { recordProjectEvent } from '@/lib/projects/project-event';

function fakeClient(created = { id: 'evt-1' }) {
  const create = vi.fn().mockResolvedValue(created);
  return { client: { projectEvent: { create } } as never, create };
}

describe('recordProjectEvent', () => {
  it('writes a fully-scoped event and returns its id', async () => {
    const { client, create } = fakeClient();

    const out = await recordProjectEvent(client, {
      projectId: 'p1',
      featureId: 'f1',
      taskId: 't1',
      kind: 'task_claimed',
      actorUserId: 'u1',
      metadata: { previousClaimant: null },
    });

    expect(out).toEqual({ id: 'evt-1' });
    expect(create).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        featureId: 'f1',
        taskId: 't1',
        kind: 'task_claimed',
        actorUserId: 'u1',
        actorAgentId: null,
        title: null,
        body: null,
        metadata: { previousClaimant: null },
      },
      select: { id: true },
    });
  });

  it('defaults absent scope/actor fields to null and omits metadata + createdAt', async () => {
    const { client, create } = fakeClient();

    await recordProjectEvent(client, { projectId: 'p1', kind: 'note' });

    const payload = create.mock.calls[0][0].data;
    expect(payload).toEqual({
      projectId: 'p1',
      featureId: null,
      taskId: null,
      kind: 'note',
      actorUserId: null,
      actorAgentId: null,
      title: null,
      body: null,
    });
    // Omitted, not set to null/JsonNull — so the column stays SQL NULL and the
    // createdAt @default(now()) applies.
    expect(payload).not.toHaveProperty('metadata');
    expect(payload).not.toHaveProperty('createdAt');
  });

  it('honours an explicit createdAt for backdated imports (§19)', async () => {
    const { client, create } = fakeClient();
    const backdated = new Date('2026-07-13T09:00:00Z');

    await recordProjectEvent(client, {
      projectId: 'p1',
      kind: 'decision',
      title: 'usable-first build order',
      body: 'AI last.',
      createdAt: backdated,
    });

    const payload = create.mock.calls[0][0].data;
    expect(payload.createdAt).toBe(backdated);
    expect(payload.title).toBe('usable-first build order');
    expect(payload.body).toBe('AI last.');
  });
});
