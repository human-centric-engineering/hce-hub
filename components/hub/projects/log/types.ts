/**
 * Client-facing DTOs for the project journal / Log surfaces (f-journal §17 t-3).
 * Mirror `lib/projects/journal.ts` (`ProjectEventView`) with dates as ISO
 * strings so client components don't import the server module.
 */

import type { UserRef } from '@/components/hub/projects/types';

/**
 * The journal event kinds — a **hand-mirror** of the Prisma `ProjectEventKind`
 * enum, kept as a value (not a bare union) so a test can enumerate it.
 *
 * This mirror is load-bearing and silent when wrong: the DTO reaches the client
 * through an unchecked cast and `describeEvent` closes with a `default:`, so a
 * kind added upstream and forgotten here renders as "updated the project" while
 * every test stays green. `log-presentation-parity.test.ts` pins this array
 * against `Object.values(ProjectEventKind)` and pins `describeEvent` against
 * this array, so the drift fails loudly instead. Do not inline this back into a
 * union type — that is what made the gap invisible (f-phase-history §33 t-98).
 */
export const PROJECT_EVENT_KINDS = [
  'feature_created',
  'feature_claimed',
  'feature_planned',
  'feature_shipped',
  'feature_blocked',
  'feature_unblocked',
  'task_created',
  'task_claimed',
  'task_pr_linked',
  'task_merged',
  'bug_reported',
  'task_assigned',
  'help_wanted',
  'member_added',
  'phase_created',
  'phase_updated',
  'phase_membership_changed',
  'decision',
  'note',
] as const;

export type ProjectEventKindDTO = (typeof PROJECT_EVENT_KINDS)[number];

export interface EventFeatureRefDTO {
  id: string;
  slug: string | null;
  title: string;
}

export interface EventTaskRefDTO {
  id: string;
  number: number | null;
}

/** One enriched journal event (`GET /api/v1/projects/:id/events`). */
export interface ProjectEventDTO {
  id: string;
  kind: ProjectEventKindDTO;
  actor: UserRef | null;
  actorAgentId: string | null;
  feature: EventFeatureRefDTO | null;
  task: EventTaskRefDTO | null;
  title: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: string;
}
