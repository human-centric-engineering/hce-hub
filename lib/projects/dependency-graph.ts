/**
 * Dependency-graph cycle guard (f-feature-planning §18 t-2; planning-retro B26).
 *
 * A pure, storage-agnostic acyclicity check over `{ from, to }` edges, where
 * `from depends on to` (so `from` must be delivered *after* `to`). The Hub's
 * dependency edges — `TaskDependency`, `FeatureDependency` — must stay a DAG:
 * a cycle means "A waits on B waits on A", which no ordering (`planOrder`,
 * `next_task`, effective-status) can ever satisfy.
 *
 * **Where the guard belongs.** Most edge writers only ever add a *new* node with
 * OUTGOING edges to existing nodes (`create_task`, `create_feature`) — a brand-new
 * node can't close a cycle (nothing points at it yet), so they need no guard. The
 * first writer that can introduce one is **`plan_feature`**: it creates N tasks in
 * one batch that may depend on *each other* (`t2 → t1 → t2`), so the combined
 * graph (new batch refs + the existing task ids they point at) must be proven
 * acyclic *before* any row is written. Existing tasks are leaves in that graph
 * (they predate the batch, so they can't depend back into it), so a cycle can
 * only live among the new nodes — but validating the whole edge set is both
 * correct and simplest.
 *
 * Detection is a 3-colour DFS (white/grey/black); a grey→grey back-edge is a
 * cycle, and the offending node ring is attached to the thrown error so the
 * caller can name it. Self-loops (`from === to`) are cycles too.
 */

/** A directed edge: `from` depends on `to` (must come after it). */
export interface DependencyEdge {
  from: string;
  to: string;
}

/**
 * Thrown by `assertAcyclic` when the edge set contains a cycle. `cycle` is the
 * node ring that closes the loop, e.g. `['t2', 't1', 't2']` — the first and last
 * entries are the same node.
 */
export class DependencyCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' → ')}`);
    this.name = 'DependencyCycleError';
  }
}

/**
 * Throw `DependencyCycleError` if `edges` contain a cycle (including a self-loop);
 * return silently for a DAG. Nodes are the opaque string ids on either side of an
 * edge — the caller decides whether they're task refs, task ids, feature ids, etc.
 */
export function assertAcyclic(edges: DependencyEdge[]): void {
  // Adjacency list; every node (both endpoints of every edge) is a key, so
  // isolated `to`-only leaves are visited too.
  const adjacency = new Map<string, string[]>();
  const ensure = (node: string): string[] => {
    let list = adjacency.get(node);
    if (!list) {
      list = [];
      adjacency.set(node, list);
    }
    return list;
  };
  for (const { from, to } of edges) {
    ensure(from).push(to);
    ensure(to);
  }

  const WHITE = 0; // unvisited
  const GREY = 1; // on the current DFS path
  const BLACK = 2; // fully explored, no cycle through it
  const colour = new Map<string, number>();
  for (const node of adjacency.keys()) colour.set(node, WHITE);

  // Explicit stack of the current DFS path so a back-edge can name the ring.
  const path: string[] = [];

  const visit = (node: string): void => {
    colour.set(node, GREY);
    path.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const c = colour.get(next);
      if (c === GREY) {
        // Back-edge into the active path → cycle. Slice the ring and close it.
        const ring = path.slice(path.indexOf(next));
        ring.push(next);
        throw new DependencyCycleError(ring);
      }
      if (c === WHITE) visit(next);
    }
    path.pop();
    colour.set(node, BLACK);
  };

  for (const node of adjacency.keys()) {
    if (colour.get(node) === WHITE) visit(node);
  }
}
