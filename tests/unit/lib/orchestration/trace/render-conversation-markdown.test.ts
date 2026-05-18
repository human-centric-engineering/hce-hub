/**
 * Tests for `lib/orchestration/trace/render-conversation-markdown.ts`.
 *
 * The renderer is deterministic: same input produces byte-identical
 * output (modulo the footer timestamp). We verify the structure and
 * specific content rather than snapshotting the full string, because
 * snapshots make it too easy to silently accept formatting churn.
 */

import { describe, expect, it } from 'vitest';

import {
  renderConversationMarkdown,
  type RenderConversationInfo,
  type RenderConversationMessage,
} from '@/lib/orchestration/trace/render-conversation-markdown';

const baseConversation: RenderConversationInfo = {
  id: 'conv-1',
  title: 'Tenancy advice — deposit protection',
  userId: 'user-1',
  agentId: 'agent-1',
  agentSlug: 'tenant-rights-advisor',
  agentName: 'Tenant Rights Advisor',
  createdAt: '2026-05-18T08:00:00.000Z',
  updatedAt: '2026-05-18T08:05:00.000Z',
  isActive: true,
};

function makeMessage(overrides: Partial<RenderConversationMessage>): RenderConversationMessage {
  return {
    id: 'msg-x',
    role: 'user',
    content: 'placeholder',
    capabilitySlug: null,
    createdAt: '2026-05-18T08:00:00.000Z',
    agentVersionId: null,
    workflowExecutionId: null,
    workflowVersionId: null,
    modelId: null,
    providerSlug: null,
    provenance: null,
    ...overrides,
  };
}

