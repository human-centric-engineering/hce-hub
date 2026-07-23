/**
 * Unit: journal presentation helpers (f-journal §17 t-3) — the pure label /
 * filter / relative-time logic shared by the Log tab and the task timeline.
 */
import { describe, it, expect } from 'vitest';
import { describeEvent, filterKinds, timeAgo } from '@/components/hub/projects/log/presentation';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const ev = (over: Partial<ProjectEventDTO>): ProjectEventDTO => ({
  id: 'e',
  kind: 'note',
  actor: null,
  actorAgentId: null,
  feature: null,
  task: null,
  title: null,
  body: null,
  metadata: null,
  createdAt: '2026-07-17T10:00:00.000Z',
  ...over,
});

describe('describeEvent', () => {
  it('labels the authored + lifecycle kinds', () => {
    expect(describeEvent(ev({ kind: 'decision' }))).toBe('recorded a decision');
    expect(describeEvent(ev({ kind: 'note' }))).toBe('added a note');
    expect(describeEvent(ev({ kind: 'feature_shipped' }))).toBe('shipped the feature');
    // task_claimed is reused for Start — a task is *born* claimed, so the
    // notable event is being actively taken (f-status-model §20).
    expect(describeEvent(ev({ kind: 'task_claimed' }))).toBe('started the task');
    expect(describeEvent(ev({ kind: 'task_merged' }))).toBe('completed the task');
  });

  it('labels task_created unconditionally (no backlog branch — every task is born claimed)', () => {
    expect(describeEvent(ev({ kind: 'task_created', metadata: { status: 'claimed' } }))).toBe(
      'created the task'
    );
    expect(describeEvent(ev({ kind: 'task_created', metadata: null }))).toBe('created the task');
  });

  it('reads metadata to disambiguate help_wanted (set vs cleared)', () => {
    expect(describeEvent(ev({ kind: 'help_wanted', metadata: { helpWanted: true } }))).toBe(
      'flagged help wanted'
    );
    expect(describeEvent(ev({ kind: 'help_wanted', metadata: { helpWanted: false } }))).toBe(
      'cleared help wanted'
    );
  });

  it('tolerates malformed / absent metadata', () => {
    expect(describeEvent(ev({ kind: 'task_created', metadata: null }))).toBe('created the task');
    expect(describeEvent(ev({ kind: 'help_wanted', metadata: 'not-an-object' }))).toBe(
      'cleared help wanted'
    );
    expect(describeEvent(ev({ kind: 'task_created', metadata: ['array'] }))).toBe(
      'created the task'
    );
  });

  it('labels every feature/task lifecycle kind', () => {
    const cases: [ProjectEventDTO['kind'], string][] = [
      ['feature_created', 'created the feature'],
      ['feature_claimed', 'claimed the feature'],
      ['feature_planned', 'planned the feature'],
      ['feature_blocked', 'marked the feature blocked'],
      ['feature_unblocked', 'unblocked the feature'],
      ['task_pr_linked', 'linked a PR'],
      ['member_added', 'joined the project'],
    ];
    for (const [kind, label] of cases) {
      expect(describeEvent(ev({ kind }))).toBe(label);
    }
  });

  it('falls back for an unrecognised kind', () => {
    expect(describeEvent(ev({ kind: 'something_new' as ProjectEventDTO['kind'] }))).toBe(
      'updated the project'
    );
  });
});

describe('filterKinds', () => {
  it('maps each filter to the right kind set (undefined = all)', () => {
    expect(filterKinds('all')).toBeUndefined();
    expect(filterKinds('decisions')).toEqual(['decision']);
    expect(filterKinds('work')).toEqual(['feature_shipped', 'task_merged']);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-07-17T12:00:00.000Z').getTime();
  it('renders coarse buckets relative to now', () => {
    expect(timeAgo('2026-07-17T11:59:50.000Z', now)).toBe('just now');
    expect(timeAgo('2026-07-17T11:55:00.000Z', now)).toBe('5m');
    expect(timeAgo('2026-07-17T09:00:00.000Z', now)).toBe('3h');
    expect(timeAgo('2026-07-15T12:00:00.000Z', now)).toBe('2d');
  });
  it('falls back to a short date beyond a week', () => {
    // 10 days earlier → not a relative bucket; a month/day string instead.
    expect(timeAgo('2026-07-07T12:00:00.000Z', now)).toMatch(/Jul/);
  });
});
