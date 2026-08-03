/**
 * Parity guard for the f-github-sync §14 t-1 `set_pr` verb: the capability class
 * carries its function definition for the in-memory handler, and its seed carries
 * the DB copy the dispatcher loads / the LLM sees. Pin the two so they can't drift
 * (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { SetPrCapability } from '@/lib/projects/capabilities/set-pr';
import { setPrFunctionDefinition } from '@/prisma/seeds/app/016-set-pr';

describe('set_pr class ↔ seed parity', () => {
  it('class functionDefinition equals the seeded copy, and name === slug', () => {
    const cap = new SetPrCapability();
    expect(cap.functionDefinition).toEqual(setPrFunctionDefinition);
    expect(cap.slug).toBe('set_pr');
    expect(setPrFunctionDefinition.name).toBe('set_pr');
  });
});
