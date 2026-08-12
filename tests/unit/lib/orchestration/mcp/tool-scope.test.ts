import { describe, it, expect } from 'vitest';
import { foldProjectScope, toolAcceptsProjectId } from '@/lib/orchestration/mcp/tool-scope';

describe('toolAcceptsProjectId', () => {
  it('is true when the schema declares a projectId property', () => {
    expect(
      toolAcceptsProjectId({ type: 'object', properties: { projectId: { type: 'string' } } })
    ).toBe(true);
  });

  it('is false when properties omits projectId', () => {
    expect(
      toolAcceptsProjectId({ type: 'object', properties: { taskId: { type: 'string' } } })
    ).toBe(false);
  });

  it('is false when there are no properties at all', () => {
    expect(toolAcceptsProjectId({ type: 'object' })).toBe(false);
  });

  it('is false when properties is not an object', () => {
    expect(toolAcceptsProjectId({ type: 'object', properties: 'nonsense' })).toBe(false);
  });

  it('does not treat an inherited property name as declared', () => {
    // `toString` lives on Object.prototype — a hasOwnProperty check must not
    // report it as a declared parameter.
    expect(toolAcceptsProjectId({ properties: {} })).toBe(false);
  });
});

describe('foldProjectScope', () => {
  const PROJ = 'proj-scoped';

  describe('unscoped keys (no scope.projectId)', () => {
    it('returns args unchanged when scope is undefined', () => {
      const args = { projectId: 'proj-explicit', q: 1 };
      const fold = foldProjectScope(args, undefined, true);
      expect(fold.args).toBe(args);
      expect(fold.crossProject).toBeUndefined();
    });

    it('returns args unchanged when scope has no projectId', () => {
      const args = { q: 1 };
      const fold = foldProjectScope(args, { other: 'x' }, true);
      expect(fold.args).toBe(args);
      expect(fold.crossProject).toBeUndefined();
    });
  });

  describe('tools that do not accept projectId', () => {
    it('leaves args untouched even when the key is scoped', () => {
      const args = { taskId: 't-1' };
      const fold = foldProjectScope(args, { projectId: PROJ }, false);
      expect(fold.args).toBe(args);
      expect(fold.args).not.toHaveProperty('projectId');
      expect(fold.crossProject).toBeUndefined();
    });
  });

  describe('scoped key + tool that accepts projectId', () => {
    it('fills projectId from scope when absent', () => {
      const fold = foldProjectScope({ q: 1 }, { projectId: PROJ }, true);
      expect(fold.args).toEqual({ q: 1, projectId: PROJ });
      expect(fold.crossProject).toBeUndefined();
    });

    it('treats null as absent and fills from scope', () => {
      const fold = foldProjectScope({ projectId: null }, { projectId: PROJ }, true);
      expect(fold.args).toEqual({ projectId: PROJ });
      expect(fold.crossProject).toBeUndefined();
    });

    it('treats an empty string as absent and fills from scope', () => {
      const fold = foldProjectScope({ projectId: '' }, { projectId: PROJ }, true);
      expect(fold.args).toEqual({ projectId: PROJ });
      expect(fold.crossProject).toBeUndefined();
    });

    it('passes through when the explicit projectId matches the scope', () => {
      const args = { projectId: PROJ, q: 2 };
      const fold = foldProjectScope(args, { projectId: PROJ }, true);
      expect(fold.args).toBe(args);
      expect(fold.crossProject).toBeUndefined();
    });

    it('flags a cross-project attempt when the explicit projectId differs', () => {
      const args = { projectId: 'proj-other' };
      const fold = foldProjectScope(args, { projectId: PROJ }, true);
      expect(fold.crossProject).toEqual({ scoped: PROJ, requested: 'proj-other' });
      // args are not mutated — the caller rejects rather than dispatches.
      expect(fold.args).toBe(args);
    });

    it('does not fill over a non-string projectId (leaves the verb schema to reject it)', () => {
      const args = { projectId: 123 };
      const fold = foldProjectScope(args, { projectId: PROJ }, true);
      expect(fold.args).toBe(args);
      expect(fold.crossProject).toBeUndefined();
    });
  });
});
