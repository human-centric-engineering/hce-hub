import type { Metadata } from 'next';
import Link from 'next/link';

import { AgentForm, type AgentProfileSummary } from '@/components/admin/orchestration/agent-form';
import { API } from '@/lib/api/endpoints';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import {
  getAgentModels,
  getEffectiveAgentDefaults,
  getProviders,
} from '@/lib/orchestration/prefetch-helpers';

async function getAgentProfiles(): Promise<AgentProfileSummary[]> {
  try {
    const res = await serverFetch(`${API.ADMIN.ORCHESTRATION.AGENT_PROFILES}?page=1&limit=100`);
    if (!res.ok) return [];
    const body = await parseApiResponse<AgentProfileSummary[]>(res);
    return body.success ? body.data : [];
  } catch (err) {
    logger.error('new agent page: profiles fetch failed', err);
    return [];
  }
}

export const metadata: Metadata = {
  title: 'New agent · AI Orchestration',
  description: 'Create a new AI agent.',
};

/**
 * Admin — New agent page (Phase 4 Session 4.2).
 *
 * Thin server shell that prefetches the provider list and the curated
 * provider matrix (chat + reasoning capabilities only) so the AgentForm's
 * Model tab hydrates with no loading flicker. Restricted to the same
 * matrix the settings page uses, so an agent can only be configured with
 * models the operator has actually added — avoids the runtime "provider
 * unavailable" trap that the broader registry view permitted. Both
 * fetches are null-safe — on failure the form falls back to free-text
 * inputs with a warning banner.
 */

export default async function NewAgentPage() {
  const [providers, models, effectiveDefaults, profiles] = await Promise.all([
    getProviders(),
    getAgentModels(),
    getEffectiveAgentDefaults({ provider: '', model: '' }),
    getAgentProfiles(),
  ]);

  return (
    <div className="space-y-6">
      <nav className="text-muted-foreground text-xs">
        <Link href="/admin/orchestration" className="hover:underline">
          AI Orchestration
        </Link>
        {' / '}
        <Link href="/admin/orchestration/agents" className="hover:underline">
          Agents
        </Link>
        {' / '}
        <span>New</span>
      </nav>

      <AgentForm
        mode="create"
        providers={providers}
        models={models}
        effectiveDefaults={effectiveDefaults}
        profiles={profiles}
      />
    </div>
  );
}
