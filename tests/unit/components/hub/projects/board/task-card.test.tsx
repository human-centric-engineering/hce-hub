/**
 * Unit: TaskCard (f-board-view t-2) — title, feature ref, claimer, collision,
 * PR link (sanitized), is-mine.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskCard } from '@/components/hub/projects/board/task-card';
import type { BoardTaskCard } from '@/components/hub/projects/board/types';

const card = (over: Partial<BoardTaskCard> = {}): BoardTaskCard => ({
  id: 't1',
  number: null,
  title: 'Do the thing',
  featureId: 'f1',
  featureSlug: null,
  featureTitle: 'Feature one',
  status: 'available',
  column: 'available',
  prUrl: null,
  claimer: null,
  isMine: false,
  collision: null,
  ...over,
});

describe('TaskCard', () => {
  it('renders the task title and the feature-title ref when there is no slug/number', () => {
    render(<TaskCard card={card()} />);
    expect(screen.getByText('Do the thing')).toBeInTheDocument();
    expect(screen.getByText('Feature one')).toBeInTheDocument();
  });

  it('renders the slug · t-number ref when present', () => {
    render(<TaskCard card={card({ featureSlug: 'f-mcp', number: 6 })} />);
    expect(screen.getByText('f-mcp')).toBeInTheDocument();
    expect(screen.getByText(/·\s*t-6/)).toBeInTheDocument();
  });

  it('renders the claimer first name', () => {
    render(
      <TaskCard
        card={card({ claimer: { id: 'u1', name: 'Grace Hopper', email: 'g@x.io', image: null } })}
      />
    );
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('renders the collision marker with its note as a tooltip', () => {
    render(<TaskCard card={card({ collision: { note: 'Overlaps “Other task”' } })} />);
    const mark = screen.getByText('collision');
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute('title', 'Overlaps “Other task”');
  });

  it('renders a PR link with a short #-label', () => {
    render(<TaskCard card={card({ prUrl: 'https://github.com/o/r/pull/48' })} />);
    expect(screen.getByRole('link', { name: '#48' })).toHaveAttribute(
      'href',
      'https://github.com/o/r/pull/48'
    );
  });

  it('renders no link for a javascript: PR url (sanitized)', () => {
    render(<TaskCard card={card({ prUrl: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('applies the is-mine left border', () => {
    const { container } = render(<TaskCard card={card({ isMine: true })} />);
    expect(container.firstElementChild?.className).toContain('border-l-2');
  });
});
