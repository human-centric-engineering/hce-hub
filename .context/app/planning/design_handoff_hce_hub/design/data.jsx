// Sample data for HCE Hub — a "busy project" scenario
// Project: building the Hub itself (meta), with realistic in-flight state

const PEOPLE = {
  simon: { id: 'simon', name: 'Simon Holmes', initials: 'SH', tone: '#c45a3e' },
  john:  { id: 'john',  name: 'John Durrant', initials: 'JD', tone: '#5b7a8a' },
  mark:  { id: 'mark',  name: 'Mark Fadel',   initials: 'MF', tone: '#7a8a6f' },
  ada:   { id: 'ada',   name: 'Ada Okonjo',   initials: 'AO', tone: '#8a7a6b' },
};

const PROJECTS = [
  {
    id: 'hub',
    name: 'HCE Hub',
    hostPlatform: 'sunrise',
    repo: 'human-centric-engineering/hub',
    lead: 'simon',
    members: ['simon', 'john', 'mark', 'ada'],
    description: 'AI-native internal operations platform. v1 = Project Coordination module.',
    activity: 24,
  },
  {
    id: 'wayframer',
    name: 'Wayframer',
    hostPlatform: 'laravel-forge',
    repo: 'wayframer/app',
    lead: 'john',
    members: ['john', 'simon'],
    description: 'Client project — Laravel/Forge stack. Custom CRM for a hospitality group.',
    activity: 11,
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    hostPlatform: 'sunrise',
    repo: 'human-centric-engineering/sunrise',
    lead: 'simon',
    members: ['simon', 'john', 'mark'],
    description: 'The agentic platform Sunrise itself. Hub depends on this.',
    activity: 6,
  },
  {
    id: 'drift',
    name: 'Against the Drift',
    hostPlatform: 'nextjs-other',
    repo: 'simonhce/against-the-drift',
    lead: 'simon',
    members: ['simon'],
    description: "Simon's essay platform. Light-touch maintenance.",
    activity: 2,
  },
];

// Features for the Hub project
const FEATURES = [
  {
    id: 'f-data',
    title: 'Hub data model + Prisma migrations',
    description: 'Project, ProjectMember, Feature, Task, Dependency, Claim. Reuse Sunrise user table.',
    owner: 'john',
    status: 'shipped',
    helpWanted: false,
    deps: [],
  },
  {
    id: 'f-intake',
    title: 'Intake workflow — requirements → features',
    description: 'Workflow DAG with human approval gate. RAG over host-platform docs.',
    owner: 'simon',
    status: 'in-flight',
    helpWanted: false,
    deps: ['f-data'],
  },
  {
    id: 'f-sidekick',
    title: 'Project-scoped sidekick agent',
    description: 'Agent definition + project-scoped knowledge category. Web chat surface.',
    owner: 'simon',
    status: 'in-flight',
    helpWanted: true,
    deps: ['f-data'],
  },
  {
    id: 'f-mcp',
    title: 'MCP capabilities for Claude Code',
    description: 'next-task, claim-task, create-task, add-backlog, ask-sidekick.',
    owner: 'john',
    status: 'in-flight',
    helpWanted: false,
    deps: ['f-data'],
  },
  {
    id: 'f-kanban',
    title: 'Kanban / project view UI',
    description: 'Swim lanes, status columns, collision warnings, help-wanted flags.',
    owner: 'mark',
    status: 'in-flight',
    helpWanted: false,
    deps: ['f-data'],
  },
  {
    id: 'f-brief',
    title: 'Per-person morning brief',
    description: 'Scheduled workflow. Email + Hub view. Read like a thoughtful colleague.',
    owner: 'ada',
    status: 'planning',
    helpWanted: false,
    deps: ['f-data', 'f-mcp'],
  },
  {
    id: 'f-pr',
    title: 'GitHub PR webhook → reconcile',
    description: 'Webhook → locate task by PR URL → mark merged → unblock dependents.',
    owner: 'john',
    status: 'planning',
    helpWanted: false,
    deps: ['f-mcp'],
  },
  {
    id: 'f-shell',
    title: 'Module-composable shell + auth',
    description: 'Strip stock public surfaces. better-auth for project-membership scoping.',
    owner: 'mark',
    status: 'blocked',
    helpWanted: false,
    deps: ['f-data'],
    blockedReason: 'Waiting on Sunrise auth refactor (sunrise#284)',
  },
];

