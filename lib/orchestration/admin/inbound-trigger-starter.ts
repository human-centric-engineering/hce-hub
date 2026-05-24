/**
 * Starter workflow definition used when an admin clicks
 * "Create a workflow (pre-filled for inbound)" from the no-workflows-yet
 * state on `/admin/orchestration/triggers/new`.
 *
 * Encoded into the `?definition=` URL param the new-workflow page
 * already accepts (the advisor chatbot uses the same hand-off path).
 *
 * The single `llm_call` step reads the normalised inbound trigger
 * fields (`trigger.text`, `trigger.from`, `trigger.channel`) so the
 * operator lands in the workflow builder with a runnable shape instead
 * of an empty canvas.
 *
 * Lives in its own module (not inline on the page component) so the
 * shape is importable by tests — the workflow new page silently falls
 * back to an empty builder when the encoded definition fails schema
 * validation, so a regression test asserts this constant parses clean.
 *
 * Field constraints to mind when editing:
 *   - Step `description` is capped at 500 chars by `workflowStepSchema`.
 *     Keep it short.
 *   - Field names referenced in `prompt` must match what the inbound
 *     adapters set on `NormalisedTriggerPayload.payload`. Twilio + WA
 *     Cloud set `text` / `from` / `channel`; Slack sets `text` /
 *     `user`; Postmark sets `textBody` / `from.email`. The starter uses
 *     the most cross-channel-compatible subset.
 */

import type { WorkflowDefinition } from '@/types/orchestration';

export const INBOUND_TRIGGER_STARTER_DEFINITION: WorkflowDefinition = {
  entryStepId: 'respond_to_inbound',
  errorStrategy: 'fail',
  steps: [
    {
      id: 'respond_to_inbound',
      name: 'Respond to inbound message',
      description:
        'Reads the inbound trigger payload (trigger.text + trigger.from + trigger.channel) and asks the LLM to draft a reply. To actually send the reply back on the same channel, add a tool_call step using `send_message_to_channel` once you have an agent with that capability bound.',
      type: 'llm_call',
      config: {
        prompt:
          'A user sent us this inbound message:\n\n{{trigger.text}}\n\nFrom: {{trigger.from}}\nChannel: {{trigger.channel}}\n\nWrite a concise, helpful reply suitable for the channel (SMS: under 1600 chars; WhatsApp: under 4096; Slack: markdown OK).',
        temperature: 0.4,
      },
      nextSteps: [],
    },
  ],
};

/**
 * Encoded URL pointing the workflow builder at the starter definition.
 * Use this in the trigger admin page CTA.
 */
export const INBOUND_TRIGGER_STARTER_HREF = `/admin/orchestration/workflows/new?definition=${encodeURIComponent(
  JSON.stringify(INBOUND_TRIGGER_STARTER_DEFINITION)
)}`;
