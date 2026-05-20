import type { Metadata } from 'next';
import Link from 'next/link';

import {
  LiveEngineDashboard,
  type LiveEngineSnapshotView,
} from '@/components/admin/orchestration/live-engine-dashboard';
import { FieldHelp } from '@/components/ui/field-help';
import { API } from '@/lib/api/endpoints';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import { getOrchestrationSettings } from '@/lib/orchestration/settings';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Live Engine · AI Orchestration',
  description: 'Real-time view of in-flight executions, queued runs, and stuck workflows.',
};

const EMPTY_SNAPSHOT: LiveEngineSnapshotView = {
  running: { count: 0, p95AgeMs: null, maxAgeMs: null },
  queued: { count: 0, maxWaitMs: null },
  orphaned: { count: 0 },
  providers: [],
  generatedAt: new Date(0).toISOString(),
};

async function getInitialSnapshot(): Promise<LiveEngineSnapshotView> {
  try {
    const res = await serverFetch(API.ADMIN.ORCHESTRATION.EXECUTIONS_LIVE_SNAPSHOT);
    if (!res.ok) return EMPTY_SNAPSHOT;
    const body = await parseApiResponse<LiveEngineSnapshotView>(res);
    if (!body.success) return EMPTY_SNAPSHOT;
    return body.data;
  } catch (err) {
    logger.error('live engine page: initial snapshot fetch failed', err);
    return EMPTY_SNAPSHOT;
  }
}

export default async function LiveEnginePage() {
  // Fetch snapshot + threshold in parallel — settings is a cached
  // singleton, snapshot hits the four index reads inside the route.
  const [snapshot, settings] = await Promise.all([
    getInitialSnapshot(),
    getOrchestrationSettings(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <nav className="text-muted-foreground mb-1 text-xs">
          <Link href="/admin/orchestration" className="hover:underline">
            AI Orchestration
          </Link>
          {' / '}
          <Link href="/admin/orchestration/executions" className="hover:underline">
            Executions
          </Link>
          {' / '}
          <span>Live Engine</span>
        </nav>
        <h1 className="text-2xl font-semibold">
          Live Engine{' '}
          <FieldHelp title="What is the live engine view?" contentClassName="w-96">
            <p>
              A real-time snapshot of the orchestration engine: how many executions are running, how
              many are queued, which (if any) have orphaned leases, and how many calls are in flight
              per provider.
            </p>
            <p className="text-foreground mt-2 font-medium">Use this when</p>
            <p>
              A partner reports &ldquo;my workflow is stuck&rdquo; — start here, then click into the
              executions list to find and (if needed) force-fail the row.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground text-sm">
          Counts auto-refresh every 5 seconds while this tab is in the foreground.
        </p>
      </header>

      <LiveEngineDashboard
        initial={snapshot}
        stuckThresholdMins={settings.stuckExecutionThresholdMins}
      />
    </div>
  );
}
