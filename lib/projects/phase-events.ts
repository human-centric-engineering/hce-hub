/**
 * Phase journalling (f-phase-history §33 t-98).
 *
 * f-phases §22 shipped its write surface ahead of its read surface: phase edits
 * and phase assignments were audit-logged (`logAdminAction`) but never appended
 * to the `ProjectEvent` stream. So moving a feature between phases genuinely
 * **overwrote** history — `Feature.phaseId` is mutable with no record of its
 * previous value — and a phase's own evolution (renamed, re-scoped, parked) went
 * unrecorded entirely. These emitters make every such change **append**.
 *
 * **Why this module exists.** The journalled phase-write paths do not share a
 * home. There are eight phase writes in all and seven are journalled: four live
 * in `phases-service.ts` (`createPhase`, `updatePhase`, `assignFeatureToPhase`
 * and the deliberately-unjournalled `reorderPhases`), while `create_feature`,
 * `create_task`, `update_feature` and `update_task` each set `data.phase` inline
 * in their own transaction and never touch the service. Hand-copying the scope
 * rule and the metadata shape across five files is exactly how the two drift;
 * the §32 t-80 note on `findProjectPhase` records the same lesson from the same
 * surface.
 *
 * **Three kinds, not five.** `phase_updated` names the changed fields in
 * `metadata.fields`, and ONE membership kind covers feature-moves and task-moves
 * via `metadata.subject` — the `task_assigned` precedent (one kind, two moves,
 * read the metadata) rather than an enum value per variant.
 *
 * **`reorderPhases` emits nothing.** Ordering is presentation, not history, and
 * one drag would emit an event per phase and bury the real changes underneath.
 *
 * **Phase names are denormalised into `metadata`, deliberately.** The Log needs
 * to say *"moved f-phases to Sunrise Management"*, not *"to another phase"* —
 * and reading the name back at render time would show today's name on a
 * historic entry, re-introducing at the read layer the very overwrite this
 * feature removes at the write layer. Snapshotting the name at write time is
 * both cheaper (no batched phase lookup in `getProjectEvents`) and more
 * truthful: a later rename leaves past entries saying what was true then.
 */
import { recordProjectEvent, type ProjectEventClient } from '@/lib/projects/project-event';

/** What moved between phases: a feature, or a single task committed on its own. */
export type PhaseSubject = 'feature' | 'task';

/** A phase identified for the journal — its id, plus its name as it was then. */
export interface PhaseSnapshot {
  id: string;
  name: string;
}

export interface PhaseMembershipChangeInput {
  projectId: string;
  actorUserId: string;
  subject: PhaseSubject;
  /** Set when `subject` is `feature`; also set for a task so the Log can chip it. */
  featureId?: string | null;
  /** Set when `subject` is `task`. */
  taskId?: string | null;
  /** Where it came from — `null` when it was unfiled (or being born). */
  from: PhaseSnapshot | null;
  /** Where it went — `null` when it is being unfiled. */
  to: PhaseSnapshot | null;
}

/**
 * Append a `phase_membership_changed` event for a feature or task moving into,
 * out of, or between phases.
 *
 * **A no-op write records nothing.** When `from` and `to` are the same phase (a
 * `update_feature{phaseId: X}` on a feature already in X) — or both are null —
 * there is no move, and fabricating one would put a change in the history that
 * never happened. The guard lives here rather than in each caller so it cannot
 * be forgotten by the fourth one. Returns `null` in that case, so a caller can
 * tell "recorded nothing" from "recorded".
 *
 * **Scope pointer:** the destination phase on a move or a file, the origin on an
 * unfile — *the phase whose membership changed in the way worth recording*.
 * Known limit, accepted at plan time: on an A→B move a phase-scoped read of A
 * does not show the departure. It remains visible in B's event metadata, on the
 * subject's own timeline, and in the project Log. Emitting a second event so
 * both phases read complete would double every move in the Log; widening this
 * belongs to a real phase page (idea #9), not here.
 *
 * Takes the active transaction client so the event commits iff the move did.
 */
export async function recordPhaseMembershipChange(
  client: ProjectEventClient,
  input: PhaseMembershipChangeInput
): Promise<{ id: string } | null> {
  const fromId = input.from?.id ?? null;
  const toId = input.to?.id ?? null;
  if (fromId === toId) return null; // not a move — nothing happened

  // Non-null by construction: the ids differ, so at least one end is a real phase.
  const scope = input.to ?? input.from;
  if (!scope) return null;

  return recordProjectEvent(client, {
    projectId: input.projectId,
    kind: 'phase_membership_changed',
    featureId: input.featureId ?? null,
    taskId: input.taskId ?? null,
    phaseId: scope.id,
    actorUserId: input.actorUserId,
    metadata: {
      subject: input.subject,
      fromPhaseId: fromId,
      toPhaseId: toId,
      fromPhaseName: input.from?.name ?? null,
      toPhaseName: input.to?.name ?? null,
    },
  });
}

export interface PhaseCreatedInput {
  projectId: string;
  actorUserId: string;
  phaseId: string;
  name: string;
  status: string;
}

/** Append a `phase_created` event. The phase's birth, with the name it was given. */
export async function recordPhaseCreated(
  client: ProjectEventClient,
  input: PhaseCreatedInput
): Promise<{ id: string }> {
  return recordProjectEvent(client, {
    projectId: input.projectId,
    kind: 'phase_created',
    phaseId: input.phaseId,
    actorUserId: input.actorUserId,
    metadata: { name: input.name, status: input.status },
  });
}

export interface PhaseUpdatedInput {
  projectId: string;
  actorUserId: string;
  phaseId: string;
  /** Which of name / description / status actually CHANGED — not merely supplied. */
  fields: string[];
  /**
   * The phase's name **after** the edit — always passed, not only on a rename.
   * A `phase_updated` event carries no feature or task ref for the Log to chip,
   * so without it a status- or intent-only edit renders as "set the phase to
   * complete" with nothing to say *which* phase.
   */
  name?: string;
  /**
   * The resulting status — passed only when the status actually CHANGED, never
   * merely because it was supplied. Metadata asserting a status an edit did not
   * touch is the same lie `fields` exists to prevent.
   */
  status?: string;
}

/**
 * Append a `phase_updated` event naming the fields that changed.
 *
 * The authored **description is deliberately not** carried into `metadata`: it is
 * long-form prose and the journal would become a second, diverging copy of it.
 * `fields` records *that* the intent was edited; the phase holds what it now says.
 */
export async function recordPhaseUpdated(
  client: ProjectEventClient,
  input: PhaseUpdatedInput
): Promise<{ id: string } | null> {
  if (input.fields.length === 0) return null;
  return recordProjectEvent(client, {
    projectId: input.projectId,
    kind: 'phase_updated',
    phaseId: input.phaseId,
    actorUserId: input.actorUserId,
    metadata: {
      fields: input.fields,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}
