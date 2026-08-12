/**
 * Parity guard: the `get_project` function definition is duplicated — the
 * `GetProjectCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/031-get-project.ts` carries the DB row the dispatcher loads and
 * the LLM sees. If the two drift, the LLM is prompted with one schema while another
 * validates. Mirrors `get-feature.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { GetProjectCapability } from '@/lib/projects/capabilities/get-project';
import { getProjectFunctionDefinition } from '@/prisma/seeds/app/031-get-project';

describe('get_project class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new GetProjectCapability().functionDefinition).toEqual(getProjectFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new GetProjectCapability().slug).toBe(getProjectFunctionDefinition.name);
  });
});
