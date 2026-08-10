/**
 * App capability (agent tool) registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `registerBuiltInCapabilities()` calls this once before the first
 * agent dispatch (server route-handler runtime). Add
 * `registerAppCapability(new YourTool())` calls (your tools extend
 * `BaseCapability`).
 *
 * Full guide + example: CUSTOMIZATION.md §4 · .context/orchestration/capabilities.md
 */
import { registerAppCapability } from '@/lib/orchestration/capabilities/registry';
import { NextTaskCapability } from '@/lib/projects/capabilities/next-task';
import { ListPhasesCapability } from '@/lib/projects/capabilities/list-phases';
import { CreateTaskCapability } from '@/lib/projects/capabilities/create-task';
import { FlagHelpWantedCapability } from '@/lib/projects/capabilities/flag-help-wanted';
import { RecordDecisionCapability } from '@/lib/projects/capabilities/record-decision';
import { AddNoteCapability } from '@/lib/projects/capabilities/add-note';
import { CreateFeatureCapability } from '@/lib/projects/capabilities/create-feature';
import { CaptureIdeaCapability } from '@/lib/projects/capabilities/capture-idea';
import { ClaimFeatureCapability } from '@/lib/projects/capabilities/claim-feature';
import { PlanFeatureCapability } from '@/lib/projects/capabilities/plan-feature';
import { ShipFeatureCapability } from '@/lib/projects/capabilities/ship-feature';
import { StartTaskCapability } from '@/lib/projects/capabilities/start-task';
import { CompleteTaskCapability } from '@/lib/projects/capabilities/complete-task';
import { AssignTaskCapability } from '@/lib/projects/capabilities/assign-task';
import { ReassignFeatureTasksCapability } from '@/lib/projects/capabilities/reassign-feature-tasks';
import { SetPrCapability } from '@/lib/projects/capabilities/set-pr';
import { UpdateTaskCapability } from '@/lib/projects/capabilities/update-task';
import { UpdateFeatureCapability } from '@/lib/projects/capabilities/update-feature';
import { CreatePhaseCapability } from '@/lib/projects/capabilities/create-phase';
import { UpdatePhaseCapability } from '@/lib/projects/capabilities/update-phase';

export function initAppCapabilities(): void {
  // HCE Hub coordination tools (f-hub-capabilities). Each also needs an active
  // `AiCapability` row (seeded under prisma/seeds/app/) or dispatch dies at
  // `capability_inactive` — registering the class here is necessary, not
  // sufficient. Membership is enforced inside each capability's execute() via
  // the f-access funnel; there is no per-agent binding requirement (default-allow).
  registerAppCapability(new NextTaskCapability()); // read (t-1)
  registerAppCapability(new ListPhasesCapability()); // read: project phases + features (member)
  registerAppCapability(new CreateTaskCapability()); // write (t-2)
  registerAppCapability(new FlagHelpWantedCapability()); // write (t-2)
  // Task lifecycle (f-status-model §20 t-38) — MCP-first: the primary way a repo
  // session says "I'm starting/completing this task". You *claim* features (which
  // cascades ownership to their tasks); these move an individual task through its
  // lifecycle. They wrap the same `startTask`/`completeTask` core the task-sheet
  // button and (later) f-github-sync also drive. `claim_task` + `add_backlog` (the
  // retired per-task pull) are gone; take_over_task (reassign) comes later.
  registerAppCapability(new StartTaskCapability()); // claimed → active (member)
  registerAppCapability(new CompleteTaskCapability()); // → merged (member)
  registerAppCapability(new AssignTaskCapability()); // (re)assign a task (member)
  registerAppCapability(new ReassignFeatureTasksCapability()); // reassign a feature's unmerged tasks (member)
  // Link a task to its PR (f-github-sync §14 t-1) — sets Task.prUrl + journals
  // task_pr_linked, NO status change. The §14 webhook later reconciles a *merge*
  // to `merged` via complete_task's core; this is the human-declared PR link.
  registerAppCapability(new SetPrCapability()); // set Task.prUrl (member)
  // Authoring fidelity (f-authoring-fidelity §21) — correct the record from the
  // Hub, not the DB. update_task edits an existing task's authored fields
  // (title/description/doneWhen/filesScope); owner-tier, no status change.
  registerAppCapability(new UpdateTaskCapability()); // edit task fields (owner)
  registerAppCapability(new UpdateFeatureCapability()); // edit feature fields/deps/owner/phase (owner)
  // Phase lifecycle (f-phases §22 t1) — activate the dormant Phase scaffolding.
  // create_phase / update_phase are project-scoped roadmap bands (member-tier, no
  // per-phase owner); feature→phase filing rides on update_feature's phaseId.
  registerAppCapability(new CreatePhaseCapability()); // add a phase (member)
  registerAppCapability(new UpdatePhaseCapability()); // edit a phase (member)
  // Journal authored verbs (f-journal §17 t-2) — free-text narrative into the
  // ProjectEvent stream; membership-scoped via the resolveEventScope funnel.
  registerAppCapability(new RecordDecisionCapability());
  registerAppCapability(new AddNoteCapability());
  // Feature lifecycle (f-feature-planning §18 t-2) — claim-then-plan over MCP.
  // Each emits its feature_* journal event; membership via the feature funnel.
  registerAppCapability(new CreateFeatureCapability()); // author (member)
  registerAppCapability(new CaptureIdeaCapability()); // jot an idea into the Ideas Park (member)
  registerAppCapability(new ClaimFeatureCapability()); // take ownership (member)
  registerAppCapability(new PlanFeatureCapability()); // materialise tasks (owner)
  registerAppCapability(new ShipFeatureCapability()); // close out (owner)
}
