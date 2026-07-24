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
import { CreateTaskCapability } from '@/lib/projects/capabilities/create-task';
import { FlagHelpWantedCapability } from '@/lib/projects/capabilities/flag-help-wanted';
import { RecordDecisionCapability } from '@/lib/projects/capabilities/record-decision';
import { AddNoteCapability } from '@/lib/projects/capabilities/add-note';
import { CreateFeatureCapability } from '@/lib/projects/capabilities/create-feature';
import { ClaimFeatureCapability } from '@/lib/projects/capabilities/claim-feature';
import { PlanFeatureCapability } from '@/lib/projects/capabilities/plan-feature';
import { ShipFeatureCapability } from '@/lib/projects/capabilities/ship-feature';
import { StartTaskCapability } from '@/lib/projects/capabilities/start-task';
import { CompleteTaskCapability } from '@/lib/projects/capabilities/complete-task';

export function initAppCapabilities(): void {
  // HCE Hub coordination tools (f-hub-capabilities). Each also needs an active
  // `AiCapability` row (seeded under prisma/seeds/app/) or dispatch dies at
  // `capability_inactive` — registering the class here is necessary, not
  // sufficient. Membership is enforced inside each capability's execute() via
  // the f-access funnel; there is no per-agent binding requirement (default-allow).
  registerAppCapability(new NextTaskCapability()); // read (t-1)
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
  // Journal authored verbs (f-journal §17 t-2) — free-text narrative into the
  // ProjectEvent stream; membership-scoped via the resolveEventScope funnel.
  registerAppCapability(new RecordDecisionCapability());
  registerAppCapability(new AddNoteCapability());
  // Feature lifecycle (f-feature-planning §18 t-2) — claim-then-plan over MCP.
  // Each emits its feature_* journal event; membership via the feature funnel.
  registerAppCapability(new CreateFeatureCapability()); // author (member)
  registerAppCapability(new ClaimFeatureCapability()); // take ownership (member)
  registerAppCapability(new PlanFeatureCapability()); // materialise tasks (owner)
  registerAppCapability(new ShipFeatureCapability()); // close out (owner)
}
