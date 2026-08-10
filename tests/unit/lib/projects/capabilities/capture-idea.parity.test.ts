/**
 * Parity guard: the `capture_idea` function definition is duplicated — the
 * `CaptureIdeaCapability` class carries it for the in-memory handler, and
 * `prisma/seeds/app/024-capture-idea.ts` carries the DB row the dispatcher loads
 * and the LLM sees. Pin the two so they can't drift.
 */
import { describe, it, expect } from 'vitest';
import { CaptureIdeaCapability } from '@/lib/projects/capabilities/capture-idea';
import { captureIdeaFunctionDefinition } from '@/prisma/seeds/app/024-capture-idea';

describe('capture_idea class ↔ seed parity', () => {
  it('the class functionDefinition equals the seeded DB copy', () => {
    expect(new CaptureIdeaCapability().functionDefinition).toEqual(captureIdeaFunctionDefinition);
  });

  it('the exposed MCP tool name matches the capability slug', () => {
    expect(new CaptureIdeaCapability().slug).toBe(captureIdeaFunctionDefinition.name);
  });
});
