/**
 * Unit: FeatureRow (f-plan-view t-2; feature-page link + indicative rendering
 * f-feature-planning §18 t-3).
 *
 * Load-bearing: a null owner renders "unassigned" (never a deref — carried
 * f-data-model t-3 finding); the mono feature slug + dependency chips render the
 * slug (title fallback, f-refs); help-wanted flags; progress + chevron only when
 * the feature has tasks/sketch. §18: the slug/title links to the feature page;
 * an indicative feature shows an "indicative" chip and expands to its sketch.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureRow } from '@/components/hub/projects/plan/feature-row';
import type { PlanFeature } from '@/components/hub/projects/plan/types';

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  id: 'f1',
  number: null,
  slug: null,
  title: 'Feature one',
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
    openBugs: 0,
    openSinceShip: 0,
    unstartedSinceShip: 0,
  },
  ...over,
});

const noop = () => {};

/**
 * Render a FeatureRow with the required projectId/projectRef, plus any prop
 * overrides. Default projectRef matches projectId ('p1') so existing href
 * assertions written before the slug/cuid split (§19) stay valid; tests that
 * exercise the split pass distinct values explicitly.
 */
function renderRow(
  props: Partial<React.ComponentProps<typeof FeatureRow>> & { feature: PlanFeature }
) {
  return render(
    <FeatureRow
      projectId="p1"
      projectRef="p1"
      ordinal={1}
      expanded={false}
      onToggle={noop}
      {...props}
    />
  );
}

