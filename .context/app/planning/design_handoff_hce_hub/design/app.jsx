// HCE Hub — main app. Routes between surfaces, orchestrates state.

const { PEOPLE, PROJECTS, FEATURES, TASKS, COLLISIONS, ACTIVITY } = window.HUB_DATA;
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "warm",
  "density": "comfortable",
  "showSidekick": true,
  "showCollisions": true,
  "currentUserId": "simon"
} /*EDITMODE-END*/;

const App = () => {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ kind: 'project', id: 'hub', view: 'plan' });
  const [taskHashId, setTaskHash] = window.useHashTask();
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && taskHashId) setTaskHash(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [taskHashId]);

  const currentUserId = t.currentUserId;

  const project = route.kind === 'project' || route.kind === 'intake' ?
  PROJECTS.find((p) => p.id === route.id) :
  null;

  // Apply theme
  React.useEffect(() => {
    document.body.className = t.theme === 'dim' ? 'theme-dim' : '';
  }, [t.theme]);

  const showSidekick = t.showSidekick && (route.kind === 'project' || route.kind === 'intake' || route.kind === 'home');
  const visibleCollisions = t.showCollisions ? COLLISIONS : [];

  const crumbs = (() => {
    if (route.kind === 'home') return [{ label: 'Hub' }];
    if (route.kind === 'projects') return [{ label: 'Hub', onClick: () => setRoute({ kind: 'home' }) }, { label: 'Projects' }];
    if (route.kind === 'project') return [
    { label: 'Hub', onClick: () => setRoute({ kind: 'home' }) },
    { label: 'Projects', onClick: () => setRoute({ kind: 'projects' }) },
    { label: project.name }];

    if (route.kind === 'intake') return [
    { label: 'Hub', onClick: () => setRoute({ kind: 'home' }) },
    { label: 'Projects', onClick: () => setRoute({ kind: 'projects' }) },
    { label: project.name, onClick: () => setRoute({ kind: 'project', id: project.id }) },
    { label: 'Intake' }];

    if (route.kind === 'brief') return [{ label: 'Hub', onClick: () => setRoute({ kind: 'home' }) }, { label: 'Morning brief' }];
    return [];
  })();

  let content;
  if (route.kind === 'home' || route.kind === 'projects') {
    content = <ProjectsList projects={PROJECTS} people={PEOPLE} currentUserId={currentUserId} onPickProject={(id) => setRoute({ kind: 'project', id })} />;
  } else if (route.kind === 'project') {
    const projFeatures = FEATURES; // demo: all features under hub project
    const projTasks = TASKS;
    const view = route.view || 'plan';
    const setView = (v) => setRoute(r => ({ ...r, view: v }));

    content =
    <>
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="h1">{project.name}</h1>
              <div className="row" style={{ gap: 10, marginTop: 4 }}>
                <span className="project-platform-tag">{project.hostPlatform}</span>
                <span className="mono-sm t-faint">{project.repo}</span>
                <span className="t-xs t-mute">·</span>
                <div className="row" style={{ gap: 4 }}>
                  <span className="t-xs t-mute">lead</span>
                  <Avatar user={PEOPLE[project.lead]} size="xs" />
                  <span className="t-xs">{PEOPLE[project.lead].name}</span>
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn"><Icon name="flag" className="glyph sm" />Flag help-wanted</button>
              <button className="btn"><Icon name="inbox" className="glyph sm" />Intake</button>
              <button className="btn primary"><Icon name="plus" className="glyph sm" />Promote task</button>
            </div>
          </div>

          {/* View tabs */}
          <div className="row" style={{ marginTop: 22, gap: 12, alignItems: 'center' }}>
            <div className="view-tabs">
              <button className={`view-tab ${view === 'plan' ? 'active' : ''}`} onClick={() => setView('plan')}>
                <Icon name="layers" className="glyph sm" /> Plan
                <span className="mono-sm t-faint" style={{ fontSize: 10 }}>{projFeatures.length}</span>
              </button>
              <button className={`view-tab ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>
                <Icon name="flow" className="glyph sm" /> Board
                <span className="mono-sm t-faint" style={{ fontSize: 10 }}>{projTasks.length}</span>
              </button>
            </div>
            <span className="t-xs t-faint" style={{ fontStyle: 'italic' }}>
              {view === 'plan' ? 'features in optimal order' : 'tasks in flight, by person'}
            </span>
          </div>
        </div>

        {view === 'plan' ? (
          <PlanView project={project} features={projFeatures} tasks={projTasks} people={PEOPLE} onOpenTask={(id) => setTaskHash(id)} />
        ) : (
          <ProjectBoard
            project={project}
            people={PEOPLE}
            features={projFeatures}
            tasks={projTasks}
            collisions={visibleCollisions}
            currentUserId={currentUserId}
            onSelectTask={(task) => setTaskHash(task.id)}
            density={t.density} />
        )}
      </>;

  } else if (route.kind === 'intake') {
    content = <Intake project={project} people={PEOPLE} />;
  } else if (route.kind === 'brief') {
    content = <Brief project={project} people={PEOPLE} currentUserId={currentUserId} onOpenTask={(id) => setTaskHash(id)} />;
  }

  return (
    <div className={`app-shell ${showSidekick ? 'with-sidekick' : ''}`}>
      <Sidebar
        route={route}
        project={project}
        projects={PROJECTS}
        people={PEOPLE}
        onNav={setRoute} />
      
      <div className="main">
        <Topbar
          crumbs={crumbs}
          actions={
          <div className="row" style={{ gap: 6 }}>
              <button className="btn icon ghost"><Icon name="bell" className="glyph sm" /></button>
              <button className="btn icon ghost" onClick={() => setTweak('showSidekick', !t.showSidekick)} title="Toggle sidekick">
                <Icon name="panel" className="glyph sm" />
              </button>
            </div>
          } />
        
        {content}
      </div>
      {showSidekick && <Sidekick project={project} people={PEOPLE} currentUserId={currentUserId} onOpenTask={(id) => setTaskHash(id)} contextTask={taskHashId ? TASKS.find(t => t.id === taskHashId) : null} />}

      {taskHashId && (
        <TaskSheet
          taskId={taskHashId}
          tasks={TASKS}
          features={FEATURES}
          people={PEOPLE}
          currentUserId={currentUserId}
          onClose={() => setTaskHash(null)}
          onJump={(id, kind) => { if (kind === 'task') setTaskHash(id); else { setTaskHash(null); setRoute({ kind: 'project', id: 'hub' }); } }}
          onAskSidekick={(task) => {
            if (!t.showSidekick) setTweak('showSidekick', true);
            window.dispatchEvent(new CustomEvent('sk-ask', { detail: { task } }));
          }}
        />
      )}

      {/* Tweaks */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Theme">
          <window.TweakRadio label="Mode" value={t.theme} onChange={(v) => setTweak('theme', v)}
          options={[{ value: 'warm', label: 'Warm' }, { value: 'dim', label: 'Dim' }]} />
          <window.TweakRadio label="Density" value={t.density} onChange={(v) => setTweak('density', v)}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </window.TweakSection>
        <window.TweakSection title="Surfaces">
          <window.TweakToggle label="Sidekick panel" value={t.showSidekick} onChange={(v) => setTweak('showSidekick', v)} />
          <window.TweakToggle label="Collision warnings" value={t.showCollisions} onChange={(v) => setTweak('showCollisions', v)} />
        </window.TweakSection>
        <window.TweakSection title="Viewing as">
          <window.TweakSelect label="Current user" value={t.currentUserId} onChange={(v) => setTweak('currentUserId', v)}
          options={Object.values(PEOPLE).map((p) => ({ value: p.id, label: p.name }))} />
        </window.TweakSection>
        <window.TweakSection title="Jump to">
          <window.TweakButton onClick={() => setRoute({ kind: 'home' })}>Hub home</window.TweakButton>
          <window.TweakButton onClick={() => setRoute({ kind: 'project', id: 'hub', view: 'plan' })}>Project · Plan</window.TweakButton>
          <window.TweakButton onClick={() => setRoute({ kind: 'project', id: 'hub', view: 'board' })}>Project · Board</window.TweakButton>
          <window.TweakButton onClick={() => setRoute({ kind: 'intake', id: 'hub' })}>Intake flow</window.TweakButton>
          <window.TweakButton onClick={() => setRoute({ kind: 'brief' })}>Morning brief</window.TweakButton>
        </window.TweakSection>
      </window.TweaksPanel>
    </div>);

};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);