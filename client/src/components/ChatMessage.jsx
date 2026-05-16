// Renders a single chat message with light markdown support

const CHART_RE  = /📊 CHART:\s*[^\n]+/g;
const STEP_RE   = /🔢 STEP:\s*\d+/g;

function parseInline(text) {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  return text;
}

function renderContent(raw) {
  // Strip control lines from display
  const cleaned = raw
    .replace(CHART_RE, '')
    .replace(STEP_RE, '')
    .replace(/^\n+/, '')
    .trimEnd();

  const lines = cleaned.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="msg-h4" dangerouslySetInnerHTML={{ __html: parseInline(line.slice(4)) }} />);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="msg-h3" dangerouslySetInnerHTML={{ __html: parseInline(line.slice(3)) }} />);
    } else if (line.startsWith('# ')) {
      elements.push(<h3 key={i} className="msg-h3" dangerouslySetInnerHTML={{ __html: parseInline(line.slice(2)) }} />);
    }
    // HR
    else if (line.match(/^[═─]{3,}$/)) {
      elements.push(<hr key={i} className="msg-hr" />);
    }
    // Bullet
    else if (line.match(/^[•\-\*]\s/)) {
      elements.push(
        <div key={i} className="msg-bullet">
          <span className="bullet-dot">•</span>
          <span dangerouslySetInnerHTML={{ __html: parseInline(line.replace(/^[•\-\*]\s/, '')) }} />
        </div>
      );
    }
    // Numbered list
    else if (line.match(/^\d+[\.\)]\s/)) {
      elements.push(
        <div key={i} className="msg-bullet">
          <span className="bullet-dot mono" style={{ color: 'var(--text3)', fontSize: 12 }}>
            {line.match(/^(\d+)/)[1]}.
          </span>
          <span dangerouslySetInnerHTML={{ __html: parseInline(line.replace(/^\d+[\.\)]\s/, '')) }} />
        </div>
      );
    }
    // Indented option (A/B/C/D)
    else if (line.match(/^[A-D]\)/)) {
      elements.push(
        <div key={i} className="msg-option" dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
      );
    }
    // Special emoji lines
    else if (line.match(/^(🎓|📝|💡|⚠️|✅|❌)/)) {
      elements.push(
        <div key={i} className="msg-highlight" dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
      );
    }
    // Empty line → spacer
    else if (line.trim() === '') {
      if (elements.length > 0) {
        elements.push(<div key={i} style={{ height: '8px' }} />);
      }
    }
    // Default paragraph
    else {
      elements.push(
        <p key={i} className="msg-p" dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
      );
    }

    i++;
  }

  return elements;
}

export default function ChatMessage({ role, content, streaming }) {
  const isAI = role === 'assistant';

  // Extract step number if present
  const stepMatch = content?.match(/🔢 STEP:\s*(\d+)/);
  const step = stepMatch ? parseInt(stepMatch[1]) : null;

  // Extract chart info for display badge
  const chartMatch = content?.match(/📊 CHART:\s*([A-Z]+:[A-Z]+)\s*\|\s*([A-Z0-9]+)/);

  return (
    <div className={`chat-msg ${isAI ? 'ai' : 'user'} fade-in`}>
      {isAI && (
        <div className="msg-meta">
          <div className="msg-avatar">⚡</div>
          <span className="msg-name">CryptoCoach</span>
          {step && (
            <span className="badge badge-blue" style={{ fontSize: 11 }}>
              Step {step}/9
            </span>
          )}
          {chartMatch && (
            <span className="badge badge-green" style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>
              {chartMatch[1]} {chartMatch[2]}
            </span>
          )}
        </div>
      )}

      <div className={`msg-bubble ${isAI ? 'ai-bubble' : 'user-bubble'}`}>
        {isAI ? (
          <div className="msg-content">
            {renderContent(content || '')}
            {streaming && <span className="cursor" />}
          </div>
        ) : (
          <p style={{ margin: 0, lineHeight: 1.6 }}>{content}</p>
        )}
      </div>
    </div>
  );
}
