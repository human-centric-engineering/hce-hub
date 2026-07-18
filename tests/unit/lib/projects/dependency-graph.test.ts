/**
 * Tests for `lib/projects/dependency-graph.ts` — the `assertAcyclic` cycle guard
 * (planning-retro B26). Load-bearing: it's what stops `plan_feature` from writing
 * a task batch that can never be ordered. Exhaustive over the shapes that matter —
 * self-loop, 2-cycle, long cycle, valid DAGs (chain + diamond), disconnected
 * components, and the empty graph — plus the reported cycle ring.
 */

import { describe, it, expect } from 'vitest';
import {
  assertAcyclic,
  DependencyCycleError,
  type DependencyEdge,
} from '@/lib/projects/dependency-graph';

const edges = (...pairs: [string, string][]): DependencyEdge[] =>
  pairs.map(([from, to]) => ({ from, to }));

describe('assertAcyclic — acyclic graphs pass', () => {
  it('accepts the empty graph', () => {
    expect(() => assertAcyclic([])).not.toThrow();
  });

  it('accepts a single edge', () => {
    expect(() => assertAcyclic(edges(['a', 'b']))).not.toThrow();
  });

  it('accepts a linear chain a→b→c→d', () => {
    expect(() => assertAcyclic(edges(['a', 'b'], ['b', 'c'], ['c', 'd']))).not.toThrow();
  });

  it('accepts a diamond DAG (shared dependency, no cycle)', () => {
    // a→b, a→c, b→d, c→d — d is depended on twice but nothing loops.
    expect(() =>
      assertAcyclic(edges(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']))
    ).not.toThrow();
  });

  it('accepts disconnected acyclic components', () => {
    expect(() => assertAcyclic(edges(['a', 'b'], ['x', 'y'], ['y', 'z']))).not.toThrow();
  });

  it('accepts repeated identical edges (a→b twice) as long as acyclic', () => {
    expect(() => assertAcyclic(edges(['a', 'b'], ['a', 'b']))).not.toThrow();
  });
});

describe('assertAcyclic — cycles throw DependencyCycleError', () => {
  it('rejects a self-loop a→a', () => {
    expect(() => assertAcyclic(edges(['a', 'a']))).toThrow(DependencyCycleError);
  });

  it('rejects a 2-cycle a→b→a', () => {
    expect(() => assertAcyclic(edges(['a', 'b'], ['b', 'a']))).toThrow(DependencyCycleError);
  });

  it('rejects a long cycle a→b→c→d→a', () => {
    expect(() => assertAcyclic(edges(['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']))).toThrow(
      DependencyCycleError
    );
  });

  it('rejects a cycle buried among valid edges', () => {
    // A healthy chain x→y plus a hidden loop b→c→b.
    expect(() => assertAcyclic(edges(['x', 'y'], ['a', 'b'], ['b', 'c'], ['c', 'b']))).toThrow(
      DependencyCycleError
    );
  });

  it('reports the offending ring (first === last), e.g. t2→t1→t2', () => {
    try {
      assertAcyclic(edges(['t2', 't1'], ['t1', 't2']));
      throw new Error('expected a DependencyCycleError');
    } catch (err) {
      expect(err).toBeInstanceOf(DependencyCycleError);
      const { cycle } = err as DependencyCycleError;
      expect(cycle.at(0)).toBe(cycle.at(-1)); // the ring closes on itself
      expect(new Set(cycle)).toEqual(new Set(['t1', 't2']));
      expect((err as DependencyCycleError).message).toContain('→');
    }
  });

  it('reports the node for a self-loop as [a, a]', () => {
    try {
      assertAcyclic(edges(['a', 'a']));
      throw new Error('expected a DependencyCycleError');
    } catch (err) {
      expect((err as DependencyCycleError).cycle).toEqual(['a', 'a']);
    }
  });
});
