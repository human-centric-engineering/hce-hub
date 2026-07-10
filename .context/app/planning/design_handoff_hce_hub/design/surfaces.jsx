// Morning brief — thoughtful colleague's note.
// Reads like prose, not a status report.

const Brief = ({ project, people, currentUserId, onOpenTask }) => {
  const me = people[currentUserId];
  const today = new Date(2026, 4, 7);
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="brief">
      <div className="brief-header">
        <div className="brief-date">{dateStr.toUpperCase()} · MORNING BRIEF</div>
        <h1 className="brief-greeting">Morning, {me.name.split(' ')[0]}.</h1>
        <div className="brief-tagline">Quiet overnight. Three things worth your attention.</div>
      </div>

      <div className="brief-section">
        <h3>Overnight <span className="ct">— since 18:30 yesterday</span></h3>
        <div className="brief-prose">
          <p style={{ margin: '0 0 12px 0' }}>
            <span className="name">John</span> merged <code>hub#56</code> at 08:42 — the data-model
            migrations are in. That unblocks <span className="name">Mark</span> on the kanban
            scaffold and clears your runway on intake persistence.
          </p>
          <p style={{ margin: 0 }}>
            <span className="name">Ada</span> left a question on <code>hub#58</code> last night
            about the diff format — she's not blocked, but a quick reply would let her review
            this morning instead of catching you at standup.
          </p>
        </div>
      </div>

      <div className="brief-section">
        <h3>What you might pull <span className="ct">— in your features, unblocked</span></h3>
        <ul className="brief-list">
          <li onClick={() => onOpenTask && onOpenTask('t-3')}>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', minWidth: 32 }}>t-3</span>
            <span style={{ flex: 1 }}>Persist approved features → Prisma</span>
            <span className="t-xs t-faint mono">f-intake</span>
            <StatusPill status="available" />
          </li>
          <li onClick={() => onOpenTask && onOpenTask('t-6')}>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', minWidth: 32 }}>t-6</span>
            <span style={{ flex: 1 }}>Streaming chat surface (web)</span>
            <span className="t-xs t-faint mono">f-sidekick</span>
            <HelpFlag />
          </li>
        </ul>
        <div className="brief-prose" style={{ marginTop: 10, fontSize: 14 }}>
          <p style={{ margin: 0 }} className="t-mute">
            t-3 keeps your intake thread contiguous. t-6 is on a help-wanted feature you flagged —
            no pressure to take it.
          </p>
        </div>
      </div>

      <div className="brief-section">
        <h3>Soft collisions <span className="ct">— ambient, not blocking</span></h3>
        <div className="brief-prose">
          <p style={{ margin: 0 }}>
            You're claimed on <code>agents/sidekick.ts</code>. <span className="clay">t-6</span> (unclaimed) touches{' '}
            <code>components/sidekick/panel.tsx</code> — adjacent, probably fine. Worth a heads-up
            to whoever pulls it.
          </p>
        </div>
      </div>

      <div className="brief-section">
        <h3>Across the studio <span className="ct">— other projects, briefly</span></h3>
        <div className="brief-prose">
          <p style={{ margin: 0 }}>
            <span className="name">Wayframer</span> shipped its booking-flow PR yesterday evening; John's
            picking up the calendar sync next. Nothing on your plate there.{' '}
            <span className="name">Sunrise</span> is mid-refactor on auth — that's the upstream blocker
            on <code>f-shell</code>.
          </p>
        </div>
      </div>

      <div style={{
        marginTop: 36, padding: '16px 20px',
        background: 'var(--bg-tint)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div className="sidekick-mark">sk</div>
        <div className="col" style={{ gap: 2, flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5 }}>Want to plan the day?</div>
          <div className="t-sm t-mute">Open a sidekick session — it has the full picture.</div>
        </div>
        <button className="btn">
          <Icon name="chat" className="glyph sm" />
          Open chat
        </button>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: 0.04 }}>
        delivered 07:00 · also in your inbox · <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>tone or frequency feels off?</span>
      </div>
    </div>
  );
};

// Projects list — Hub home / projects index

const ProjectsList = ({ projects, people, currentUserId, onPickProject }) => {
  return (
    <div className="page">
      <div className="page-header">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="h1">Projects</h1>
            <div className="page-sub">{projects.length} projects you're a member of. Pick one to plan in.</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn"><Icon name="search" className="glyph sm" /> Filter</button>
            <button className="btn primary"><Icon name="plus" className="glyph sm" /> New project</button>
          </div>
        </div>
      </div>

      <div className="project-grid">
        {projects.map(p => {
          const lead = people[p.lead];
          const sparkValues = Array.from({ length: 14 }, (_, i) => 0.2 + Math.random() * (i / 14 + 0.3));
          return (
            <div key={p.id} className="project-card" onClick={() => onPickProject(p.id)}>
              <div className="project-card-head">
                <div className="col" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: -0.015 }}>{p.name}</span>
                    {p.id === 'hub' && <span className="help-flag" style={{ background: 'var(--bg-tint)', color: 'var(--ink-mute)', borderColor: 'var(--line)' }}>active build</span>}
                  </div>
                  <span className="project-platform-tag">{p.hostPlatform}</span>
                </div>
                <Avatar user={lead} />
              </div>
              <div className="t-sm t-mute" style={{ lineHeight: 1.5 }}>{p.description}</div>
              <div style={{ flex: 1 }} />
              <div className="project-stat-row">
                <div className="row" style={{ gap: 4 }}>
                  <span className="stat-num">{p.activity}</span>
                  <span>events</span>
                </div>
                <div className="spark" style={{ marginLeft: 'auto' }}>
                  {sparkValues.map((v, i) => (
                    <span key={i} style={{ height: `${v * 100}%`, background: i > 10 ? 'var(--accent)' : 'var(--ink-mute)' }} />
                  ))}
                </div>
                <div className="row" style={{ gap: -2 }}>
                  <div className="avatar-stack">
                    {p.members.slice(0, 3).map(m => <Avatar key={m} user={people[m]} size="xs" />)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div
          className="project-card"
          style={{
            border: '1px dashed var(--line-strong)',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-mute)',
            minHeight: 180,
            cursor: 'pointer',
          }}
        >
          <div className="col" style={{ alignItems: 'center', gap: 8 }}>
            <Icon name="plus" className="glyph lg" />
            <span className="t-sm">New project</span>
            <span className="mono-sm t-faint">requirements doc → intake → board</span>
          </div>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 28 }}>
        <span className="label">Across the studio</span>
        <span className="h2">Recent activity</span>
        <div className="spacer" />
      </div>

      <div className="card" style={{ padding: 4 }}>
        {window.HUB_DATA.ACTIVITY.map((a, i) => {
          const who = a.who === 'sidekick' ? null : people[a.who];
          return (
            <div key={i} className="row" style={{
              padding: '10px 14px',
              borderBottom: i < window.HUB_DATA.ACTIVITY.length - 1 ? '1px solid var(--line-soft)' : 'none',
              gap: 10,
            }}>
              <span className="mono-sm" style={{ width: 40, color: 'var(--ink-faint)' }}>{a.ts}</span>
              {who ? <Avatar user={who} size="xs" /> : (
                <div className="sidekick-mark" style={{ width: 18, height: 18, fontSize: 8 }}>sk</div>
              )}
              <span style={{ fontSize: 13, flex: 1 }}>{a.text}</span>
              <span className="mono-sm" style={{ color: 'var(--ink-faint)' }}>{a.kind}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { Brief, ProjectsList });
