/**
 * Parity guard: the `get_feature` function definition is duplicated — the
 * `GetFeatureCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/029-get-feature.ts` carries the DB row the dispatcher loads and
 * the LLM sees. If the two drift, the LLM is prompted with one schema while another
 * validates. Mirrors `get-task.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { GetFeatureCapability } from '@/lib/projects/capabilities/get-feature';
import { getFeatureFunctionDefinition } from '@/prisma/seeds/app/029-get-feature';

describe('get_feature class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new GetFeatureCapability().functionDefinition).toEqual(getFeatureFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new GetFeatureCapability().slug).toBe(getFeatureFunctionDefinition.name);
  });
});
