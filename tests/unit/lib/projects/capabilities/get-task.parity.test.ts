/**
 * Parity guard: the `get_task` function definition is duplicated — the
 * `GetTaskCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/028-get-task.ts` carries the DB row the dispatcher loads and
 * the LLM sees. If the two drift, the LLM is prompted with one schema while another
 * validates. Mirrors `list-tasks.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { GetTaskCapability } from '@/lib/projects/capabilities/get-task';
import { getTaskFunctionDefinition } from '@/prisma/seeds/app/028-get-task';

describe('get_task class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new GetTaskCapability().functionDefinition).toEqual(getTaskFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new GetTaskCapability().slug).toBe(getTaskFunctionDefinition.name);
  });
});
