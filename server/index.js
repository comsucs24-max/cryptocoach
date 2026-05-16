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

// ── Delta Exchange Integration ────────────────────────────────────────────────

const DELTA_BASE = 'https://api.delta.exchange';

const RESOLUTION_SECONDS = {
  '15m': 15 * 60,
  '1h':  3600,
  '4h':  4 * 3600,
  '6h':  6 * 3600,
  '8h':  8 * 3600,
  '12h': 12 * 3600,
  '1d':  86400,
  '1w':  7 * 86400,
  '1M':  30 * 86400,
};

const MODE_TIMEFRAMES = {
  scalp:    ['1d', '4h', '15m'],
  swing:    ['1w', '1d', '4h'],
  position: ['1w', '1d'],
  full:     ['1w', '1d', '4h', '1h', '15m'],
};

const ANALYSIS_TRIGGERS = [
  'analyse', 'analyze', 'analysis', 'give me levels', 'trade plan',
  'long or short', 'should i buy', 'should i sell', 'should i go long',
  'should i go short', 'quick levels', 'scan for patterns', 'mtf',
  'multi timeframe', 'deep analyse', 'deep analyze', 'what do you think about',
  'entry point', 'where to buy', 'where to sell', 'target price', 'stop loss',
  'take profit', 'resistance level', 'support level', 'scalp', 'swing',
  'position trade', 'full analysis', 'technical view', 'ta on', 'setup on',
  // Pattern & structure keywords
  'pennant', 'flag', 'triangle', 'wedge', 'formation', 'pattern',
  'check my', 'verify', 'confirm', 'breakout', 'breakdown',
  'support', 'resistance', 'divergence', 'rsi', 'macd',
  'volume spike', 'wick', 'candle', 'bullish', 'bearish',
];

const SYMBOL_MAP = {
  btc: 'BTCUSDT', bitcoin: 'BTCUSDT',
  eth: 'ETHUSDT', ethereum: 'ETHUSDT',
  sol: 'SOLUSDT', solana: 'SOLUSDT',
  bnb: 'BNBUSDT',
  xrp: 'XRPUSDT', ripple: 'XRPUSDT',
  ada: 'ADAUSDT', cardano: 'ADAUSDT',
  avax: 'AVAXUSDT', avalanche: 'AVAXUSDT',
  dot: 'DOTUSDT', polkadot: 'DOTUSDT',
  link: 'LINKUSDT', chainlink: 'LINKUSDT',
  doge: 'DOGEUSDT', dogecoin: 'DOGEUSDT',
};

async function deltaGet(path) {
  const resp = await fetch(`${DELTA_BASE}${path}`, {
    headers: { 'api-key': process.env.DELTA_API_KEY || '' },
  });
  if (!resp.ok) throw new Error(`Delta API ${resp.status}: ${path}`);
  return resp.json();
}

async function fetchTicker(symbol) {
  const data = await deltaGet('/v2/tickers');
  const result = data.result || [];
  const ticker = result.find(t => t.symbol === symbol);
  if (!ticker) throw new Error(`Symbol ${symbol} not found in tickers`);
  return ticker;
}

async function fetchCandles(symbol, resolution, limit = 100) {
  const secs = RESOLUTION_SECONDS[resolution] || 86400;
  const end = Math.floor(Date.now() / 1000);
  const start = end - secs * limit;
  const data = await deltaGet(
    `/v2/history/candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${end}`
  );
  return (data.result || []).slice(-limit);
}

async function fetchSnapshot(symbol, mode = 'swing') {
  const timeframes = MODE_TIMEFRAMES[mode] || MODE_TIMEFRAMES.swing;
  const limit = mode === 'full' ? 50 : 100;

  const [tickerResult, ...candleResults] = await Promise.allSettled([
    fetchTicker(symbol),
    ...timeframes.map(tf => fetchCandles(symbol, tf, limit)),
  ]);

  return {
    symbol,
    mode,
    ticker: tickerResult.status === 'fulfilled' ? tickerResult.value : null,
    tickerError: tickerResult.status === 'rejected' ? tickerResult.reason?.message : null,
    candles: Object.fromEntries(
      timeframes.map((tf, i) => [
        tf,
        candleResults[i].status === 'fulfilled' ? candleResults[i].value : [],
      ])
    ),
  };
}

