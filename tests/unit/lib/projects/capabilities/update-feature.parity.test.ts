/**
 * Parity guard for the f-authoring-fidelity §21 t-e `update_feature` verb: the
 * capability class carries its function definition for the in-memory handler, and
 * its seed carries the DB copy the dispatcher loads / the LLM sees. Pin the two so
 * they can't drift (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { UpdateFeatureCapability } from '@/lib/projects/capabilities/update-feature';
import { updateFeatureFunctionDefinition } from '@/prisma/seeds/app/018-update-feature';

describe('update_feature class ↔ seed parity', () => {
  it('class functionDefinition equals the seeded copy, and name === slug', () => {
    const cap = new UpdateFeatureCapability();
    expect(cap.functionDefinition).toEqual(updateFeatureFunctionDefinition);
    expect(cap.slug).toBe('update_feature');
    expect(updateFeatureFunctionDefinition.name).toBe('update_feature');
  });
});
