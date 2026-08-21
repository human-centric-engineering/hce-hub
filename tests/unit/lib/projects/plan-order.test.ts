/**
 * Unit: `planOrder()` — the Plan view's optimal working order (f-plan-view t-1).
 *
 * The load-bearing surface of t-1 (B27): topological correctness (status band
 * then dependency depth) and — critically — **cycle tolerance** (a read must
 * never loop or throw on a malformed graph; the acyclicity *guard* lives in the
 * writers, B26/HB4).
 */
import { describe, it, expect } from 'vitest';
import { planOrder, type PlanOrderInput } from '@/lib/projects/plan-order';

const feat = (
  id: string,
  status: PlanOrderInput['status'],
  dependsOn: string[] = []
): PlanOrderInput => ({
  id,
  status,
  dependsOn,
});

const order = (features: PlanOrderInput[]): string[] => planOrder(features).map((f) => f.id);

describe('planOrder — status banding', () => {
  it('orders shipped → in_flight → planning → blocked', () => {
    const out = order([
      feat('blk', 'blocked'),
      feat('plan', 'planning'),
      feat('ship', 'shipped'),
      feat('flight', 'in_flight'),
    ]);
    expect(out).toEqual(['ship', 'flight', 'plan', 'blk']);
  });
});

describe('planOrder — dependency depth within a band', () => {
  it('sorts a deeper dependency chain later', () => {
    // c depends on b depends on a; all same band → a (0) < b (1) < c (2).
    const out = order([
      feat('c', 'planning', ['b']),
      feat('a', 'planning', []),
      feat('b', 'planning', ['a']),
    ]);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('band dominates depth (a deep shipped feature still precedes a shallow planning one)', () => {
    const out = order([
      feat('planShallow', 'planning', []),
      feat('shipDeep', 'shipped', ['x']),
      feat('x', 'shipped', []),
    ]);
    // both shipped features precede the planning one; within shipped, x(0) < shipDeep(1)
    expect(out).toEqual(['x', 'shipDeep', 'planShallow']);
  });
});

describe('planOrder — cycle tolerance (never loops or throws)', () => {
  it('tolerates a self-loop', () => {
    expect(() => planOrder([feat('a', 'planning', ['a'])])).not.toThrow();
    expect(order([feat('a', 'planning', ['a'])])).toEqual(['a']);
  });

  it('tolerates a multi-node cycle', () => {
    const out = () =>
      order([
        feat('a', 'planning', ['b']),
        feat('b', 'planning', ['c']),
        feat('c', 'planning', ['a']),
      ]);
    expect(out).not.toThrow();
    expect(out()).toHaveLength(3);
  });
});

describe('planOrder — robustness', () => {
  it('ignores a dependency id not in the feature set (cross-project / dangling edge)', () => {
    const out = order([feat('a', 'planning', ['ghost']), feat('b', 'planning', [])]);
    // 'ghost' contributes no depth → a and b both depth 0, stable input order.
    expect(out).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [feat('b', 'blocked'), feat('a', 'shipped')];
    const snapshot = input.map((f) => f.id);
    planOrder(input);
    expect(input.map((f) => f.id)).toEqual(snapshot);
  });

  it('is stable within a {band, depth} tie (keeps incoming order)', () => {
    const out = order([
      feat('first', 'planning'),
      feat('second', 'planning'),
      feat('third', 'planning'),
    ]);
    expect(out).toEqual(['first', 'second', 'third']);
  });
});

describe('planOrder — the shipped band reads as linear history (§33-sweep t-60)', () => {
  const shipped = (id: string, at: string | null, dependsOn: string[] = []): PlanOrderInput => ({
    id,
    status: 'shipped',
    dependsOn,
    shippedAt: at === null ? null : new Date(at),
  });

  it('reads oldest-shipped first, regardless of dependency depth', () => {
    // The dates run OPPOSITE to the depth chain on purpose — `shallow` is depth 0 but
    // shipped last, `deep` is depth 2 but shipped first — so depth ordering and ship
    // ordering give different answers and this can tell them apart. (With the dates
    // running the same way as the chain, both orderings agree and the test proves
    // nothing.)
    const out = order([
      shipped('shallow', '2026-08-20'),
      shipped('mid', '2026-08-10', ['shallow']),
      shipped('deep', '2026-08-01', ['mid']),
    ]);
    expect(out).toEqual(['deep', 'mid', 'shallow']);
  });

  it('sorts an unstamped feature FIRST — oldest, in a chronological list', () => {
    // Null means "shipped before we tracked the instant", so it belongs at the old end.
    // In an ascending band that is the top. Sorting it to the bottom would place it
    // beside the in-flight work, claiming it was the last thing finished.
    const out = order([shipped('dated', '2026-08-01'), shipped('unknown', null)]);
    expect(out).toEqual(['unknown', 'dated']);
  });

  it('falls through to dependency depth when neither is stamped', () => {
    // The degradation t-60 asked for: a set with no stamps keeps exactly the
    // ordering it had before this change, rather than being reshuffled arbitrarily.
    const out = order([
      shipped('deep', null, ['mid']),
      shipped('mid', null, ['shallow']),
      shipped('shallow', null),
    ]);
    expect(out).toEqual(['shallow', 'mid', 'deep']);
  });

  it('leaves the other three bands on dependency depth', () => {
    // A stamp on a non-shipped feature is meaningless and must not reorder anything —
    // the depth axis is the entire value of the view for work still moving.
    const out = order([
      { id: 'deep', status: 'planning', dependsOn: ['shallow'], shippedAt: new Date('2026-08-20') },
      { id: 'shallow', status: 'planning', dependsOn: [], shippedAt: new Date('2026-08-01') },
    ]);
    expect(out).toEqual(['shallow', 'deep']);
  });

  it('still bands shipped above everything, however old', () => {
    const out = order([
      { id: 'flight', status: 'in_flight', dependsOn: [] },
      shipped('ancient', '2020-01-01'),
    ]);
    expect(out).toEqual(['ancient', 'flight']);
  });
});
