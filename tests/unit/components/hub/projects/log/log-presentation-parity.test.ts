/**
 * Invariant: the client's journal-event mirror covers the Prisma enum, and every
 * kind in it has a real label.
 *
 * `ProjectEventKindDTO` is hand-written in `components/hub/projects/log/types.ts`
 * and `describeEvent` closes with a `default:` returning a generic phrase. Both
 * are reasonable on their own; together they make adding a `ProjectEventKind`
 * upstream a **silent** failure — the DTO reaches the client through an
 * unchecked `parseApiResponse` cast, so nothing type-errors, no test goes red,
 * and the new event simply renders as "updated the project" forever.
 *
 * That is the exact shape f-work-kinds §32 t-88's code review named: *an enum
 * hand-mirrored across the client boundary needs a parity test against
 * `Object.values(TheEnum)`, else a defensive guard turns drift into a designed
 * silence.* No such test existed; f-phase-history §33 t-98 was the first feature
 * to extend the enum since, so it writes one — for every future kind, not just
 * its own three.
 *
 * The `default:` case is deliberately kept in `describeEvent`: it is the right
 * runtime behaviour during a deploy rollout, when a newer server can send a kind
 * an older client bundle has never heard of. This test is what stops it also
 * absorbing our own mistakes.
 */
import { describe, it, expect } from 'vitest';
import { ProjectEventKind } from '@prisma/client';

import { PROJECT_EVENT_KINDS } from '@/components/hub/projects/log/types';
import { describeEvent } from '@/components/hub/projects/log/presentation';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

/** The phrase `describeEvent` falls back to for a kind it does not know. */
const FALLBACK = 'updated the project';

function eventOf(kind: string, metadata: unknown = null): ProjectEventDTO {
  return {
    id: 'evt_1',
    kind: kind as ProjectEventDTO['kind'],
    actor: null,
    actorAgentId: null,
    feature: null,
    task: null,
    title: null,
    body: null,
    metadata,
    createdAt: '2026-08-18T00:00:00.000Z',
  };
}

describe('journal event kind parity', () => {
  it('mirrors every ProjectEventKind the database can produce', () => {
    // Sorted set comparison so the failure message names the missing kinds
    // rather than just reporting "arrays differ".
    expect([...PROJECT_EVENT_KINDS].sort()).toEqual([...Object.values(ProjectEventKind)].sort());
  });

  it('gives every mirrored kind a label of its own, never the fallback', () => {
    const unlabelled = PROJECT_EVENT_KINDS.filter(
      (kind) => describeEvent(eventOf(kind)) === FALLBACK
    );
    expect(unlabelled).toEqual([]);
  });

  it('falls back rather than throwing for a kind this bundle has never heard of', () => {
    // The deploy-rollout case the `default:` exists for: a newer server sends a
    // kind an older client cannot know. It must degrade, not crash the Log.
    expect(describeEvent(eventOf('some_future_kind'))).toBe(FALLBACK);
  });
});

describe('describeEvent — phase kinds', () => {
  it('names the phase a feature was moved to, and where it came from', () => {
    expect(
      describeEvent(
        eventOf('phase_membership_changed', {
          subject: 'feature',
          fromPhaseId: 'p1',
          toPhaseId: 'p2',
          fromPhaseName: 'Foundations',
          toPhaseName: 'Project flow',
        })
      )
    ).toBe('moved the feature from Foundations to Project flow');
  });

  it('reads as a filing when there was no previous phase', () => {
    expect(
      describeEvent(
        eventOf('phase_membership_changed', {
          subject: 'task',
          fromPhaseId: null,
          toPhaseId: 'p2',
          fromPhaseName: null,
          toPhaseName: 'Sunrise Management',
        })
      )
    ).toBe('filed the task under Sunrise Management');
  });

  it('reads as a removal when the phase was cleared', () => {
    expect(
      describeEvent(
        eventOf('phase_membership_changed', {
          subject: 'feature',
          fromPhaseId: 'p1',
          toPhaseId: null,
          fromPhaseName: 'Foundations',
          toPhaseName: null,
        })
      )
    ).toBe('took the feature out of Foundations');
  });

  it('still reads sensibly when the name snapshot is missing', () => {
    // Defensive, but not theoretical: `metadata` is `unknown` on the wire and an
    // event written by an older build carries no names. It must not render
    // "moved the feature from undefined to undefined".
    expect(describeEvent(eventOf('phase_membership_changed', { subject: 'feature' }))).toBe(
      'took the feature out of its phase'
    );
  });

  it('distinguishes a rename from a status change from an intent edit', () => {
    expect(
      describeEvent(eventOf('phase_updated', { fields: ['name'], name: 'Project flow' }))
    ).toBe('renamed the phase Project flow');
    expect(describeEvent(eventOf('phase_updated', { fields: ['status'], status: 'active' }))).toBe(
      'set the phase to active'
    );
    expect(describeEvent(eventOf('phase_updated', { fields: ['description'] }))).toBe(
      'edited the phase intent'
    );
  });

  it('does not claim one specific change when several landed together', () => {
    // Naming just the rename would misreport an edit that also re-statused it.
    expect(
      describeEvent(eventOf('phase_updated', { fields: ['name', 'status'], name: 'Renamed' }))
    ).toBe('updated the phase');
  });

  it('names a created phase, and copes with a nameless one', () => {
    expect(describeEvent(eventOf('phase_created', { name: 'Ideas Park', status: 'parked' }))).toBe(
      'created the phase Ideas Park'
    );
    expect(describeEvent(eventOf('phase_created', {}))).toBe('created the phase');
  });
});
