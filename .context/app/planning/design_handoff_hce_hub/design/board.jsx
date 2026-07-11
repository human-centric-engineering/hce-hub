// Project Board — Kanban with swim lanes by person, status columns within
// Primary surface of the Hub.

const STATUSES = ['available', 'claimed', 'in-pr', 'merged', 'backlog'];
const STATUS_LABELS = {
  'available': 'Available',
  'claimed':   'Claimed',
  'in-pr':     'In PR',
  'merged':    'Merged',
  'backlog':   'Backlog',
};

const TaskCard = ({ task, feature, people, isMine, hasCollision, collisionNote, onSelect }) => {
  const claimer = task.claimedBy ? people[task.claimedBy] : null;
  return (
    <div
      className={`task-card ${isMine ? 'is-mine' : ''} ${hasCollision ? 'has-collision' : ''}`}
      onClick={() => onSelect && onSelect(task)}
    >
      <div className="task-title">{task.title}</div>
      <div className="task-ref">
        <span className="feature-ref" title={feature.title}>{feature.id}</span>
        <span className="seq">·</span>
        <span>{task.id}</span>
      </div>
      <div className="task-meta">
        {claimer && <Avatar user={claimer} size="xs" />}
        {hasCollision && (
          <span className="collision-mark" title={collisionNote}>
            <span className="pulse" />
            collision
          </span>
        )}
        {task.prUrl && <span className="pr">{task.prUrl}</span>}
      </div>
    </div>
  );
};

const SwimLane = ({ user, role, features, tasks, people, collisions, currentUserId, onSelectTask }) => {
  // tasks already filtered to this user; route by effective status (deps-blocked → backlog)
  const byStatus = {};
  STATUSES.forEach(s => byStatus[s] = []);
  tasks.forEach(t => {
    const status = t._effectiveStatus || t.status;
    if (byStatus[status]) byStatus[status].push(t);
  });

  return (
    <div className="swim-lane">
      <div className="swim-lane-head">
        <Avatar user={user} size="lg" />
        <div className="who">
          <div className="who-name">{user.name}</div>
          <div className="who-meta">{role}</div>
          <div className="row" style={{ gap: 4, marginTop: 4 }}>
            {features.map(f => (
              <span key={f.id} className="mono-sm" style={{ color: 'var(--ink-faint)', background: 'var(--bg-tint)', padding: '0 5px', borderRadius: 3, fontSize: 9.5 }} title={f.title}>
                {f.id}
              </span>
            ))}
          </div>
        </div>
      </div>

      {STATUSES.map(status => (
        <div key={status} className="task-col">
          {byStatus[status].length === 0 ? (
            <div className="empty-col">·</div>
          ) : (
            byStatus[status].map(task => {
              const feature = features.find(f => f.id === task.featureId) ||
                              window.HUB_DATA.FEATURES.find(f => f.id === task.featureId);
              const isMine = task.claimedBy === currentUserId;
              const collision = collisions.find(c =>
                c.a.taskId === task.id || c.b.taskId === task.id
              );
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  feature={feature}
                  people={people}
                  isMine={isMine}
                  hasCollision={!!collision}
                  collisionNote={collision ? collision.note : null}
                  onSelect={onSelectTask}
                />
              );
            })
          )}
        </div>
      ))}
    </div>
  );
};

const UnassignedLane = ({ tasks, features, people, currentUserId, onSelectTask, onClaim, helpFeatures }) => {
  // available tasks (no claimer) plus help-wanted opportunities
  const byStatus = {};
  STATUSES.forEach(s => byStatus[s] = []);
  tasks.forEach(t => {
    if (byStatus[t.status]) byStatus[t.status].push(t);
  });

  return (
    <div className="swim-lane" style={{ background: 'linear-gradient(180deg, var(--bg) 0%, var(--bg-sunken) 100%)' }}>
      <div className="swim-lane-head">
        <div className="avatar lg" style={{ background: 'transparent', color: 'var(--ink-mute)', border: '1px dashed var(--line-strong)' }}>
          <Icon name="layers" className="glyph" />
        </div>
        <div className="who">
          <div className="who-name">Unclaimed</div>
          <div className="who-meta">{tasks.length} tasks · pull, don't assign</div>
          {helpFeatures.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <HelpFlag />
            </div>
          )}
        </div>
      </div>

      {STATUSES.map(status => (
        <div key={status} className="task-col">
          {byStatus[status].length === 0 ? (
            <div className="empty-col">·</div>
          ) : (
            byStatus[status].map(task => {
              const feature = features.find(f => f.id === task.featureId);
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  feature={feature}
                  people={people}
                  isMine={false}
                  hasCollision={false}
                  onSelect={onSelectTask}
                />
              );
            })
          )}
        </div>
      ))}
    </div>
  );
};