describe('renderConversationMarkdown', () => {
  it('renders the conversation header with id, agent, and message count', () => {
    const md = renderConversationMarkdown(baseConversation, []);
    expect(md).toContain('# Conversation provenance — `conv-1`');
    expect(md).toContain('**Tenancy advice — deposit protection**');
    expect(md).toContain('| Agent | Tenant Rights Advisor (`tenant-rights-advisor`) |');
    expect(md).toContain('| User | `user-1` |');
    expect(md).toContain('| Messages | 0 |');
  });

  it('handles an empty message list with a clean placeholder', () => {
    const md = renderConversationMarkdown(baseConversation, []);
    expect(md).toContain('## Message timeline');
    expect(md).toContain('_No messages in this conversation._');
  });

  it('renders an assistant message with all four scalar pins', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'The deposit must be protected within 30 days.',
        modelId: 'claude-sonnet-4-6',
        providerSlug: 'anthropic',
        agentVersionId: 'av-1',
        workflowExecutionId: 'exec-1',
        workflowVersionId: 'wv-1',
      }),
    ]);
    expect(md).toContain('### 1. Assistant — 2026-05-18T08:00:00.000Z');
    expect(md).toContain('Model `claude-sonnet-4-6`');
    expect(md).toContain('Provider `anthropic`');
    expect(md).toContain('Agent version `av-1`');
    expect(md).toContain('Workflow execution `exec-1` @ `wv-1`');
  });

  it('renders citations with content hash, document name, and excerpt truncation', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Deposit must be protected [1].',
        provenance: {
          citations: [
            {
              marker: 1,
              chunkId: 'chunk-1',
              documentId: 'doc-1',
              documentName: 'Tenancy Guide',
              contentHash: 'sha256-deadbeef0000000011112222',
              documentVersion: 3,
              section: 'Page 12',
              patternNumber: null,
              patternName: null,
              excerpt: 'Deposits must be protected within 30 days of receipt.',
              similarity: 0.91,
            },
          ],
        },
      }),
    ]);
    expect(md).toContain('**Citations (1)**');
    // contentHash is truncated to the first 16 chars + ellipsis for table compactness.
    expect(md).toContain('| [1] | Tenancy Guide (`doc-1`) | Page 12 | `sha256-deadbeef0…` |');
    expect(md).toContain('Deposits must be protected within 30 days');
  });

  it('renders capability call traces with success and latency', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Looked it up.',
        provenance: {
          capabilityCalls: [
            {
              slug: 'lookup_order',
              arguments: { orderId: 'o_1' },
              latencyMs: 142,
              success: true,
              resultPreview: '{"id":"o_1"}',
            },
            {
              slug: 'send_email',
              arguments: { to: 'x' },
              latencyMs: 50,
              success: false,
              errorCode: 'forbidden',
            },
          ],
        },
      }),
    ]);
    expect(md).toContain('**Capability calls (2)**');
    expect(md).toContain('| `lookup_order` | `ok` | 142ms |');
    expect(md).toContain('| `send_email` | `fail: forbidden` | 50ms |');
  });

  it('renders workflow source provenance items when present', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Workflow summary.',
        workflowExecutionId: 'exec-1',
        provenance: {
          workflowSources: [
            { source: 'knowledge_base', confidence: 'high', reference: 'doc-1', stepId: 'step-2' },
            { source: 'external_call', confidence: 'medium', reference: 'api-x' },
          ],
        },
      }),
    ]);
    expect(md).toContain('**Workflow sources (2)**');
    expect(md).toContain('| `step-2` | `knowledge_base` | `high` | doc-1 |');
    expect(md).toContain('| — | `external_call` | `medium` | api-x |');
  });

  it('includes the provenance summary when any trail has data', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Answer with citation [1].',
        provenance: {
          citations: [
            {
              marker: 1,
              chunkId: 'c1',
              documentId: 'd1',
              documentName: 'Doc',
              contentHash: null,
              documentVersion: null,
              section: null,
              patternNumber: null,
              patternName: null,
              excerpt: 'x',
              similarity: 0.5,
            },
          ],
          capabilityCalls: [{ slug: 'x', arguments: {}, latencyMs: 1, success: true }],
        },
      }),
    ]);
    expect(md).toContain('## Provenance summary');
    expect(md).toContain('- **Citations:** 1');
    expect(md).toContain('- **Capability calls:** 1');
    expect(md).toContain('- **Workflow sources:** 0');
  });

  it('omits the provenance summary entirely when no message carries provenance', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({ id: 'msg-1', role: 'user', content: 'Hi.' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Hello.' }),
    ]);
    expect(md).not.toContain('## Provenance summary');
  });

  it('escapes pipe characters in cell content so the table stays valid', () => {
    const md = renderConversationMarkdown(baseConversation, [
      makeMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'See [1].',
        provenance: {
          citations: [
            {
              marker: 1,
              chunkId: 'c1',
              documentId: 'd1',
              documentName: 'Title with | pipe',
              contentHash: null,
              documentVersion: null,
              section: 'A | B',
              patternNumber: null,
              patternName: null,
              excerpt: 'has | pipe in body',
              similarity: 0.5,
            },
          ],
        },
      }),
    ]);
    // The cell content escapes the bare pipe to `\|` so the table parser
    // doesn't split the column on the wrong character.
    expect(md).toContain('Title with \\| pipe');
    expect(md).toContain('A \\| B');
    expect(md).toContain('has \\| pipe in body');
  });

  it('produces deterministic output for the same input (ignoring footer timestamp)', () => {
    const fixture: RenderConversationMessage[] = [
      makeMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Ask',
        createdAt: '2026-05-18T08:00:00.000Z',
      }),
      makeMessage({
        id: 'msg-2',
        role: 'assistant',
        content: 'Reply [1].',
        modelId: 'claude-sonnet-4-6',
        providerSlug: 'anthropic',
        createdAt: '2026-05-18T08:00:05.000Z',
        provenance: {
          citations: [
            {
              marker: 1,
              chunkId: 'c1',
              documentId: 'd1',
              documentName: 'Doc',
              contentHash: 'sha256-x',
              documentVersion: 1,
              section: null,
              patternNumber: null,
              patternName: null,
              excerpt: 'x',
              similarity: 0.9,
            },
          ],
        },
      }),
    ];
    const first = renderConversationMarkdown(baseConversation, fixture);
    const second = renderConversationMarkdown(baseConversation, fixture);
    // Strip the footer "Generated …" line which contains a wall-clock
    // timestamp, then compare the rest byte-for-byte.
    const strip = (s: string) => s.replace(/Generated [^\n]+/, 'Generated <ts>');
    expect(strip(first)).toBe(strip(second));
  });

  it('uses relative URL by default and absolutizes with hostPrefix option', () => {
    const relative = renderConversationMarkdown(baseConversation, []);
    expect(relative).toContain('[open in admin](/admin/orchestration/conversations/conv-1)');

    const absolute = renderConversationMarkdown(baseConversation, [], {
      hostPrefix: 'https://admin.example.com',
    });
    expect(absolute).toContain(
      '[open in admin](https://admin.example.com/admin/orchestration/conversations/conv-1)'
    );
  });
});
