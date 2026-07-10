// Plan view — feature-level list. Optimal-order topological sort.
// Sibling to the Board. Click a feature with tasks → expand to task list.

const STATUS_ORDER = { 'shipped': 0, 'in-flight': 1, 'planning': 2, 'blocked': 3 };

// Topological sort of features. Within a topological layer, sort by status then title.
const planOrder = (features) => {
  const byId = Object.fromEntries(features.map((f) => [f.id, f]));
  const depth = {};
  const compute = (id, seen = new Set()) => {
    if (depth[id] != null) return depth[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const f = byId[id];
    if (!f || f.deps.length === 0) {depth[id] = 0;return 0;}
    const d = 1 + Math.max(...f.deps.map((dep) => compute(dep, seen)));
    depth[id] = d;
    return d;
  };
  features.forEach((f) => compute(f.id));
  return [...features].sort((a, b) => {
    const sd = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (sd !== 0) return sd;
    return depth[a.id] - depth[b.id];
  });
};

const TaskRow = ({ task, people, isLast, onOpen }) => {
  const claimer = task.claimedBy ? people[task.claimedBy] : null;
  return (
    <div onClick={() => onOpen && onOpen(task.id)} style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr auto auto auto',
      gap: 12,
      alignItems: 'center',
      padding: '8px 16px 8px 28px',
      borderTop: '1px solid var(--line-soft)',
      fontSize: 13,
      cursor: 'pointer',
      transition: 'background 120ms ease'
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tint)'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
      <span className="mono-sm" style={{ color: 'var(--ink-faint)' }}>{task.id}</span>
      <span style={{ color: 'var(--ink-soft)' }}>{task.title}</span>
      {claimer ?
      <div className="row" style={{ gap: 5 }}>
          <Avatar user={claimer} size="xs" />
          <span className="t-xs t-mute">{claimer.name.split(' ')[0]}</span>
        </div> :
      <span className="t-xs t-faint">—</span>}
      {task.prUrl ?
      <span className="mono-sm" style={{ color: 'var(--ink-mute)' }}>{task.prUrl}</span> :
      <span className="t-xs t-faint">—</span>}
      <StatusPill status={task.status} />
    </div>);

};

const FeatureRow = ({ feature, tasks, people, expanded, onToggle, ordinal, onOpenTask }) => {
  const owner = people[feature.owner];
  const fTasks = tasks.filter((t) => t.featureId === feature.id);
  const merged = fTasks.filter((t) => t.status === 'merged').length;
  const inFlight = fTasks.filter((t) => t.status !== 'merged' && t.status !== 'backlog').length;
  const total = fTasks.length;
  const pct = total ? merged / total : 0;
  const hasTasks = total > 0;

  return (
    <div className="feature-card-v2" style={{
      borderColor: feature.status === 'blocked' ? 'var(--signal-blocked)' :
      feature.status === 'shipped' ? 'var(--line-soft)' : 'var(--line)',
      opacity: feature.status === 'shipped' ? 0.78 : 1
    }}>
      <div
        className="feature-row-head"
        onClick={hasTasks ? onToggle : undefined}
        style={{ cursor: hasTasks ? 'pointer' : 'default' }}>
        
        <div className="ord-col">
          <span className="ord-num">{String(ordinal).padStart(2, '0')}</span>
        </div>

        <div className="title-col">
          <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span className="mono-sm t-faint">{feature.id}</span>
            <span className="feature-title">{feature.title}</span>
            {feature.helpWanted && <HelpFlag />}
          </div>
          <div className="t-sm t-mute" style={{ marginTop: 4, lineHeight: 1.45 }}>{feature.description}</div>

          {(feature.deps.length > 0 || feature.blockedReason) &&
          <div className="deps" style={{ marginTop: 8 }}>
              {feature.deps.length > 0 &&
            <>
                  <span style={{ color: 'var(--ink-faint)' }}>depends on</span>
                  {feature.deps.map((d) => <span key={d} className="dep-chip">{d}</span>)}
                </>
            }
              {feature.blockedReason &&
            <span style={{ color: 'var(--signal-blocked)', marginLeft: feature.deps.length > 0 ? 8 : 0 }}>
                  · {feature.blockedReason}
                </span>
            }
            </div>
          }
        </div>

        <div className="owner-col">
          <Avatar user={owner} size="xs" />
          <span className="t-xs t-mute">{owner.name.split(' ')[0]}</span>
        </div>

        <div className="status-col">
          <StatusPill status={feature.status} />
          {hasTasks ?
          <div className="status-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{
                width: `${pct * 100}%`,
                background: feature.status === 'blocked' ? 'var(--signal-blocked)' :
                feature.status === 'shipped' ? 'var(--signal-merged)' : 'var(--ink-soft)'
              }} />
              </div>
              <div className="progress-meta mono-sm">
                {merged}/{total}
                {inFlight > 0 && <span style={{ color: 'var(--signal-pr)' }}> · {inFlight} live</span>}
              </div>
            </div> :

          <div className="status-progress progress-meta mono-sm" style={{ color: 'var(--ink-faint)' }}>
              {feature.status === 'planning' ? 'no tasks yet' : '—'}
            </div>
          }
        </div>

        <div className="expand-col">
          {hasTasks &&
          <Icon name="chevron" className="glyph sm" style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
            color: 'var(--ink-mute)'
          }} />
          }
        </div>
      </div>

      {expanded && hasTasks &&
      <div style={{ background: 'var(--bg-sunken)', borderTop: '1px solid var(--line-soft)' }}>
          <div style={{
          display: 'grid', gridTemplateColumns: '32px 1fr auto auto auto', gap: 12,
          padding: '6px 16px 6px 28px', alignItems: 'center'
        }}>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.08 }}>id</span>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.08 }}>task</span>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.08 }}>claimed by</span>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.08 }}>pr</span>
            <span className="mono-sm" style={{ color: 'var(--ink-faint)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.08 }}>status</span>
          </div>
          {fTasks.map((t, i) =>
        <TaskRow key={t.id} task={t} people={people} isLast={i === fTasks.length - 1} onOpen={onOpenTask} />
        )}
        </div>
      }
    </div>);

};

