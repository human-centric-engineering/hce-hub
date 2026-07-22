/**
 * Unit: the cutover snapshot assembler (f-selfhost-cutover §19 t-2).
 * @see lib/projects/cutover/snapshot.ts
 *
 * The key proof: `buildCutoverSnapshot` produces a snapshot the shipped §19 t-1
 * `importProject` can load (it parses against `projectTransferSchema`), with the
 * right owner assignment, task numbering, and backdated events.
 */
import { describe, it, expect } from 'vitest';
import { buildCutoverSnapshot } from '@/lib/projects/cutover/snapshot';
import { projectTransferSchema } from '@/lib/projects/transfer/schema';
import { buildCutoverPlan, featureId } from '@/lib/projects/cutover/plan-data';
import { buildCutoverHistory } from '@/lib/projects/cutover/history-data';

const LEAD = 'user-lead-1';
const snap = buildCutoverSnapshot(LEAD);

describe('buildCutoverSnapshot', () => {
  it('produces a snapshot that validates against the transfer schema (importable by t-1)', () => {
    expect(() => projectTransferSchema.parse(snap)).not.toThrow();
  });

  it('reuses the sample project id, seats the lead, and sets the task counter', () => {
    expect(snap.data.project.id).toBe('chubproject');
    expect(snap.data.project.leadUserId).toBe(LEAD);
    expect(snap.data.members).toHaveLength(1);
    expect(snap.data.members[0]).toMatchObject({ userId: LEAD, role: 'lead' });
    expect(snap.data.project.taskCounter).toBe(snap.data.tasks.length);
  });

  it('owns shipped/in-flight features with the lead and leaves unowned features null', () => {
    const owner = (slug: string) => snap.data.features.find((f) => f.slug === slug)?.ownerUserId;
    expect(owner('f-fork')).toBe(LEAD);
    expect(owner('f-selfhost-cutover')).toBe(LEAD);
    expect(owner('f-github-sync')).toBeNull(); // unowned backlog
    expect(owner('f-sidekick')).toBeNull();
  });

  it('numbers tasks 1..N project-wide in feature order', () => {
    const numbers = snap.data.tasks.map((t) => t.number);
    expect(numbers).toEqual(Array.from({ length: snap.data.tasks.length }, (_, i) => i + 1));
  });

  it('assigns tasks to the owner and marks past-available tasks claimed', () => {
    const merged = snap.data.tasks.find((t) => t.prUrl?.endsWith('/4'));
    expect(merged?.assigneeUserId).toBe(LEAD);
    expect(merged?.claimedByUserId).toBe(LEAD); // merged ⇒ claimant recorded
    const backlog = snap.data.tasks.find((t) => t.status === 'backlog');
    expect(backlog?.claimedByUserId).toBeNull();
  });

  it('emits one backdated feature_shipped event per shipped feature', () => {
    const ships = snap.data.events.filter((e) => e.kind === 'feature_shipped');
    const shipped = buildCutoverPlan().filter((f) => f.status === 'shipped');
    expect(ships).toHaveLength(shipped.length);
    const fork = ships.find((e) => e.featureId === featureId('f-fork'));
    expect(fork?.createdAt).toBe('2026-07-11T12:00:00.000Z'); // backdated to shippedAt
    expect(fork?.actorUserId).toBe(LEAD);
  });

  it('emits one backdated decision event per history entry, feature- or project-scoped', () => {
    const decisions = snap.data.events.filter((e) => e.kind === 'decision');
    expect(decisions).toHaveLength(buildCutoverHistory().length);
    // A feature-scoped decision points at its feature; a project ADR has none.
    const refsClaim = decisions.find((e) => e.title?.startsWith('f-refs'));
    expect(refsClaim?.featureId).toBe(featureId('f-refs'));
    const pivot = decisions.find((e) => e.title?.includes('Self-hosting pivot'));
    expect(pivot?.featureId).toBeNull();
  });

  it('emits no dangling event scopes (every featureId points at a real feature)', () => {
    const featureIds = new Set(snap.data.features.map((f) => f.id));
    for (const e of snap.data.events) {
      if (e.featureId) expect(featureIds.has(e.featureId)).toBe(true);
    }
  });
});
