/**
 * Parity guards for the f-status-model §20 t-38 task-lifecycle verbs: each
 * capability class carries its function definition for the in-memory handler, and
 * its seed carries the DB copy the dispatcher loads / the LLM sees. Pin the two so
 * they can't drift (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { StartTaskCapability } from '@/lib/projects/capabilities/start-task';
import { CompleteTaskCapability } from '@/lib/projects/capabilities/complete-task';
import { startTaskFunctionDefinition } from '@/prisma/seeds/app/014-start-task';
import { completeTaskFunctionDefinition } from '@/prisma/seeds/app/015-complete-task';

describe('task-lifecycle-verb class ↔ seed parity', () => {
  it.each([
    ['start_task', new StartTaskCapability(), startTaskFunctionDefinition],
    ['complete_task', new CompleteTaskCapability(), completeTaskFunctionDefinition],
  ])(
    '%s: class functionDefinition equals the seeded copy, and name === slug',
    (slug, cap, seedDef) => {
      expect(cap.functionDefinition).toEqual(seedDef);
      expect(cap.slug).toBe(slug);
      expect(seedDef.name).toBe(slug);
    }
  );
});
