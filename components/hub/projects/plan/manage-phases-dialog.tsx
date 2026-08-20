'use client';

/**
 * Manage-phases dialog (f-phases §22 t3) — create, rename, drag-to-reorder, and
 * set the status of (incl. park) a project's phases, without leaving the Plan for
 * MCP.
 *
 * Member-tier (any member may shape the roadmap), so it's shown to every viewer.
 * Each action POSTs/PATCHes the phase REST routes and `router.refresh()`es so the
 * server-rendered Plan re-reads the new state; a failed write is surfaced, never
 * swallowed. **Reorder is batch** — dragging a row (or lifting it with the
 * keyboard: focus the handle, Space, arrows, Space) PUTs the whole new id order to
 * `…/phases/order`, which rewrites ordinals 0..n-1 (collision-free by design).
 */
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldHelp } from '@/components/ui/field-help';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { PhaseStatus } from '@/components/hub/projects/plan/types';

/** A phase as the dialog manages it (derived from the plan payload). */
export interface ManagedPhase {
  id: string;
  name: string;
  /** Short plain-text one-liner — what the Plan band renders (§33-sweep t-104). */
  summary: string | null;
  /** The authored intent — why the phase exists, and what would complete it. */
  description: string | null;
  status: PhaseStatus;
  ordinal: number;
  featureCount: number;
}

const STATUSES: readonly PhaseStatus[] = ['upcoming', 'active', 'complete', 'parked'];

function isPhaseStatus(v: string): v is PhaseStatus {
  return (STATUSES as readonly string[]).includes(v);
}

/**
 * The new id order after dragging `activeId` over `overId` — extracted so the
 * reorder logic is unit-testable without driving dnd-kit's pointer/keyboard
 * sensors (hard in jsdom). Returns the unchanged list for a no-op / unknown id.
 */
export function reorderedIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return ids;
  return arrayMove(ids, from, to);
}