const PlanView = ({ project, features, tasks, people, onOpenTask }) => {
  const ordered = React.useMemo(() => planOrder(features), [features]);
  const [expanded, setExpanded] = React.useState({ 'f-intake': true }); // open one by default
  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // Aggregate stats
  const counts = {
    shipped: features.filter((f) => f.status === 'shipped').length,
    inFlight: features.filter((f) => f.status === 'in-flight').length,
    planning: features.filter((f) => f.status === 'planning').length,
    blocked: features.filter((f) => f.status === 'blocked').length
  };
  const allTasks = tasks.length;
  const mergedTasks = tasks.filter((t) => t.status === 'merged').length;

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <div className="plan-summary">
        <div className="summary-line">
          <span className="summary-stat"><span className="summary-n">{features.length}</span><span className="summary-l">features</span></span>
          <span className="summary-sep">·</span>
          <span className="summary-stat"><span className="summary-n">{mergedTasks}<span className="t-faint">/{allTasks}</span></span><span className="summary-l">tasks merged</span></span>
          <span className="summary-sep">·</span>
          <span className="summary-stat-pills">
            {counts.shipped > 0 && <span className="stat-pill" data-tone="merged"><span className="stat-pill-n">{counts.shipped}</span> shipped</span>}
            {counts.inFlight > 0 && <span className="stat-pill" data-tone="pr"><span className="stat-pill-n">{counts.inFlight}</span> in flight</span>}
            {counts.planning > 0 && <span className="stat-pill" data-tone="mute"><span className="stat-pill-n">{counts.planning}</span> planning</span>}
            {counts.blocked > 0 && <span className="stat-pill" data-tone="blocked"><span className="stat-pill-n">{counts.blocked}</span> blocked</span>}
          </span>
        </div>
        <div className="summary-hint">
          <Icon name="sparkle" className="glyph sm" style={{ color: 'var(--accent)' }} />
          <span>Sorted by status, then dependency depth — top is most ready to advance.</span>
        </div>
      </div>

      <div className="feature-list-v2">
        {ordered.map((f, i) =>
        <FeatureRow
          key={f.id}
          feature={f}
          tasks={tasks}
          people={people}
          ordinal={i + 1}
          expanded={!!expanded[f.id]}
          onToggle={() => toggle(f.id)}
          onOpenTask={onOpenTask} />

        )}
      </div>
    </div>);

};

Object.assign(window, { PlanView });