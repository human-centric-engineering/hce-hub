/**
 * Parity guard: the `next_task` function definition is duplicated — the
 * `NextTaskCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/001-next-task.ts` carries it for the DB row the dispatcher
 * loads and the LLM sees (the house pattern from Sunrise's built-in seeds). If
 * the two drift, the LLM is prompted with one schema while another validates —
 * a silent bug. This pins them together so a change to one fails until the other
 * follows.
 */

import { describe, it, expect } from 'vitest';
import { NextTaskCapability } from '@/lib/projects/capabilities/next-task';
import { nextTaskFunctionDefinition } from '@/prisma/seeds/app/001-next-task';

describe('next_task class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new NextTaskCapability().functionDefinition).toEqual(nextTaskFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    // The seed sets McpExposedTool.customName = 'next_task'; keep it == slug.
    expect(new NextTaskCapability().slug).toBe(nextTaskFunctionDefinition.name);
  });
});
