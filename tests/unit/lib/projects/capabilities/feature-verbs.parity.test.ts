/**
 * Parity guards for the f-feature-planning §18 t-2 lifecycle verbs: each
 * capability class carries its function definition for the in-memory handler, and
 * its seed carries the DB copy the dispatcher loads / the LLM sees. Pin the two so
 * they can't drift (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { CreateFeatureCapability } from '@/lib/projects/capabilities/create-feature';
import { ClaimFeatureCapability } from '@/lib/projects/capabilities/claim-feature';
import { PlanFeatureCapability } from '@/lib/projects/capabilities/plan-feature';
import { ShipFeatureCapability } from '@/lib/projects/capabilities/ship-feature';
import { createFeatureFunctionDefinition } from '@/prisma/seeds/app/010-create-feature';
import { claimFeatureFunctionDefinition } from '@/prisma/seeds/app/011-claim-feature';
import { planFeatureFunctionDefinition } from '@/prisma/seeds/app/012-plan-feature';
import { shipFeatureFunctionDefinition } from '@/prisma/seeds/app/013-ship-feature';

describe('feature-verb class ↔ seed parity', () => {
  it.each([
    ['create_feature', new CreateFeatureCapability(), createFeatureFunctionDefinition],
    ['claim_feature', new ClaimFeatureCapability(), claimFeatureFunctionDefinition],
    ['plan_feature', new PlanFeatureCapability(), planFeatureFunctionDefinition],
    ['ship_feature', new ShipFeatureCapability(), shipFeatureFunctionDefinition],
  ])(
    '%s: class functionDefinition equals the seeded copy, and name === slug',
    (slug, cap, seedDef) => {
      expect(cap.functionDefinition).toEqual(seedDef);
      expect(cap.slug).toBe(slug);
      expect(seedDef.name).toBe(slug);
    }
  );
});
