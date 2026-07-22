/**
 * Unit: the cutover plan data (f-selfhost-cutover §19 t-2).
 * @see lib/projects/cutover/plan-data.ts
 *
 * Pure fidelity of the Hub's own build record — the successor to the retired
 * 006-sample-plan seed's data tests.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCutoverPlan,
  CUTOVER_PROJECT,
  featureId,
  taskId,
} from '@/lib/projects/cutover/plan-data';
import { cuidSchema } from '@/lib/validations/common';

const plan = buildCutoverPlan();
const slugs = new Set(plan.map((f) => f.slug));

describe('cutover plan data', () => {
  it('materialises all 19 v1 features', () => {
    expect(plan).toHaveLength(19);
  });

  it('carries the real status split (14 shipped · 1 in_flight · 3 planning · 1 blocked)', () => {
    const by = (s: string) => plan.filter((f) => f.status === s).map((f) => f.slug);
    expect(by('shipped')).toHaveLength(14);
    expect(by('in_flight')).toEqual(['f-selfhost-cutover']);
    expect(by('planning')).toEqual(['f-sidekick', 'f-intake', 'f-github-sync']);
    expect(by('blocked')).toEqual(['f-morning-brief']);
  });

  it('every feature carries a human description', () => {
    for (const f of plan) expect(f.description.length).toBeGreaterThan(0);
  });

  it('gives every shipped feature merged tasks with real PR URLs', () => {
    for (const f of plan.filter((x) => x.status === 'shipped')) {
      expect(f.tasks.length).toBeGreaterThan(0);
      for (const t of f.tasks) {
        expect(t.status).toBe('merged');
        expect(t.prUrl).toMatch(
          /^https:\/\/github\.com\/human-centric-engineering\/hce-hub\/pull\/\d+$/
        );
      }
      expect(f.shippedAt).toBeTruthy();
    }
  });

  it('surfaces unowned "available to claim" features (incl. help-wanted)', () => {
    const unowned = plan.filter((f) => f.unowned).map((f) => f.slug);
    expect(unowned).toEqual(['f-sidekick', 'f-intake', 'f-github-sync', 'f-morning-brief']);
    expect(plan.find((f) => f.slug === 'f-github-sync')?.helpWanted).toBe(true);
  });

  it('carries referentially-intact dependency edges', () => {
    for (const f of plan) for (const dep of f.dependsOn) expect(slugs.has(dep)).toBe(true);
    expect(plan.find((f) => f.slug === 'f-shell')?.dependsOn).toEqual(['f-theme', 'f-access']);
  });

  it('carries §18 indicative sketches on the unplanned AI-layer features', () => {
    const sketched = plan.filter((f) => (f.indicativeTasks?.length ?? 0) > 0).map((f) => f.slug);
    expect(sketched).toContain('f-sidekick');
    for (const f of plan.filter((x) => (x.indicativeTasks?.length ?? 0) > 0)) {
      expect(f.tasks).toHaveLength(0); // a sketch has no real tasks yet
    }
  });

  it('uses cuid-shaped ids (so /projects/:id parseCuidParam accepts them)', () => {
    expect(cuidSchema.safeParse(CUTOVER_PROJECT.id).success).toBe(true);
    expect(cuidSchema.safeParse(featureId('f-journal')).success).toBe(true);
    expect(cuidSchema.safeParse(taskId('f-fork', 0)).success).toBe(true);
  });

  it('reuses the 006 sample-project id (so import-plan upgrades it in place)', () => {
    // cid('hubproject') — the retired seed's SAMPLE_PROJECT.id.
    expect(CUTOVER_PROJECT.id).toBe('chubproject');
  });
});
