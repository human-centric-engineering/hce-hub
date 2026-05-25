/**
 * Event entity-keys map + matcher.
 *
 * Covers the pure helper in isolation. The dispatcher integration is
 * covered separately in dispatcher.test.ts under
 * "dispatchWebhookEvent: entity-scoped matching".
 *
 * @see lib/orchestration/webhooks/event-entity-keys.ts
 */

import { describe, it, expect } from 'vitest';
import {
  EVENT_ENTITY_KEYS,
  matchesEntityScope,
} from '@/lib/orchestration/webhooks/event-entity-keys';
import { WEBHOOK_EVENT_TYPES } from '@/lib/validations/orchestration';

describe('EVENT_ENTITY_KEYS map coverage', () => {
  // Forces a deliberate decision when a new event type is added: pick the
  // payload field that carries the agent/workflow id, or leave `{}` to
  // declare "no scopable entity". Failing this test means the map is out
  // of sync with the catalogue of wired events.
  it('contains an entry for every webhook event type in WEBHOOK_EVENT_TYPES', () => {
    for (const event of WEBHOOK_EVENT_TYPES) {
      expect(EVENT_ENTITY_KEYS, `missing entry for event "${event}"`).toHaveProperty(event);
    }
  });
});

describe('matchesEntityScope', () => {
  // Empty filters → no constraint. Backward compatible with pre-scoping rows.
  it('returns true when both filters are empty', () => {
    expect(
      matchesEntityScope('budget_exceeded', { agentId: 'a1' }, { agentIds: [], workflowIds: [] })
    ).toBe(true);
  });

  it('returns true when the payload agentId is in the agentIds filter', () => {
    expect(
      matchesEntityScope('budget_exceeded', { agentId: 'a1' }, { agentIds: ['a1', 'a2'] })
    ).toBe(true);
  });

  it('returns false when the payload agentId is NOT in the agentIds filter', () => {
    expect(matchesEntityScope('budget_exceeded', { agentId: 'a3' }, { agentIds: ['a1'] })).toBe(
      false
    );
  });

  it('ignores the agent filter for workflow-typed events (dimension-specific)', () => {
    // The sub cares about agents, but workflow_failed has no agent
    // dimension — the filter must not block it.
    expect(
      matchesEntityScope(
        'workflow_failed',
        { workflowId: 'wf-1', error: 'boom' },
        { agentIds: ['a1'], workflowIds: [] }
      )
    ).toBe(true);
  });

  it('ignores the workflow filter for agent-typed events', () => {
    expect(
      matchesEntityScope(
        'budget_exceeded',
        { agentId: 'a1' },
        { agentIds: [], workflowIds: ['wf-1'] }
      )
    ).toBe(true);
  });

  it('requires both dimensions to match when both are filtered', () => {
    expect(
      matchesEntityScope(
        'budget_exceeded',
        { agentId: 'a1' },
        { agentIds: ['a1'], workflowIds: ['wf-1'] }
      )
    ).toBe(true);
  });

  it('fails closed when an agent filter is set but the payload is missing agentId', () => {
    // Defensive contract: never leak a scoped sub when the dispatch site
    // forgot to enrich the payload. Better to drop the event than route
    // it to the wrong subscriber.
    expect(matchesEntityScope('budget_exceeded', {}, { agentIds: ['a1'] })).toBe(false);
  });

  it('returns true for unscopable events (e.g. circuit_breaker_opened) even with filters set', () => {
    // No agent/workflow keys mapped — filters can't apply. Scoped sub
    // still gets the event so admins don't accidentally mute breaker
    // notifications by setting an unrelated filter.
    expect(
      matchesEntityScope(
        'circuit_breaker_opened',
        { providerSlug: 'openai' },
        { agentIds: ['a1'], workflowIds: ['wf-1'] }
      )
    ).toBe(true);
  });

  it('tolerates a non-string payload entity value (fails closed when filtered)', () => {
    expect(matchesEntityScope('budget_exceeded', { agentId: 123 }, { agentIds: ['a1'] })).toBe(
      false
    );
  });
});
