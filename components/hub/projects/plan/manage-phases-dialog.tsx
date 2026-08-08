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
import { useEffect, useState, useTransition } from 'react';
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GripVertical className="mr-1.5 h-4 w-4" /> Manage phases
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage phases</DialogTitle>
          <DialogDescription>
            Create, rename, drag to reorder, or park this project&rsquo;s phases.
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

function PhaseRow({
  phase,
  disabled,
  onRename,
  onStatus,
}: {
  phase: ManagedPhase;
  disabled: boolean;
  onRename: (id: string, name: string) => void;
  onStatus: (id: string, status: PhaseStatus) => void;
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

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
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
  );
}
