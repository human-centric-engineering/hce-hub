// Shared primitives — icons, avatars, status pills, status helpers

const Icon = ({ name, className = 'glyph' }) => {
  const paths = {
    home: <><path d="M3 11l6-7 6 7M5 9v7h3v-4h2v4h3V9" /></>,
    folder: <><path d="M2 5a1 1 0 011-1h3l1.5 2H15a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" /></>,
    inbox: <><path d="M2 9l2-5h10l2 5v4a1 1 0 01-1 1H3a1 1 0 01-1-1V9z M2 9h4l1 2h4l1-2h4" /></>,
    sun: <><circle cx="9" cy="9" r="3" /><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3 3l1.5 1.5M13.5 13.5L15 15M3 15l1.5-1.5M13.5 4.5L15 3" /></>,
    spark: <><path d="M9 2l1.5 4 4 1.5-4 1.5L9 13l-1.5-4-4-1.5 4-1.5L9 2z" /></>,
    flow: <><path d="M3 4h7M3 9h10M3 14h5" /></>,
    book: <><path d="M3 3h6a2 2 0 012 2v10a2 2 0 00-2-2H3V3z M15 3H9a2 2 0 00-2 2v10a2 2 0 012-2h6V3z" /></>,
    chat: <><path d="M3 4a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H7l-4 3V4z" /></>,
    chart: <><path d="M3 14V6 M8 14V3 M13 14v-6 M2 14h14" /></>,
    settings: <><circle cx="9" cy="9" r="2.5"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.5 3.5l1.4 1.4M13.1 13.1l1.4 1.4M3.5 14.5l1.4-1.4M13.1 4.9l1.4-1.4"/></>,
    plus: <><path d="M9 3v12M3 9h12" /></>,
    arrow: <><path d="M4 9h10M9 4l5 5-5 5" /></>,
    arrowDown: <><path d="M9 4v10M4 9l5 5 5-5" /></>,
    check: <><path d="M3 9l4 4 7-8" /></>,
    x: <><path d="M4 4l10 10M14 4L4 14" /></>,
    branch: <><circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="14" r="1.5"/><circle cx="13" cy="9" r="1.5"/><path d="M5 5.5v7M5 9c0 0 4 0 8 0"/></>,
    pr: <><circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="14" r="1.5"/><circle cx="13" cy="14" r="1.5"/><path d="M5 5.5v7M13 5l0 7M13 4l-2-2h-3"/></>,
    send: <><path d="M3 9l13-6-5 14-2-6-6-2z" /></>,
    search: <><circle cx="8" cy="8" r="4.5"/><path d="M11.5 11.5L15 15"/></>,
    bell: <><path d="M5 7a4 4 0 018 0v3l1.5 2H3.5L5 10V7z M7 14a2 2 0 004 0"/></>,
    flag: <><path d="M4 2v14M4 3h8l-2 3 2 3H4"/></>,
    slash: <><path d="M11 3L7 15"/></>,
    dot: <><circle cx="9" cy="9" r="1.5" /></>,
    chevron: <><path d="M6 4l5 5-5 5" /></>,
    layers: <><path d="M9 2l7 4-7 4-7-4 7-4z M2 10l7 4 7-4 M2 13l7 4 7-4"/></>,
    lock: <><rect x="4" y="8" width="10" height="7" rx="1"/><path d="M6 8V6a3 3 0 016 0v2"/></>,
    user: <><circle cx="9" cy="6" r="3"/><path d="M3 16c0-3 3-5 6-5s6 2 6 5"/></>,
    eye: <><path d="M1 9s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="9" cy="9" r="2.5"/></>,
    panel: <><rect x="2" y="3" width="14" height="12" rx="1"/><path d="M11 3v12"/></>,
    sparkle: <><path d="M9 2v4M9 12v4M2 9h4M12 9h4M4 4l2.5 2.5M11.5 11.5L14 14M4 14l2.5-2.5M11.5 6.5L14 4"/></>,
    morningSun: <><circle cx="9" cy="11" r="3"/><path d="M9 5v1M14 11h-1M5 11h-1M5.5 7.5l.7.7M12.5 7.5l-.7.7M2 14h14"/></>,
    git: <><circle cx="5" cy="5" r="1.5"/><circle cx="13" cy="9" r="1.5"/><circle cx="5" cy="13" r="1.5"/><path d="M5 6.5v5M6.5 5l5 0M5 11.5L11.5 9"/></>,
  };
  return (
    <svg className={className} viewBox="0 0 18 18">{paths[name] || null}</svg>
  );
};

const Avatar = ({ user, size = 'md' }) => {
  if (!user) return <div className={`avatar ${size}`} style={{ background: 'var(--ink-faint)' }}>?</div>;
  const klass = size === 'lg' ? 'avatar lg' : size === 'xs' ? 'avatar xs' : 'avatar';
  return (
    <div className={klass} style={{ background: user.tone }} title={user.name}>
      {user.initials}
    </div>
  );
};

const StatusPill = ({ status }) => {
  const labels = {
    'merged': 'merged',
    'in-pr': 'in pr',
    'claimed': 'claimed',
    'available': 'available',
    'backlog': 'backlog',
    'blocked': 'blocked',
    'planning': 'planning',
    'in-flight': 'in flight',
    'shipped': 'shipped',
  };
  return (
    <span className={`status-pill status-${status}`}>
      <span className="dot" />
      {labels[status] || status}
    </span>
  );
};

const HelpFlag = () => (
  <span className="help-flag">
    <svg className="glyph sm" viewBox="0 0 18 18" style={{ width: 9, height: 9 }}>
      <path d="M4 2v14M4 3h8l-2 3 2 3H4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </svg>
    help wanted
  </span>
);

const Kbd = ({ children }) => <span className="kbd">{children}</span>;

Object.assign(window, { Icon, Avatar, StatusPill, HelpFlag, Kbd });
