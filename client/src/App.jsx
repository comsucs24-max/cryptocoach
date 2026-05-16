import { useState } from 'react';
import Home from './pages/Home.jsx';
import Learn from './pages/Learn.jsx';
import Tutor from './pages/Tutor.jsx';
import Dashboard from './pages/Dashboard.jsx';
import './App.css';

export default function App() {
  const [view, setView] = useState('home');
  const [startSession, setStartSession] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function nav(v, sessionId) {
    setView(v);
    if (sessionId) setStartSession(sessionId);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <button className="logo" onClick={() => nav('home')}>
            <span className="logo-bolt">⚡</span>
            <span className="logo-text">CryptoCoach</span>
          </button>

          <nav className={`nav ${menuOpen ? 'nav-open' : ''}`}>
            {['home','learn','tutor','dashboard'].map(v => (
              <button
                key={v}
                className={`nav-link ${view === v ? 'active' : ''}`}
                onClick={() => nav(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </nav>

          <button className={`hamburger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(m => !m)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
      </header>

      <main className="main">
        {view === 'home'      && <Home onNavigate={nav} />}
        {view === 'learn'     && <Learn sessionId={startSession} onNavigate={nav} />}
        {view === 'tutor'     && <Tutor onNavigate={nav} />}
        {view === 'dashboard' && <Dashboard onNavigate={nav} />}
      </main>
    </div>
  );
}