function calculateIndicators(candles) {
  if (!candles || candles.length < 20) return null;

  const closes  = candles.map(c => parseFloat(c.close));
  const highs   = candles.map(c => parseFloat(c.high));
  const lows    = candles.map(c => parseFloat(c.low));
  const volumes = candles.map(c => parseFloat(c.volume));

  function calcEMA(arr, period) {
    const k = 2 / (period + 1);
    let ema = arr[0];
    const emas = [ema];
    for (let i = 1; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
      emas.push(parseFloat(ema.toFixed(2)));
    }
    return emas;
  }

  function calcRSI(arr, period = 14) {
    if (arr.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = arr[i] - arr[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const rsiValues = [];
    for (let i = period + 1; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
      const rs  = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiValues.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
    }
    return rsiValues;
  }

  function calcMACD(arr) {
    const ema12 = calcEMA(arr, 12);
    const ema26 = calcEMA(arr, 26);
    const macdLine = ema12.map((v, i) => parseFloat((v - ema26[i]).toFixed(2)));
    const signal   = calcEMA(macdLine.slice(25), 9);
    const histogram = signal.map((v, i) => parseFloat((macdLine[25 + i] - v).toFixed(2)));
    return {
      macd:      macdLine.slice(-10),
      signal:    signal.slice(-10),
      histogram: histogram.slice(-10),
    };
  }

  function calcBollinger(arr, period = 20) {
    const slice  = arr.slice(-period);
    const sma    = slice.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period);
    return {
      upper:  parseFloat((sma + 2 * stdDev).toFixed(2)),
      middle: parseFloat(sma.toFixed(2)),
      lower:  parseFloat((sma - 2 * stdDev).toFixed(2)),
      width:  parseFloat(((4 * stdDev / sma) * 100).toFixed(2)),
    };
  }

  function detectDivergence(arr, rsiValues) {
    if (!rsiValues || rsiValues.length < 6) return { type: 'None detected', strength: 'NONE', desc: 'Insufficient data' };
    const rc = arr.slice(-6);
    const rr = rsiValues.slice(-6);
    const pH1 = Math.max(...rc.slice(0, 3)), pH2 = Math.max(...rc.slice(3));
    const rH1 = Math.max(...rr.slice(0, 3)), rH2 = Math.max(...rr.slice(3));
    const pL1 = Math.min(...rc.slice(0, 3)), pL2 = Math.min(...rc.slice(3));
    const rL1 = Math.min(...rr.slice(0, 3)), rL2 = Math.min(...rr.slice(3));

    if (pH2 > pH1 && rH2 < rH1)
      return { type: 'Regular Bearish', strength: Math.abs(rH1 - rH2) > 5 ? 'STRONG' : 'MILD',
        desc: `Price HH ($${pH2.toFixed(0)} vs $${pH1.toFixed(0)}) but RSI LH (${rH2.toFixed(1)} vs ${rH1.toFixed(1)}) — momentum weakening, reversal risk` };
    if (pL2 < pL1 && rL2 > rL1)
      return { type: 'Regular Bullish', strength: Math.abs(rL1 - rL2) > 5 ? 'STRONG' : 'MILD',
        desc: `Price LL ($${pL2.toFixed(0)} vs $${pL1.toFixed(0)}) but RSI HL (${rL2.toFixed(1)} vs ${rL1.toFixed(1)}) — selling exhausting, bounce likely` };
    if (pH2 < pH1 && rH2 > rH1)
      return { type: 'Hidden Bearish', strength: 'MILD', desc: 'Price LH with RSI HH — downtrend continuation signal' };
    if (pL2 > pL1 && rL2 < rL1)
      return { type: 'Hidden Bullish', strength: 'MILD', desc: 'Price HL with RSI LL — uptrend continuation signal' };
    return { type: 'None detected', strength: 'NONE', desc: 'Price and RSI moving in sync — no divergence' };
  }

  const rsi    = calcRSI(closes);
  const macd   = calcMACD(closes);
  const bb     = calcBollinger(closes);
  const diverg = detectDivergence(closes, rsi);
  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : null;

  return {
    rsi: {
      current:  rsi ? rsi[rsi.length - 1] : null,
      previous: rsi ? rsi[rsi.length - 2] : null,
      last5:    rsi ? rsi.slice(-5) : [],
      zone:     rsi ? (rsi[rsi.length - 1] > 70 ? 'OVERBOUGHT' : rsi[rsi.length - 1] < 30 ? 'OVERSOLD' : 'NEUTRAL') : null,
    },
    macd,
    bollinger: bb,
    divergence: diverg,
    ema20:        parseFloat(ema20[ema20.length - 1].toFixed(2)),
    ema50:        parseFloat(ema50[ema50.length - 1].toFixed(2)),
    ema200:       ema200 ? parseFloat(ema200[ema200.length - 1].toFixed(2)) : null,
    currentPrice: closes[closes.length - 1],
    priceVsEma20: closes[closes.length - 1] > ema20[ema20.length - 1] ? 'ABOVE' : 'BELOW',
  };
}

function formatMarketData(snap) {
  const t = snap.ticker;
  if (!t) return `\n⚠️ Live market data unavailable for ${snap.symbol}: ${snap.tickerError || 'unknown error'}\n`;

  const markPrice = parseFloat(t.mark_price);
  const change24h = t.mark_change_24h != null ? `${parseFloat(t.mark_change_24h).toFixed(2)}%` : 'N/A';
  const fr = parseFloat(t.funding_rate || 0);
  const frStr = t.funding_rate != null
    ? `${(fr * 100).toFixed(4)}% (${fr > 0 ? 'longs pay shorts — bearish lean' : 'shorts pay longs — bullish lean'})`
    : 'N/A';

  let out = `\n## LIVE MARKET DATA FROM DELTA EXCHANGE — USE THESE EXACT PRICES\n`;
  out += `CRITICAL: You CAN see live data below. Use these prices. Never say you cannot access charts or live data.\n\n`;
  out += `Symbol: ${snap.symbol}\n`;
  out += `Mark Price: $${markPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\n`;
  out += `24H Change: ${change24h}\n`;
  out += `24H High: $${(t.high || 0).toLocaleString()} | Low: $${(t.low || 0).toLocaleString()}\n`;
  out += `Funding Rate: ${frStr}\n\n`;
  out += `### OHLCV CANDLE DATA (analyse these actual prices):\n`;

  for (const [tf, candles] of Object.entries(snap.candles)) {
    if (!candles.length) continue;
    // API returns newest-first; reverse for oldest-first before indicators
    const chronological = [...candles].reverse();
    const indicators    = calculateIndicators(chronological);
    const last          = candles[0];
    const display       = chronological.slice(-20);

    out += `\n${tf.toUpperCase()}: Last close=$${parseFloat(last.close).toFixed(0)} `;
    out += `High=$${parseFloat(last.high).toFixed(0)} Low=$${parseFloat(last.low).toFixed(0)}\n`;

    if (indicators) {
      const ind = indicators;
      out += `RSI(14): ${ind.rsi.current} [${ind.rsi.zone}] | Last 5: ${ind.rsi.last5.join(', ')}\n`;
      out += `MACD Histogram (last 5): ${ind.macd.histogram.slice(-5).join(', ')} (${ind.macd.histogram.slice(-1)[0] > 0 ? 'BULLISH' : 'BEARISH'})\n`;
      out += `EMA20: $${ind.ema20} | EMA50: $${ind.ema50}${ind.ema200 ? ` | EMA200: $${ind.ema200}` : ''}\n`;
      out += `Price vs EMA20: ${ind.priceVsEma20}\n`;
      out += `Bollinger Bands: Upper=$${ind.bollinger.upper} Mid=$${ind.bollinger.middle} Lower=$${ind.bollinger.lower} Width=${ind.bollinger.width}%\n`;
      out += `DIVERGENCE: ${ind.divergence.type} [${ind.divergence.strength}] — ${ind.divergence.desc}\n`;
    }

    out += `Recent candles (oldest→newest):\n`;
    out += display.map(c => {
      const ts = new Date(c.time * 1000).toISOString().slice(0, 16);
      return `  ${ts} O:${parseFloat(c.open).toFixed(0)} H:${parseFloat(c.high).toFixed(0)} L:${parseFloat(c.low).toFixed(0)} C:${parseFloat(c.close).toFixed(0)} V:${c.volume}`;
    }).join('\n');
    out += '\n';
  }

  out += `\nYou have the live data above. Analyse it directly. Never say you cannot see the chart.\n`;
  out += `IMPORTANT: Analyse these actual prices. Do not use training memory for price levels.\n`;
  return out;
}

function extractSymbol(text) {
  const t = text.toLowerCase();
  for (const [key, sym] of Object.entries(SYMBOL_MAP)) {
    if (t.includes(key)) return sym;
  }
  return 'BTCUSDT';
}

function extractMode(text) {
  const t = text.toLowerCase();
  if (t.includes('scalp') || t.includes('15m') || t.includes('quick')) return 'scalp';
  if (t.includes('position') || t.includes('monthly') || t.includes('1m ')) return 'position';
  if (t.includes('full') || t.includes('mtf') || t.includes('multi')) return 'full';
  return 'swing';
}

function isAnalysisRequest(text) {
  const t = text.toLowerCase();
  return ANALYSIS_TRIGGERS.some(trigger => t.includes(trigger));
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

// ── Market snapshot endpoints ─────────────────────────────────────────────────

app.get('/api/market/snapshot', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const mode   = req.query.mode || 'swing';
  try {
    const snap = await fetchSnapshot(symbol, mode);
    res.json({ success: true, ...snap });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/market/candles', async (req, res) => {
  const symbol     = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const resolution = req.query.interval || '1d';
  const limit      = Math.min(parseInt(req.query.limit || '100', 10), 500);
  try {
    const candles = await fetchCandles(symbol, resolution, limit);
    res.json({ success: true, symbol, resolution, candles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Chat endpoint (streaming SSE) ────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { messages, mode } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastText    = lastUserMsg?.content || '';

  let systemPrompt = mode === 'tutor' ? TUTOR_SYSTEM : LEARN_SYSTEM;
  let augmentedMessages = messages;

  // Inject live market data when analysis is triggered
  if (mode === 'tutor' && isAnalysisRequest(lastText)) {
    try {
      const symbol = extractSymbol(lastText);
      const snapMode = extractMode(lastText);
      const snap = await fetchSnapshot(symbol, snapMode);
      const marketData = formatMarketData(snap);

      // Prepend market data to the last user message
      augmentedMessages = messages.map((msg, i) => {
        if (i === messages.length - 1 && msg.role === 'user') {
          return { ...msg, content: `${marketData}\n\nStudent request: ${msg.content}` };
        }
        return msg;
      });
    } catch (err) {
      console.error('Market data fetch failed:', err.message);
      // Continue without market data — don't block the chat
    }
  }

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
      messages: augmentedMessages,
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
