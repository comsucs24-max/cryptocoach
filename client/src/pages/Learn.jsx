import { useState, useEffect, useRef, useCallback } from 'react';
import ChatMessage from '../components/ChatMessage.jsx';
import TradingViewChart from '../components/TradingViewChart.jsx';
import { SESSIONS, PHASES, getSession } from '../data/curriculum.js';
import './Learn.css';

const CHART_RE = /📊 CHART:\s*([A-Z]+:[A-Z]+)\s*\|\s*([A-Z0-9]+)/;
const STEP_RE  = /🔢 STEP:\s*(\d+)/;

async function streamChat(messages, onChunk) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, mode: 'learn' }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() || '';
    for (const line of parts) {
      if (!line.startsWith('data: ')) continue;
      const d = line.slice(6).trim();
      if (d === '[DONE]') continue;
      try {
        const { text, error } = JSON.parse(d);
        if (error) throw new Error(error);
        if (text) { full += text; onChunk(full); }
      } catch {}
    }
  }
  return full;
}

export default function Learn({ sessionId, onNavigate }) {
  const [selectedSession, setSelectedSession] = useState(null);
  const [showPicker, setShowPicker] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [chartSymbol, setChartSymbol] = useState('BINANCE:BTCUSDT');
  const [chartInterval, setChartInterval] = useState('D');
  const [currentStep, setCurrentStep] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [journalText, setJournalText] = useState('');
  const [showJournal, setShowJournal] = useState(false);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  // Auto-start session if sessionId passed from parent
  useEffect(() => {
    if (sessionId) {
      const s = getSession(sessionId);
      if (s) startSession(s);
    }
  }, []);

  function applyControls(text) {
    const cm = text.match(CHART_RE);
    if (cm) { setChartSymbol(cm[1]); setChartInterval(cm[2]); }
    const sm = text.match(STEP_RE);
    if (sm) setCurrentStep(parseInt(sm[1]));
    if (/🎓 SESSION.*COMPLETE/i.test(text)) {
      setSessionDone(true);
      setShowJournal(true);
    }
  }

  async function startSession(session) {
    setSelectedSession(session);
    setShowPicker(false);
    setMessages([]);
    setCurrentStep(0);
    setSessionDone(false);
    setStreamText('');
    setBusy(true);

    const phase = PHASES.find(p => p.id === session.phase);
    const kickoff = [{ role: 'user', content: `Start Session ${session.id}: "${session.title}" (Phase ${session.phase}: ${phase?.name}). Description: ${session.desc}. Begin with Step 1 now.` }];

    try {
      const full = await streamChat(kickoff, t => setStreamText(t));
      const aiMsg = { role: 'assistant', content: full };
      setMessages([...kickoff, aiMsg]);
      setStreamText('');
      applyControls(full);
    } catch (e) {
      setMessages([...kickoff, { role: 'assistant', content: `⚠️ Error: ${e.message}. Please check your API key and try again.` }]);
      setStreamText('');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    textareaRef.current?.focus();

    const newMsgs = [...messages, { role: 'user', content: text }];
    setMessages(newMsgs);
    setBusy(true);
    setStreamText('');

    try {
      const full = await streamChat(newMsgs, t => setStreamText(t));
      setMessages(prev => [...prev, { role: 'assistant', content: full }]);
      setStreamText('');
      applyControls(full);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${e.message}` }]);
      setStreamText('');
    } finally {
      setBusy(false);
    }
  }

  async function saveJournal() {
    if (!selectedSession) return;
    await fetch('/api/complete-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: selectedSession.id,
        score: Math.min(100, currentStep * 11 + 1),
        journalEntry: journalText ? { text: journalText, sessionTitle: selectedSession.title } : null,
      }),
    });
    setShowJournal(false);
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // ── Session Picker ──
  if (showPicker) {
    return <SessionPicker onSelect={startSession} onNavigate={onNavigate} />;
  }

  const session = selectedSession;
  const phase = session ? PHASES.find(p => p.id === session.phase) : null;

  return (
    <div className="learn-layout">
      {/* Left: Chat panel */}
      <div className="chat-panel">
        {/* Session header */}
        <div className="session-header">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPicker(true)}>← Sessions</button>
          {session && (
            <div className="session-info">
              <span className="badge" style={{ background: phase?.color + '22', color: phase?.color }}>
                Phase {session.phase}
              </span>
              <span className="session-title-small">S{session.id}: {session.title}</span>
            </div>
          )}
        </div>

        {/* Step progress */}
        <div className="step-bar">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className={`step-pip ${i + 1 < currentStep ? 'done' : i + 1 === currentStep ? 'active' : ''}`}
            />
          ))}
          <span className="step-label">
            {currentStep > 0 ? `Step ${currentStep}/9` : 'Not started'}
          </span>
        </div>

        {/* Messages */}
        <div className="chat-scroll">
          {messages.filter(m => !(m.role === 'user' && m.content.startsWith('Start Session'))).map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}
          {streamText && <ChatMessage role="assistant" content={streamText} streaming />}
          {busy && !streamText && (
            <div className="thinking">
              <div className="msg-avatar">⚡</div>
              <div className="thinking-dots"><span/><span/><span/></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Journal modal */}
        {showJournal && (
          <div className="journal-overlay">
            <div className="journal-modal card">
              <h3>🎓 Session Complete!</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Add a journal reflection for this session (optional)
              </p>
              <textarea
                className="textarea"
                style={{ marginTop: 12 }}
                rows={4}
                placeholder="What was your key takeaway? How will you apply this?"
                value={journalText}
                onChange={e => setJournalText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={saveJournal}>Save & Complete</button>
                <button className="btn btn-ghost" onClick={() => { setShowJournal(false); saveJournal(); }}>Skip</button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={busy ? 'AI is responding...' : sessionDone ? 'Session complete! Start a new one ↑' : 'Type your answer or observation...'}
            disabled={busy || sessionDone}
            rows={1}
          />
          <button className="send-btn" onClick={send} disabled={busy || !input.trim() || sessionDone}>
            ↑
          </button>
        </div>
      </div>

      {/* Right: Chart panel */}
      <div className="chart-side">
        <div className="chart-label">
          <span className="mono green" style={{ fontSize: 13 }}>{chartSymbol}</span>
          <span className="mono muted" style={{ fontSize: 12 }}> · {chartInterval}</span>
        </div>
        <div className="chart-wrapper">
          <TradingViewChart key={`${chartSymbol}|${chartInterval}`} symbol={chartSymbol} interval={chartInterval} />
        </div>
      </div>
    </div>
  );
}

// ── Session Picker ─────────────────────────────────────────────────────────

function SessionPicker({ onSelect, onNavigate }) {
  const [appData, setAppData] = useState(null);
  const [filter, setFilter] = useState(null);

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setAppData).catch(() => {});
  }, []);

  const displayed = filter !== null
    ? SESSIONS.filter(s => s.phase === filter)
    : SESSIONS;

  return (
    <div className="picker-wrap">
      <div className="picker-header">
        <div>
          <h2>Choose a Session</h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {appData?.completedSessions?.length || 0} of 49 sessions complete
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('home')}>← Home</button>
      </div>

      <div className="picker-phases">
        <button className={`phase-btn ${filter === null ? 'active' : ''}`} onClick={() => setFilter(null)}>
          All
        </button>
        {PHASES.map(ph => (
          <button
            key={ph.id}
            className={`phase-btn ${filter === ph.id ? 'active' : ''}`}
            style={{ '--ph-color': ph.color }}
            onClick={() => setFilter(ph.id)}
          >
            {ph.name}
          </button>
        ))}
      </div>

      <div className="session-grid">
        {displayed.map(session => {
          const done = appData?.completedSessions?.includes(session.id);
          const score = appData?.masteryScores?.[session.id];
          const ph = PHASES.find(p => p.id === session.phase);
          return (
            <div
              key={session.id}
              className={`session-card ${done ? 'done' : ''}`}
              onClick={() => onSelect(session)}
            >
              <div className="sc-top">
                <span className="sc-num mono" style={{ color: ph?.color }}>S{session.id}</span>
                {done && <span className="badge badge-green" style={{ fontSize: 10 }}>✓ Done</span>}
                {score && <span className="sc-score mono">{score}%</span>}
              </div>
              <div className="sc-title">{session.title}</div>
              <div className="sc-desc">{session.desc}</div>
              <div className="sc-phase" style={{ color: ph?.color }}>Phase {session.phase}: {ph?.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
