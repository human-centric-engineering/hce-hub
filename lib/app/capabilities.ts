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
import { AddBacklogCapability } from '@/lib/projects/capabilities/add-backlog';
import { FlagHelpWantedCapability } from '@/lib/projects/capabilities/flag-help-wanted';
import { ClaimTaskCapability } from '@/lib/projects/capabilities/claim-task';
import { RecordDecisionCapability } from '@/lib/projects/capabilities/record-decision';
import { AddNoteCapability } from '@/lib/projects/capabilities/add-note';
import { CreateFeatureCapability } from '@/lib/projects/capabilities/create-feature';
import { ClaimFeatureCapability } from '@/lib/projects/capabilities/claim-feature';
import { PlanFeatureCapability } from '@/lib/projects/capabilities/plan-feature';
import { ShipFeatureCapability } from '@/lib/projects/capabilities/ship-feature';

export function initAppCapabilities(): void {
  // HCE Hub coordination tools (f-hub-capabilities). Each also needs an active
  // `AiCapability` row (seeded under prisma/seeds/app/) or dispatch dies at
  // `capability_inactive` — registering the class here is necessary, not
  // sufficient. Membership is enforced inside each capability's execute() via
  // the f-access funnel; there is no per-agent binding requirement (default-allow).
  registerAppCapability(new NextTaskCapability()); // read (t-1)
  registerAppCapability(new CreateTaskCapability()); // write (t-2)
  registerAppCapability(new AddBacklogCapability()); // write (t-2)
  registerAppCapability(new FlagHelpWantedCapability()); // write (t-2)
  registerAppCapability(new ClaimTaskCapability()); // write + soft-collision (t-3)
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
