/**
 * Parity guard: the `update_idea` function definition is duplicated — the
 * `UpdateIdeaCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/025-update-idea.ts` carries the DB row the dispatcher loads
 * and the LLM sees. Pin the two so they can't drift.
 */
import { describe, it, expect } from 'vitest';
import { UpdateIdeaCapability } from '@/lib/projects/capabilities/update-idea';
import { updateIdeaFunctionDefinition } from '@/prisma/seeds/app/025-update-idea';

describe('update_idea class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new UpdateIdeaCapability().functionDefinition).toEqual(updateIdeaFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new UpdateIdeaCapability().slug).toBe(updateIdeaFunctionDefinition.name);
  });
});
