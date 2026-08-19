/**
 * Unit: EventRow (f-journal §17 t-3) — the shared journal-event row used by the
 * Log tab, the feature timeline and the task timeline. Covers actor-name
 * fallbacks, the authored title/body, and the ref chips gated by `showRefs`.
 *
 * Extended by the §33 sweep: bodies render **markdown** (t-85) and the ref chips
 * **navigate** (t-105). Both are behaviours of this one component precisely
 * because all three surfaces render through it — a fix here is a fix everywhere,
 * which is why the two tasks were bundled rather than split.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventRow } from '@/components/hub/projects/log/event-row';
import { TaskSheetControlsProvider } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

const ev = (over: Partial<ProjectEventDTO>): ProjectEventDTO => ({
  id: 'e',
  kind: 'task_created',
  actor: { id: 'u1', name: 'Simon Holmes', email: 's@x', image: null },
  actorAgentId: null,
  feature: null,
  task: null,
  phaseId: null,
  title: null,
  body: null,
  metadata: null,
  createdAt: '2026-07-17T10:00:00.000Z',
  ...over,
});

const rowOf = (ui: React.ReactElement) => render(<ul>{ui}</ul>);

/** A row inside a live sheet provider, so the `t-N` chip has something to open. */
const rowWithSheet = (ui: React.ReactElement, open: () => void) =>
  render(
    <TaskSheetControlsProvider value={{ open, close: vi.fn() }}>
      <ul>{ui}</ul>
    </TaskSheetControlsProvider>
  );

describe('EventRow', () => {
  it("renders the actor's first name + the verb", () => {
    rowOf(<EventRow event={ev({})} projectRef="hce-hub" />);
    expect(screen.getByText('Simon')).toBeInTheDocument();
    expect(screen.getByText(/created the task/)).toBeInTheDocument();
  });

  it('falls back to "An agent" / "Someone" when there is no human actor', () => {
    rowOf(<EventRow event={ev({ actor: null, actorAgentId: 'agent-1' })} projectRef="hce-hub" />);
    expect(screen.getByText('An agent')).toBeInTheDocument();

    rowOf(<EventRow event={ev({ actor: null, actorAgentId: null })} projectRef="hce-hub" />);
    expect(screen.getByText('Someone')).toBeInTheDocument();
  });

  it('shows the authored title + body for a decision', () => {
    rowOf(
      <EventRow
        event={ev({ kind: 'decision', title: 'One journal', body: 'One stream.' })}
        projectRef="hce-hub"
      />
    );
    expect(screen.getByText('One journal')).toBeInTheDocument();
    expect(screen.getByText('One stream.')).toBeInTheDocument();
  });
});

describe('EventRow — markdown bodies (t-85)', () => {
  it('renders an authored body as formatted markdown, not as source', () => {
    // The bug: `record_decision` documents its body as markdown and build-time
    // decisions lean on it hard, so a reader saw literal `**`, `-` and backticks.
    const { container } = rowOf(
      <EventRow
        event={ev({
          kind: 'decision',
          title: 'Bands, not tags',
          body: 'The **commitment** marker is `Task.phaseId`.\n\n- one\n- two',
        })}
        projectRef="hce-hub"
      />
    );
    expect(container.querySelector('strong')?.textContent).toBe('commitment');
    expect(container.querySelector('code')?.textContent).toBe('Task.phaseId');
    // Asserted by element rather than by count: the row is itself an `<li>`, so
    // a bare `li` count would pass on the wrapper alone and prove nothing.
    expect(screen.getByText('one').tagName).toBe('LI');
    expect(screen.getByText('two').tagName).toBe('LI');
    // The literal source must be gone — the whole point of the fix.
    expect(screen.queryByText(/\*\*commitment\*\*/)).not.toBeInTheDocument();
  });

  it('renders a note body too — both authored kinds, one path', () => {
    const { container } = rowOf(
      <EventRow event={ev({ kind: 'note', body: '**noted**' })} projectRef="hce-hub" />
    );
    expect(container.querySelector('strong')?.textContent).toBe('noted');
  });

  it('escapes raw HTML in an authored body rather than mounting it', () => {
    // Event bodies are user-authored strings reaching a shared renderer, so the
    // safe-renderer guarantee is the thing under test here, not the formatting.
    // `components/hub/markdown.tsx` escapes raw HTML by default and must never
    // gain `rehype-raw` — this pins that for the journal's own content.
    const { container } = rowOf(
      <EventRow
        event={ev({ kind: 'decision', body: '<img src=x onerror="alert(1)"> and <b>bold</b>' })}
        projectRef="hce-hub"
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/<b>bold<\/b>/)).toBeInTheDocument();
  });

  it('leaves a non-authored kind with no body block at all', () => {
    const { container } = rowOf(
      <EventRow event={ev({ kind: 'task_merged', body: '**ignored**' })} projectRef="hce-hub" />
    );
    expect(container.querySelector('strong')).toBeNull();
  });
});

describe('EventRow — navigable refs (t-105)', () => {
  const withRefs = ev({
    feature: { id: 'f1', slug: 'f-journal', title: 'Journal' },
    task: { id: 't1', number: 5 },
  });

  it('links the feature ref to its page and opens the sheet from the task ref', () => {
    const open = vi.fn();
    rowWithSheet(<EventRow event={withRefs} projectRef="hce-hub" showRefs />, open);

    expect(screen.getByRole('link', { name: 'f-journal' })).toHaveAttribute(
      'href',
      '/projects/hce-hub/features/f-journal'
    );

    fireEvent.click(screen.getByRole('button', { name: 't-5' }));
    expect(open).toHaveBeenCalledWith('t1');
  });

  it('falls back to the feature id in the href when the slug is null', () => {
    // The label falls back to the TITLE and the href to the ID — different
    // fallbacks, because one has to be readable and the other has to resolve.
    rowOf(
      <EventRow
        event={ev({ feature: { id: 'f1', slug: null, title: 'Journal' } })}
        projectRef="hce-hub"
        showRefs
      />
    );
    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute(
      'href',
      '/projects/hce-hub/features/f1'
    );
  });

  it('renders no chips at all when showRefs is off (the task timeline)', () => {
    rowOf(<EventRow event={withRefs} projectRef="hce-hub" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 't-5' })).not.toBeInTheDocument();
  });

  it('omits the task chip for a number-less task rather than rendering "t-—"', () => {
    rowOf(
      <EventRow
        event={ev({
          feature: { id: 'f1', slug: 'f-journal', title: 'Journal' },
          task: { id: 't1', number: null },
        })}
        projectRef="hce-hub"
        showRefs
      />
    );
    expect(screen.getByRole('link', { name: 'f-journal' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // …and with no second chip there is no dangling separator either.
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });
});
