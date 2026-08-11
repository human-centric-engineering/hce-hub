/**
 * Unit: IdeaRow (f-idea-capture §22 t-62). Renders an inbox idea, and drives the
 * edit / drop / restore mutations (PATCH …/ideas/:id + refresh); a failed write is
 * surfaced inline, never silent. No Promote control (capability-mediated).
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
