/**
 * Client-facing DTOs for the project journal / Log surfaces (f-journal §17 t-3).
 * Mirror `lib/projects/journal.ts` (`ProjectEventView`) with dates as ISO
 * strings so client components don't import the server module.
 */

import type { UserRef } from '@/components/hub/projects/types';

/** The journal event kinds (mirrors the Prisma `ProjectEventKind` enum). */
export type ProjectEventKindDTO =
  | 'feature_created'
  | 'feature_claimed'
  | 'feature_planned'
  | 'feature_shipped'
  | 'feature_blocked'
  | 'feature_unblocked'
  | 'task_created'
  | 'task_claimed'
  | 'task_pr_linked'
  | 'task_merged'
  | 'help_wanted'
  | 'member_added'
  | 'decision'
  | 'note';

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
