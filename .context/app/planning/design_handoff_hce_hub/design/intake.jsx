// Intake flow — paste requirements → AI proposes feature list → human approval

const SAMPLE_REQ = `# HCE Hub — v1 Requirements

## Context
HCE Venture Studio (Simon + John) is co-developing multiple projects at AI pace, on Agentic Sunrise. Traditional PM tools assume a slower cadence and can't keep up.

## Thesis
Build a coordination environment that gets the best out of both AI and humans. Pull, not push. Ownership at the feature level. The sidekick suggests; humans approve.

## v1 scope
- Project + feature + task data model
- Sidekick agent (web chat + MCP) with project-scoped RAG
- Intake workflow: requirements → draft features → approval
- MCP capabilities for Claude Code: next-task, claim-task, create-task
- GitHub PR-state integration via webhook subscriptions
- Per-person morning brief (scheduled workflow)
- Web UI: Kanban / dashboard, intake screen, sidekick chat
…`;

const PROPOSED_FEATURES = [
  { id: 'pf-1', title: 'Hub data model + Prisma migrations', host: 'sunrise',
    rationale: 'Project, ProjectMember, Feature, Task, Dependency, Claim. Reuse Sunrise user table.',
    deps: [], confidence: 'high' },
  { id: 'pf-2', title: 'Project-scoped sidekick agent', host: 'sunrise',
    rationale: 'Reuses existing AiAgent + AiKnowledgeCategory. New: project-scope wiring.',
    deps: ['pf-1'], confidence: 'high' },
  { id: 'pf-3', title: 'Intake workflow with approval gate', host: 'sunrise',
    rationale: 'Sunrise workflow DAG + human_approval step. New capability: persist-features.',
    deps: ['pf-1'], confidence: 'high' },
  { id: 'pf-4', title: 'MCP capabilities for Claude Code', host: 'sunrise',
    rationale: 'Register on existing MCP server. Per-developer API key auth follows Sunrise pattern.',
    deps: ['pf-1'], confidence: 'high' },
  { id: 'pf-5', title: 'GitHub PR webhook → reconcile', host: 'sunrise',
    rationale: 'call_external_api capability + inbound webhook handler. Verify signatures.',
    deps: ['pf-4'], confidence: 'medium' },
  { id: 'pf-6', title: 'Module-composable shell + auth', host: 'sunrise',
    rationale: "Strip stock public surfaces. better-auth for project-membership scoping. Open: cleanest Next.js routing pattern.",
    deps: ['pf-1'], confidence: 'medium' },
  { id: 'pf-7', title: 'Kanban / project view UI', host: 'sunrise',
    rationale: 'Swim lanes by person. Status columns. Soft collision warnings.',
    deps: ['pf-6'], confidence: 'high' },
  { id: 'pf-8', title: 'Per-person morning brief', host: 'sunrise',
    rationale: 'Cron workflow. Email + Hub view. Tone: thoughtful colleague.',
    deps: ['pf-1', 'pf-4'], confidence: 'high' },
];

const Intake = ({ project, people }) => {
  const [phase, setPhase] = React.useState('drafted'); // 'input' | 'thinking' | 'drafted'
  const [approved, setApproved] = React.useState({});

  const toggle = (id) => setApproved(a => ({ ...a, [id]: !a[id] }));
  const allApproved = PROPOSED_FEATURES.every(f => approved[f.id]);
  const approvedCount = Object.values(approved).filter(Boolean).length;

  return (
    <div className="intake-layout">
      <div className="intake-input">
        <div className="intake-pane-head">
          <Icon name="inbox" className="glyph" />
          <div className="col" style={{ gap: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13.5 }}>Requirements</div>
            <div className="mono-sm" style={{ color: 'var(--ink-faint)' }}>v1-requirements.md · 273 lines</div>
          </div>
          <div style={{ flex: 1 }} />
          <span className="status-pill status-merged"><span className="dot" />parsed</span>
        </div>
        <textarea
          className="intake-textarea"
          defaultValue={SAMPLE_REQ}
          spellCheck={false}
        />
      </div>

      <div className="intake-output">
        <div className="intake-pane-head">
          <div className="sidekick-mark" style={{ width: 22, height: 22, fontSize: 9 }}>sk</div>
          <div className="col" style={{ gap: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13.5 }}>Proposed features</div>
            <div className="mono-sm" style={{ color: 'var(--ink-faint)' }}>
              {phase === 'thinking' ? 'reading host-platform docs…' : `${PROPOSED_FEATURES.length} drafted · ${approvedCount} approved`}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn ghost sm">Re-run</button>
          <button className={`btn sm ${allApproved ? 'primary' : ''}`} disabled={approvedCount === 0}>
            <Icon name="check" className="glyph sm" />
            Approve {approvedCount > 0 ? approvedCount : 'all'} →
          </button>
        </div>

        <div className="intake-content">
          <div className="intake-status-row">
            <div className="dot" />
            <span><strong style={{ fontWeight: 500 }}>Sidekick</strong> drew on Sunrise architecture docs to shape these. Confidence is 'high' where mapped to existing primitives, 'medium' where new patterns are needed. Edit anything before approving.</span>
          </div>

          <div className="feature-list">
            {PROPOSED_FEATURES.map((f, i) => {
              const isApproved = approved[f.id];
              return (
                <div key={f.id} className="feature-card" style={{
                  borderColor: isApproved ? 'var(--signal-merged)' : undefined,
                  background: isApproved ? 'var(--signal-merged-bg)' : undefined,
                  opacity: isApproved ? 0.85 : 1,
                  transition: 'all 200ms ease',
                }}>
                  <div className="col" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="mono-sm" style={{ color: 'var(--ink-faint)' }}>{f.id}</span>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{f.title}</span>
                      <span className="mono-sm" style={{
                        color: f.confidence === 'high' ? 'var(--signal-merged)' : 'var(--signal-pr)',
                        background: f.confidence === 'high' ? 'var(--signal-merged-bg)' : 'var(--signal-pr-bg)',
                        padding: '1px 6px', borderRadius: 3, fontSize: 9.5,
                      }}>
                        {f.confidence}
                      </span>
                    </div>
                    <div className="t-sm t-mute" style={{ lineHeight: 1.5 }}>{f.rationale}</div>
                    {f.deps.length > 0 && (
                      <div className="deps">
                        <span style={{ color: 'var(--ink-faint)' }}>depends on</span>
                        {f.deps.map(d => <span key={d} className="dep-chip">{d}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
                    <button
                      className={`btn sm ${isApproved ? '' : 'primary'}`}
                      onClick={() => toggle(f.id)}
                    >
                      {isApproved ? (<><Icon name="check" className="glyph sm" /> Approved</>) : 'Approve'}
                    </button>
                    <button className="btn ghost sm">Edit</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20, padding: '14px 16px', border: '1px dashed var(--line-strong)', borderRadius: 'var(--radius-lg)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Icon name="sparkle" className="glyph" style={{ color: 'var(--accent)', marginTop: 2 }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>One question before you approve</div>
              <div className="t-mute" style={{ lineHeight: 1.5 }}>
                The doc mentions a <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>"hub-wide sidekick"</strong> as future scope.
                I scoped pf-2 to per-project. Architecture allows the hub-wide variant later — confirming that's the intent for v1.
              </div>
            </div>
            <button className="btn sm">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Intake });
