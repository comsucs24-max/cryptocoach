export const PHASES = [
  { id: 0, name: 'Mindset',        color: '#bc8cff', sessions: [1,2,3] },
  { id: 1, name: 'Market Phases',  color: '#58a6ff', sessions: [4,5,6,7,8] },
  { id: 2, name: 'Price Action',   color: '#3fb950', sessions: [9,10,11,12,13,14,15,16] },
  { id: 3, name: 'Candlesticks',   color: '#d29922', sessions: [17,18,19,20,21] },
  { id: 4, name: 'Chart Patterns', color: '#f78166', sessions: [22,23,24,25,26,27] },
  { id: 5, name: 'Traps',          color: '#f85149', sessions: [28,29,30,31] },
  { id: 6, name: 'Indicators',     color: '#79c0ff', sessions: [32,33,34,35,36] },
  { id: 7, name: 'Strategies',     color: '#56d364', sessions: [37,38,39,40,41] },
  { id: 8, name: 'Risk Mgmt',      color: '#ffa657', sessions: [42,43,44,45] },
  { id: 9, name: 'Psychology',     color: '#e3b341', sessions: [46,47,48,49] },
];

export const SESSIONS = [
  // Phase 0
  { id:1,  phase:0, title:'Why Traders Fail',           desc:'Survivorship bias, overconfidence, and the psychological traps that eliminate 90% of retail traders before they learn.' },
  { id:2,  phase:0, title:'Market Structure Overview',  desc:'Who the real players are — retail vs institutional. How prices are actually set and why the market moves the way it does.' },
  { id:3,  phase:0, title:'Reading OHLC Candles',       desc:'Master Open/High/Low/Close candlestick charts and decode what each bar reveals about the battle between buyers and sellers.' },
  // Phase 1
  { id:4,  phase:1, title:'Accumulation & Spring Trap', desc:'How smart money quietly builds positions. The spring trap that shakes out weak hands before the real markup begins.' },
  { id:5,  phase:1, title:'Markup Phase',               desc:'Recognizing a healthy uptrend vs manipulation. How to tell real markup from a fakeout continuation.' },
  { id:6,  phase:1, title:'Distribution & UTAD',        desc:'How institutional money offloads into retail buying. The Upthrust After Distribution trap that fools most traders.' },
  { id:7,  phase:1, title:'Markdown Phase',             desc:'The anatomy of a bear market. How to identify and profit from — or safely navigate — markdown phases.' },
  { id:8,  phase:1, title:'Re-accumulation',            desc:'Mid-trend consolidations that look like reversals but aren\'t. How to tell re-accumulation from distribution.' },
  // Phase 2
  { id:9,  phase:2, title:'Support & Resistance',       desc:'Finding key price levels where supply and demand intersect. Why certain prices become magnets for both buyers and sellers.' },
  { id:10, phase:2, title:'Trendlines',                 desc:'Drawing valid multi-touch trendlines. When a trendline break is significant vs a trap to fade.' },
  { id:11, phase:2, title:'HH/HL Market Structure',     desc:'Higher highs, higher lows. Lower highs, lower lows. The foundational structure every trade should respect.' },
  { id:12, phase:2, title:'Break of Structure (BOS)',   desc:'When price breaks a significant swing high or low. Distinguishing real BOS from fakeouts and how to trade the retest.' },
  { id:13, phase:2, title:'Change of Character (CHoCH)',desc:'The first sign a trend is changing direction. CHoCH vs BOS — catching early reversals before the crowd.' },
  { id:14, phase:2, title:'Fair Value Gaps (FVG)',      desc:'Price imbalances that act as magnets for future price. Bullish vs bearish FVGs and how institutions fill them.' },
  { id:15, phase:2, title:'Order Blocks',               desc:'Where institutional orders cluster. Finding valid order blocks and using them as precision entry zones.' },
  { id:16, phase:2, title:'Volume Analysis',            desc:'What volume reveals about market conviction. Volume divergence, high-volume nodes, and what they predict.' },
  // Phase 3
  { id:17, phase:3, title:'Doji Patterns',              desc:'Doji variations — dragonfly, gravestone, long-legged. Reading market indecision and anticipating what follows.' },
  { id:18, phase:3, title:'Hammer & Shooting Star',     desc:'Long-wick reversal candles. Context makes them meaningful — the same candle means different things in different locations.' },
  { id:19, phase:3, title:'Engulfing Patterns',         desc:'Bullish and bearish engulfing. Why body size matters and why engulfing at key levels is powerful.' },
  { id:20, phase:3, title:'Morning & Evening Star',     desc:'Three-candle reversal patterns. The gap that separates real signals from noise.' },
  { id:21, phase:3, title:'Marubozu',                   desc:'Strong conviction candles with no wicks. What they reveal about directional momentum in different phases.' },
  // Phase 4
  { id:22, phase:4, title:'Head & Shoulders',           desc:'The most reliable reversal pattern in technical analysis. Necklines, targets, and inverse H&S for bottoms.' },
  { id:23, phase:4, title:'Double Top & Bottom',        desc:'M and W patterns. The second test that confirms, the neckline break, and the retest trade.' },
  { id:24, phase:4, title:'Flags & Pennants',           desc:'Continuation patterns after strong moves. Volume signatures and measuring flag targets.' },
  { id:25, phase:4, title:'Triangles',                  desc:'Symmetrical, ascending, descending. The coiling energy that precedes breakouts.' },
  { id:26, phase:4, title:'Wedges',                     desc:'Rising and falling wedges — usually reversal patterns. How to distinguish from valid trends.' },
  { id:27, phase:4, title:'Cup & Handle',               desc:'The bullish continuation formation. The U-shape accumulation and handle as a final shakeout before breakout.' },
  // Phase 5
  { id:28, phase:5, title:'Bull Traps',                 desc:'False breakouts above resistance that trap longs before reversing. Volume and close-based confirmation rules.' },
  { id:29, phase:5, title:'Bear Traps',                 desc:'Stop hunts below obvious support. How smart money uses bear traps to fill orders against the crowd.' },
  { id:30, phase:5, title:'Fake Breakouts',             desc:'Why most breakouts fail. Time-tested confirmation rules and why retests matter.' },
  { id:31, phase:5, title:'Crypto Manipulation',        desc:'Exchange-specific patterns: liquidation hunts, funding rate manipulation, and coordinated whale moves.' },
  // Phase 6
  { id:32, phase:6, title:'EMA & Moving Averages',      desc:'9, 21, 50, 200 EMAs as dynamic support/resistance. EMA crossovers and ribbons for trend strength.' },
  { id:33, phase:6, title:'RSI & Divergence',           desc:'Overbought/oversold levels, regular vs hidden divergence — the hidden signals most traders miss.' },
  { id:34, phase:6, title:'MACD',                       desc:'MACD line, signal line, histogram. Zero-line crossovers, divergence, and histogram momentum.' },
  { id:35, phase:6, title:'Bollinger Bands',            desc:'Dynamic volatility bands, the squeeze before expansion, band walking, and breakout confirmation.' },
  { id:36, phase:6, title:'VWAP',                       desc:'Volume-weighted average price as the institutional reference. Intraday S/R and anchored VWAP.' },
  // Phase 7
  { id:37, phase:7, title:'Trend-Following Strategy',   desc:'Trading in the direction of the major trend. Pullback entries, trailing stops, and riding moves to their natural end.' },
  { id:38, phase:7, title:'Pullback Strategy',          desc:'Buying the dip in uptrends, selling rallies in downtrends. Fibonacci retracements and OB entries.' },
  { id:39, phase:7, title:'Breakout Strategy',          desc:'Trading confirmed breakouts with volume. Entry, stop placement, targets, and managing false breaks.' },
  { id:40, phase:7, title:'Range Trading Strategy',     desc:'Identifying ranging markets, buying the low, selling the high, and stop placement inside the range.' },
  { id:41, phase:7, title:'Multi-Timeframe Analysis',   desc:'Top-down analysis: high TF for direction, lower TF for entry. Timeframe confluence for high-probability trades.' },
  // Phase 8
  { id:42, phase:8, title:'Position Sizing 1-2%',       desc:'Why you never risk more than 1-2% per trade. The position size formula that keeps professionals in the game.' },
  { id:43, phase:8, title:'Stop-Loss Placement',        desc:'Logical stops based on structure. Hard vs mental stops. Trailing stops. The rule: never move stops against you.' },
  { id:44, phase:8, title:'Risk/Reward Ratio',          desc:'Minimum 2:1 RR. How even a 40% win rate is profitable with good RR. Expected value thinking.' },
  { id:45, phase:8, title:'Drawdown Management',        desc:'Maximum drawdown rules. When to cut size. How to recover from losses without revenge trading.' },
  // Phase 9
  { id:46, phase:9, title:'Biases & FOMO',              desc:'Cognitive biases that destroy traders: FOMO, recency bias, confirmation bias. Building systematic awareness.' },
  { id:47, phase:9, title:'Disposition Effect',         desc:'Why traders hold losers too long and sell winners too early — and the systematic approach to fight it.' },
  { id:48, phase:9, title:'Overconfidence',             desc:'The Dunning-Kruger effect in trading. How winning streaks create dangerous overconfidence cycles.' },
  { id:49, phase:9, title:'Your Trading Plan',          desc:'Building a complete written trading plan. Rules over feelings. The document that makes you consistent.' },
];

export function getSession(id) {
  return SESSIONS.find(s => s.id === id);
}

export function getPhase(phaseId) {
  return PHASES.find(p => p.id === phaseId);
}