const ProjectBoard = ({ project, people, features, tasks, collisions, currentUserId, onSelectTask, density }) => {
  // Compute effective status per task — deps-unmet "available" tasks → backlog visually
  const taskById = Object.fromEntries(tasks.map(t => [t.id, t]));
  const effectiveStatus = (t) => {
    if (t.status === 'available') {
      const blocked = (t.deps || []).some(d => taskById[d] && taskById[d].status !== 'merged');
      return blocked ? 'backlog' : 'available';
    }
    return t.status;
  };

  // group ALL tasks by claimer if claimed, else by feature owner
  const memberTasks = {};
  project.members.forEach(m => memberTasks[m] = []);

  tasks.forEach(t => {
    const feature = features.find(f => f.id === t.featureId);
    if (!feature) return;
    const taggedTask = { ...t, _effectiveStatus: effectiveStatus(t) };
    const ownerId = t.claimedBy || feature.owner;
    if (!memberTasks[ownerId]) memberTasks[ownerId] = [];
    memberTasks[ownerId].push(taggedTask);
  });

  // features per member (owned)
  const memberFeatures = {};
  project.members.forEach(m => memberFeatures[m] = features.filter(f => f.owner === m));

  const helpFeatures = features.filter(f => f.helpWanted);

  return (
    <div className={`kanban ${density === 'compact' ? 'density-compact' : ''}`}>
      <div className="kanban-head">
        <div className="kanban-col-label">
          <div className="kanban-col-row"><span>Owner</span></div>
          <span className="sub">grouped by person</span>
        </div>
        <div className="kanban-col-label">
          <div className="kanban-col-row"><span>Available</span><span className="kanban-col-count">{tasks.filter(t => t.status === 'available').length}</span></div>
          <span className="sub">deps met · anyone can claim</span>
        </div>
        <div className="kanban-col-label">
          <div className="kanban-col-row"><span>Claimed</span><span className="kanban-col-count">{tasks.filter(t => t.status === 'claimed').length}</span></div>
          <span className="sub">in progress, no PR yet</span>
        </div>
        <div className="kanban-col-label">
          <div className="kanban-col-row"><span>In PR</span><span className="kanban-col-count">{tasks.filter(t => t.status === 'in-pr').length}</span></div>
          <span className="sub">awaiting review / CI</span>
        </div>
        <div className="kanban-col-label">
          <div className="kanban-col-row"><span>Merged</span><span className="kanban-col-count">{tasks.filter(t => t.status === 'merged').length}</span></div>
          <span className="sub">landed</span>
        </div>
        <div className="kanban-col-label">
          <div className="kanban-col-row"><span>Backlog</span><span className="kanban-col-count">{tasks.filter(t => t.status === 'backlog').length}</span></div>
          <span className="sub">deps unmet or not yet promoted</span>
        </div>
      </div>

      {/* Each member, sorted by activity (most tasks first) */}
      {project.members
        .map(m => ({ m, count: memberTasks[m].length }))
        .sort((a, b) => b.count - a.count)
        .map(({ m }) => (
          <SwimLane
            key={m}
            user={people[m]}
            role={m === project.lead ? 'lead' : 'member'}
            features={memberFeatures[m]}
            tasks={memberTasks[m]}
            people={people}
            collisions={collisions}
            currentUserId={currentUserId}
            onSelectTask={onSelectTask}
          />
        ))}
    </div>
  );
};

Object.assign(window, { ProjectBoard, STATUSES, STATUS_LABELS });
