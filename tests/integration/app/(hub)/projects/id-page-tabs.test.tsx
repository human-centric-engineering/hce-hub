/**
 * Integration: the project-view tab registry cannot drift (§33-sweep t-111).
 * @see components/hub/projects/tabs.ts
 *
 * t-111's whole point is that the tab set used to be derived independently in
 * several places, so two of them could disagree with **nothing failing** — the
 * page could title itself "Board" over a rendered Plan, and a tab nobody had
 * added a body for would silently render the Log.
 *
 * So this walks **every row of `PROJECT_TABS`** and checks that all four derived
 * surfaces agree about it:
 *
 *   1. the page `<title>` (from `generateMetadata`)
 *   2. which tab the control marks selected
 *   3. which body renders
 *   4. whether the active-bugs strip appears
 *
 * Iterating the registry rather than listing tabs by hand is what makes this a
 * drift guard instead of five more hand-written cases: **add a tab and it is
 * automatically covered** — and it fails until the body switch and this file's
 * stubs handle it, which is precisely the moment the old code went quiet.
 *
 * Bodies are stubbed to a marker here, unlike `id-page.test.tsx` next door, which
 * renders them for real. That is deliberate: this file asserts *which* body was
 * chosen, not what any body contains, and the Log/Connect tabs fetch on mount —
 * rendering them unstubbed would put unhandled network calls in the run for no
 * assertion's benefit.
 *
 * **If you mutation-test this file, mutate the IMPLEMENTATION, not the registry.**
 * Every expectation below reads `PROJECT_TABS`, so editing a row moves the
 * expectation with it and everything still passes — which looks like a hole and
 * is not one. The registry is the specification; changing it changes what correct
 * means. What these assertions pin is that the four consumers still *derive* from
 * it: reintroduce an independent label in `generateMetadata`, hardcode the strip
 * guard back to a negative list, drop a `case` from the body switch, or fetch a
 * payload the tab did not declare, and this file fails.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({ serverFetch: vi.fn(), parseApiResponse: vi.fn() }));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
}));

// One marker per body, keyed by the tab that should mount it. `body-<key>` is
// derived from the registry key on the assertion side too, so a renamed key
// cannot leave a stale expectation passing.
vi.mock('@/components/hub/projects/plan/plan-view', () => ({
  PlanView: () => <div data-testid="body-plan" />,
}));
vi.mock('@/components/hub/projects/board/board-view', () => ({
  BoardView: () => <div data-testid="body-board" />,
}));
vi.mock('@/components/hub/projects/ideas/ideas-view', () => ({
  IdeasView: () => <div data-testid="body-ideas" />,
}));
vi.mock('@/components/hub/projects/log/log-view', () => ({
  LogView: () => <div data-testid="body-log" />,
}));
vi.mock('@/components/hub/projects/connect/connect-panel', () => ({
  ConnectPanel: () => <div data-testid="body-connect" />,
}));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { PROJECT_TABS } from '@/components/hub/projects/tabs';
import ProjectViewPage, { generateMetadata } from '@/app/(hub)/projects/[id]/page';

const fetchMock = serverFetch as unknown as Mock<(url: string) => Promise<unknown>>;
const parseMock = parseApiResponse as unknown as Mock<(res: { url: string }) => Promise<unknown>>;

/** One open bug, so `showsBugStrip: true` has something to render (it self-hides when empty). */
const view = {
  id: 'p1',
  name: 'HCE Hub',
  hostPlatform: 'sunrise',
  status: 'active',
  repoUrls: [],
  leadUserId: 'u1',
  createdAt: '',
  lead: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null },
  members: [
    { userId: 'u1', role: 'lead', user: { id: 'u1', name: 'Ada', email: 'a@x.io', image: null } },
  ],
  memberCount: 1,
  featureCount: 1,
  taskCount: 1,
  activeBugs: [
    {
      taskId: 't1',
      taskNumber: 9,
      title: 'A defect',
      feature: { id: 'f1', slug: 'f-thing', title: 'Thing' },
      phaseName: null,
    },
  ],
};

/** Every sub-payload resolves; each tab still only fetches what it declares. */
function wireOk() {
  fetchMock.mockImplementation((url: string) => Promise.resolve({ ok: true, url }));
  parseMock.mockImplementation((res: { url: string }) =>
    Promise.resolve({
      success: true,
      data: res.url === '/api/v1/projects/p1' ? view : {},
    })
  );
}

beforeEach(() => vi.clearAllMocks());

describe('project tab registry — every derived surface agrees', () => {
  it.each(PROJECT_TABS.map((tab) => [tab.key, tab] as const))(
    '?view=%s titles, selects, renders and strips consistently',
    async (key, tab) => {
      wireOk();

      const metadata = await generateMetadata({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: key }),
      });

      render(
        await ProjectViewPage({
          params: Promise.resolve({ id: 'p1' }),
          searchParams: Promise.resolve({ view: key }),
        })
      );

      // 1 + 2. The title and the selected tab both read the registry's label.
      expect(metadata.title).toBe(`HCE Hub · ${tab.label}`);
      expect(screen.getByRole('tab', { name: tab.label })).toHaveAttribute('aria-selected', 'true');

      // 3. Exactly this tab's body mounted — and no other. The second half is
      //    what would have caught the old ternary's silent fall-through to the Log.
      expect(screen.getByTestId(`body-${key}`)).toBeInTheDocument();
      for (const other of PROJECT_TABS) {
        if (other.key === key) continue;
        expect(screen.queryByTestId(`body-${other.key}`)).not.toBeInTheDocument();
      }

      // 4. The bugs strip appears iff the registry says it should.
      const strip = screen.queryByRole('region', { name: 'Active bugs' });
      if (tab.showsBugStrip) expect(strip).toBeInTheDocument();
      else expect(strip).not.toBeInTheDocument();

      // The declared payload is the one fetched — and a `payload: null` tab makes
      // no sub-fetch at all beyond the project header.
      const urls = fetchMock.mock.calls.map((call) => call[0]);
      for (const kind of ['plan', 'board', 'ideas'] as const) {
        const expected = tab.payload === kind;
        expect(urls.includes(`/api/v1/projects/p1/${kind}`)).toBe(expected);
      }
    }
  );

  it('falls back to the default tab for an unrecognised ?view=', async () => {
    wireOk();
    // A typo'd, hand-edited or stale link is cosmetic, not a missing page — it
    // lands on Plan rather than 404ing or rendering nothing.
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({ view: 'gantt' }),
    });
    render(
      await ProjectViewPage({
        params: Promise.resolve({ id: 'p1' }),
        searchParams: Promise.resolve({ view: 'gantt' }),
      })
    );

    expect(metadata.title).toBe('HCE Hub · Plan');
    expect(screen.getByTestId('body-plan')).toBeInTheDocument();
  });
});
