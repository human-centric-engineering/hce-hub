/**
 * Parity guard: the `list_ideas` function definition is duplicated — the
 * `ListIdeasCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/026-list-ideas.ts` carries the DB row the dispatcher loads
 * and the LLM sees. If the two drift, the LLM is prompted with one schema while
 * another validates. Mirrors `list-phases.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { ListIdeasCapability } from '@/lib/projects/capabilities/list-ideas';
import { listIdeasFunctionDefinition } from '@/prisma/seeds/app/026-list-ideas';

describe('list_ideas class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new ListIdeasCapability().functionDefinition).toEqual(listIdeasFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new ListIdeasCapability().slug).toBe(listIdeasFunctionDefinition.name);
  });
});
