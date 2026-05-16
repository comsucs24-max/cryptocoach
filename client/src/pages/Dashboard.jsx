import { useState, useEffect } from 'react';
import { SESSIONS, PHASES } from '../data/curriculum.js';
import './Dashboard.css';

const TABS = ['Overview', 'Curriculum', 'Mastery', 'Trades', 'Journal', 'Bias', 'AI Review'];

export default function Dashboard({ onNavigate }) {
  const [tab, setTab] = useState('Overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState('');
  const [genReview, setGenReview] = useState(false);

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function generateReview() {
    setGenReview(true);
    setReview('');
    try {
      const res = await fetch('/api/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const { review: r } = await res.json();
      setReview(r || 'No review generated.');
    } catch (e) {
      setReview(`Error: ${e.message}`);
    } finally {
      setGenReview(false);
    }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding: 80 }}><div className="spinner" /></div>;

  const completed = data?.completedSessions || [];
  const scores    = data?.masteryScores || {};
  const trades    = data?.paperTrades || [];
  const journal   = data?.journalEntries || [];
  const streak    = data?.streak || 0;

  const avgScore = completed.length > 0
    ? Math.round(Object.values(scores).reduce((a,b) => a + b, 0) / Math.max(Object.values(scores).length, 1))
    : 0;

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted" style={{ fontSize: 14 }}>Your trading education progress</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('learn')}>
          + Continue Learning
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview'    && <OverviewTab data={data} completed={completed} scores={scores} trades={trades} streak={streak} avgScore={avgScore} onNavigate={onNavigate} />}
      {tab === 'Curriculum'  && <CurriculumTab completed={completed} scores={scores} onNavigate={onNavigate} />}
      {tab === 'Mastery'     && <MasteryTab completed={completed} scores={scores} />}
      {tab === 'Trades'      && <TradesTab trades={trades} />}
      {tab === 'Journal'     && <JournalTab journal={journal} />}
      {tab === 'Bias'        && <BiasTab data={data} journal={journal} />}
      {tab === 'AI Review'   && <ReviewTab review={review} loading={genReview} onGenerate={generateReview} />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ completed, scores, trades, streak, avgScore, onNavigate }) {
  const pct = Math.round((completed.length / 49) * 100);
  const nextSession = SESSIONS.find(s => !completed.includes(s.id)) || SESSIONS[48];
  const ph = PHASES.find(p => p.id === nextSession.phase);

  return (
    <div className="overview-grid">
      <div className="card overview-main">
        <div className="ov-title">Overall Progress</div>
        <div className="ov-big mono">{pct}%</div>
        <div className="big-bar">
          <div className="big-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="ov-sub muted">{completed.length} of 49 sessions complete</div>
      </div>

      <div className="stat-mini card">
        <div className="stat-mini-val green mono">{streak}</div>
        <div className="stat-mini-label">Day Streak</div>
        <div className="dim" style={{ fontSize: 20 }}>🔥</div>
      </div>

      <div className="stat-mini card">
        <div className="stat-mini-val blue mono">{avgScore}%</div>
        <div className="stat-mini-label">Avg Mastery</div>
      </div>

      <div className="stat-mini card">
        <div className="stat-mini-val mono">{trades.length}</div>
        <div className="stat-mini-label">Paper Trades</div>
      </div>

      <div className="card next-session" onClick={() => onNavigate('learn', nextSession.id)}>
        <div className="ns-label">Up Next →</div>
        <div className="ns-title">S{nextSession.id}: {nextSession.title}</div>
        <div className="ns-phase" style={{ color: ph?.color }}>Phase {nextSession.phase}: {ph?.name}</div>
        <div className="ns-desc muted">{nextSession.desc.slice(0, 100)}...</div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
          Start Session
        </button>
      </div>

      <div className="card phase-summary">
        <div className="ov-title">Phase Progress</div>
        <div className="phase-bars">
          {PHASES.map(ph => {
            const total = SESSIONS.filter(s => s.phase === ph.id).length;
            const done  = SESSIONS.filter(s => s.phase === ph.id && completed.includes(s.id)).length;
            return (
              <div key={ph.id} className="phase-row">
                <div className="phase-row-name">{ph.name}</div>
                <div className="phase-row-bar">
                  <div className="phase-row-fill" style={{ width: `${(done/total)*100}%`, background: ph.color }} />
                </div>
                <div className="phase-row-count dim mono">{done}/{total}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Curriculum ───────────────────────────────────────────────────────────────

function CurriculumTab({ completed, scores, onNavigate }) {
  return (
    <div className="curriculum-wrap">
      {PHASES.map(ph => (
        <div key={ph.id} className="ph-section">
          <div className="ph-section-header">
            <div className="ph-dot" style={{ background: ph.color }} />
            <h3 style={{ color: ph.color }}>Phase {ph.id}: {ph.name}</h3>
            <span className="dim" style={{ fontSize: 12, marginLeft: 8 }}>
              {SESSIONS.filter(s => s.phase === ph.id && completed.includes(s.id)).length}/
              {SESSIONS.filter(s => s.phase === ph.id).length}
            </span>
          </div>
          <div className="ph-sessions">
            {SESSIONS.filter(s => s.phase === ph.id).map(s => {
              const done = completed.includes(s.id);
              const score = scores[s.id];
              return (
                <div key={s.id} className={`ph-session ${done ? 'done' : ''}`} onClick={() => onNavigate('learn', s.id)}>
                  <div className="phs-top">
                    <span className="phs-num mono" style={{ color: ph.color }}>S{s.id}</span>
                    {done && <span className="badge badge-green" style={{ fontSize: 10 }}>✓</span>}
                    {score !== undefined && <span className="mono dim" style={{ fontSize: 11, marginLeft: 'auto' }}>{score}%</span>}
                  </div>
                  <div className="phs-title">{s.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mastery ───────────────────────────────────────────────────────────────────

function MasteryTab({ completed, scores }) {
  const scored = SESSIONS.filter(s => scores[s.id] !== undefined);
  if (scored.length === 0) {
    return <EmptyState icon="🎯" title="No mastery scores yet" desc="Complete sessions to see your mastery scores here." />;
  }
  return (
    <div className="mastery-list">
      {PHASES.map(ph => {
        const phSessions = scored.filter(s => s.phase === ph.id);
        if (!phSessions.length) return null;
        return (
          <div key={ph.id} className="mastery-phase">
            <h4 style={{ color: ph.color, marginBottom: 12 }}>{ph.name}</h4>
            {phSessions.map(s => {
              const score = scores[s.id];
              const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';
              return (
                <div key={s.id} className="mastery-row">
                  <span className="mastery-title">S{s.id}: {s.title}</span>
                  <div className="mastery-bar-wrap">
                    <div className="mastery-bar">
                      <div className="mastery-fill" style={{ width: `${score}%`, background: color }} />
                    </div>
                    <span className="mono" style={{ color, fontSize: 13, minWidth: 36, textAlign: 'right' }}>{score}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Trades ────────────────────────────────────────────────────────────────────

function TradesTab({ trades }) {
  if (!trades.length) return <EmptyState icon="📈" title="No paper trades yet" desc="Trade simulations in Learn sessions will appear here." />;
  const wins  = trades.filter(t => (t.pnl || 0) > 0).length;
  const total = trades.length;
  return (
    <div className="trades-wrap">
      <div className="trades-summary card">
        <div style={{ display:'flex', gap: 32 }}>
          <div><div className="mono green" style={{ fontSize: 28 }}>{wins}</div><div className="dim">Wins</div></div>
          <div><div className="mono red" style={{ fontSize: 28 }}>{total - wins}</div><div className="dim">Losses</div></div>
          <div><div className="mono" style={{ fontSize: 28 }}>{total}</div><div className="dim">Total</div></div>
          <div><div className="mono blue" style={{ fontSize: 28 }}>{total > 0 ? Math.round((wins/total)*100) : 0}%</div><div className="dim">Win Rate</div></div>
        </div>
      </div>
      <div className="trades-list">
        {[...trades].reverse().map((t, i) => {
          const pnl = t.pnl || 0;
          return (
            <div key={i} className="trade-row card">
              <div className="tr-left">
                <div className="tr-symbol mono bold">{t.symbol || 'BTCUSDT'}</div>
                <div className="dim" style={{ fontSize: 12 }}>{t.sessionTitle || `Session ${t.sessionId}`}</div>
              </div>
              <div className="tr-right">
                <div className={`mono bold ${pnl >= 0 ? 'green' : 'red'}`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                </div>
                <div className="dim" style={{ fontSize: 11 }}>{new Date(t.ts).toLocaleDateString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Journal ───────────────────────────────────────────────────────────────────

function JournalTab({ journal }) {
  if (!journal.length) return <EmptyState icon="📝" title="No journal entries yet" desc="Reflection prompts after session completion will appear here." />;
  return (
    <div className="journal-list">
      {[...journal].reverse().map((entry, i) => (
        <div key={i} className="journal-entry card">
          <div className="je-header">
            <span className="bold" style={{ fontSize: 14 }}>{entry.sessionTitle || `Session ${entry.sessionId}`}</span>
            <span className="dim" style={{ fontSize: 12 }}>{new Date(entry.ts).toLocaleDateString()}</span>
          </div>
          <p className="je-text">{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

// ── Bias Profile ──────────────────────────────────────────────────────────────

const BIASES = [
  { key: 'fomo',          label: 'FOMO',             desc: 'Fear of missing out on moves', session: 46 },
  { key: 'confirmation',  label: 'Confirmation Bias', desc: 'Seeking info that confirms existing views', session: 46 },
  { key: 'recency',       label: 'Recency Bias',      desc: 'Over-weighting recent events', session: 46 },
  { key: 'disposition',   label: 'Disposition Effect',desc: 'Holding losers, selling winners', session: 47 },
  { key: 'overconfidence',label: 'Overconfidence',    desc: 'Over-estimating skill after wins', session: 48 },
  { key: 'anchoring',     label: 'Anchoring',         desc: 'Over-relying on first price seen', session: 46 },
];

function BiasTab({ data, journal }) {
  const [ratings, setRatings] = useState(data?.biasProfile || {});

  async function save(key, val) {
    const updated = { ...ratings, [key]: val };
    setRatings(updated);
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ biasProfile: updated }),
    });
  }

  return (
    <div className="bias-wrap">
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Rate how much each bias affects your trading decisions (1 = rarely, 5 = frequently).
      </p>
      {BIASES.map(b => {
        const val = ratings[b.key] || 0;
        return (
          <div key={b.key} className="bias-row card">
            <div className="bias-left">
              <div className="bias-name bold">{b.label}</div>
              <div className="dim" style={{ fontSize: 12 }}>{b.desc}</div>
            </div>
            <div className="bias-right">
              <div className="bias-stars">
                {[1,2,3,4,5].map(n => (
                  <button key={n} className={`star-btn ${val >= n ? 'lit' : ''}`} onClick={() => save(b.key, n)}>
                    ★
                  </button>
                ))}
              </div>
              <div className="dim" style={{ fontSize: 11 }}>
                {val > 0 ? ['','Rarely','Occasionally','Sometimes','Often','Frequently'][val] : 'Not rated'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AI Review ─────────────────────────────────────────────────────────────────

function ReviewTab({ review, loading, onGenerate }) {
  return (
    <div className="review-wrap">
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Weekly AI Progress Review</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          Get an AI-generated review of your trading education progress, tailored to your completed sessions,
          mastery scores, and paper trades.
        </p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onGenerate} disabled={loading}>
          {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating...</> : '✨ Generate Review'}
        </button>
      </div>

      {review && (
        <div className="card review-content">
          <pre style={{ fontFamily: 'var(--sans)', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
            {review.replace(/📊 CHART:[^\n]+\n?/, '')}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 14 }}>{desc}</p>
    </div>
  );
}
