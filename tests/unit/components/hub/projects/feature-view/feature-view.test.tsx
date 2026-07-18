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
  projectName: 'HCE Hub',
  slug: 'f-mcp',
  title: 'MCP server',
  description: 'Expose the tools.',
  doneWhen: 'tools/list works',
  references: [{ label: 'spec', target: 'https://example.com/spec' }],
  status: 'in_flight',
  planningStage: 'planned',
  helpWanted: false,
  owner: { id: 'u1', name: 'Ada Lovelace', email: 'a@x', image: null },
  dependsOn: [{ id: 'd1', slug: 'f-access', title: 'Membership funnel' }],
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

describe('FeatureView', () => {
  it('renders the header, description, done-when, and the owner name', () => {
    render(<FeatureView feature={detail()} />);
    expect(screen.getByRole('heading', { name: 'MCP server' })).toBeInTheDocument();
    expect(screen.getByText('f-mcp')).toBeInTheDocument();
    expect(screen.getByText('Expose the tools.')).toBeInTheDocument();
    expect(screen.getByText('tools/list works')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('links a valid reference target and the project back-link', () => {
    render(<FeatureView feature={detail()} />);
    expect(screen.getByRole('link', { name: 'spec' })).toHaveAttribute(
      'href',
      'https://example.com/spec'
    );
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

  it('links each dependency to its feature page', () => {
    render(<FeatureView feature={detail()} />);
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
