/**
 * Parity guards for the f-journal §17 t-2 authored verbs: each capability class
 * carries its function definition for the in-memory handler, and its seed
 * carries the DB copy the dispatcher loads / the LLM sees. Pin the two so they
 * can't drift (see next-task.parity.test.ts for the rationale).
 */

import { describe, it, expect } from 'vitest';
import { RecordDecisionCapability } from '@/lib/projects/capabilities/record-decision';
import { AddNoteCapability } from '@/lib/projects/capabilities/add-note';
import { recordDecisionFunctionDefinition } from '@/prisma/seeds/app/008-record-decision';
import { addNoteFunctionDefinition } from '@/prisma/seeds/app/009-add-note';

describe('journal-verb class ↔ seed parity', () => {
  it.each([
    ['record_decision', new RecordDecisionCapability(), recordDecisionFunctionDefinition],
    ['add_note', new AddNoteCapability(), addNoteFunctionDefinition],
  ])(
    '%s: class functionDefinition equals the seeded copy, and name === slug',
    (slug, cap, seedDef) => {
      expect(cap.functionDefinition).toEqual(seedDef);
      expect(cap.slug).toBe(slug);
      expect(seedDef.name).toBe(slug);
    }
  );
});
