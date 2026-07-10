// Sidekick — persistent right-side chat panel.
// Quiet companion. Project-scoped. Proposes; never enforces.

const SK_INTRO = [
  { from: 'sidekick', kind: 'text', text: "Morning. I've been reading overnight changes — one thing worth your attention." },
  { from: 'sidekick', kind: 'proposal', proposal: {
    head: 'Suggested dependency',
    body: 'I think t-7 (human_approval gate) should depend on t-5 (knowledge category wiring) — t-7 reads scope from there. Want me to add the edge?',
    onApprove: 'add-dep',
  } },
];

const SK_SUGGESTIONS_BASE = [
  "What can I work on right now?",
  "Where would PR-state caching live?",
  "Anything blocked on me?",
  "Show parallel work for the kanban feature",
];

const SK_RESPONSES = {
  "what can i work on right now?": [
    { from: 'sidekick', kind: 'text', text: "Three available tasks, none of them blocked on you:" },
    { from: 'sidekick', kind: 'list', items: [
      { id: 't-3', title: 'Persist approved features → Prisma', why: 'Continues your intake thread; t-2 lands today.' },
      { id: 't-6', title: 'Streaming chat surface (web)', why: 'You flagged sidekick help-wanted; this is the one that benefits most.' },
      { id: 't-9', title: 'create-task + add-backlog capabilities', why: 'John\'s opened the parent PR; this is the parallel pickup.' },
    ] },
    { from: 'sidekick', kind: 'text', text: "I'd lean t-3 — keeps the intake flow contiguous. Worth a look?" },
  ],
  "where would pr-state caching live?": [
    { from: 'sidekick', kind: 'text', text: "Looking at the data model — `Task.status` already mirrors PR state, so caching is more 'coalescence' than 'cache'." },
    { from: 'sidekick', kind: 'text', text: "Two reasonable homes:" },
    { from: 'sidekick', kind: 'list', items: [
      { id: 'a', title: 'lib/github/sync.ts', why: 'Sits next to webhook handler. Easy to test in isolation.' },
      { id: 'b', title: 'workflows/pr-merged/reconcile.ts', why: 'Already triggered on the right events. Lower indirection.' },
    ] },
    { from: 'sidekick', kind: 'text', text: "If it stays simple, (b). If you expect rate-limit gymnastics, (a)." },
  ],
  "anything blocked on me?": [
    { from: 'sidekick', kind: 'text', text: "Two things, but only one is acute:" },
    { from: 'sidekick', kind: 'list', items: [
      { id: 'b1', title: 'hub#58 — Feature-list draft renderer', why: 'Ada flagged a question on the diff format yesterday at 18:42. Quick reply unblocks her review.' },
      { id: 'b2', title: 'Mark on f-shell', why: "Waiting on Sunrise auth refactor (sunrise#284). Not yours to unblock — just visibility." },
    ] },
  ],
  "show parallel work for the kanban feature": [
    { from: 'sidekick', kind: 'text', text: "f-kanban currently has t-11 in PR. Two safe parallel pickups:" },
    { from: 'sidekick', kind: 'list', items: [
      { id: 't-12', title: 'Collision warning surface', why: 'Touches components/kanban/collision.tsx — disjoint files from t-11.' },
      { id: 't-13', title: 'Help-wanted toggle on feature card', why: 'Touches feature-card.tsx — also disjoint.' },
    ] },
    { from: 'sidekick', kind: 'text', text: "Both depend on t-11 merging, but the work itself parallels cleanly. Mark probably wants to keep t-12; t-13 is a fair pickup." },
  ],
};

