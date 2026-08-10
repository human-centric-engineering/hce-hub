/**
 * Parity guard: the `list_phases` function definition is duplicated — the
 * `ListPhasesCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/023-list-phases.ts` carries the DB row the dispatcher loads
 * and the LLM sees. If the two drift, the LLM is prompted with one schema while
 * another validates. Mirrors `next-task.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { ListPhasesCapability } from '@/lib/projects/capabilities/list-phases';
import { listPhasesFunctionDefinition } from '@/prisma/seeds/app/023-list-phases';

describe('list_phases class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new ListPhasesCapability().functionDefinition).toEqual(listPhasesFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new ListPhasesCapability().slug).toBe(listPhasesFunctionDefinition.name);
  });
});
