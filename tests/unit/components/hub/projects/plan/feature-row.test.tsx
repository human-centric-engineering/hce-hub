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
  slug: null,
  title: 'Feature one',
  description: null,
  status: 'planning',
  planningStage: 'planned',
  helpWanted: false,
  owner: null,
  dependsOn: [],
  tasks: [],
  indicativeTasks: [],
  progress: { merged: 0, total: 0, live: 0, blocked: 0 },
  ...over,
});

const noop = () => {};

/** Render a FeatureRow with the required projectId, plus any prop overrides. */
function renderRow(
  props: Partial<React.ComponentProps<typeof FeatureRow>> & { feature: PlanFeature }
) {
  return render(
    <FeatureRow projectId="p1" ordinal={1} expanded={false} onToggle={noop} {...props} />
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
          { id: 't1', number: null, title: 'x', status: 'merged', prUrl: null, claimer: null },
        ],
        progress: { merged: 1, total: 3, live: 1, blocked: 1 },
      }),
      onToggle,
    });
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText(/1 live/)).toBeInTheDocument();
    expect(screen.getByText(/1 blocked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tasks/ }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has no toggle and shows "no tasks yet" when a planning feature has none', () => {
    renderRow({
      feature: feature({
        status: 'planning',
        planningStage: 'planned',
        tasks: [],
        owner: { id: 'u1', name: 'Ada', email: 'a@x', image: null },
      }),
    });
    expect(screen.queryByRole('button', { name: /Toggle/ })).not.toBeInTheDocument();
    expect(screen.getByText('no tasks yet')).toBeInTheDocument();
  });

  it('shows an inline Claim button on an unowned, unshipped feature (§18 t-4)', () => {
    renderRow({ feature: feature({ owner: null, status: 'planning' }) });
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
            status: 'available',
            prUrl: null,
            claimer: null,
          },
        ],
        progress: { merged: 0, total: 1, live: 0, blocked: 0 },
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
          { id: 't1', number: 1, title: 'x', status: 'available', prUrl: null, claimer: null },
        ],
        progress: { merged: 0, total: 1, live: 0, blocked: 0 },
      }),
      expanded: true,
    });
    const toggle = screen.getByRole('button', { name: 'Toggle tasks for MCP server' });
    expect(toggle).toHaveAttribute('aria-controls', 'feature-tasks-feat-9');
    expect(document.getElementById('feature-tasks-feat-9')).toBeInTheDocument();
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
