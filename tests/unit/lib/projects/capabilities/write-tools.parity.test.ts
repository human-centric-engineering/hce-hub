/**
 * Parity guards for the write tools: each capability class carries its
 * function definition for the in-memory handler, and its seed carries the DB
 * copy the dispatcher loads / the LLM sees. Pin the two so they can't drift
 * (see next-task.parity.test.ts for the rationale).
 *
 * `add_backlog` and `claim_task` retired with f-status-model §20 t-1 (you claim
 * features, not tasks — a task is born `claimed`; the pull-task flow is gone).
 */

import { describe, it, expect } from 'vitest';
import { CreateTaskCapability } from '@/lib/projects/capabilities/create-task';
import { FlagHelpWantedCapability } from '@/lib/projects/capabilities/flag-help-wanted';
import { createTaskFunctionDefinition } from '@/prisma/seeds/app/002-create-task';
import { flagHelpWantedFunctionDefinition } from '@/prisma/seeds/app/004-flag-help-wanted';

describe('write-tool class ↔ seed parity', () => {
  it.each([
    ['create_task', new CreateTaskCapability(), createTaskFunctionDefinition],
    ['flag_help_wanted', new FlagHelpWantedCapability(), flagHelpWantedFunctionDefinition],
  ])(
    '%s: class functionDefinition equals the seeded copy, and name === slug',
    (slug, cap, seedDef) => {
      expect(cap.functionDefinition).toEqual(seedDef);
      expect(cap.slug).toBe(slug);
      expect(seedDef.name).toBe(slug);
    }
  );
});
