/**
 * Parity guard: the `list_projects` function definition is duplicated — the
 * `ListProjectsCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/030-list-projects.ts` carries the DB row the dispatcher loads
 * and the LLM sees. If the two drift, the LLM is prompted with one schema while
 * another validates. Mirrors `get-feature.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { ListProjectsCapability } from '@/lib/projects/capabilities/list-projects';
import { listProjectsFunctionDefinition } from '@/prisma/seeds/app/030-list-projects';

describe('list_projects class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new ListProjectsCapability().functionDefinition).toEqual(listProjectsFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new ListProjectsCapability().slug).toBe(listProjectsFunctionDefinition.name);
  });
});
