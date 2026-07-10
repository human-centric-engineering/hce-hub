// TaskSheet — side drawer for task detail.
// Opens on click from Plan / Board / Brief / Sidekick.
// Deep-linkable via URL hash: #task=t-3
// Sliding overlay preserves the underlying surface state.

const useHashTask = () => {
  const parse = () => {
    const m = (window.location.hash || '').match(/task=([\w-]+)/);
    return m ? m[1] : null;
  };
  const [taskId, setTaskId] = React.useState(parse());
  React.useEffect(() => {
    const onHash = () => setTaskId(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const open = (id) => {
    if (id) window.location.hash = `task=${id}`;
    else { history.replaceState(null, '', window.location.pathname + window.location.search); setTaskId(null); }
  };
  return [taskId, open];
};

const TaskSheet = ({ taskId, onClose, tasks, features, people, currentUserId, onJump, onAskSidekick }) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const feature = features.find(f => f.id === task.featureId);
  const claimer = task.claimedBy ? people[task.claimedBy] : null;
  const owner = people[feature.owner];
  const blockers = task.deps.map(d => tasks.find(t => t.id === d)).filter(Boolean);
  const dependents = tasks.filter(t => t.deps.includes(task.id));
  const isMine = task.claimedBy === currentUserId;
  const canClaim = !task.claimedBy && task.status === 'available';

  // Mock activity timeline
  const timeline = [
    { ts: 'Mon 10:14', who: feature.owner, kind: 'created', text: `Promoted from ${feature.id} backlog by sidekick · approved by ${owner.name.split(' ')[0]}` },
    ...(task.status === 'merged' || task.status === 'in-pr' || task.status === 'claimed' ? [
      { ts: 'Tue 09:31', who: task.claimedBy || feature.owner, kind: 'claimed', text: `Claimed via Claude Code MCP` },
    ] : []),
    ...(task.status === 'in-pr' || task.status === 'merged' ? [
      { ts: 'Wed 14:08', who: task.claimedBy, kind: 'pr', text: `Opened ${task.prUrl} · 3 files, +127 −12` },
    ] : []),
    ...(task.status === 'merged' ? [
      { ts: 'Thu 08:42', who: task.claimedBy, kind: 'merged', text: `Merged · CI green · dependents notified` },
    ] : []),
  ];

  return (
    <>
      <div className="ts-scrim" onClick={onClose} />
      <aside className="ts-sheet" role="dialog" aria-label={`Task ${task.id}`}>
        <header className="ts-head">
          <div className="ts-head-top">
            <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
              <span className="mono-sm t-faint">{task.id}</span>
              <span className="t-xs t-mute">·</span>
              <button className="ts-feature-link" onClick={() => onJump && onJump(task.featureId)}>
                <span className="mono-sm">{feature.id}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>{feature.title}</span>
              </button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon ghost" title="Copy link" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
                <Icon name="branch" className="glyph sm" />
              </button>
              <button className="btn icon ghost" onClick={onClose} title="Close (Esc)">
                <Icon name="x" className="glyph sm" />
              </button>
            </div>
          </div>
          <h2 className="ts-title">{task.title}</h2>
          <div className="ts-meta-row">
            <StatusPill status={task.status} />
            {claimer ? (
              <div className="row" style={{ gap: 5 }}>
                <Avatar user={claimer} size="xs" />
                <span className="t-sm">{claimer.name}</span>
                {isMine && <span className="t-xs" style={{ color: 'var(--accent)' }}>· you</span>}
              </div>
            ) : (
              <span className="t-sm t-mute">unclaimed</span>
            )}
            {task.prUrl && (
              <a className="ts-pr-link" href="#" onClick={(e) => e.preventDefault()}>
                <Icon name="pr" className="glyph sm" />
                {task.prUrl}
              </a>
            )}
          </div>
          <div className="ts-actions">
            {canClaim && (
              <button className="btn primary"><Icon name="check" className="glyph sm" />Claim</button>
            )}
            {task.status === 'claimed' && isMine && (
              <button className="btn"><Icon name="pr" className="glyph sm" />Open PR</button>
            )}
            {!canClaim && !task.claimedBy && (
              <button className="btn" disabled><Icon name="lock" className="glyph sm" />Blocked by deps</button>
            )}
            <button className="btn"><Icon name="git" className="glyph sm" />Open in Claude Code</button>
            <button className="btn" onClick={() => onAskSidekick && onAskSidekick(task)}><Icon name="chat" className="glyph sm" />Ask sidekick</button>
            <div style={{ flex: 1 }} />
            <button className="btn ghost icon" title="More"><Icon name="dot" className="glyph sm" /></button>
          </div>
        </header>

        <div className="ts-body">
          {/* Description */}
          <section className="ts-section">
            <div className="ts-section-label">What this is</div>
            <div className="ts-prose">
              {task.description || `Implementation slice of ${feature.title.toLowerCase()}. Touches ${task.files?.length || 'a few'} files; should land in one PR.`}
            </div>
          </section>

          {/* Files */}
          {task.files && task.files.length > 0 && (
            <section className="ts-section">
              <div className="ts-section-label">Files in scope <span className="t-faint">· declared, not enforced</span></div>
              <div className="ts-files">
                {task.files.map((f, i) => (
                  <div key={i} className="ts-file-row">
                    <Icon name="folder" className="glyph sm" style={{ color: 'var(--ink-faint)' }} />
                    <span className="mono">{f}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Dependencies */}
          <section className="ts-section">
            <div className="ts-section-label">Dependencies</div>
            <div className="ts-deps-grid">
              <div>
                <div className="t-xs t-faint" style={{ marginBottom: 6 }}>blocked by</div>
                {blockers.length === 0 ? (
                  <div className="t-sm t-faint">none — ready to pull</div>
                ) : blockers.map(b => (
                  <button key={b.id} className="ts-dep-row" onClick={() => onJump && onJump(b.id, 'task')}>
                    <span className="mono-sm t-faint">{b.id}</span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{b.title}</span>
                    <StatusPill status={b.status} />
                  </button>
                ))}
              </div>
              <div>
                <div className="t-xs t-faint" style={{ marginBottom: 6 }}>blocks</div>
                {dependents.length === 0 ? (
                  <div className="t-sm t-faint">nothing waiting</div>
                ) : dependents.map(d => (
                  <button key={d.id} className="ts-dep-row" onClick={() => onJump && onJump(d.id, 'task')}>
                    <span className="mono-sm t-faint">{d.id}</span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{d.title}</span>
                    <StatusPill status={d.status} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="ts-section">
            <div className="ts-section-label">Activity</div>
            <div className="ts-timeline">
              {timeline.map((e, i) => (
                <div key={i} className="ts-event">
                  <div className="ts-event-dot" />
                  <div className="ts-event-body">
                    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                      {e.who === 'sidekick' ? (
                        <div className="sidekick-mark" style={{ width: 16, height: 16, fontSize: 7 }}>sk</div>
                      ) : (
                        <Avatar user={people[e.who]} size="xs" />
                      )}
                      <span className="t-xs t-mute">{people[e.who]?.name.split(' ')[0] || 'sidekick'}</span>
                      <span className="t-xs t-faint mono">{e.ts}</span>
                    </div>
                    <div className="t-sm" style={{ marginTop: 2, color: 'var(--ink-soft)' }}>{e.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Sidekick observations */}
          <section className="ts-section">
            <div className="ts-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="sidekick-mark" style={{ width: 16, height: 16, fontSize: 7 }}>sk</div>
              <span>Sidekick notes</span>
            </div>
            <div className="ts-prose t-sm" style={{ background: 'var(--bg-tint)', padding: 12, borderRadius: 'var(--radius)', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
              {task.status === 'available' && task.id === 't-3' && (
                <>This continues your intake thread directly. <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>t-2</strong> lands the renderer; this persists what comes out. Roughly 90 minutes of work based on similar Prisma slices in Sunrise.</>
              )}
              {task.status === 'available' && task.id !== 't-3' && (
                <>No collisions detected. Files are disjoint from currently-claimed work. Estimated 1–2 hours based on adjacent work.</>
              )}
              {task.status === 'in-pr' && (
                <>PR has been open {task.id === 't-2' ? '14 hours' : '6 hours'}. {task.id === 't-2' ? 'Ada flagged a question yesterday — quick reply unblocks review.' : 'Awaiting review; no blockers.'}</>
              )}
              {task.status === 'claimed' && (
                <>Claimed but no PR yet. {isMine ? 'Want me to draft a PR description from your branch diff?' : 'Last commit 3h ago.'}</>
              )}
              {task.status === 'merged' && (
                <>Landed cleanly. {dependents.length > 0 ? `Unblocked ${dependents.length} dependent task${dependents.length > 1 ? 's' : ''}.` : 'No dependents to notify.'}</>
              )}
              {task.status === 'backlog' && (
                <>Noted but not promoted. Promote with <span className="kbd" style={{ fontSize: 10 }}>P</span> or via the sidekick.</>
              )}
            </div>
          </section>
        </div>

        <footer className="ts-foot">
          <span className="t-xs t-faint mono">↗ link copies as hub.hce.studio/p/hub#task={task.id}</span>
          <span style={{ flex: 1 }} />
          <span className="t-xs t-faint">esc to close</span>
        </footer>
      </aside>
    </>
  );
};

Object.assign(window, { TaskSheet, useHashTask });