export function ManagePhasesDialog({
  projectId,
  phases,
}: {
  projectId: string;
  phases: ManagedPhase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const working = busy || pending;
  const base = `/api/v1/projects/${encodeURIComponent(projectId)}/phases`;

  // Local render order — the source of truth for the list, so a drag updates the
  // UI immediately (no flip back to the stale server order while the PUT saves).
  // Re-adopt the server order only once writes SETTLE (`working` false → the PUT
  // and its refresh have landed, so the prop already reflects the new order, or a
  // create/other-client change needs adopting) — never mid-write.
  const [order, setOrder] = useState<string[]>(() => phases.map((p) => p.id));
  const serverSig = phases.map((p) => p.id).join('␟');
  useEffect(() => {
    if (!working) setOrder(phases.map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverSig is the stable content key for `phases`
  }, [serverSig, working]);

  const byId = new Map(phases.map((p) => [p.id, p]));
  const orderedPhases = order
    .map((id) => byId.get(id))
    .filter((p): p is ManagedPhase => p !== undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Every caller sends a JSON body (create / rename / status / reorder).
  const call = async (url: string, method: string, body: unknown): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError('Something went wrong — try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await call(base, 'POST', { name })) setNewName('');
  };
  const rename = (id: string, name: string) => void call(`${base}/${id}`, 'PATCH', { name });
  const setStatus = (id: string, status: PhaseStatus) =>
    void call(`${base}/${id}`, 'PATCH', { status });
  // The PATCH route has accepted `description` since f-phases §22 t3 — only the UI
  // was missing, so this is client-only. Empty clears it (the route takes null).
  // Returns `call`'s outcome rather than discarding it: the row needs to know
  // whether the write landed, so a failed save can be retried (§33 t-103 review).
  const setSummary = (id: string, summary: string) =>
    call(`${base}/${id}`, 'PATCH', { summary: summary.trim() || null });
  const setDescription = (id: string, description: string) =>
    call(`${base}/${id}`, 'PATCH', { description: description.trim() || null });

  // dnd-kit drag glue — the reorder computation lives in the unit-tested
  // `reorderedIds`; this handler only fires on a real pointer/keyboard drag, which
  // jsdom can't drive, so it's excluded from coverage.
  /* v8 ignore start */
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = reorderedIds(order, String(active.id), String(over.id));
    setOrder(next); // optimistic — the list follows the drop immediately, no flip
    void call(`${base}/order`, 'PUT', { phaseIds: next });
  };
  /* v8 ignore stop */

  // Pending intent edits, keyed by phase id. A Textarea saves on blur, but closing
  // the dialog — Escape, the X, or a click outside — unmounts the content without
  // delivering one, so a paragraph of typed intent would vanish with no error and
  // no indication. The name Input survives that because Enter also commits it and
  // it is short; a multi-line intent has neither defence. Rows register a flush
  // here and the dialog runs them on close, which covers every dismissal path in
  // one place rather than guessing at each one.
  const pendingEdits = useRef(new Map<string, () => void>());
  const flushPending = () => {
    for (const flush of pendingEdits.current.values()) flush();
    pendingEdits.current.clear();
  };
  /** A row reports its uncommitted edit, or clears it once saved. Stable identity. */
  const registerPending = useCallback((id: string, flush: (() => void) | null) => {
    if (flush) pendingEdits.current.set(id, flush);
    else pendingEdits.current.delete(id);
  }, []);

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) flushPending();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GripVertical className="mr-1.5 h-4 w-4" /> Manage phases
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage phases</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <span>
              Create, rename, describe, drag to reorder, or set the status of this project&rsquo;s
              phases.
            </span>
            <FieldHelp title="Phase intent" ariaLabel="What to write in a phase description">
              <p>
                A phase description says <strong>what the phase is for</strong>, and{' '}
                <strong>what would make it complete</strong>. It shows under the phase in the plan,
                so the grouping explains itself.
              </p>
              <p>
                Deliberately not a checklist: a phase can be an epic, a release band or an idea
                park, and a completion contract is nonsense for a park &mdash; a park never
                completes, it drains.
              </p>
            </FieldHelp>
            <FieldHelp title="Phase status" ariaLabel="What the phase statuses mean">
              <p>
                <strong>upcoming</strong> / <strong>active</strong> — on the live roadmap; shown
                expanded in the plan.
              </p>
              <p>
                <strong>complete</strong> — done work; collapsed by default in the plan.
              </p>
              <p>
                <strong>parked</strong> — set aside (an idea pool); hidden from active views,
                collapsed by default. Setting <em>active</em>/<em>complete</em> also stamps the
                phase&rsquo;s start / finish time.
              </p>
            </FieldHelp>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {phases.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">No phases yet.</p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {orderedPhases.map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  disabled={working}
                  onRename={rename}
                  onStatus={setStatus}
                  onSummarise={setSummary}
                  onDescribe={setDescription}
                  registerPending={registerPending}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
            placeholder="New phase name"
            maxLength={200}
            disabled={working}
            aria-label="New phase name"
          />
          <Button onClick={() => void create()} disabled={working || !newName.trim()}>
            Add
          </Button>
        </div>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One free-text phase field's draft state, shared by the summary and the intent
 * (§33-sweep t-104 extracted it; every rule below predates that and was learned
 * the hard way on the description).
 *
 *  - **Adopt the server value whenever it changes** (own save landed, or another
 *    client edited) so a stale local value cannot clobber it on the next blur.
 *    Keyed on the value itself, so in-progress typing survives a refresh caused by
 *    a *different* row.
 *  - **An empty value is legitimate** — it clears the field — so `dirty` compares
 *    against the stored value rather than requiring content.
 *  - **Trimmed on BOTH sides.** Nothing trims on the write path (the route schema
 *    is `.nullish()`, not `.trim()`), so an MCP-authored value can arrive with a
 *    trailing newline; comparing it against a trimmed local value made merely
 *    tabbing through the field "dirty", and since §33 t-98 journals every phase
 *    change that phantom PATCH wrote a `phase_updated` event nobody made.
 *  - **`lastSent` is state, not a ref**, because `dirty` is derived from it during
 *    render — a ref read there would not re-render when it changed, which is what
 *    the `react-hooks/refs` rule protects against.
 *  - **Optimistic, then reverted if the write failed.** Recording the send up front
 *    stops a blur-then-close sending twice; leaving it recorded after a failure
 *    silently ate the draft (the field went clean, the next blur short-circuited,
 *    and the server value never changed so the adopt effect never undid it). A 409
 *    says "retry", and until §33 t-103 the UI made retrying impossible.
 */
function useFieldDraft({
  serverValue,
  save,
  registerPending,
  pendingKey,
}: {
  serverValue: string | null;
  save: (value: string) => Promise<boolean>;
  registerPending: (key: string, flush: (() => void) | null) => void;
  pendingKey: string;
}) {
  const [value, setValue] = useState(serverValue ?? '');
  const [lastSent, setLastSent] = useState<string | null>(null);
  useEffect(() => {
    setValue(serverValue ?? '');
    setLastSent(null);
  }, [serverValue]);

  const committed = (lastSent ?? serverValue ?? '').trim();
  const dirty = value.trim() !== committed;

  const flush = () => {
    if (!dirty) return;
    setLastSent(value);
    void save(value).then((ok) => {
      if (!ok) setLastSent(null); // dirty again ⇒ blur retries, close still flushes
    });
    // ACCEPTED LIMIT (owner, 2026-08-19): this covers the BLUR path only. Save via
    // the close path and the row unmounts before the response, so the revert above
    // is a no-op and the draft is gone — and the error banner lives inside
    // `DialogContent`, so nothing is shown either; you find out on reopening. Not
    // fixed because closing it means lifting the error state out of `DialogContent`
    // for a save that has to fail in the same instant you dismiss the dialog.
  };

  // Report an uncommitted draft to the dialog so closing it commits rather than
  // discards. Registered as `flush` itself, so the close path runs the same guard
  // as blur and cannot duplicate a write. Challenged by review (§33 t-102) on the
  // grounds that a pointerdown-dismissal fires `flushPending` and `onBlur` from one
  // render's closure; measured, and it does NOT — React flushes each discrete
  // event's updates before the next handler runs, so the second call sees the new
  // closure and short-circuits.
  const pending = dirty ? flush : null;
  useEffect(() => {
    registerPending(pendingKey, pending);
    return () => registerPending(pendingKey, null);
  }, [pendingKey, pending, registerPending]);

  return { value, setValue, flush };
}

function PhaseRow({
  phase,
  disabled,
  onRename,
  onStatus,
  onSummarise,
  onDescribe,
  registerPending,
}: {
  phase: ManagedPhase;
  disabled: boolean;
  onRename: (id: string, name: string) => void;
  onStatus: (id: string, status: PhaseStatus) => void;
  onSummarise: (id: string, summary: string) => Promise<boolean>;
  onDescribe: (id: string, description: string) => Promise<boolean>;
  /** Report an uncommitted intent so the dialog can save it on close. */
  registerPending: (id: string, flush: (() => void) | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: phase.id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    /* v8 ignore next -- isDragging is only true mid-drag, which jsdom can't drive */
    opacity: isDragging ? 0.5 : 1,
  };
  const [name, setName] = useState(phase.name);
  // Adopt the server name whenever it changes (own save landed, or another client
  // renamed) so a stale local value can't clobber it on the next blur (lost update).
  // Only fires when `phase.name` actually changes, so in-progress typing survives a
  // refresh triggered by a *different* row.
  useEffect(() => setName(phase.name), [phase.name]);
  const dirty = name.trim().length > 0 && name.trim() !== phase.name;
  const saveName = () => {
    if (dirty) onRename(phase.id, name.trim());
  };

  // Both free-text fields share one draft discipline — see `useFieldDraft`. The
  // summary is a §33-sweep t-104 addition; giving it its own copy of this logic
  // would have been ~40 lines of subtle, hard-won behaviour duplicated, and two
  // copies drift.
  const summaryDraft = useFieldDraft({
    serverValue: phase.summary,
    save: (v) => onSummarise(phase.id, v),
    registerPending,
    pendingKey: `${phase.id}:summary`,
  });
  const descriptionDraft = useFieldDraft({
    serverValue: phase.description,
    save: (v) => onDescribe(phase.id, v),
    registerPending,
    pendingKey: `${phase.id}:description`,
  });

  return (
    <div ref={setNodeRef} style={style} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder ${phase.name}`}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none disabled:opacity-30"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName();
          }}
          maxLength={200}
          disabled={disabled}
          aria-label={`Phase name: ${phase.name}`}
          className="flex-1"
        />
        <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
          {phase.featureCount} feat
        </span>
        <Select
          value={phase.status}
          onValueChange={(v) => {
            if (isPhaseStatus(v)) onStatus(phase.id, v);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-32 shrink-0" aria-label={`Status: ${phase.status}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/*
        Indented to the name input so the intent reads as belonging to this phase
        rather than as a sibling control. Saves on blur, like the name — there is
        no explicit save in this dialog, and adding one only for this field would
        make the two edits behave differently for no reason.
      */}
      {/*
        The one-liner the Plan band actually renders (§33-sweep t-104). An `Input`
        rather than a `Textarea` because it IS one line — the control's shape is
        the strongest hint that markdown and paragraphs do not belong here.
      */}
      <Input
        value={summaryDraft.value}
        onChange={(e) => summaryDraft.setValue(e.target.value)}
        onBlur={summaryDraft.flush}
        onKeyDown={(e) => {
          if (e.key === 'Enter') summaryDraft.flush();
        }}
        maxLength={300}
        disabled={disabled}
        placeholder="One line: what is this phase for?"
        aria-label={`Phase summary: ${phase.name}`}
        className="ml-6 w-[calc(100%-1.5rem)] text-xs"
      />
      <Textarea
        value={descriptionDraft.value}
        onChange={(e) => descriptionDraft.setValue(e.target.value)}
        onBlur={descriptionDraft.flush}
        rows={2}
        maxLength={2000}
        disabled={disabled}
        placeholder="What is this phase for, and what would make it complete?"
        aria-label={`Phase intent: ${phase.name}`}
        className="ml-6 w-[calc(100%-1.5rem)] resize-y text-xs"
      />
    </div>
  );
}
