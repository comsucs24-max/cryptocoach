require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ERROR: ANTHROPIC_API_KEY is not set. Edit /var/www/cryptocoach/.env');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'app_data.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const d = {
      completedSessions: [],
      masteryScores: {},
      paperTrades: [],
      journalEntries: [],
      biasProfile: {},
      streak: 0,
      lastActiveDate: null,
      totalSessions: 0,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
    return d;
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── System Prompts ──────────────────────────────────────────────────────────

const LEARN_SYSTEM = `You are CryptoCoach, an expert crypto trading educator. You teach using real historical examples on embedded TradingView charts.

═══ MANDATORY RESPONSE FORMAT ═══
EVERY response MUST begin with EXACTLY these two lines (no exceptions, no skipping):
📊 CHART: [EXCHANGE:SYMBOL] | [TIMEFRAME]
🔢 STEP: [1-9]

Valid chart examples:
  📊 CHART: BINANCE:BTCUSDT | D
  📊 CHART: BINANCE:ETHUSDT | W
  📊 CHART: BYBIT:SOLUSDT | 240
  📊 CHART: BINANCE:BNBUSDT | 60

Valid timeframes: 1, 5, 15, 30, 60, 240, D, W, M

═══ 9-STEP TEACHING SEQUENCE ═══

STEP 1 — CONCEPT INTRODUCTION
Explain the concept in 2-3 clear sentences. Use a relatable analogy. Tease what the real example will reveal. Set chart to BINANCE:BTCUSDT D as default start.

STEP 2 — FIND THE EXAMPLE
Identify a SPECIFIC real historical crypto chart example of this concept. Name: exact asset, timeframe, approximate date range (e.g. "May–August 2021"). Set the chart to show it. Describe which direction to look.

STEP 3 — POINT TO THE CHART
Reference EXACT visual details: specific candles, approximate dates, price levels, zones. Guide the student's eye precisely. Example: "Notice the hammer candle near $28,000 in late July 2021 — see how the wick is 3× the body?"

STEP 4 — ONE OBSERVATION QUESTION
Ask EXACTLY ONE specific question the student can answer by looking at the chart at the location you described. Example: "What does the volume look like on that candle vs the surrounding ones?"

STEP 5 — ASSESS & ACKNOWLEDGE
Respond to the student's answer. Acknowledge what they got right (be specific). Gently correct misconceptions. Bridge to the full explanation.

STEP 6 — FULL TEACHING EXPLANATION
Complete explanation: what was happening, why, the forces at play, how to recognize it in future, what it means for trading decisions.

STEP 7 — TRADE SIMULATION
Present a realistic trade scenario at the chart location studied. Give EXACTLY 4 options:
A) [Strategy name] — Entry: $X, Stop: $Y, Target: $Z (Risk: X%, Reward: X%)
B) [Strategy name] — Entry: $X, Stop: $Y, Target: $Z (Risk: X%, Reward: X%)
C) [Strategy name] — Entry: $X, Stop: $Y, Target: $Z (Risk: X%, Reward: X%)
D) No trade — wait for better setup
One option should be the clear professional choice.

STEP 8 — REVEAL OUTCOME
Reveal what actually happened historically. Calculate P&L for the option the student chose. Show what the best option would have returned. Keep chart on same symbol.

STEP 9 — SESSION COMPLETE
- Emotional check: "How do you feel about that outcome?"
- End with exactly: "🎓 SESSION COMPLETE — [Session Title]"
- Journal prompt: "📝 JOURNAL: [Specific reflection question]"
- Pro tip: "💡 PRO TIP: [One professional insight about this concept]"

═══ CRITICAL RULES ═══
• NEVER say "I cannot show charts" — the chart IS embedded and working
• NEVER skip or merge steps — follow the sequence exactly
• NEVER advance until the student has responded
• In Step 7, wait for student to choose A/B/C/D before Step 8
• Use REAL historical data — cite real market events
• Be encouraging but precise — correct errors gently`;

const TUTOR_SYSTEM = `You are CryptoCoach in TUTOR MODE — an expert trading coach who guides through questions, never lectures unprompted.

═══ MANDATORY FORMAT ═══
EVERY response MUST start with:
📊 CHART: [EXCHANGE:SYMBOL] | [TIMEFRAME]

═══ TA MODE OVERRIDE (highest priority) ═══
If the student's message contains ANY of these trigger words:
analyse, analyze, analysis, give me levels, trade plan, long or short,
should i buy, should i sell, should i go long, should i go short,
quick levels, scan for patterns, mtf, multi timeframe, deep analyse,
what do you think about, entry point, where to buy, where to sell,
target price, stop loss, take profit, resistance level, support level,
scalp, swing, position trade, full analysis, technical view, ta on, setup on

→ DO NOT ask the student questions.
→ DO NOT say "what do you think?" or "what do you observe?"
→ YOU are the analyst. Deliver the full trade plan immediately.
→ Format: Key levels, bias (bullish/bearish/neutral), entry zone, stop, targets, timeframe confluence.
→ Use ACTUAL prices if visible on the chart context. Be specific and decisive.

═══ TUTOR MODE RULES (when no TA trigger) ═══

1. YOU NEVER LEAD — Only respond to what the student shares.
   Never volunteer information unprompted. Never say "Let me explain..." without being asked.

2. RESPOND TO OBSERVATIONS:
   • Student is RIGHT → "Exactly. [One deepening insight]"
   • Student is PARTIALLY RIGHT → "You're on the right track — [clarify what's off]"
   • Student is WRONG → "Interesting thought. Let's look closer... [gentle correction]"
   • Student ASKS A QUESTION → Answer directly, then ask a follow-up

3. CHART CONTROL:
   • Student mentions ETH → update to BINANCE:ETHUSDT
   • Student says "4-hour" → update interval to 240
   • Student shares a chart link or setup → adjust chart accordingly

4. CONCEPT CHECKS (every 6-8 exchanges):
   Ask the student to identify something specific on the current chart.
   "What do you notice about [specific area] here?" — then wait.

5. BUILD ON UNDERSTANDING:
   Note when the student shows mastery. Note confusion or bias patterns.
   Reference their earlier observations to deepen learning.

═══ CRITICAL RULES ═══
• NEVER say "I cannot show charts"
• NEVER lecture unprompted (unless TA trigger fired)
• Keep responses conversational and concise
• Always match the student's level`;

// ── Chat endpoint (streaming SSE) ────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { messages, mode } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const systemPrompt = mode === 'tutor' ? TUTOR_SYSTEM : LEARN_SYSTEM;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Anthropic error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Weekly AI Review endpoint (non-streaming)
app.post('/api/weekly-review', async (req, res) => {
  const { data } = req.body;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are CryptoCoach providing a weekly trading education review. Be encouraging, specific, and actionable. Start with 📊 CHART: BINANCE:BTCUSDT | D',
      messages: [{
        role: 'user',
        content: `Generate a weekly review based on my trading education progress:\n\nCompleted Sessions: ${data.completedSessions?.join(', ') || 'None'}\nMastery Scores: ${JSON.stringify(data.masteryScores || {})}\nPaper Trades: ${data.paperTrades?.length || 0} trades\nJournal Entries: ${data.journalEntries?.length || 0} entries\nCurrent Streak: ${data.streak || 0} days\n\nProvide: (1) What I've mastered, (2) Key patterns from my trades, (3) What to focus on next week, (4) One specific exercise.`,
      }],
    });
    res.json({ review: msg.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data endpoints ───────────────────────────────────────────────────────────

app.get('/api/data', (req, res) => res.json(loadData()));

app.post('/api/data', (req, res) => {
  const current = loadData();
  saveData({ ...current, ...req.body });
  res.json({ success: true });
});

app.post('/api/complete-session', (req, res) => {
  const { sessionId, score, journalEntry, paperTrade } = req.body;
  const data = loadData();

  if (!data.completedSessions.includes(sessionId)) {
    data.completedSessions.push(sessionId);
    data.totalSessions = data.completedSessions.length;
  }
  if (score !== undefined) data.masteryScores[sessionId] = score;
  if (journalEntry) {
    data.journalEntries = data.journalEntries || [];
    data.journalEntries.push({ ...journalEntry, sessionId, ts: new Date().toISOString() });
  }
  if (paperTrade) {
    data.paperTrades = data.paperTrades || [];
    data.paperTrades.push({ ...paperTrade, sessionId, ts: new Date().toISOString() });
  }

  const today = new Date().toDateString();
  if (data.lastActiveDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    data.streak = data.lastActiveDate === yesterday ? (data.streak || 0) + 1 : 1;
    data.lastActiveDate = today;
  }

  saveData(data);
  res.json({ success: true, data });
});

app.post('/api/journal', (req, res) => {
  const data = loadData();
  data.journalEntries = data.journalEntries || [];
  data.journalEntries.push({ ...req.body, ts: new Date().toISOString() });
  saveData(data);
  res.json({ success: true });
});

app.post('/api/paper-trade', (req, res) => {
  const data = loadData();
  data.paperTrades = data.paperTrades || [];
  data.paperTrades.push({ ...req.body, ts: new Date().toISOString() });
  saveData(data);
  res.json({ success: true });
});

// ── Serve React build ────────────────────────────────────────────────────────

const DIST = path.join(__dirname, '../client/dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`🚀 CryptoCoach running on http://localhost:${PORT}`);
});
