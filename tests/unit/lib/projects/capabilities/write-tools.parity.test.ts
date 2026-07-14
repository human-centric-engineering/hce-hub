/**
 * Parity guards for the t-2 write tools: each capability class carries its
 * function definition for the in-memory handler, and its seed carries the DB
 * copy the dispatcher loads / the LLM sees. Pin the two so they can't drift
 * (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { CreateTaskCapability } from '@/lib/projects/capabilities/create-task';
import { AddBacklogCapability } from '@/lib/projects/capabilities/add-backlog';
import { FlagHelpWantedCapability } from '@/lib/projects/capabilities/flag-help-wanted';
import { ClaimTaskCapability } from '@/lib/projects/capabilities/claim-task';
import { createTaskFunctionDefinition } from '@/prisma/seeds/app/002-create-task';
import { addBacklogFunctionDefinition } from '@/prisma/seeds/app/003-add-backlog';
import { flagHelpWantedFunctionDefinition } from '@/prisma/seeds/app/004-flag-help-wanted';
import { claimTaskFunctionDefinition } from '@/prisma/seeds/app/005-claim-task';

describe('write-tool class ↔ seed parity', () => {
  it.each([
    ['create_task', new CreateTaskCapability(), createTaskFunctionDefinition],
    ['add_backlog', new AddBacklogCapability(), addBacklogFunctionDefinition],
    ['flag_help_wanted', new FlagHelpWantedCapability(), flagHelpWantedFunctionDefinition],
    ['claim_task', new ClaimTaskCapability(), claimTaskFunctionDefinition],
  ])(
    '%s: class functionDefinition equals the seeded copy, and name === slug',
    (slug, cap, seedDef) => {
      expect(cap.functionDefinition).toEqual(seedDef);
      expect(cap.slug).toBe(slug);
      expect(seedDef.name).toBe(slug);
    }
  );
});
