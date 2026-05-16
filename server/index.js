require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3001;

function toIST(timestamp) {
  const ms      = timestamp > 1e10 ? timestamp : timestamp * 1000;
  const istDate = new Date(new Date(ms).getTime() + 5.5 * 60 * 60 * 1000);
  const dd  = String(istDate.getUTCDate()).padStart(2, '0');
  const mm  = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const yy  = istDate.getUTCFullYear();
  const hh  = String(istDate.getUTCHours()).padStart(2, '0');
  const min = String(istDate.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min} IST`;
}

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

async function fetchCandles(symbol, resolution, limit = 300) {
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
  const limit = mode === 'full' ? 200 : 300;

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

function detectSupportResistance(candles, currentPrice) {
  if (!candles || candles.length < 20) return { resistance: [], support: [] };

  const highs   = candles.map(c => parseFloat(c.high));
  const lows    = candles.map(c => parseFloat(c.low));
  const volumes = candles.map(c => parseFloat(c.volume));
  const pivotWindow = 5;
  const pivotHighs = [], pivotLows = [];

  for (let i = pivotWindow; i < candles.length - pivotWindow; i++) {
    const sliceH = highs.slice(i - pivotWindow, i + pivotWindow + 1);
    const sliceL = lows.slice(i - pivotWindow, i + pivotWindow + 1);
    if (highs[i] === Math.max(...sliceH))
      pivotHighs.push({ price: highs[i], idx: i, volume: volumes[i], time: candles[i].time });
    if (lows[i] === Math.min(...sliceL))
      pivotLows.push({ price: lows[i],  idx: i, volume: volumes[i], time: candles[i].time });
  }

  function clusterLevels(pivots) {
    const clustered = [], used = new Set();
    for (let i = 0; i < pivots.length; i++) {
      if (used.has(i)) continue;
      const cluster = [pivots[i]];
      used.add(i);
      for (let j = i + 1; j < pivots.length; j++) {
        if (used.has(j)) continue;
        if (Math.abs(pivots[i].price - pivots[j].price) / pivots[i].price < 0.005) {
          cluster.push(pivots[j]);
          used.add(j);
        }
      }
      const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      const touches  = cluster.length;
      clustered.push({
        price:    parseFloat(avgPrice.toFixed(0)),
        touches,
        strength: touches >= 3 ? 'STRONG' : touches === 2 ? 'MODERATE' : 'WEAK',
        volume:   cluster.reduce((s, p) => s + p.volume, 0),
        lastSeen: cluster[cluster.length - 1].time,
      });
    }
    return clustered.sort((a, b) => b.touches - a.touches);
  }

  const resistance = clusterLevels(pivotHighs)
    .filter(l => l.price > currentPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);

  const support = clusterLevels(pivotLows)
    .filter(l => l.price < currentPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 8);

  return { resistance, support };
}

// ── Candlestick patterns — pure JS (talib npm incompatible with Node 20) ─────
function detectCandlePatterns(candles) {
  if (!candles || candles.length < 3) return [];

  const patterns = [];
  const n = candles.length;

  function candle(c) {
    const o = parseFloat(c.open), h = parseFloat(c.high);
    const l = parseFloat(c.low),  cl = parseFloat(c.close);
    const body  = Math.abs(cl - o);
    const range = h - l;
    const upper = h - Math.max(o, cl);
    const lower = Math.min(o, cl) - l;
    return { o, h, l, cl, body, range, upper, lower, bull: cl >= o };
  }

  function push(name, bias, confidence, description, action, session, time, price) {
    patterns.push({ name, type: 'CANDLESTICK', bias, confidence, description,
      action: `${action}${time ? ' Spotted at ' + toIST(time) + ' ($' + price.toFixed(0) + ').' : ''}`,
      session });
  }

  // ── Last single candle ──────────────────────────────────
  const c0 = candle(candles[n - 1]);
  const t0 = candles[n - 1].time;

  if (c0.range > 0) {
    const bodyRatio = c0.body / c0.range;

    // Doji family
    if (bodyRatio < 0.1) {
      if (c0.lower > c0.range * 0.6 && c0.upper < c0.range * 0.1)
        push('Dragonfly Doji', 'BULLISH', 'HIGH', 'Long lower wick, buyers rejected the lows decisively.', 'Bullish signal at support — confirm with next green candle.', 'Session 17: Doji Patterns', t0, c0.cl);
      else if (c0.upper > c0.range * 0.6 && c0.lower < c0.range * 0.1)
        push('Gravestone Doji', 'BEARISH', 'HIGH', 'Long upper wick, sellers rejected the highs decisively.', 'Bearish signal at resistance — confirm with next red candle.', 'Session 17: Doji Patterns', t0, c0.cl);
      else if (c0.upper > c0.range * 0.3 && c0.lower > c0.range * 0.3)
        push('Long-legged Doji', 'NEUTRAL', 'MEDIUM', 'Open ≈ close with wicks both sides — extreme indecision.', 'Wait for next candle to confirm direction.', 'Session 17: Doji Patterns', t0, c0.cl);
      else
        push('Doji', 'NEUTRAL', 'MEDIUM', `Open ≈ close (body ${(bodyRatio*100).toFixed(0)}% of range) — buyers and sellers in balance.`, 'Wait for next candle to confirm direction.', 'Session 17: Doji Patterns', t0, c0.cl);
    }

    // Spinning Top
    if (bodyRatio >= 0.1 && bodyRatio < 0.35 && c0.upper > c0.body * 0.5 && c0.lower > c0.body * 0.5)
      push('Spinning Top', 'NEUTRAL', 'MEDIUM', 'Small body with wicks both sides — indecision, trend may be losing steam.', 'Wait for breakout candle to confirm direction.', 'Session 17: Doji Patterns', t0, c0.cl);

    // Hammer / Hanging Man / Inverted Hammer / Shooting Star
    if (c0.lower > c0.body * 2 && c0.upper < c0.body * 0.5) {
      if (c0.bull) push('Hammer', 'BULLISH', 'MEDIUM', `Long lower wick (${(c0.lower/c0.range*100).toFixed(0)}% of range) — buyers stepped in strongly, rejected lows.`, 'Bullish reversal signal at support. Confirm with next green candle.', 'Session 18: Hammer & Shooting Star', t0, c0.cl);
      else         push('Hanging Man', 'BEARISH', 'MEDIUM', `Long lower wick at highs — looks like hammer but bearish warning at resistance.`, 'Bearish reversal warning. Confirm with next red candle below this candle\'s low.', 'Session 18: Hammer & Shooting Star', t0, c0.cl);
    }
    if (c0.upper > c0.body * 2 && c0.lower < c0.body * 0.5) {
      if (!c0.bull) push('Shooting Star', 'BEARISH', 'MEDIUM', `Long upper wick (${(c0.upper/c0.range*100).toFixed(0)}% of range) — sellers rejected the highs strongly.`, 'Bearish reversal signal at resistance. Confirm with next red candle.', 'Session 18: Hammer & Shooting Star', t0, c0.cl);
      else          push('Inverted Hammer', 'BULLISH', 'MEDIUM', 'Long upper wick — buyers tried at highs; needs next-candle confirmation.', 'Tentative bullish signal. Confirm with next green candle closing above this high.', 'Session 18: Hammer & Shooting Star', t0, c0.cl);
    }

    // Marubozu
    if (bodyRatio > 0.9)
      push(c0.bull ? 'Bullish Marubozu' : 'Bearish Marubozu',
        c0.bull ? 'BULLISH' : 'BEARISH', 'HIGH',
        `Full-body candle (${(bodyRatio*100).toFixed(0)}% of range) — pure ${c0.bull ? 'buying' : 'selling'} pressure, no hesitation.`,
        `Strong ${c0.bull ? 'bullish' : 'bearish'} momentum. Trend likely continues.`, 'Session 21: Marubozu', t0, c0.cl);
  }

  // ── Last 2 candles ──────────────────────────────────────
  if (n >= 2) {
    const c1 = candle(candles[n - 2]);

    // Engulfing
    if (!c1.bull && c0.bull && c0.o < c1.cl && c0.cl > c1.o)
      push('Bullish Engulfing', 'BULLISH', 'HIGH', 'Current candle fully engulfs previous bearish candle — buyers overwhelmed sellers.', 'Strong reversal signal. Enter long after this candle closes.', 'Session 19: Engulfing Patterns', t0, c0.cl);
    if (c1.bull && !c0.bull && c0.o > c1.cl && c0.cl < c1.o)
      push('Bearish Engulfing', 'BEARISH', 'HIGH', 'Current candle fully engulfs previous bullish candle — sellers overwhelmed buyers.', 'Strong reversal signal. Enter short after this candle closes.', 'Session 19: Engulfing Patterns', t0, c0.cl);

    // Harami
    if (c1.bull && !c0.bull && c0.o < c1.cl && c0.cl > c1.o && c0.range < c1.range * 0.6)
      push('Bearish Harami', 'BEARISH', 'MEDIUM', 'Small bearish candle inside previous bullish candle — momentum slowing.', 'Bearish warning. Wait for confirmation with next red candle.', 'Session 2: Market Structure', t0, c0.cl);
    if (!c1.bull && c0.bull && c0.o > c1.cl && c0.cl < c1.o && c0.range < c1.range * 0.6)
      push('Bullish Harami', 'BULLISH', 'MEDIUM', 'Small bullish candle inside previous bearish candle — selling momentum slowing.', 'Bullish warning. Wait for confirmation with next green candle.', 'Session 2: Market Structure', t0, c0.cl);

    // Piercing Line / Dark Cloud Cover
    if (!c1.bull && c0.bull && c0.o < c1.l && c0.cl > (c1.o + c1.cl) / 2 && c0.cl < c1.o)
      push('Piercing Line', 'BULLISH', 'MEDIUM', 'Bullish candle closes above midpoint of prior bearish candle — buyers taking control.', 'Bullish reversal signal. Confirm with follow-through candle.', 'Session 19: Engulfing Patterns', t0, c0.cl);
    if (c1.bull && !c0.bull && c0.o > c1.h && c0.cl < (c1.o + c1.cl) / 2 && c0.cl > c1.o)
      push('Dark Cloud Cover', 'BEARISH', 'MEDIUM', 'Bearish candle closes below midpoint of prior bullish candle — sellers taking control.', 'Bearish reversal signal. Confirm with follow-through candle.', 'Session 19: Engulfing Patterns', t0, c0.cl);
  }

  // ── Last 3 candles ──────────────────────────────────────
  if (n >= 3) {
    const c1 = candle(candles[n - 2]);
    const c2 = candle(candles[n - 3]);

    // Three White Soldiers
    if (c0.bull && c1.bull && c2.bull &&
        c0.cl > c1.cl && c1.cl > c2.cl &&
        c0.body / c0.range > 0.6 && c1.body / c1.range > 0.6 && c2.body / c2.range > 0.6)
      push('Three White Soldiers', 'BULLISH', 'HIGH', 'Three consecutive strong bullish candles — powerful momentum shift.', 'Strong bullish trend signal. Look for long entries on any pullback.', 'Session 5: Markup Phase', t0, c0.cl);

    // Three Black Crows
    if (!c0.bull && !c1.bull && !c2.bull &&
        c0.cl < c1.cl && c1.cl < c2.cl &&
        c0.body / c0.range > 0.6 && c1.body / c1.range > 0.6 && c2.body / c2.range > 0.6)
      push('Three Black Crows', 'BEARISH', 'HIGH', 'Three consecutive strong bearish candles — powerful momentum shift.', 'Strong bearish trend signal. Look for short entries on any bounce.', 'Session 7: Markdown Phase', t0, c0.cl);

    // Morning Star (bearish, small, bullish)
    const midSmall = c1.body < Math.min(c0.body, c2.body) * 0.5;
    if (!c2.bull && midSmall && c0.bull && c0.cl > (c2.o + c2.cl) / 2)
      push('Morning Star', 'BULLISH', 'HIGH', '3-candle bullish reversal: bearish → small indecision → strong bullish close above midpoint.', 'Strong bullish reversal. Enter long above the third candle\'s high.', 'Session 20: Morning & Evening Star', t0, c0.cl);

    // Evening Star (bullish, small, bearish)
    if (c2.bull && midSmall && !c0.bull && c0.cl < (c2.o + c2.cl) / 2)
      push('Evening Star', 'BEARISH', 'HIGH', '3-candle bearish reversal: bullish → small indecision → strong bearish close below midpoint.', 'Strong bearish reversal. Enter short below the third candle\'s low.', 'Session 20: Morning & Evening Star', t0, c0.cl);
  }

  return patterns;
}

// ── Price structure patterns (manual trendline logic) ────────────────────────
function detectPricePatterns(candles) {
  if (!candles || candles.length < 20) return [];

  const closes  = candles.map(c => parseFloat(c.close));
  const highs   = candles.map(c => parseFloat(c.high));
  const lows    = candles.map(c => parseFloat(c.low));
  const volumes = candles.map(c => parseFloat(c.volume));
  const n       = closes.length;
  const patterns = [];

  function findPeaks(arr, window = 3) {
    const peaks = [];
    for (let i = window; i < arr.length - window; i++) {
      const slice = arr.slice(i - window, i + window + 1);
      if (arr[i] === Math.max(...slice)) peaks.push({ idx: i, val: arr[i] });
    }
    return peaks;
  }
  function findTroughs(arr, window = 3) {
    const troughs = [];
    for (let i = window; i < arr.length - window; i++) {
      const slice = arr.slice(i - window, i + window + 1);
      if (arr[i] === Math.min(...slice)) troughs.push({ idx: i, val: arr[i] });
    }
    return troughs;
  }

  const highPeaks  = findPeaks(highs);
  const lowTroughs = findTroughs(lows);

  // Double Top
  if (highPeaks.length >= 2) {
    const [p1, p2] = highPeaks.slice(-2);
    const diff = Math.abs(p1.val - p2.val) / p1.val;
    const gap  = p2.idx - p1.idx;
    if (diff < 0.02 && gap >= 5 && gap <= 30) {
      const neckline = Math.min(...lows.slice(p1.idx, p2.idx));
      const target   = p1.val - (p1.val - neckline);
      patterns.push({ name: 'Double Top', type: 'REVERSAL', bias: 'BEARISH',
        confidence: diff < 0.01 ? 'HIGH' : 'MEDIUM',
        description: `Two peaks at $${p1.val.toFixed(0)} and $${p2.val.toFixed(0)} — ${(diff*100).toFixed(1)}% apart`,
        neckline: neckline.toFixed(0), target: target.toFixed(0),
        action: `Watch for break below neckline $${neckline.toFixed(0)}. Target $${target.toFixed(0)}`,
        session: 'Session 23: Double Top & Bottom' });
    }
  }

  // Double Bottom
  if (lowTroughs.length >= 2) {
    const [t1, t2] = lowTroughs.slice(-2);
    const diff = Math.abs(t1.val - t2.val) / t1.val;
    const gap  = t2.idx - t1.idx;
    if (diff < 0.02 && gap >= 5 && gap <= 30) {
      const neckline = Math.max(...highs.slice(t1.idx, t2.idx));
      const target   = t1.val + (neckline - t1.val) * 2;
      patterns.push({ name: 'Double Bottom', type: 'REVERSAL', bias: 'BULLISH',
        confidence: diff < 0.01 ? 'HIGH' : 'MEDIUM',
        description: `Two troughs at $${t1.val.toFixed(0)} and $${t2.val.toFixed(0)} — ${(diff*100).toFixed(1)}% apart`,
        neckline: neckline.toFixed(0), target: target.toFixed(0),
        action: `Watch for break above neckline $${neckline.toFixed(0)}. Target $${target.toFixed(0)}`,
        session: 'Session 23: Double Top & Bottom' });
    }
  }

  // Head & Shoulders
  if (highPeaks.length >= 3) {
    const [left, head, right] = highPeaks.slice(-3);
    if (head.val > left.val && head.val > right.val && Math.abs(left.val - right.val) / left.val < 0.03) {
      const neckline = Math.min(Math.min(...lows.slice(left.idx, head.idx)), Math.min(...lows.slice(head.idx, right.idx)));
      const target   = neckline - (head.val - neckline);
      patterns.push({ name: 'Head & Shoulders', type: 'REVERSAL', bias: 'BEARISH',
        confidence: Math.abs(left.val - right.val) / left.val < 0.015 ? 'HIGH' : 'MEDIUM',
        description: `L-shoulder $${left.val.toFixed(0)}, Head $${head.val.toFixed(0)}, R-shoulder $${right.val.toFixed(0)}`,
        neckline: neckline.toFixed(0), target: target.toFixed(0),
        action: `Break below neckline $${neckline.toFixed(0)} confirms. Target $${target.toFixed(0)}`,
        session: 'Session 22: Head & Shoulders' });
    }
  }

  // Inverse Head & Shoulders
  if (lowTroughs.length >= 3) {
    const [left, head, right] = lowTroughs.slice(-3);
    if (head.val < left.val && head.val < right.val && Math.abs(left.val - right.val) / left.val < 0.03) {
      const neckline = Math.max(Math.max(...highs.slice(left.idx, head.idx)), Math.max(...highs.slice(head.idx, right.idx)));
      const target   = neckline + (neckline - head.val);
      patterns.push({ name: 'Inverse Head & Shoulders', type: 'REVERSAL', bias: 'BULLISH',
        confidence: 'MEDIUM',
        description: `L-shoulder $${left.val.toFixed(0)}, Head $${head.val.toFixed(0)}, R-shoulder $${right.val.toFixed(0)}`,
        neckline: neckline.toFixed(0), target: target.toFixed(0),
        action: `Break above neckline $${neckline.toFixed(0)} confirms. Target $${target.toFixed(0)}`,
        session: 'Session 22: Head & Shoulders' });
    }
  }

  // Bull / Bear Flag
  const last20C = closes.slice(-20), last20H = highs.slice(-20), last20L = lows.slice(-20);
  const poleEnd      = 10;
  const poleMove     = (last20C[poleEnd] - last20C[0]) / last20C[0];
  const bearPoleMove = (last20C[0] - last20C[poleEnd]) / last20C[0];
  const consRange    = (Math.max(...last20H.slice(poleEnd)) - Math.min(...last20L.slice(poleEnd))) / last20C[poleEnd];
  const volDecline   = volumes.slice(-5).reduce((a,b)=>a+b,0) < volumes.slice(-15,-10).reduce((a,b)=>a+b,0);

  if (poleMove > 0.04 && consRange < 0.03 && volDecline) {
    const target = closes[n-1] + (last20C[poleEnd] - last20C[0]);
    patterns.push({ name: 'Bull Flag', type: 'CONTINUATION', bias: 'BULLISH',
      confidence: consRange < 0.015 ? 'HIGH' : 'MEDIUM',
      description: `Flagpole +${(poleMove*100).toFixed(1)}%, consolidation ${(consRange*100).toFixed(1)}%, volume declining ✓`,
      target: target.toFixed(0),
      action: `Buy breakout above $${Math.max(...last20H.slice(poleEnd)).toFixed(0)}. Target $${target.toFixed(0)}`,
      session: 'Session 24: Bull & Bear Flags' });
  }
  if (bearPoleMove > 0.04 && consRange < 0.03 && volDecline) {
    const target = closes[n-1] - (last20C[0] - last20C[poleEnd]);
    patterns.push({ name: 'Bear Flag', type: 'CONTINUATION', bias: 'BEARISH',
      confidence: consRange < 0.015 ? 'HIGH' : 'MEDIUM',
      description: `Flagpole -${(bearPoleMove*100).toFixed(1)}%, consolidation ${(consRange*100).toFixed(1)}%, volume declining ✓`,
      target: target.toFixed(0),
      action: `Short breakdown below $${Math.min(...last20L.slice(poleEnd)).toFixed(0)}. Target $${target.toFixed(0)}`,
      session: 'Session 24: Bull & Bear Flags' });
  }

  // Bull / Bear Pennant
  for (const windowSize of [8, 12, 16, 20, 25]) {
    if (candles.length < windowSize + 5) continue;
    const poleC   = candles.slice(-(windowSize + 5), -windowSize);
    const pennC   = candles.slice(-windowSize);
    const poleCloses = poleC.map(c => parseFloat(c.close));
    const pennH   = pennC.map(c => parseFloat(c.high));
    const pennL   = pennC.map(c => parseFloat(c.low));
    const pennVol = pennC.map(c => parseFloat(c.volume));
    const poleVol = poleC.map(c => parseFloat(c.volume));
    const pm      = (poleCloses[poleCloses.length-1] - poleCloses[0]) / poleCloses[0];
    const half    = Math.floor(windowSize / 2);
    const hDecl   = Math.max(...pennH.slice(half)) < Math.max(...pennH.slice(0, half));
    const lRise   = Math.min(...pennL.slice(half))  > Math.min(...pennL.slice(0, half));
    const pAvgV   = poleVol.reduce((a,b)=>a+b,0) / poleVol.length;
    const nAvgV   = pennVol.reduce((a,b)=>a+b,0) / pennVol.length;
    const vDecl   = nAvgV < pAvgV * 0.7;
    const pRange  = (Math.max(...pennH) - Math.min(...pennL)) / closes[n-1];
    const isTight = pRange < Math.abs(pm) * 0.6;

    if (pm > 0.03 && hDecl && lRise && isTight) {
      const bo  = Math.max(...pennH);
      const tgt = closes[n-1] + (poleCloses[poleCloses.length-1] - poleCloses[0]);
      const sl  = Math.min(...pennL.slice(-3));
      const vp  = ((pAvgV - nAvgV) / pAvgV * 100).toFixed(0);
      patterns.push({ name: 'Bull Pennant', type: 'CONTINUATION', bias: 'BULLISH',
        confidence: vDecl && isTight ? 'HIGH' : 'MEDIUM',
        description: `Flagpole +${(pm*100).toFixed(1)}%, ${windowSize}-candle pennant, converging trendlines, volume -${vp}%${vDecl?' ✓':''}`,
        breakout: bo.toFixed(0), target: tgt.toFixed(0), stopLoss: sl.toFixed(0),
        action: `Buy breakout above $${bo.toFixed(0)} on volume surge. Target $${tgt.toFixed(0)}. Stop $${sl.toFixed(0)}`,
        session: 'Session 24: Bull & Bear Flags', windowSize });
      break;
    }
    if (pm < -0.03 && hDecl && lRise && isTight) {
      const bd  = Math.min(...pennL);
      const tgt = closes[n-1] - Math.abs(poleCloses[0] - poleCloses[poleCloses.length-1]);
      const sl  = Math.max(...pennH.slice(-3));
      const vp  = ((pAvgV - nAvgV) / pAvgV * 100).toFixed(0);
      patterns.push({ name: 'Bear Pennant', type: 'CONTINUATION', bias: 'BEARISH',
        confidence: vDecl && isTight ? 'HIGH' : 'MEDIUM',
        description: `Flagpole ${(pm*100).toFixed(1)}%, ${windowSize}-candle pennant, converging price, volume -${vp}%${vDecl?' ✓':''}`,
        breakout: bd.toFixed(0), target: tgt.toFixed(0), stopLoss: sl.toFixed(0),
        action: `Short breakdown below $${bd.toFixed(0)}. Target $${tgt.toFixed(0)}. Stop $${sl.toFixed(0)}`,
        session: 'Session 24: Bull & Bear Flags', windowSize });
      break;
    }
  }

  // Ascending / Descending Triangle
  const rH = highs.slice(-15), rL = lows.slice(-15);
  const highVar = Math.max(...rH) - Math.min(...rH);
  const lowVar  = Math.max(...rL) - Math.min(...rL);
  if (highVar / closes[n-1] < 0.015 && rL[rL.length-1] > rL[0] && lowVar > highVar * 2) {
    const resistance = Math.max(...rH);
    patterns.push({ name: 'Ascending Triangle', type: 'CONTINUATION', bias: 'BULLISH',
      confidence: 'MEDIUM',
      description: `Flat resistance $${resistance.toFixed(0)}, rising lows — buyers getting more aggressive`,
      target: (resistance + (resistance - Math.min(...rL))).toFixed(0),
      action: `Buy breakout above $${resistance.toFixed(0)}. Stop below last higher low.`,
      session: 'Session 25: Triangle Patterns' });
  }
  if (lowVar / closes[n-1] < 0.015 && rH[rH.length-1] < rH[0] && highVar > lowVar * 2) {
    const support = Math.min(...rL);
    patterns.push({ name: 'Descending Triangle', type: 'CONTINUATION', bias: 'BEARISH',
      confidence: 'MEDIUM',
      description: `Flat support $${support.toFixed(0)}, falling highs — sellers getting more aggressive`,
      target: (support - (Math.max(...rH) - support)).toFixed(0),
      action: `Short breakdown below $${support.toFixed(0)}.`,
      session: 'Session 25: Triangle Patterns' });
  }

  return patterns;
}

// ── Combined: talib candlesticks + manual price patterns ─────────────────────
function getAllPatterns(candles, timeframe) {
  const candlePatterns = detectCandlePatterns(candles);
  const pricePatterns  = detectPricePatterns(candles);
  return [...candlePatterns, ...pricePatterns];
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

  const nowIST = toIST(Date.now());
  let out = `\n## LIVE MARKET DATA FROM DELTA EXCHANGE — USE THESE EXACT PRICES\n`;
  out += `CRITICAL: You CAN see live data below. Use these prices. Never say you cannot access charts or live data.\n\n`;
  out += `Data as of: ${nowIST}\n`;
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

    const patterns  = getAllPatterns(chronological, tf);
    const latestIST = toIST(last.time);
    const latestClose = `$${parseFloat(last.close).toFixed(0)}`;
    if (patterns.length > 0) {
      patterns.forEach(p => {
        out += `\n  ★ [${tf.toUpperCase()}] ${p.name}\n`;
        out += `     Bias: ${p.bias} | Confidence: ${p.confidence}\n`;
        out += `     Spotted at: ${latestIST} | Price: ${latestClose}\n`;
        out += `     What: ${p.description}\n`;
        out += `     Action: ${p.action}\n`;
        if (p.neckline) out += `     Neckline: $${p.neckline} | Target: $${p.target}\n`;
        out += `     Learn: ${p.session}\n`;
      });
    } else {
      out += `\n  ### ${tf.toUpperCase()} — No clear patterns | Price: ${latestClose} | RSI: ${indicators?.rsi?.current ?? 'N/A'}\n`;
    }

    const currentPrice = parseFloat(last.close);
    const srLevels = detectSupportResistance(chronological, currentPrice);
    out += `\nKEY LEVELS ON ${tf.toUpperCase()} (current price $${currentPrice.toFixed(0)}):\n`;
    out += `RESISTANCE (above $${currentPrice.toFixed(0)}):\n`;
    if (srLevels.resistance.length) {
      srLevels.resistance.forEach(r =>
        out += `  $${r.price} | ${r.strength} | ${r.touches} touch${r.touches > 1 ? 'es' : ''} | last seen ${toIST(r.lastSeen)}\n`
      );
    } else {
      out += `  None detected above current price\n`;
    }
    out += `SUPPORT (below $${currentPrice.toFixed(0)}):\n`;
    if (srLevels.support.length) {
      srLevels.support.forEach(s =>
        out += `  $${s.price} | ${s.strength} | ${s.touches} touch${s.touches > 1 ? 'es' : ''} | last seen ${toIST(s.lastSeen)}\n`
      );
    } else {
      out += `  None detected below current price\n`;
    }

    out += `Recent candles (oldest→newest):\n`;
    out += display.map(c => {
      return `  ${toIST(c.time)} O:${parseFloat(c.open).toFixed(0)} H:${parseFloat(c.high).toFixed(0)} L:${parseFloat(c.low).toFixed(0)} C:${parseFloat(c.close).toFixed(0)} V:${c.volume}`;
    }).join('\n');
    out += '\n';
  }

  out += `\nCONFLUENCE CHECK:\n`;
  out += `If 2+ timeframes show the same bias → HIGH CONVICTION trade\n`;
  out += `If timeframes conflict → WAIT — no clear edge\n`;
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
• Be encouraging but precise — correct errors gently
• All timestamps in market data are IST (Indian Standard Time, UTC+5:30). Always refer to candle times in IST.`;

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
• Always match the student's level
• All timestamps in market data are IST (Indian Standard Time, UTC+5:30). Always refer to candle times and price levels in IST.
• When reporting chart patterns always mention the timeframe first. Order timeframes longest→shortest: 1W → 1D → 4H → 1H → 15m. Format each pattern as:
  ### [TF] — [Pattern Name] [BIAS] [CONFIDENCE]
  Spotted at: DD/MM/YYYY HH:MM IST | Price: $X
  [Description]
  Action: [what to do] | Stop: $X | Target: $X
  Learn: [Session reference]
• After all patterns add a CONFLUENCE CHECK: if 2+ timeframes show same bias → HIGH CONVICTION. If conflicts → WAIT.
• When listing key levels show ALL detected levels from the SR data — resistance above and support below current price. Mark each with strength (STRONG/MODERATE/WEAK) and number of touches. More touches = more significant. Never truncate. Show all 8 resistance and 8 support levels per timeframe.`;

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
