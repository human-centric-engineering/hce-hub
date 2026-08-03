/**
 * Parity guard for the f-authoring-fidelity §21 t-b `update_task` verb: the
 * capability class carries its function definition for the in-memory handler, and
 * its seed carries the DB copy the dispatcher loads / the LLM sees. Pin the two so
 * they can't drift (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { UpdateTaskCapability } from '@/lib/projects/capabilities/update-task';
import { updateTaskFunctionDefinition } from '@/prisma/seeds/app/017-update-task';

describe('update_task class ↔ seed parity', () => {
  it('class functionDefinition equals the seeded copy, and name === slug', () => {
    const cap = new UpdateTaskCapability();
    expect(cap.functionDefinition).toEqual(updateTaskFunctionDefinition);
    expect(cap.slug).toBe('update_task');
    expect(updateTaskFunctionDefinition.name).toBe('update_task');
  });
});
