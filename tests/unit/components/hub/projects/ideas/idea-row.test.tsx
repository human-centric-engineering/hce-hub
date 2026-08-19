/**
 * Unit: IdeaRow (f-idea-capture §22 t-62). Renders an inbox idea, and drives the
 * edit / drop / restore mutations (PATCH …/ideas/:id + refresh); a failed write is
 * surfaced inline, never silent. No Promote control (capability-mediated).
 *
 * §33-sweep t-112 adds markdown rendering + the long-jot clamp.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { IdeaRow } from '@/components/hub/projects/ideas/idea-row';
import type { IdeaView } from '@/components/hub/projects/ideas/types';

const openIdea: IdeaView = {
  id: 'i1',
  number: 4,
  text: 'board should remember my last filter',
  status: 'open',
  createdBy: { id: 'u1', name: 'Ada Lovelace', email: 'ada@x.io', image: null },
  createdAt: '2026-08-01T10:00:00.000Z',
  triagedAt: null,
};
const droppedIdea: IdeaView = {
  ...openIdea,
  id: 'i2',
  status: 'dropped',
  triagedAt: '2026-08-03T00:00:00.000Z',
};

const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('IdeaRow', () => {
  it('renders the #N handle, jot, author and date', () => {
    render(<IdeaRow projectId="p1" idea={openIdea} />);
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText('board should remember my last filter')).toBeInTheDocument();
    expect(screen.getByText(/captured by Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/1 Aug 2026/)).toBeInTheDocument();
  });

  it('omits the handle for a pre-t-63 idea with no number', () => {
    render(<IdeaRow projectId="p1" idea={{ ...openIdea, number: null }} />);
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    expect(screen.getByText('board should remember my last filter')).toBeInTheDocument();
  });

  it('renders "former member" when the author was erased', () => {
    render(<IdeaRow projectId="p1" idea={{ ...openIdea, createdBy: null }} />);
    expect(screen.getByText(/captured by former member/)).toBeInTheDocument();
  });

  it('drops an open idea (PATCH status:dropped) and refreshes', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<IdeaRow projectId="p1" idea={openIdea} />);
    fireEvent.click(screen.getByRole('button', { name: /Drop/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/ideas/i1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'dropped' }) })
    );
  });

  it('restores a dropped idea (PATCH status:open)', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<IdeaRow projectId="p1" idea={droppedIdea} />);
    // A dropped idea shows Restore, not Drop.
    expect(screen.queryByRole('button', { name: /Drop/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Restore/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/ideas/i2',
      expect.objectContaining({ body: JSON.stringify({ status: 'open' }) })
    );
  });

  it('edits the text (PATCH text) via the inline editor', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<IdeaRow projectId="p1" idea={openIdea} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText('Edit idea'), { target: { value: 'refined jot' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/ideas/i1',
      expect.objectContaining({ body: JSON.stringify({ text: 'refined jot' }) })
    );
  });

  it('surfaces a failed write inline and does not refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<IdeaRow projectId="p1" idea={openIdea} />);
    fireEvent.click(screen.getByRole('button', { name: /Drop/ }));
    await waitFor(() => expect(screen.getByText('!')).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('IdeaRow — markdown (t-112)', () => {
  /** A jot well past the clamp threshold, so "long" is not a near-miss judgement. */
  const longText = `## Repro\n\n${'x'.repeat(400)}\n\n- one\n- two\n- three\n\nAnd a closing paragraph.`;

  it('renders the jot as formatted markdown rather than source', () => {
    // Ideas now routinely carry a repro, a fix shape and cross-references — #24
    // read as a wall of literal asterisks and backticks.
    const { container } = render(
      <IdeaRow projectId="p1" idea={{ ...openIdea, text: 'the **board** filter is `sticky`' }} />
    );
    expect(container.querySelector('strong')?.textContent).toBe('board');
    expect(container.querySelector('code')?.textContent).toBe('sticky');
    expect(screen.queryByText(/\*\*board\*\*/)).not.toBeInTheDocument();
  });

  it('escapes raw HTML in a jot rather than mounting it', () => {
    // `capture_idea` is an MCP write, so the text is authored input reaching a
    // shared renderer — the safe-renderer guarantee is what is under test.
    const { container } = render(
      <IdeaRow projectId="p1" idea={{ ...openIdea, text: '<img src=x onerror="alert(1)">' }} />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('leaves a short jot unclamped, with no Show more', () => {
    render(<IdeaRow projectId="p1" idea={openIdea} />);
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
  });

  it('clamps a long jot and expands it in place', () => {
    const { container } = render(<IdeaRow projectId="p1" idea={{ ...openIdea, text: longText }} />);
    // The clamp is asserted through the clipping class, not a measured height:
    // jsdom has no layout, so `scrollHeight` is 0 and would pass either way. The
    // visual result is browser-checked; this pins that the state actually flips.
    const clipped = () => container.querySelector('.overflow-hidden');
    expect(clipped()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
    expect(clipped()).toBeNull(); // expanded → nothing hidden

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
    expect(clipped()).not.toBeNull();
  });

  it('does NOT treat SOFT line breaks as height — markdown collapses them', () => {
    // This is the case an earlier version of the heuristic got backwards. Counting
    // raw `\n` called this seven lines; markdown renders it as ONE paragraph on one
    // line (no `<br>`), so collapsing it hid text that was already fully visible.
    render(<IdeaRow projectId="p1" idea={{ ...openIdea, text: 'a\nb\nc\nd\ne\nf\ng' }} />);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('DOES count the breaks that start a real block', () => {
    // Blank-line-separated paragraphs and list items each render on their own
    // line, so these are height in a way soft breaks are not.
    const listy = '- one\n- two\n- three\n- four\n- five\n- six\n- seven';
    render(<IdeaRow projectId="p1" idea={{ ...openIdea, text: listy }} />);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('never clips without also offering the way back', () => {
    // The invariant that makes an imprecise height estimate safe: the clipping box
    // and the toggle come from ONE flag, so there is no state where content is cut
    // off and nothing says so. Checked on a short jot and a long one.
    const short = render(<IdeaRow projectId="p1" idea={openIdea} />);
    expect(short.container.querySelector('.overflow-hidden')).toBeNull();
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
    short.unmount();

    const { container } = render(<IdeaRow projectId="p1" idea={{ ...openIdea, text: longText }} />);
    expect(container.querySelector('.overflow-hidden')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('reports its expanded state to assistive tech', () => {
    render(<IdeaRow projectId="p1" idea={{ ...openIdea, text: longText }} />);
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'idea-body-i1');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('edits the raw source, not the rendering', () => {
    // You refine the jot you wrote; a markdown editor is a different feature.
    render(<IdeaRow projectId="p1" idea={{ ...openIdea, text: 'the **board** filter' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(screen.getByLabelText('Edit idea')).toHaveValue('the **board** filter');
  });

  it('renders a dropped idea as markdown too — both lists, one row', () => {
    const { container } = render(
      <IdeaRow projectId="p1" idea={{ ...droppedIdea, text: '**dropped** but readable' }} />
    );
    expect(container.querySelector('strong')?.textContent).toBe('dropped');
    expect(screen.getByRole('button', { name: /Restore/ })).toBeInTheDocument();
  });
});
