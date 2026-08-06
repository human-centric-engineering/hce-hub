/**
 * Parity guard for the f-phases §22 t1 `create_phase` verb: the capability class
 * carries its function definition for the in-memory handler, and its seed carries
 * the DB copy the dispatcher loads / the LLM sees. Pin the two so they can't drift
 * (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { CreatePhaseCapability } from '@/lib/projects/capabilities/create-phase';
import { createPhaseFunctionDefinition } from '@/prisma/seeds/app/019-create-phase';

describe('create_phase class ↔ seed parity', () => {
  it('class functionDefinition equals the seeded copy, and name === slug', () => {
    const cap = new CreatePhaseCapability();
    expect(cap.functionDefinition).toEqual(createPhaseFunctionDefinition);
    expect(cap.slug).toBe('create_phase');
    expect(createPhaseFunctionDefinition.name).toBe('create_phase');
  });
});
