/**
 * App database drift-probe registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `scripts/db/check-drift.ts` (run by `npm run db:drift-check`, in
 * CI, and by `/pre-pr`) calls this once, then probes everything you register
 * here alongside Sunrise's own A-series objects.
 *
 * Register the Prisma-*unmodelled* objects your app adds — most commonly the
 * hand-written FK constraint behind a satellite `User` table (see
 * CUSTOMIZATION.md §5). Prisma can't see those, so without a probe a future
 * `migrate dev` can silently drop one and CI won't notice.
 *
 * Example (the satellite-FK recipe from CUSTOMIZATION.md §5):
 *
 *   import {
 *     registerAppDriftProbe,
 *     constraintExists,
 *   } from '@/lib/db/drift-probes';
 *
 *   export function registerAppDriftProbes(): void {
 *     registerAppDriftProbe({
 *       name: 'AppUserProfile_userId_fkey (hand-written FK → User)',
 *       kind: 'FK constraint',
 *       table: 'AppUserProfile',
 *       // 2nd arg asserts the constraint definition text — pin the ON DELETE
 *       // action so a fork can't quietly drop the GDPR cascade.
 *       probe: constraintExists('AppUserProfile_userId_fkey', 'ON DELETE CASCADE'),
 *     });
 *   }
 *
 * Available probe factories from `@/lib/db/drift-probes`: `indexExists`,
 * `constraintExists` (optional definition-substring assertion), `columnExists`.
 *
 * Full guide: CUSTOMIZATION.md §5 · .context/database/prisma-unmodelled-objects.md
 */
import { registerAppDriftProbe, constraintExists } from '@/lib/db/drift-probes';

export function registerAppDriftProbes(): void {
  // Hand-written satellite FKs → core "user" (f-data-model). Prisma can't see
  // them (no `@relation` on User), so a future `migrate dev` could silently drop
  // one — and each FK's `ON DELETE` action IS the GDPR erasure mechanism (fired
  // by eraseUser()'s tx.user.delete()). Pin the constraint AND its action.
  registerAppDriftProbe({
    name: 'app_project_leadUserId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_project',
    probe: constraintExists('app_project_leadUserId_fkey', 'ON DELETE SET NULL'),
  });
  registerAppDriftProbe({
    name: 'app_project_member_userId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_project_member',
    probe: constraintExists('app_project_member_userId_fkey', 'ON DELETE CASCADE'),
  });
  registerAppDriftProbe({
    name: 'app_feature_ownerUserId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_feature',
    probe: constraintExists('app_feature_ownerUserId_fkey', 'ON DELETE SET NULL'),
  });
  // Task domain (t-2): task.claimedByUserId retains the task; a task_claim IS
  // the user's participation and cascades.
  registerAppDriftProbe({
    name: 'app_task_claimedByUserId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_task',
    probe: constraintExists('app_task_claimedByUserId_fkey', 'ON DELETE SET NULL'),
  });
  // Feature planning (f-feature-planning §18): task.assigneeUserId — "this is
  // yours to do" (defaults to the feature owner at plan time, freely
  // reassignable). Retained work, so the assignee reference nulls on erasure —
  // the same SET NULL policy as claimedByUserId, kept as a distinct column.
  registerAppDriftProbe({
    name: 'app_task_assigneeUserId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_task',
    probe: constraintExists('app_task_assigneeUserId_fkey', 'ON DELETE SET NULL'),
  });
  registerAppDriftProbe({
    name: 'app_task_claim_userId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_task_claim',
    probe: constraintExists('app_task_claim_userId_fkey', 'ON DELETE CASCADE'),
  });
  // Futures scaffolding (t-3): the sole Hub→user edge — a directive is retained
  // shared work, so its declarer reference nulls on erasure. (Sprint is
  // user-agnostic; Phase/Feature.phaseId are intra-Hub.)
  registerAppDriftProbe({
    name: 'app_focus_directive_declaredByUserId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_focus_directive',
    probe: constraintExists('app_focus_directive_declaredByUserId_fkey', 'ON DELETE SET NULL'),
  });
  // Journal (f-journal §17): a ProjectEvent is retained shared history — the
  // actor reference nulls on erasure, the event stays. (featureId/taskId are
  // unconstrained soft scope pointers — no FK, so nothing to probe there.)
  registerAppDriftProbe({
    name: 'app_project_event_actorUserId_fkey (hand-written FK → user)',
    kind: 'FK constraint',
    table: 'app_project_event',
    probe: constraintExists('app_project_event_actorUserId_fkey', 'ON DELETE SET NULL'),
  });
}
