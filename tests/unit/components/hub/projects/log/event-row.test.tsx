/**
 * Unit: EventRow (f-journal §17 t-3) — the shared journal-event row used by the
 * Log tab and the task timeline. Covers actor-name fallbacks, the authored
 * title/body, and the ref chips gated by `showRefs`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventRow } from '@/components/hub/projects/log/event-row';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const ev = (over: Partial<ProjectEventDTO>): ProjectEventDTO => ({
  id: 'e',
  kind: 'task_created',
  actor: { id: 'u1', name: 'Simon Holmes', email: 's@x', image: null },
  actorAgentId: null,
  feature: null,
  task: null,
  title: null,
  body: null,
  metadata: null,
  createdAt: '2026-07-17T10:00:00.000Z',
  ...over,
});

const rowOf = (ui: React.ReactElement) => render(<ul>{ui}</ul>);

describe('EventRow', () => {
  it("renders the actor's first name + the verb", () => {
    rowOf(<EventRow event={ev({})} />);
    expect(screen.getByText('Simon')).toBeInTheDocument();
    expect(screen.getByText(/created the task/)).toBeInTheDocument();
  });

  it('falls back to "An agent" / "Someone" when there is no human actor', () => {
    rowOf(<EventRow event={ev({ actor: null, actorAgentId: 'agent-1' })} />);
    expect(screen.getByText('An agent')).toBeInTheDocument();

    rowOf(<EventRow event={ev({ actor: null, actorAgentId: null })} />);
    expect(screen.getByText('Someone')).toBeInTheDocument();
  });

  it('shows the authored title + body for a decision', () => {
    rowOf(<EventRow event={ev({ kind: 'decision', title: 'One journal', body: 'One stream.' })} />);
    expect(screen.getByText('One journal')).toBeInTheDocument();
    expect(screen.getByText('One stream.')).toBeInTheDocument();
  });

  it('shows feature/task ref chips only when showRefs is set', () => {
    const event = ev({
      feature: { id: 'f1', slug: 'f-journal', title: 'Journal' },
      task: { id: 't1', number: 5 },
    });
    const { unmount } = rowOf(<EventRow event={event} showRefs />);
    expect(screen.getByText('f-journal · t-5')).toBeInTheDocument();
    unmount();

    rowOf(<EventRow event={event} />);
    expect(screen.queryByText('f-journal · t-5')).not.toBeInTheDocument();
  });
});
