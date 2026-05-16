import { useState, useRef, useEffect } from 'react';
import ChatMessage from '../components/ChatMessage.jsx';
import TradingViewChart from '../components/TradingViewChart.jsx';
import './Tutor.css';

const CHART_RE = /📊 CHART:\s*([A-Z]+:[A-Z]+)\s*\|\s*([A-Z0-9]+)/;

async function streamChat(messages, onChunk) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, mode: 'tutor' }),
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

const QUICK_PROMPTS = [
  "I'm looking at BTC on the 4-hour chart. What's your take?",
  "I see a potential double top forming on ETH",
  "The RSI looks oversold on the daily",
  "There's a big wick rejection at resistance",
  "Volume is decreasing on this uptrend",
  "I think this is a bull trap setup",
];

export default function Tutor({ onNavigate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [chartSymbol, setChartSymbol] = useState('BINANCE:BTCUSDT');
  const [chartInterval, setChartInterval] = useState('D');
  const [started, setStarted] = useState(false);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  function applyControls(text) {
    const cm = text.match(CHART_RE);
    if (cm) { setChartSymbol(cm[1]); setChartInterval(cm[2]); }
  }

  async function send(override) {
    const text = (override || input).trim();
    if (!text || busy) return;
    setInput('');
    setStarted(true);
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

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="tutor-layout">
      {/* Left: Chat */}
      <div className="chat-panel">
        <div className="tutor-header">
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('home')}>← Home</button>
          <div className="tutor-status">
            <div className="status-dot active" />
            <span>Tutor Mode — You lead, I follow</span>
          </div>
        </div>

        <div className="chat-scroll">
          {!started && (
            <div className="tutor-welcome fade-in">
              <div className="welcome-icon">🧠</div>
              <h3>Tutor Mode</h3>
              <p>
                Share what you're observing on the chart. Your AI coach will respond to your analysis,
                validate insights, correct mistakes, and deepen your understanding.
              </p>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                <strong>You lead.</strong> The coach never volunteers information — only responds to what you share.
              </p>
              <div className="quick-prompts">
                <p className="dim" style={{ fontSize: 12, marginBottom: 8 }}>Quick starters:</p>
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} className="quick-btn" onClick={() => send(p)}>{p}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
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

        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={busy ? 'AI is thinking...' : 'Share what you observe on the chart...'}
            disabled={busy}
            rows={1}
          />
          <button className="send-btn" onClick={() => send()} disabled={busy || !input.trim()}>
            ↑
          </button>
        </div>
      </div>

      {/* Right: Chart */}
      <div className="chart-side">
        <div className="chart-label">
          <span className="mono green" style={{ fontSize: 13 }}>{chartSymbol}</span>
          <span className="mono muted" style={{ fontSize: 12 }}> · {chartInterval}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {['1','5','15','60','240','D','W'].map(tf => (
              <button
                key={tf}
                className={`tf-btn ${chartInterval === tf ? 'active' : ''}`}
                onClick={() => setChartInterval(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-wrapper">
          <TradingViewChart key={`${chartSymbol}|${chartInterval}`} symbol={chartSymbol} interval={chartInterval} />
        </div>
      </div>
    </div>
  );
}
