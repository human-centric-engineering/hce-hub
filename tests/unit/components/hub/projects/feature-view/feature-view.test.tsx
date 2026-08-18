/**
 * Unit: FeatureView (f-feature-planning §18 t-3) — the feature page body. Renders
 * the header (slug/title/status/stage/help-wanted/owner), the narrative sections
 * (description, done-when, safe reference chips, dependency links), and the task
 * section label (Tasks vs Sketch). The activity journal is fetch-mocked to empty.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureView } from '@/components/hub/projects/feature-view/feature-view';
import type { FeatureDetailDTO } from '@/components/hub/projects/feature-view/types';

const detail = (over: Partial<FeatureDetailDTO> = {}): FeatureDetailDTO => ({
  id: 'f1',
  projectId: 'p1',
  projectSlug: 'hce-hub',
  projectName: 'HCE Hub',
  phase: null,
  number: 3,
  slug: 'f-mcp',
  title: 'MCP server',
  description: 'Expose the tools.',
  doneWhen: 'tools/list works',
  references: [{ label: 'spec', target: 'https://example.com/spec' }],
  status: 'in_flight',
  waitingOn: [],
  planningStage: 'planned',
  helpWanted: false,
  owner: { id: 'u1', name: 'Ada Lovelace', email: 'a@x', image: null },
  members: [],
  dependsOn: [{ id: 'd1', slug: 'f-access', title: 'Membership funnel' }],
  taskPhaseBoundaries: [],
  tasks: [],
  indicativeTasks: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // FeatureActivity fetches on mount — keep it quiet (empty timeline).
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('FeatureView — phase chip (§33 t-99)', () => {
  it('links the phase back to the Plan with that band deep-linked', () => {
    render(<FeatureView feature={detail({ phase: { id: 'ph1', name: 'Project flow' } })} />);
    const chip = screen.getByRole('link', { name: 'Project flow' });
    expect(chip).toHaveAttribute('href', '/projects/hce-hub?phase=ph1');
  });

  it('renders no chip for an unfiled feature, rather than an empty one', () => {
    render(<FeatureView feature={detail({ phase: null })} />);
    expect(screen.queryByRole('link', { name: /Project flow/ })).not.toBeInTheDocument();
  });

  it('falls back to the project id when the slug is absent', () => {
    render(
      <FeatureView
        feature={detail({ projectSlug: null, phase: { id: 'ph1', name: 'Project flow' } })}
      />
    );
    expect(screen.getByRole('link', { name: 'Project flow' })).toHaveAttribute(
      'href',
      '/projects/p1?phase=ph1'
    );
  });
});

describe('FeatureView', () => {
  it('renders the header, description, done-when, and the owner name', () => {
    render(<FeatureView feature={detail()} />);
    expect(screen.getByRole('heading', { name: 'MCP server' })).toBeInTheDocument();
    expect(screen.getByText('f-mcp')).toBeInTheDocument();
    expect(screen.getByText('Expose the tools.')).toBeInTheDocument();
    expect(screen.getByText('tools/list works')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders the description as markdown, not literal syntax (§21 t-d)', () => {
    render(<FeatureView feature={detail({ description: 'Expose the **tools** now' })} />);
    // Bold becomes <strong>; no literal ** leaks into the page.
    expect(screen.getByText('tools').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*tools\*\*/)).toBeNull();
  });

  it('links a valid reference target and the project back-link (by slug, §19)', () => {
    render(<FeatureView feature={detail()} />);
    expect(screen.getByRole('link', { name: 'spec' })).toHaveAttribute(
      'href',
      'https://example.com/spec'
    );
    // The project back-link prefers the shareable slug over the cuid.
    expect(screen.getByRole('link', { name: /HCE Hub/ })).toHaveAttribute(
      'href',
      '/projects/hce-hub'
    );
  });

  it('falls back to the cuid projectId for the back-link when there is no project slug', () => {
    render(<FeatureView feature={detail({ projectSlug: null })} />);
    expect(screen.getByRole('link', { name: /HCE Hub/ })).toHaveAttribute('href', '/projects/p1');
  });

  it('does not link an unsafe reference target (renders as text)', () => {
    render(
      <FeatureView
        feature={detail({ references: [{ label: 'sneaky', target: 'javascript:alert(1)' }] })}
      />
    );
    expect(screen.getByText('sneaky')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'sneaky' })).not.toBeInTheDocument();
  });

  it('links each dependency to its feature page using the project slug (§19)', () => {
    render(<FeatureView feature={detail()} />);
    expect(screen.getByRole('link', { name: 'f-access' })).toHaveAttribute(
      'href',
      '/projects/hce-hub/features/f-access'
    );
  });

  it('falls back to the cuid projectId in dependency links when there is no project slug', () => {
    render(<FeatureView feature={detail({ projectSlug: null })} />);
    expect(screen.getByRole('link', { name: 'f-access' })).toHaveAttribute(
      'href',
      '/projects/p1/features/f-access'
    );
  });

  it('labels the task section "Tasks" when planned and shows the stage chip', () => {
    render(<FeatureView feature={detail({ planningStage: 'planned' })} />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('planned')).toBeInTheDocument();
  });

  it('shows a Claim button on an unowned, unshipped feature (§18 t-4)', () => {
    render(<FeatureView feature={detail({ owner: null, status: 'available' })} />);
    expect(screen.getByRole('button', { name: /Claim feature/ })).toBeInTheDocument();
  });

  it('shows a "waiting on" line naming the unshipped dependency for a blocked feature', () => {
    render(
      <FeatureView
        feature={detail({
          status: 'blocked',
          waitingOn: [{ slug: 'f-other', title: 'Other feature' }],
        })}
      />
    );
    expect(screen.getByText('waiting on')).toBeInTheDocument();
    expect(screen.getByText('f-other')).toBeInTheDocument();
  });

  it('shows no Claim button when the feature is owned or shipped', () => {
    const { rerender } = render(
      <FeatureView feature={detail({ owner: null, status: 'shipped' })} />
    );
    expect(screen.queryByRole('button', { name: /Claim feature/ })).not.toBeInTheDocument();
    rerender(<FeatureView feature={detail()} />); // owned
    expect(screen.queryByRole('button', { name: /Claim feature/ })).not.toBeInTheDocument();
  });

  it('labels the section "Sketch" for an indicative feature and renders its bullets', () => {
    render(
      <FeatureView
        feature={detail({
          planningStage: 'indicative',
          tasks: [],
          indicativeTasks: [{ id: 'i1', order: 0, text: 'draft the schema' }],
        })}
      />
    );
    expect(screen.getByText('Sketch')).toBeInTheDocument();
    expect(screen.getByText('indicative')).toBeInTheDocument();
    expect(screen.getByText('draft the schema')).toBeInTheDocument();
  });
});