const Sidekick = ({ project, people, currentUserId, onAction, onOpenTask, contextTask }) => {
  React.useEffect(() => {
    const onAsk = (e) => {
      const task = e.detail.task;
      const userMsg = { from: 'user', kind: 'task-context', task };
      const reply = [
        { from: 'sidekick', kind: 'text', text: `Looking at ${task.id} — ${task.title.toLowerCase()}.` },
        { from: 'sidekick', kind: 'text', text: task.status === 'available'
          ? `Files are disjoint from currently-claimed work, no collisions. Estimated 1–2 hours. Want me to walk through the approach?`
          : task.status === 'in-pr'
          ? `PR is open. Worth flagging: Ada has a question on the diff format that's been sitting since 18:42 yesterday.`
          : `What would you like to know about it?` },
      ];
      setMessages(m => [...m, userMsg]);
      setTimeout(() => reply.forEach((r, i) => setTimeout(() => setMessages(m => [...m, r]), 350 + i * 400)), 200);
    };
    window.addEventListener('sk-ask', onAsk);
    return () => window.removeEventListener('sk-ask', onAsk);
  }, []);
  const [messages, setMessages] = React.useState(SK_INTRO);
  const [draft, setDraft] = React.useState('');
  const streamRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages]);

  const send = (text) => {
    if (!text.trim()) return;
    const userMsg = { from: 'user', kind: 'text', text };
    const reply = SK_RESPONSES[text.toLowerCase().trim()] || [
      { from: 'sidekick', kind: 'text', text: "Mm — let me think on that. (Demo: try one of the chips below for a fully-rendered response.)" }
    ];
    setMessages(m => [...m, userMsg]);
    setDraft('');
    setTimeout(() => {
      reply.forEach((r, i) => {
        setTimeout(() => setMessages(m => [...m, r]), 400 + i * 350);
      });
    }, 250);
  };

  const onApprove = (proposal) => {
    setMessages(m => [...m, { from: 'sidekick', kind: 'text', text: '✓ Added dependency t-7 → t-5. Logged for audit.' }]);
  };
  const onDismiss = () => {
    setMessages(m => [...m, { from: 'sidekick', kind: 'text', text: 'No worries — I\'ll let it ride.' }]);
  };

  return (
    <aside className="sidekick">
      <div className="sidekick-head">
        <div className="sidekick-mark">sk</div>
        <div className="col" style={{ gap: 0 }}>
          <div className="sidekick-title">Sidekick</div>
          <div className="sidekick-sub">{project ? `scoped: ${project.name.toLowerCase()}` : 'hub-wide'}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn icon ghost" title="Pop out"><Icon name="panel" className="glyph sm" /></button>
      </div>

      <div className="sidekick-stream" ref={streamRef}>
        {messages.map((msg, i) => {
          if (msg.kind === 'proposal') {
            return (
              <div key={i} className="sk-msg from-sidekick">
                <div className="sk-mini-avatar">sk</div>
                <div style={{ maxWidth: '85%' }}>
                  <div className="sk-bubble">{msg.proposal.body}</div>
                  <div className="sk-proposal">
                    <div className="sk-proposal-head">
                      <Icon name="sparkle" className="glyph sm" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                      {msg.proposal.head} · awaiting approval
                    </div>
                    <div className="mono" style={{ color: 'var(--ink-soft)' }}>
                      <span className="dep-chip">t-7</span>
                      <Icon name="arrow" className="glyph sm" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 6px' }} />
                      <span className="dep-chip">t-5</span>
                    </div>
                    <div className="sk-proposal-actions">
                      <button className="btn primary sm" onClick={() => onApprove(msg.proposal)}>
                        <Icon name="check" className="glyph sm" /> Approve
                      </button>
                      <button className="btn ghost sm" onClick={onDismiss}>
                        <Icon name="x" className="glyph sm" /> Not now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          if (msg.kind === 'list') {
            return (
              <div key={i} className="sk-msg from-sidekick">
                <div className="sk-mini-avatar" style={{ visibility: 'hidden' }}>sk</div>
                <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {msg.items.map((it, j) => (
                    <div key={j}
                      onClick={() => onOpenTask && /^t-/.test(it.id) && onOpenTask(it.id)}
                      style={{
                        background: 'var(--bg-elev)', border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: 12.5,
                        cursor: /^t-/.test(it.id) ? 'pointer' : 'default',
                      }}>
                      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                        <span className="mono-sm" style={{ color: 'var(--ink-faint)' }}>{it.id}</span>
                        <span style={{ fontWeight: 500 }}>{it.title}</span>
                      </div>
                      <div className="t-mute" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{it.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          if (msg.kind === 'task-context') {
            return (
              <div key={i} className="sk-msg from-user">
                <div className="sk-mini-avatar">{people[currentUserId].initials}</div>
                <div style={{ maxWidth: '85%' }}>
                  <div className="sk-bubble" style={{ marginBottom: 4 }}>tell me about this →</div>
                  <div className="ts-sk-pulse" onClick={() => onOpenTask && onOpenTask(msg.task.id)} style={{ cursor: 'pointer' }}>
                    <div className="ts-sk-pulse-mark">{msg.task.id}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 450, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.task.title}</div>
                      <div className="t-xs t-faint mono" style={{ marginTop: 1 }}>{msg.task.featureId} · {msg.task.status}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className={`sk-msg from-${msg.from}`}>
              {msg.from === 'sidekick' && <div className="sk-mini-avatar">sk</div>}
              {msg.from === 'user' && <div className="sk-mini-avatar">{people[currentUserId].initials}</div>}
              <div className="sk-bubble">{msg.text}</div>
            </div>
          );
        })}
      </div>

      <div className="sidekick-input">
        <div className="sk-suggest">
          {SK_SUGGESTIONS_BASE.map(s => (
            <button key={s} className="sk-chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
        <div className="sk-input-row">
          <textarea
            ref={inputRef}
            className="sk-input"
            placeholder="Ask the sidekick…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
          />
          <button className="sk-send" onClick={() => send(draft)} title="Send">
            <Icon name="send" className="glyph sm" style={{ width: 11, height: 11 }} />
          </button>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 0.02 }}>
          <span>also available via MCP from claude code</span>
          <span>haiku-4-5</span>
        </div>
      </div>
    </aside>
  );
};

Object.assign(window, { Sidekick });
