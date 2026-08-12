/**
 * Parity guard: the `list_events` function definition is duplicated — the
 * `ListEventsCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/032-list-events.ts` carries the DB row the dispatcher loads and
 * the LLM sees. If the two drift, the LLM is prompted with one schema while another
 * validates. Mirrors `get-feature.parity.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { ListEventsCapability } from '@/lib/projects/capabilities/list-events';
import { listEventsFunctionDefinition } from '@/prisma/seeds/app/032-list-events';

describe('list_events class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new ListEventsCapability().functionDefinition).toEqual(listEventsFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new ListEventsCapability().slug).toBe(listEventsFunctionDefinition.name);
  });
});
