/**
 * Unit: `buildClaudeCodeCommand` (f-task-sheet §11 t-3).
 *
 * There is no Claude Code deep-link scheme (the integration is MCP), so the
 * "Open in Claude Code" action composes a ready-to-paste prompt instead.
 */
import { describe, it, expect } from 'vitest';
import { buildClaudeCodeCommand } from '@/lib/projects/claude-code-link';

describe('buildClaudeCodeCommand', () => {
  it('references the task number + feature slug when present', () => {
    const cmd = buildClaudeCodeCommand({ number: 6, title: 'Wire it', featureSlug: 'f-mcp' });
    expect(cmd).toContain('claim task t-6');
    expect(cmd).toContain('("Wire it")');
    expect(cmd).toContain('in feature f-mcp');
  });

  it('falls back to the title and omits the feature when number/slug are null', () => {
    const cmd = buildClaudeCodeCommand({ number: null, title: 'Do the base', featureSlug: null });
    expect(cmd).toContain('the task "Do the base"');
    expect(cmd).not.toContain('t-');
    expect(cmd).not.toContain('in feature');
  });
});
