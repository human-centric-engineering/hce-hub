/**
 * Parity guard for the f-phases §22 t1 `update_phase` verb: the capability class
 * carries its function definition for the in-memory handler, and its seed carries
 * the DB copy the dispatcher loads / the LLM sees. Pin the two so they can't drift
 * (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { UpdatePhaseCapability } from '@/lib/projects/capabilities/update-phase';
import { updatePhaseFunctionDefinition } from '@/prisma/seeds/app/020-update-phase';

describe('update_phase class ↔ seed parity', () => {
  it('class functionDefinition equals the seeded copy, and name === slug', () => {
    const cap = new UpdatePhaseCapability();
    expect(cap.functionDefinition).toEqual(updatePhaseFunctionDefinition);
    expect(cap.slug).toBe('update_phase');
    expect(updatePhaseFunctionDefinition.name).toBe('update_phase');
  });
});