const TASKS = [
  // f-intake
  { id: 't-1',  featureId: 'f-intake',  title: 'Workflow scaffold: parse → RAG → draft → approve',
    files: ['workflows/intake/index.ts', 'workflows/intake/steps.ts'],
    status: 'merged', claimedBy: 'simon', prUrl: 'hub#42', deps: [] },
  { id: 't-2',  featureId: 'f-intake',  title: 'Feature-list draft renderer + diff view',
    files: ['app/projects/[id]/intake/draft.tsx', 'components/intake/diff.tsx'],
    status: 'in-pr', claimedBy: 'simon', prUrl: 'hub#58', deps: ['t-1'] },
  { id: 't-3',  featureId: 'f-intake',  title: 'Persist approved features → Prisma',
    files: ['workflows/intake/persist.ts', 'lib/features.ts'],
    status: 'available', claimedBy: null, prUrl: null, deps: ['t-2'] },

  // f-sidekick
  { id: 't-4',  featureId: 'f-sidekick', title: 'Sidekick agent definition + system prompt',
    files: ['agents/sidekick.ts'],
    status: 'merged', claimedBy: 'simon', prUrl: 'hub#37', deps: [] },
  { id: 't-5',  featureId: 'f-sidekick', title: 'Project-scoped knowledge category wiring',
    files: ['lib/knowledge/scope.ts', 'agents/sidekick.ts'],
    status: 'claimed', claimedBy: 'simon', prUrl: null, deps: ['t-4'] },
  { id: 't-6',  featureId: 'f-sidekick', title: 'Streaming chat surface (web)',
    files: ['components/sidekick/panel.tsx', 'app/api/sidekick/stream/route.ts'],
    status: 'available', claimedBy: null, prUrl: null, deps: ['t-4'] },
  { id: 't-7',  featureId: 'f-sidekick', title: 'human_approval gate on state changes',
    files: ['agents/sidekick.ts', 'lib/approvals.ts'],
    status: 'backlog', claimedBy: null, prUrl: null, deps: ['t-5'] },

  // f-mcp
  { id: 't-8',  featureId: 'f-mcp', title: 'Register next-task + claim-task capabilities',
    files: ['mcp/capabilities/tasks.ts'],
    status: 'in-pr', claimedBy: 'john', prUrl: 'hub#61', deps: [] },
  { id: 't-9',  featureId: 'f-mcp', title: 'create-task + add-backlog capabilities',
    files: ['mcp/capabilities/tasks.ts', 'mcp/capabilities/backlog.ts'],
    status: 'available', claimedBy: null, prUrl: null, deps: ['t-8'] },
  { id: 't-10', featureId: 'f-mcp', title: 'Per-developer API key auth for Claude Code',
    files: ['mcp/auth.ts', 'lib/api-keys.ts'],
    status: 'claimed', claimedBy: 'john', prUrl: null, deps: [] },

  // f-kanban
  { id: 't-11', featureId: 'f-kanban', title: 'Swim-lane layout + status columns',
    files: ['app/projects/[id]/page.tsx', 'components/kanban/board.tsx'],
    status: 'in-pr', claimedBy: 'mark', prUrl: 'hub#59', deps: [] },
  { id: 't-12', featureId: 'f-kanban', title: 'Collision warning surface',
    files: ['components/kanban/collision.tsx', 'lib/collisions.ts'],
    status: 'available', claimedBy: null, prUrl: null, deps: ['t-11'] },
  { id: 't-13', featureId: 'f-kanban', title: 'Help-wanted toggle on feature card',
    files: ['components/kanban/feature-card.tsx'],
    status: 'backlog', claimedBy: null, prUrl: null, deps: ['t-11'] },

  // f-brief
  { id: 't-14', featureId: 'f-brief', title: 'Scheduled workflow scaffold',
    files: ['workflows/brief/index.ts'],
    status: 'backlog', claimedBy: null, prUrl: null, deps: [] },
  { id: 't-15', featureId: 'f-brief', title: 'Brief composition prompt + tone',
    files: ['workflows/brief/compose.ts', 'agents/brief-writer.ts'],
    status: 'backlog', claimedBy: null, prUrl: null, deps: ['t-14'] },

  // f-pr
  { id: 't-16', featureId: 'f-pr', title: 'PR webhook handler + signature verify',
    files: ['app/api/webhooks/github/route.ts'],
    status: 'backlog', claimedBy: null, prUrl: null, deps: [] },

  // f-shell — blocked feature
  { id: 't-17', featureId: 'f-shell', title: 'Strip stock public surfaces',
    files: ['app/(public)/*', 'next.config.js'],
    status: 'available', claimedBy: null, prUrl: null, deps: [] },
];

// Soft collision: Simon and Mark are both touching components/sidekick area
const COLLISIONS = [
  {
    id: 'c-1',
    a: { taskId: 't-5', user: 'simon', file: 'agents/sidekick.ts' },
    b: { taskId: 't-6', user: null,    file: 'components/sidekick/panel.tsx' },
    note: 'Same feature, adjacent files. Probably fine.',
    severity: 'low',
  },
];

const ACTIVITY = [
  { ts: '08:42', who: 'john', text: 'merged hub#56 — Hub data model + Prisma migrations', kind: 'merged' },
  { ts: '09:15', who: 'mark', text: 'opened hub#59 — Swim-lane layout', kind: 'pr' },
  { ts: '09:31', who: 'simon', text: 'claimed: Project-scoped knowledge category wiring', kind: 'claim' },
  { ts: '10:04', who: 'simon', text: 'flagged help-wanted on Project-scoped sidekick agent', kind: 'help' },
  { ts: '10:22', who: 'john', text: 'opened hub#61 — Register next-task + claim-task', kind: 'pr' },
  { ts: '11:08', who: 'sidekick', text: 'proposed dependency: t-7 → t-5 (awaiting Simon)', kind: 'sidekick' },
];

window.HUB_DATA = { PEOPLE, PROJECTS, FEATURES, TASKS, COLLISIONS, ACTIVITY };
