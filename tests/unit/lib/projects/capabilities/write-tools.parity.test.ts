/**
 * Parity guards for the write tools: each capability class carries its
 * function definition for the in-memory handler, and its seed carries the DB
 * copy the dispatcher loads / the LLM sees. Pin the two so they can't drift
 * (see next-task.parity.test.ts for the rationale).
 *
 * `add_backlog` and `claim_task` retired with f-status-model §20 t-1 (you claim
 * features, not tasks — a task is born `claimed`; the pull-task flow is gone).
 *
 * **This list is hand-maintained — but since t-124 it is no longer the only thing
 * covering these verbs.** It used to be: the structural sibling
 * (`capability-class-seed-parity`) reads `functionDefinition` only where it is an
 * inline object literal in the upsert, so every Hub app seed — which spreads a
 * hoisted `*_IMPL` const instead — contributes nothing to its completeness check
 * (verified by mutating a seed description and watching that suite stay green, §21
 * t-123; filed upstream as sunrise#646).
 *
 * `app-capability-parity.test.ts` now derives both sides — classes from the
 * registration seam, seeds by executing each unit — so a verb added without a row
 * here is still caught. This file is kept as the readable, per-verb statement of the
 * same invariant; it is no longer load-bearing on its own, and a row missing from it
 * is a documentation gap rather than a hole.
 */

import { describe, it, expect } from 'vitest';
import { CreateTaskCapability } from '@/lib/projects/capabilities/create-task';
import { FlagHelpWantedCapability } from '@/lib/projects/capabilities/flag-help-wanted';
import { AssignTaskCapability } from '@/lib/projects/capabilities/assign-task';
import { ReassignFeatureTasksCapability } from '@/lib/projects/capabilities/reassign-feature-tasks';
import { WithdrawTaskCapability } from '@/lib/projects/capabilities/withdraw-task';
import { createTaskFunctionDefinition } from '@/prisma/seeds/app/002-create-task';
import { flagHelpWantedFunctionDefinition } from '@/prisma/seeds/app/004-flag-help-wanted';
import { assignTaskFunctionDefinition } from '@/prisma/seeds/app/021-assign-task';
import { reassignFeatureTasksFunctionDefinition } from '@/prisma/seeds/app/022-reassign-feature-tasks';
import { withdrawTaskFunctionDefinition } from '@/prisma/seeds/app/033-withdraw-task';

describe('write-tool class ↔ seed parity', () => {
  it.each([
    ['create_task', new CreateTaskCapability(), createTaskFunctionDefinition],
    ['flag_help_wanted', new FlagHelpWantedCapability(), flagHelpWantedFunctionDefinition],
    ['assign_task', new AssignTaskCapability(), assignTaskFunctionDefinition],
    [
      'reassign_feature_tasks',
      new ReassignFeatureTasksCapability(),
      reassignFeatureTasksFunctionDefinition,
    ],
    ['withdraw_task', new WithdrawTaskCapability(), withdrawTaskFunctionDefinition],
  ])(
    '%s: class functionDefinition equals the seeded copy, and name === slug',
    (slug, cap, seedDef) => {
      expect(cap.functionDefinition).toEqual(seedDef);
      expect(cap.slug).toBe(slug);
      expect(seedDef.name).toBe(slug);
    }
  );
});
