import { useState, useEffect } from 'react';
import { SESSIONS, PHASES } from '../data/curriculum.js';
import './Home.css';

export default function Home({ onNavigate }) {
  const [appData, setAppData] = useState(null);

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setAppData).catch(() => {});
  }, []);

  const completed = appData?.completedSessions?.length || 0;
  const streak    = appData?.streak || 0;
  const trades    = appData?.paperTrades?.length || 0;
  const pct       = Math.round((completed / 49) * 100);

  // Next session to study
  const nextSession = SESSIONS.find(s => !appData?.completedSessions?.includes(s.id)) || SESSIONS[0];
  const nextPhase   = PHASES.find(p => p.id === nextSession.phase);

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge badge badge-green">AI-Powered Trading Education</div>
          <h1 className="hero-title">
            Learn Crypto Trading<br />
            <span className="gradient-text">Like a Professional</span>
          </h1>
          <p className="hero-sub">
            49 structured sessions across 10 phases. Real chart examples. AI-guided 9-step lessons.
            From mindset to mastery — step by step.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate('learn', nextSession.id)}>
              ▶ Continue Learning
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => onNavigate('tutor')}>
              💬 Open Tutor
            </button>
          </div>
        </div>

        <div className="hero-chart">
          <div className="mock-chart">
            <div className="chart-line" />
            {[40,55,45,70,60,80,65,90,75,95,85,100].map((h, i) => (
              <div key={i} className="chart-bar" style={{ height: `${h}%`, opacity: .3 + i * .06 }} />
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-val mono green">{completed}</div>
          <div className="stat-label">Sessions Done</div>
          <div className="stat-sub">of 49 total</div>
        </div>
        <div className="stat-card">
          <div className="stat-val mono blue">{pct}%</div>
          <div className="stat-label">Curriculum</div>
          <div className="stat-prog">
            <div className="prog-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-val mono yellow">{streak}</div>
          <div className="stat-label">Day Streak</div>
          <div className="stat-sub">🔥 Keep it up</div>
        </div>
        <div className="stat-card">
          <div className="stat-val mono">{trades}</div>
          <div className="stat-label">Paper Trades</div>
          <div className="stat-sub">logged</div>
        </div>
      </section>

      {/* Modules */}
      <section className="modules">
        <h2 className="section-title">Learning Modules</h2>
        <div className="module-grid">
          <div className="module-card" onClick={() => onNavigate('learn', nextSession.id)}>
            <div className="module-icon">📚</div>
            <div className="module-body">
              <h3>Structured Learning</h3>
              <p>Follow the 9-step AI teaching sequence. Real historical chart examples, trade simulations, and outcome reveals.</p>
              <div className="module-next">
                <span className="badge badge-blue">Next up</span>
                <span>S{nextSession.id}: {nextSession.title}</span>
              </div>
            </div>
            <div className="module-arrow">→</div>
          </div>

          <div className="module-card" onClick={() => onNavigate('tutor')}>
            <div className="module-icon">🧠</div>
            <div className="module-body">
              <h3>AI Tutor Session</h3>
              <p>Student-led exploration. Share what you see on charts, and your AI coach responds, corrects, and validates.</p>
              <div className="module-next">
                <span className="badge badge-green">Always open</span>
                <span>Any chart, any concept</span>
              </div>
            </div>
            <div className="module-arrow">→</div>
          </div>

          <div className="module-card" onClick={() => onNavigate('dashboard')}>
            <div className="module-icon">📊</div>
            <div className="module-body">
              <h3>Dashboard</h3>
              <p>Track mastery scores, review your paper trades, journal entries, bias profile, and get weekly AI reviews.</p>
              <div className="module-next">
                <span className="badge badge-yellow">{completed} sessions complete</span>
              </div>
            </div>
            <div className="module-arrow">→</div>
          </div>
        </div>
      </section>

      {/* Curriculum preview */}
      <section className="curriculum-preview">
        <div className="curriculum-header">
          <h2 className="section-title">49-Session Curriculum</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('dashboard')}>
            View full curriculum →
          </button>
        </div>
        <div className="phase-grid">
          {PHASES.map(phase => {
            const phaseSessions = SESSIONS.filter(s => s.phase === phase.id);
            const phaseDone = phaseSessions.filter(s => appData?.completedSessions?.includes(s.id)).length;
            return (
              <div key={phase.id} className="phase-card" onClick={() => onNavigate('learn', phaseSessions[0].id)}>
                <div className="phase-dot" style={{ background: phase.color }} />
                <div className="phase-info">
                  <div className="phase-name">{phase.name}</div>
                  <div className="phase-count dim">{phaseDone}/{phaseSessions.length} done</div>
                </div>
                <div className="phase-prog">
                  <div className="phase-fill" style={{ width: `${(phaseDone/phaseSessions.length)*100}%`, background: phase.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