describe('FeatureRow', () => {
  it('renders a null owner as "unassigned", never dereferencing', () => {
    renderRow({ feature: feature({ owner: null }) });
    expect(screen.getByText('unassigned')).toBeInTheDocument();
  });

  it('renders the owner first name when present', () => {
    renderRow({
      feature: feature({ owner: { id: 'u1', name: 'Ada Lovelace', email: 'a@x.io', image: null } }),
    });
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('shows the plain summary in the row when authored (§21 t-d)', () => {
    renderRow({ feature: feature({ summary: 'the short version', description: 'the long one' }) });
    expect(screen.getByText('the short version')).toBeInTheDocument();
    expect(screen.queryByText('the long one')).not.toBeInTheDocument();
  });

  describe('open-fixes label (f-bug-handling §22-02)', () => {
    const withFixes = (openBugs: number) =>
      feature({
        status: 'shipped',
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'built',
            status: 'merged',
            kind: 'feature_work',
            prUrl: null,
            claimer: null,
            committedPhaseName: null,
          },
        ],
        progress: {
          merged: 1,
          total: 1,
          live: 0,
          blocked: 0,
          openBugs,
          openSinceShip: 0,
          unstartedSinceShip: 0,
        },
      });

    it('surfaces multiple open bug fixes as "· N open bugs"', () => {
      renderRow({ feature: withFixes(2) });
      expect(screen.getByText(/open bugs/)).toBeInTheDocument();
    });

    it('uses the singular "· 1 open bug" for a single fix', () => {
      renderRow({ feature: withFixes(1) });
      expect(screen.getByText(/open bug$/)).toBeInTheDocument();
    });

    it('shows no open-fixes label when there are none', () => {
      renderRow({ feature: withFixes(0) });
      expect(screen.queryByText(/open bug/)).not.toBeInTheDocument();
    });

    /**
     * §32 t-94. The owner found this on the first real enhancement filed through the
     * new flow: §20 rendered `4/4` with an unmerged fifth row in its own task table
     * and nothing on the row to suggest it existed — buried under a collapsed feature
     * inside a collapsed, completed phase.
     */
    describe('post-ship work (§32 t-94)', () => {
      /** A shipped feature whose ratio is sealed at 1/1, plus post-ship state. */
      const shipped = (over: Partial<PlanFeature['progress']>) =>
        feature({
          status: 'shipped',
          tasks: [
            {
              id: 't1',
              number: 1,
              title: 'built',
              status: 'merged',
              kind: 'feature_work',
              prUrl: null,
              claimer: null,
              committedPhaseName: null,
            },
          ],
          progress: {
            merged: 1,
            total: 1,
            live: 0,
            blocked: 0,
            openBugs: 0,
            openSinceShip: 0,
            unstartedSinceShip: 0,
            ...over,
          },
        });

      it('surfaces unstarted post-ship work as "· N new" beside the sealed ratio', () => {
        renderRow({ feature: shipped({ openSinceShip: 1, unstartedSinceShip: 1 }) });
        // The ratio stays honest AND the row stops hiding the extra work.
        expect(screen.getByText(/1\/1/)).toBeInTheDocument();
        expect(screen.getByText(/· 1 new/)).toBeInTheDocument();
      });

      it('shows nothing when there is no post-ship work', () => {
        renderRow({ feature: shipped({}) });
        expect(screen.queryByText(/new/)).not.toBeInTheDocument();
      });

      /**
       * Owner's call: once somebody starts that task `live` already shows it, so
       * "1 live · 1 new" would read as two outstanding items where there is one.
       * "new" means post-ship work **no other marker is showing**.
       */
      it('drops "new" once the post-ship task is started — `live` already shows it', () => {
        renderRow({ feature: shipped({ live: 1, openSinceShip: 1, unstartedSinceShip: 0 }) });
        expect(screen.getByText(/1 live/)).toBeInTheDocument();
        expect(screen.queryByText(/new/)).not.toBeInTheDocument();
      });

      it('drops "new" for a dependency-blocked post-ship task, for the same reason', () => {
        renderRow({ feature: shipped({ blocked: 1, openSinceShip: 1, unstartedSinceShip: 0 }) });
        expect(screen.getByText(/1 blocked/)).toBeInTheDocument();
        expect(screen.queryByText(/new/)).not.toBeInTheDocument();
      });

      it('shows both when one post-ship task is started and another is not', () => {
        renderRow({ feature: shipped({ live: 1, openSinceShip: 2, unstartedSinceShip: 1 }) });
        expect(screen.getByText(/1 live/)).toBeInTheDocument();
        expect(screen.getByText(/1 new/)).toBeInTheDocument(); // disjoint — the other one
      });

      it('reads both markers when a feature carries an open bug AND unstarted post-ship work', () => {
        renderRow({ feature: shipped({ openBugs: 2, openSinceShip: 1, unstartedSinceShip: 1 }) });
        expect(screen.getByText(/2 open bugs/)).toBeInTheDocument();
        expect(screen.getByText(/1 new/)).toBeInTheDocument();
      });
    });
  });

  it('falls back to the description in the row until a summary is authored', () => {
    renderRow({ feature: feature({ summary: null, description: 'the long one' }) });
    expect(screen.getByText('the long one')).toBeInTheDocument();
  });

  it('links the slug/title to the feature page (slug key when authored)', () => {
    renderRow({ feature: feature({ slug: 'f-access', title: 'Membership funnel' }) });
    const link = screen.getByRole('link', { name: /Membership funnel/ });
    expect(link).toHaveAttribute('href', '/projects/p1/features/f-access');
    expect(screen.getByText('f-access')).toBeInTheDocument();
  });

  it('falls back to the feature id in the page link when unslugged', () => {
    renderRow({ feature: feature({ id: 'feat-x', slug: null, title: 'No slug' }) });
    expect(screen.getByRole('link', { name: /No slug/ })).toHaveAttribute(
      'href',
      '/projects/p1/features/feat-x'
    );
  });

  it('uses projectRef (the project slug) for the feature-page link, distinct from the cuid projectId used elsewhere (§19)', () => {
    renderRow({
      projectId: 'cmxprojectcuid00000000001',
      projectRef: 'hce-hub',
      feature: feature({ slug: 'f-access', title: 'Membership funnel' }),
    });
    const link = screen.getByRole('link', { name: /Membership funnel/ });
    expect(link).toHaveAttribute('href', '/projects/hce-hub/features/f-access');
  });

  it('renders dependency chips with the depended-on feature slug (title fallback)', () => {
    renderRow({
      feature: feature({
        dependsOn: [
          { id: 'a', slug: 'f-access', title: 'Membership funnel' },
          { id: 'b', slug: null, title: 'Unslugged feature' },
        ],
      }),
    });
    expect(screen.getByText('depends on')).toBeInTheDocument();
    expect(screen.getByText('f-access')).toBeInTheDocument(); // slug
    expect(screen.getByText('Unslugged feature')).toBeInTheDocument(); // title fallback
  });

  it('flags a help-wanted feature', () => {
    renderRow({ feature: feature({ helpWanted: true }) });
    expect(screen.getByText('help wanted')).toBeInTheDocument();
  });

  it('shows progress (incl. blocked) and a toggle when the feature has tasks', () => {
    const onToggle = vi.fn();
    renderRow({
      feature: feature({
        tasks: [
          {
            id: 't1',
            number: null,
            title: 'x',
            status: 'merged',
            kind: 'feature_work',
            prUrl: null,
            claimer: null,
            committedPhaseName: null,
          },
        ],
        progress: {
          merged: 1,
          total: 3,
          live: 1,
          blocked: 1,
          openBugs: 0,
          openSinceShip: 0,
          unstartedSinceShip: 0,
        },
      }),
      onToggle,
    });
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText(/1 live/)).toBeInTheDocument();
    expect(screen.getByText(/1 blocked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tasks/ }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has no toggle and shows "no tasks yet" when an available feature has none', () => {
    renderRow({
      feature: feature({
        status: 'available',
        planningStage: 'planned',
        tasks: [],
        owner: { id: 'u1', name: 'Ada', email: 'a@x', image: null },
      }),
    });
    expect(screen.queryByRole('button', { name: /Toggle/ })).not.toBeInTheDocument();
    expect(screen.getByText('no tasks yet')).toBeInTheDocument();
  });

  it('shows an inline Claim button on an unowned, unshipped feature (§18 t-4)', () => {
    renderRow({ feature: feature({ owner: null, status: 'available' }) });
    expect(screen.getByRole('button', { name: 'Claim this feature' })).toBeInTheDocument();
  });

  it('shows no Claim button once a feature is owned', () => {
    renderRow({
      feature: feature({ owner: { id: 'u1', name: 'Ada', email: 'a@x', image: null } }),
    });
    expect(screen.queryByRole('button', { name: 'Claim this feature' })).not.toBeInTheDocument();
  });

  it('shows no Claim button on a shipped feature (even if unowned)', () => {
    renderRow({ feature: feature({ owner: null, status: 'shipped' }) });
    expect(screen.queryByRole('button', { name: 'Claim this feature' })).not.toBeInTheDocument();
  });

  it('renders the task table when expanded', () => {
    renderRow({
      feature: feature({
        tasks: [
          {
            id: 't1',
            number: null,
            title: 'Expanded task',
            status: 'claimed',
            kind: 'feature_work',
            prUrl: null,
            claimer: null,
            committedPhaseName: null,
          },
        ],
        progress: {
          merged: 0,
          total: 1,
          live: 0,
          blocked: 0,
          openBugs: 0,
          openSinceShip: 0,
          unstartedSinceShip: 0,
        },
      }),
      expanded: true,
    });
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open task Expanded task' })).toBeInTheDocument();
    expect(screen.getByText('Expanded task')).toBeInTheDocument();
  });

  it('labels the expand toggle and links it to its task region (a11y — carried §09)', () => {
    renderRow({
      feature: feature({
        id: 'feat-9',
        title: 'MCP server',
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'x',
            status: 'claimed',
            kind: 'feature_work',
            prUrl: null,
            claimer: null,
            committedPhaseName: null,
          },
        ],
        progress: {
          merged: 0,
          total: 1,
          live: 0,
          blocked: 0,
          openBugs: 0,
          openSinceShip: 0,
          unstartedSinceShip: 0,
        },
      }),
      expanded: true,
    });
    const toggle = screen.getByRole('button', { name: 'Toggle tasks for MCP server' });
    expect(toggle).toHaveAttribute('aria-controls', 'feature-tasks-feat-9');
    expect(document.getElementById('feature-tasks-feat-9')).toBeInTheDocument();
  });

  describe('readiness derivation (f-status-model §20 t-37)', () => {
    it('renders a "waiting on" line naming the unshipped dependency for a blocked feature', () => {
      renderRow({
        feature: feature({
          status: 'blocked',
          waitingOn: [{ slug: 'f-x', title: 'Feature X' }],
        }),
      });
      expect(screen.getByText('waiting on')).toBeInTheDocument();
      expect(screen.getByText('f-x')).toBeInTheDocument();
    });

    it('falls back to the title when a waiting-on dependency has no slug', () => {
      renderRow({
        feature: feature({
          status: 'blocked',
          waitingOn: [{ slug: null, title: 'Unslugged blocker' }],
        }),
      });
      expect(screen.getByText('Unslugged blocker')).toBeInTheDocument();
    });

    it('shows no "waiting on" line for an available feature (empty waitingOn)', () => {
      renderRow({ feature: feature({ status: 'available', waitingOn: [] }) });
      expect(screen.queryByText('waiting on')).not.toBeInTheDocument();
    });

    it("renders the row number from the stable ordinal prop (the feature's §N, not row position)", () => {
      // The Plan view computes `ordinal = feature.number ?? index + 1` and passes
      // it in — FeatureRow just formats whatever it's given, zero-padded.
      renderRow({ feature: feature({ number: 15 }), ordinal: 15 });
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  describe('indicative features (§18)', () => {
    it('shows the "indicative" chip and the sketch count', () => {
      renderRow({
        feature: feature({
          planningStage: 'indicative',
          indicativeTasks: [
            { id: 'i1', order: 0, text: 'sketch a' },
            { id: 'i2', order: 1, text: 'sketch b' },
          ],
        }),
      });
      expect(screen.getByText('indicative')).toBeInTheDocument();
      expect(screen.getByText('2 in sketch')).toBeInTheDocument();
    });

    it('expands to the muted sketch list (no task rows, no pills)', () => {
      renderRow({
        feature: feature({
          planningStage: 'indicative',
          indicativeTasks: [{ id: 'i1', order: 0, text: 'draft the schema' }],
        }),
        expanded: true,
      });
      const toggle = screen.getByRole('button', { name: /Toggle sketch/ });
      expect(toggle).toBeInTheDocument();
      expect(screen.getByText('draft the schema')).toBeInTheDocument();
      // No task-opening buttons — the sketch isn't claimable.
      expect(screen.queryByRole('button', { name: /Open task/ })).not.toBeInTheDocument();
    });
  });
});
