// Sidebar — Hub navigation. Module-composable shell.

const Sidebar = ({ route, project, projects, people, onNav, onPickProject }) => {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">H</div>
        <div className="col" style={{ gap: 0 }}>
          <div className="brand-name">HCE Hub</div>
          <div className="brand-sub">hub.hce.studio</div>
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-label">Hub</div>
        <button className={`nav-item ${route.kind === 'home' ? 'active' : ''}`} onClick={() => onNav({ kind: 'home' })}>
          <Icon name="home" className="glyph nav-glyph" />
          <span>Home</span>
        </button>
        <button className={`nav-item ${route.kind === 'brief' ? 'active' : ''}`} onClick={() => onNav({ kind: 'brief' })}>
          <Icon name="morningSun" className="glyph nav-glyph" />
          <span>Morning brief</span>
          <span className="nav-meta">07:00</span>
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-label">Modules</div>
        <button
          className={`nav-item ${route.kind === 'projects' || route.kind === 'project' || route.kind === 'intake' ? 'active' : ''}`}
          onClick={() => onNav({ kind: 'projects' })}
        >
          <Icon name="folder" className="glyph nav-glyph" />
          <span>Projects</span>
          <span className="nav-meta">{projects.length}</span>
        </button>
        <button className="nav-item future" disabled>
          <Icon name="chart" className="glyph nav-glyph" />
          <span>Sales</span>
          <span className="nav-meta">soon</span>
        </button>
        <button className="nav-item future" disabled>
          <Icon name="chat" className="glyph nav-glyph" />
          <span>Support</span>
          <span className="nav-meta">soon</span>
        </button>
        <button className="nav-item future" disabled>
          <Icon name="book" className="glyph nav-glyph" />
          <span>Knowledge</span>
          <span className="nav-meta">soon</span>
        </button>
      </div>

      {(route.kind === 'project' || route.kind === 'intake') && project && (
        <div className="nav-section">
          <div className="nav-label">{project.name}</div>
          <button className={`nav-item ${route.kind === 'project' ? 'active' : ''}`} onClick={() => onNav({ kind: 'project', id: project.id })}>
            <Icon name="layers" className="glyph nav-glyph" />
            <span>Board</span>
          </button>
          <button className={`nav-item ${route.kind === 'intake' ? 'active' : ''}`} onClick={() => onNav({ kind: 'intake', id: project.id })}>
            <Icon name="inbox" className="glyph nav-glyph" />
            <span>Intake</span>
          </button>
          <button className="nav-item">
            <Icon name="git" className="glyph nav-glyph" />
            <span>Activity</span>
          </button>
          <button className="nav-item">
            <Icon name="book" className="glyph nav-glyph" />
            <span>Knowledge base</span>
          </button>

          <div style={{ marginTop: 12, padding: '8px 8px 0', borderTop: '1px solid var(--line)' }}>
            <div className="nav-label" style={{ paddingLeft: 0, marginBottom: 4 }}>Members</div>
            <div className="row" style={{ gap: 4, padding: '0 0 4px', flexWrap: 'wrap' }}>
              {project.members.map(id => (
                <Avatar key={id} user={people[id]} size="xs" />
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div className="nav-section" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <button className="nav-item">
          <Avatar user={people.simon} size="xs" />
          <span style={{ marginLeft: 4 }}>{people.simon.name}</span>
        </button>
        <button className="nav-item">
          <Icon name="settings" className="glyph nav-glyph" />
          <span>Admin</span>
        </button>
      </div>
    </aside>
  );
};

const Topbar = ({ crumbs, actions }) => (
  <div className="topbar">
    <div className="crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="slash" className="glyph sm crumb-sep" />}
          <span className={i === crumbs.length - 1 ? 'crumb-current' : 'crumb'} onClick={c.onClick}>
            {c.label}
          </span>
        </React.Fragment>
      ))}
    </div>
    <div className="topbar-spacer" />
    <button className="cmdk-trigger">
      <Icon name="search" className="glyph sm" />
      <span>Ask the sidekick or jump to…</span>
      <span className="kbd">⌘K</span>
    </button>
    {actions}
  </div>
);

Object.assign(window, { Sidebar, Topbar });
