/**
 * Parity guard: the `list_tasks` function definition is duplicated — the
 * `ListTasksCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/027-list-tasks.ts` carries the DB row the dispatcher loads and
 * the LLM sees. If the two drift, the LLM is prompted with one schema while another
 * validates. Mirrors `list-ideas.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { ListTasksCapability } from '@/lib/projects/capabilities/list-tasks';
import { listTasksFunctionDefinition } from '@/prisma/seeds/app/027-list-tasks';

describe('list_tasks class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new ListTasksCapability().functionDefinition).toEqual(listTasksFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new ListTasksCapability().slug).toBe(listTasksFunctionDefinition.name);
  });
});
