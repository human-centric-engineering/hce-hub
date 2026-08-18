/**
 * Unit: PlanView (f-plan-view t-2) — renders server-ordered features, expands
 * to tasks, and shows the empty state.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlanView } from '@/components/hub/projects/plan/plan-view';
import type {
  PlanFeature,
  PlanPhaseBand,
  PlanBandRow,
  ProjectPlanDTO,
} from '@/components/hub/projects/plan/types';

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
    openFixes: 0,
    openSinceShip: 0,
    unstartedSinceShip: 0,
  },
  ...over,
});

// Wrap features in a single residual band — mirrors the server's no-phases output
// (an empty residual is dropped), so these render exactly like the flat plan.
/**
 * A band as a fixture writes it — `rows` optional, since most tests only care
 * about features. Defaulted below to exactly those features, which is what the
 * server produces for a band with nothing borrowed into it (§32 t-95).
 */
type BandInput = Omit<PlanPhaseBand, 'rows' | 'description' | 'startedAt' | 'completedAt'> & {
  rows?: PlanBandRow[];
  /** §33 t-99 — optional here too: most tests care about grouping, not the header. */
  description?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

const withRows = (b: BandInput): PlanPhaseBand => ({
  description: null,
  startedAt: null,
  completedAt: null,
  ...b,
  rows: b.rows ?? b.features.map((feature) => ({ kind: 'feature', feature })),
});

const plan = (features: PlanFeature[], projectSlug: string | null = null): ProjectPlanDTO => ({
  projectId: 'p1',
  projectSlug,
  phases: features.length
    ? [withRows({ id: null, name: null, status: null, ordinal: null, features })]
    : [],
});

// Build a plan from explicit phase bands (for the grouping/collapse tests).
const banded = (phases: BandInput[]): ProjectPlanDTO => ({
  projectId: 'p1',
  projectSlug: null,
  phases: phases.map(withRows),
});

describe('PlanView rendering', () => {
  it('renders features in the given order and numbers them', () => {
    render(
      <PlanView
        plan={plan([
          feature({ id: 'a', title: 'Foundation', status: 'shipped' }),
          feature({ id: 'b', title: 'Built on it' }),
        ])}
      />
    );
    expect(screen.getByText('Foundation')).toBeInTheDocument();
    expect(screen.getByText('Built on it')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
  });

  it('shows the empty state when there are no features', () => {
    render(<PlanView plan={plan([])} />);
    expect(screen.getByText(/No features yet/i)).toBeInTheDocument();
  });

  it('expands a feature to reveal its task table on click', () => {
    render(
      <PlanView
        plan={plan([
          feature({
            id: 'f1',
            title: 'Has tasks',
            status: 'available',
            tasks: [
              {
                id: 't1',
                number: null,
                title: 'Do the thing',
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
              openFixes: 0,
              openSinceShip: 0,
              unstartedSinceShip: 0,
            },
          }),
        ])}
      />
    );
    // Not expanded by default (planning, but the default-open picks the first
    // NON-shipped feature with tasks — here that IS f1, so it opens).
    expect(screen.getByText('Do the thing')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { expanded: true });
    fireEvent.click(toggle);
    expect(screen.queryByText('Do the thing')).not.toBeInTheDocument();
  });

  it('opens the first in-flight feature with tasks by default, not a shipped one', () => {
    render(
      <PlanView
        plan={plan([
          feature({
            id: 'shipped',
            title: 'Shipped feature',
            status: 'shipped',
            tasks: [
              {
                id: 's1',
                number: null,
                title: 'shipped task',
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
              openFixes: 0,
              openSinceShip: 0,
              unstartedSinceShip: 0,
            },
          }),
          feature({
            id: 'live',
            title: 'Live feature',
            status: 'in_flight',
            tasks: [
              {
                id: 'l1',
                number: null,
                title: 'live task',
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
              live: 1,
              blocked: 0,
              openFixes: 0,
              openSinceShip: 0,
              unstartedSinceShip: 0,
            },
          }),
        ])}
      />
    );
    // The in-flight feature's task is visible; the shipped one's is collapsed.
    expect(screen.getByText('live task')).toBeInTheDocument();
    expect(screen.queryByText('shipped task')).not.toBeInTheDocument();
  });

  it('prefers the feature containing an active task over an earlier non-shipped feature with only claimed tasks (f-status-model §20 t-37)', () => {
    render(
      <PlanView
        plan={plan([
          feature({
            id: 'first',
            title: 'First in order, nothing active',
            status: 'in_flight',
            tasks: [
              {
                id: 't1',
                number: null,
                title: 'claimed task',
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
              openFixes: 0,
              openSinceShip: 0,
              unstartedSinceShip: 0,
            },
          }),
          feature({
            id: 'second',
            title: 'Later, has the active task',
            status: 'in_flight',
            tasks: [
              {
                id: 't2',
                number: null,
                title: 'active task',
                status: 'active',
                kind: 'feature_work',
                prUrl: null,
                claimer: null,
                committedPhaseName: null,
              },
            ],
            progress: {
              merged: 0,
              total: 1,
              live: 1,
              blocked: 0,
              openFixes: 0,
              openSinceShip: 0,
              unstartedSinceShip: 0,
            },
          }),
        ])}
      />
    );
    // The second feature (the one with the active task) is expanded by default,
    // even though the first feature sorts earlier and is also non-shipped with tasks.
    expect(screen.getByText('active task')).toBeInTheDocument();
    expect(screen.queryByText('claimed task')).not.toBeInTheDocument();
  });

  it('links feature rows using the project slug for the page URL when present (§19)', () => {
    render(
      <PlanView plan={plan([feature({ slug: 'f-x', title: 'Slugged feature' })], 'hce-hub')} />
    );
    const link = screen.getByRole('link', { name: /Slugged feature/ });
    expect(link).toHaveAttribute('href', '/projects/hce-hub/features/f-x');
  });

  it('falls back to the cuid projectId for feature links when the plan has no project slug', () => {
    render(<PlanView plan={plan([feature({ slug: 'f-x', title: 'No slug project' })], null)} />);
    const link = screen.getByRole('link', { name: /No slug project/ });
    expect(link).toHaveAttribute('href', '/projects/p1/features/f-x');
  });

  it('renders the summary line', () => {
    render(
      <PlanView plan={plan([feature({ status: 'shipped' }), feature({ status: 'available' })])} />
    );
    const summary = screen.getByText('features').closest('div')!;
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/most ready to advance/i)).toBeInTheDocument();
  });
});

describe('PlanView phase grouping (f-phases §22 t2)', () => {
  it('shows a band header with the phase name and feature count when phases exist', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'ph1',
            name: 'v0.9.0',
            status: 'active',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Filed feature' })],
          },
        ])}
      />
    );
    // The band header is a button; the phase name also appears in the row's
    // assign picker (a combobox), so target the header specifically.
    expect(screen.getByRole('button', { name: /v0\.9\.0/ })).toBeInTheDocument();
    expect(screen.getByText('1 feature')).toBeInTheDocument();
    expect(screen.getByText('Filed feature')).toBeInTheDocument();
  });

  it('does not render band chrome when the plan is a single residual band', () => {
    render(<PlanView plan={plan([feature({ id: 'a', title: 'Unfiled' })])} />);
    expect(screen.getByText('Unfiled')).toBeInTheDocument();
    expect(screen.queryByText('No phase')).not.toBeInTheDocument();
  });

  it('labels the residual band "No phase" with no status chip (not "parked")', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'ph1',
            name: 'Active',
            status: 'active',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Filed' })],
          },
          {
            id: null,
            name: null,
            status: null,
            ordinal: null,
            features: [feature({ id: 'b', title: 'Unfiled' })],
          },
        ])}
      />
    );
    const residual = screen.getByRole('button', { name: /No phase/ });
    // Regression: a null-status residual band fell into the parked branch and
    // rendered "parked". It must carry no status chip at all.
    expect(within(residual).queryByText('parked')).not.toBeInTheDocument();
    expect(within(residual).getByText('1 feature')).toBeInTheDocument();
  });

  it('collapses a complete phase by default (done history), open on click', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'done',
            name: 'Foundations',
            status: 'complete',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Shipped work', status: 'shipped' })],
          },
        ])}
      />
    );
    expect(screen.queryByText('Shipped work')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Foundations/ }));
    expect(screen.getByText('Shipped work')).toBeInTheDocument();
  });

  it('forces a collapse-by-default band open when it holds the auto-expanded feature', () => {
    // A complete phase collapses by default, but if it contains the feature the
    // view opens on (an active task), the band must open so that work is visible.
    render(
      <PlanView
        plan={banded([
          {
            id: 'done',
            name: 'Foundations',
            status: 'complete',
            ordinal: 0,
            features: [
              feature({
                id: 'a',
                title: 'Live work in a complete phase',
                status: 'in_flight',
                tasks: [
                  {
                    id: 't1',
                    number: null,
                    title: 'active task',
                    status: 'active',
                    kind: 'feature_work',
                    prUrl: null,
                    claimer: null,
                    committedPhaseName: null,
                  },
                ],
                progress: {
                  merged: 0,
                  total: 1,
                  live: 1,
                  blocked: 0,
                  openFixes: 0,
                  openSinceShip: 0,
                  unstartedSinceShip: 0,
                },
              }),
            ],
          },
        ])}
      />
    );
    expect(screen.getByText('active task')).toBeInTheDocument();
  });

  it('collapses a parked band by default and reveals it on click', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'ideas',
            name: 'Idea park',
            status: 'parked',
            ordinal: 0,
            features: [feature({ id: 'p1', title: 'Parked idea' })],
          },
        ])}
      />
    );
    // Hidden until the parked band is opened.
    expect(screen.queryByText('Parked idea')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Idea park/ }));
    expect(screen.getByText('Parked idea')).toBeInTheDocument();
  });
});

