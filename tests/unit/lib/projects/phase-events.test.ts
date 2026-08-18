/**
 * Tests for `lib/projects/phase-events.ts` (f-phase-history §33 t-98) — the
 * shared phase journalling emitters.
 *
 * These are the rules that must not be re-derived per call site, because seven
 * write paths across four files emit through them: which phase a membership
 * event hangs on, what a no-op write records, and the fact that phase names are
 * snapshotted rather than looked up later.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  recordPhaseCreated,
  recordPhaseMembershipChange,
  recordPhaseUpdated,
} from '@/lib/projects/phase-events';

const create = vi.fn();
/** A stand-in for the transaction client the real callers pass through. */
const client = { projectEvent: { create } } as never;

/** The `data` of the single event written, or `undefined` if none was. */
function written() {
  return create.mock.calls[0]?.[0]?.data;
}

const P1 = { id: 'ph1', name: 'Foundations' };
const P2 = { id: 'ph2', name: 'Project flow' };

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ id: 'evt-1' });
});

describe('recordPhaseMembershipChange — the scope pointer', () => {
  it('hangs a move on the DESTINATION phase', async () => {
    await recordPhaseMembershipChange(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      subject: 'feature',
      featureId: 'f1',
      from: P1,
      to: P2,
    });
    // The destination is what the phase-scoped read should surface: "these
    // arrived here". The origin stays in metadata (see the module's known limit).
    expect(written().phaseId).toBe('ph2');
    expect(written().featureId).toBe('f1');
    expect(written().kind).toBe('phase_membership_changed');
  });

  it('hangs an unfile on the ORIGIN phase, which is the only phase involved', async () => {
    await recordPhaseMembershipChange(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      subject: 'feature',
      featureId: 'f1',
      from: P1,
      to: null,
    });
    expect(written().phaseId).toBe('ph1');
  });

  it('carries both ends, and the names as they read at the time', async () => {
    await recordPhaseMembershipChange(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      subject: 'task',
      featureId: 'f1',
      taskId: 't1',
      from: P1,
      to: P2,
    });
    expect(written().metadata).toEqual({
      subject: 'task',
      fromPhaseId: 'ph1',
      toPhaseId: 'ph2',
      fromPhaseName: 'Foundations',
      toPhaseName: 'Project flow',
    });
    // A task move also records its feature, so the project Log can chip it.
    expect(written().taskId).toBe('t1');
    expect(written().featureId).toBe('f1');
  });
});

describe('recordPhaseMembershipChange — what is NOT a move', () => {
  it('records nothing when the phase is unchanged', async () => {
    // `update_feature{phaseId: X}` on a feature already in X is a legitimate
    // no-op patch. Journalling it would put a move in the history that never
    // happened — and this history is meant to be the trustworthy record.
    const out = await recordPhaseMembershipChange(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      subject: 'feature',
      featureId: 'f1',
      from: P1,
      to: { id: 'ph1', name: 'Foundations' },
    });
    expect(out).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('records nothing when an already-unfiled subject is unfiled again', async () => {
    const out = await recordPhaseMembershipChange(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      subject: 'feature',
      featureId: 'f1',
      from: null,
      to: null,
    });
    expect(out).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('still records a move between two phases that happen to share a name', async () => {
    // The identity that matters is the id, not the label — two phases can be
    // called the same thing, and moving between them IS a move.
    await recordPhaseMembershipChange(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      subject: 'feature',
      featureId: 'f1',
      from: { id: 'ph1', name: 'Ideas' },
      to: { id: 'ph2', name: 'Ideas' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(written().phaseId).toBe('ph2');
  });
});

describe('recordPhaseCreated / recordPhaseUpdated', () => {
  it('records a creation against the phase, with the name it was given', async () => {
    await recordPhaseCreated(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      phaseId: 'ph1',
      name: 'Foundations',
      status: 'upcoming',
    });
    expect(written().kind).toBe('phase_created');
    expect(written().phaseId).toBe('ph1');
    expect(written().metadata).toEqual({ name: 'Foundations', status: 'upcoming' });
  });

  it('names the changed fields, and the resulting name / status', async () => {
    await recordPhaseUpdated(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      phaseId: 'ph1',
      fields: ['name', 'status'],
      name: 'Project flow',
      status: 'active',
    });
    expect(written().kind).toBe('phase_updated');
    expect(written().metadata).toEqual({
      fields: ['name', 'status'],
      name: 'Project flow',
      status: 'active',
    });
  });

  it('omits name / status from an edit that did not touch them', async () => {
    await recordPhaseUpdated(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      phaseId: 'ph1',
      fields: ['description'],
    });
    // The description itself is deliberately absent — the journal must not become
    // a second, diverging copy of the phase's long-form intent.
    expect(written().metadata).toEqual({ fields: ['description'] });
  });

  it('records nothing when an update changed no fields', async () => {
    const out = await recordPhaseUpdated(client, {
      projectId: 'p1',
      actorUserId: 'u1',
      phaseId: 'ph1',
      fields: [],
    });
    expect(out).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
