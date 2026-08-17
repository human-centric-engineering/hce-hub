/**
 * Unit: PlanSummary (f-plan-view t-2) — feature count, tasks merged, status pills.
 *
 * The task count is **every** task, bugs and post-ship work included (§32 t-94,
 * owner: "a bug and an enhancement are both types of task — that's the honest
 * accounting"). That is deliberately NOT the feature ratio, which excludes both so
 * neither dents a feature's build-out. Two lines, two questions.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanSummary } from '@/components/hub/projects/plan/plan-summary';
import type { PlanFeature, PlanTask, TaskKind } from '@/components/hub/projects/plan/types';

const task = (
  id: string,
  status: PlanTask['status'] = 'claimed',
  kind: TaskKind = 'feature_work'
): PlanTask => ({
  id,
  number: null,
  title: `task ${id}`,
  status,
  kind,
  prUrl: null,
  claimer: null,
});

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  id: 'f1',
  number: null,
  slug: null,
  title: 't',
  summary: null,
  description: null,
  status: 'available',
  waitingOn: [],
  planningStage: 'planned',
  helpWanted: false,
  owner: null,
  dependsOn: [],
  tasks: [],
  indicativeTasks: [],
  progress: {
    merged: 0,
    total: 0,
    live: 0,
    blocked: 0,
    openFixes: 0,
    openSinceShip: 0,
    unstartedSinceShip: 0,
  },
  ...over,
});

describe('PlanSummary', () => {
  it('counts features and merged/total tasks', () => {
    render(
      <PlanSummary
        features={[
          feature({ status: 'shipped', tasks: [task('a', 'merged'), task('b')] }),
          feature({ status: 'available', tasks: [task('c'), task('d', 'active'), task('e')] }),
        ]}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument(); // feature count (unique)
    expect(screen.getByText('/5')).toBeInTheDocument(); // total tasks
    expect(screen.getByText('shipped')).toBeInTheDocument();
    expect(screen.getByText('available')).toBeInTheDocument();
  });

  it('omits a status pill for a band with zero features', () => {
    render(<PlanSummary features={[feature({ status: 'available' })]} />);
    expect(screen.queryByText('blocked')).not.toBeInTheDocument();
    expect(screen.getByText('available')).toBeInTheDocument();
  });

  describe('honest project-level accounting (§32 t-94)', () => {
    it('counts bugs and post-ship enhancements — every task is a task', () => {
      // The shipped feature's RATIO is 1/1 (a bug and a post-ship enhancement are
      // off its build-out axis, and must stay off). The project LINE counts all
      // four rows, because "how much of this project's work is done" is a
      // different question from "did this feature's build-out complete".
      render(
        <PlanSummary
          features={[
            feature({
              status: 'shipped',
              tasks: [
                task('built', 'merged'),
                task('fix', 'claimed', 'bug'),
                task('fixed', 'merged', 'bug'),
                task('improve', 'claimed', 'enhancement'),
              ],
              progress: {
                merged: 1,
                total: 1,
                live: 0,
                blocked: 0,
                openFixes: 1,
                openSinceShip: 1,
                unstartedSinceShip: 0,
              },
            }),
          ]}
        />
      );
      expect(screen.getByText('/4')).toBeInTheDocument(); // NOT /1 — the feature ratio
      expect(screen.getByText('2')).toBeInTheDocument(); // built + fixed bug
    });

    it('does not read off the feature ratio, which excludes exactly what this must include', () => {
      // Guards the regression directly: a feature whose ratio says 1/1 while its
      // table holds 3 rows must not make the project line read 1/1. That mismatch
      // is what put "76/81 tasks merged" under a header saying "96 tasks".
      render(
        <PlanSummary
          features={[
            feature({
              status: 'shipped',
              tasks: [task('a', 'merged'), task('b', 'claimed', 'bug'), task('c', 'claimed')],
              progress: {
                merged: 1,
                total: 1,
                live: 0,
                blocked: 0,
                openFixes: 1,
                openSinceShip: 1,
                unstartedSinceShip: 0,
              },
            }),
          ]}
        />
      );
      expect(screen.getByText('/3')).toBeInTheDocument();
      expect(screen.queryByText('/1')).not.toBeInTheDocument();
    });

    it('reconciles with a raw task count across features — the property the header uses', () => {
      const features = [
        feature({ id: 'f1', tasks: [task('a', 'merged'), task('b', 'claimed', 'bug')] }),
        feature({ id: 'f2', tasks: [task('c', 'merged', 'enhancement'), task('d', 'blocked')] }),
        feature({ id: 'f3', tasks: [] }), // an indicative feature contributes nothing
      ];
      render(<PlanSummary features={features} />);
      // The project header counts rows with `prisma.task.count` — this line must
      // agree with it, or the page shows two different totals for one project.
      const rawTotal = features.reduce((n, f) => n + f.tasks.length, 0);
      expect(screen.getByText(`/${rawTotal}`)).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // the two merged, of any kind
    });
  });
});