/**
 * §32 t-95 — a band renders `rows` (features interleaved with borrowed tasks), not
 * `features`. These pin the wiring; the ORDERING those rows arrive in is the
 * server's and is asserted in `lib/projects/plan.test.ts`.
 */
describe('PlanView borrowed task rows (§32 t-95)', () => {
  const borrowed = {
    kind: 'task' as const,
    task: {
      id: 't93',
      number: 93,
      title: 'Borrowed into this phase',
      status: 'claimed' as const,
      kind: 'enhancement' as const,
      prUrl: null,
      claimer: null,
      feature: { id: 'f20', slug: 'f-status-model', title: 'Origin feature' },
      originPhaseName: 'Foundations',
    },
  };

  it('renders a borrowed task row in the band, in the position the server gave it', () => {
    const a = feature({ id: 'a', title: 'Native feature' });
    render(
      <PlanView
        plan={banded([
          {
            id: 'now',
            name: 'Project flow',
            status: 'active',
            ordinal: 0,
            features: [a],
            // Server order: the borrowed task ahead of the feature.
            rows: [borrowed, { kind: 'feature', feature: a }],
          },
        ])}
      />
    );
    expect(screen.getByText('Borrowed into this phase')).toBeInTheDocument();
    expect(screen.getByText('Native feature')).toBeInTheDocument();
    expect(screen.getByText('t-93')).toBeInTheDocument();
    // The breadcrumb says where the work actually lives.
    expect(screen.getByRole('link', { name: 'f-status-model' })).toBeInTheDocument();
  });

  it('counts only features in the band header — a borrow is not membership', () => {
    const a = feature({ id: 'a', title: 'Native feature' });
    render(
      <PlanView
        plan={banded([
          {
            id: 'now',
            name: 'Project flow',
            status: 'active',
            ordinal: 0,
            features: [a],
            rows: [borrowed, { kind: 'feature', feature: a }],
          },
        ])}
      />
    );
    expect(screen.getByRole('button', { name: /Project flow/ })).toHaveTextContent('1 feature');
  });

  /**
   * A phase can hold borrowed work and no features of its own — a band created to
   * collect committed work is exactly that shape. It must still render, and its
   * "0 features" header must not read as "nothing here".
   */
  it('renders a band whose only content is borrowed — zero features of its own', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'now',
            name: 'Project flow',
            status: 'active',
            ordinal: 0,
            features: [],
            rows: [borrowed],
          },
          // Another band supplies the project's features; without one anywhere the
          // view shows its project-level empty state instead.
          {
            id: 'old',
            name: 'Foundations',
            status: 'active',
            ordinal: 1,
            features: [feature({ id: 'a', title: 'Native feature' })],
          },
        ])}
      />
    );
    expect(screen.getByText('Borrowed into this phase')).toBeInTheDocument();
    // "0 features" alone would read as "nothing here" — and if such a band were
    // `complete`/`parked` it would also be collapsed, leaving the borrowed work both
    // unlabelled and hidden. The count stays feature-only (a borrow isn't
    // membership); the borrowed total rides alongside it.
    const header = screen.getByRole('button', { name: /Project flow/ });
    expect(header).toHaveTextContent('0 features');
    expect(header).toHaveTextContent('1 borrowed');
  });

  it('shows no borrowed hint on a band with none', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'now',
            name: 'Project flow',
            status: 'active',
            ordinal: 0,
            features: [feature({ id: 'a', title: 'Native feature' })],
          },
        ])}
      />
    );
    expect(screen.getByRole('button', { name: /Project flow/ })).not.toHaveTextContent('borrowed');
  });

  /**
   * The DTO is hand-mirrored and arrives through an unchecked `parseApiResponse`
   * cast, so `rows` being required by the type proves nothing at runtime. Mid-deploy
   * a response from the older server carries `features` and no `rows` — that must
   * degrade to the pre-t-95 rendering, not white-screen the Plan over a
   * presentational addition.
   */
  it('falls back to rendering features when a payload predates `rows`', () => {
    const a = feature({ id: 'a', title: 'Native feature' });
    const legacyBand = {
      id: 'now',
      name: 'Project flow',
      status: 'active',
      ordinal: 0,
      features: [a],
      // rows: absent, exactly as an older server would send it
    } as unknown as PlanPhaseBand;

    render(<PlanView plan={{ projectId: 'p1', projectSlug: null, phases: [legacyBand] }} />);
    expect(screen.getByText('Native feature')).toBeInTheDocument();
  });

  it('hides a borrowed row with its band when that band is collapsed', () => {
    render(
      <PlanView
        plan={banded([
          {
            id: 'done',
            name: 'Foundations',
            status: 'complete', // collapses by default
            ordinal: 0,
            features: [],
            rows: [borrowed],
          },
          {
            id: 'now',
            name: 'Project flow',
            status: 'active',
            ordinal: 1,
            features: [feature({ id: 'a', title: 'Native feature' })],
          },
        ])}
      />
    );
    expect(screen.queryByText('Borrowed into this phase')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Foundations/ }));
    expect(screen.getByText('Borrowed into this phase')).toBeInTheDocument();
  });
});
