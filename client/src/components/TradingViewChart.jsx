import { useEffect, useRef } from 'react';

// Load TradingView script once globally
let tvReady = false;
let tvLoading = false;
const tvQueue = [];

function ensureScript(cb) {
  if (tvReady) { cb(); return; }
  tvQueue.push(cb);
  if (!tvLoading) {
    tvLoading = true;
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.onload = () => {
      tvReady = true;
      tvQueue.forEach(fn => fn());
      tvQueue.length = 0;
    };
    document.head.appendChild(s);
  }
}

let uid = 0;

// Parent should set key={symbol+'|'+interval} to force remount on change
export default function TradingViewChart({ symbol = 'BINANCE:BTCUSDT', interval = 'D' }) {
  const id = useRef(`tv_${++uid}`).current;

  useEffect(() => {
    ensureScript(() => {
      if (!window.TradingView) return;
      new window.TradingView.widget({
        autosize: true,
        symbol,
        interval,
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#161b22',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        withdateranges: true,
        container_id: id,
      });
    });
  }, []); // remounted by parent key change

  return (
    <div
      id={id}
      style={{ width: '100%', height: '100%', minHeight: '420px', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}
