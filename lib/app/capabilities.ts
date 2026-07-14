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

export function initAppCapabilities(): void {
  // HCE Hub coordination tools (f-hub-capabilities). Each also needs an active
  // `AiCapability` row (seeded under prisma/seeds/app/) or dispatch dies at
  // `capability_inactive` — registering the class here is necessary, not
  // sufficient. Membership is enforced inside each capability's execute() via
  // the f-access funnel; there is no per-agent binding requirement (default-allow).
  registerAppCapability(new NextTaskCapability());
}
