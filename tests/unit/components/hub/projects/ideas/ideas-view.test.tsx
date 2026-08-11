/**
 * Unit: IdeasView (f-idea-capture §22 t-62). The inbox with two toggled bands
 * (open "Inbox" / "Dropped" archive) and counts; empty states; no Promote control.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { IdeasView } from '@/components/hub/projects/ideas/ideas-view';
import type { IdeaInboxDTO, IdeaView } from '@/components/hub/projects/ideas/types';

const idea = (over: Partial<IdeaView>): IdeaView => ({
  id: 'i',
  text: 'a jot',
  status: 'open',
  createdBy: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  triagedAt: null,
  ...over,
});

const inbox: IdeaInboxDTO = {
  ideas: [
    idea({ id: 'o1', text: 'open one', status: 'open' }),
    idea({ id: 'o2', text: 'open two', status: 'open' }),
    idea({
      id: 'd1',
      text: 'dropped one',
      status: 'dropped',
      triagedAt: '2026-08-02T00:00:00.000Z',
    }),
  ],
};

describe('IdeasView', () => {
  it('defaults to the Inbox band, showing open ideas with counts', () => {
    render(<IdeasView projectId="p1" inbox={inbox} />);
    expect(screen.getByRole('tab', { name: /Inbox/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Dropped/ })).toHaveTextContent('1');
    expect(screen.getByText('open one')).toBeInTheDocument();
    expect(screen.queryByText('dropped one')).not.toBeInTheDocument();
  });

  it('switches to the Dropped band on click', () => {
    render(<IdeasView projectId="p1" inbox={inbox} />);
    fireEvent.click(screen.getByRole('tab', { name: /Dropped/ }));
    expect(screen.getByText('dropped one')).toBeInTheDocument();
    expect(screen.queryByText('open one')).not.toBeInTheDocument();
  });

  it('shows an empty state for an empty band', () => {
    render(<IdeasView projectId="p1" inbox={{ ideas: [] }} />);
    expect(screen.getByText(/No ideas in the inbox/)).toBeInTheDocument();
  });

  it('never renders a Promote control (promotion is capability-mediated)', () => {
    render(<IdeasView projectId="p1" inbox={inbox} />);
    expect(screen.queryByRole('button', { name: /Promote/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Promote an idea into a feature/)).toBeInTheDocument();
  });
});
