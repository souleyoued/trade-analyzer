import { useRef, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

function buildLinePath(data, key, xScale, yScale) {
  return data.reduce((acc, d, i) => {
    if (d[key] == null) return acc;
    const cmd = acc === '' ? 'M' : 'L';
    return `${acc}${cmd}${xScale(i).toFixed(1)},${yScale(d[key]).toFixed(1)} `;
  }, '');
}

// Timeframe config: label → { interval, range, refreshMs }
const TIMEFRAMES = [
  { label: '5m',  interval: '5m',  range: '2d',  refresh: 60_000  },
  { label: '15m', interval: '15m', range: '5d',  refresh: 60_000  },
  { label: '1h',  interval: '60m', range: '1mo', refresh: 120_000 },
  { label: '1D',  interval: '1d',  range: null,  refresh: 120_000 },
];

export default function PriceChart({ chartData, entryPrice, targetPrice, stopLoss, symbol, action }) {
  const containerRef  = useRef(null);
  const refreshTimerRef = useRef(null);
  const [width, setWidth]           = useState(700);
  const [tfIdx, setTfIdx]           = useState(0);
  const [intradayData, setIntradayData] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [livePrice, setLivePrice]   = useState(null);
  const [hovered, setHovered]       = useState(null);

  const tf = TIMEFRAMES[tfIdx];
  const is1D = tf.interval === '1d';
  const rawData = is1D ? chartData : (intradayData ?? chartData);

  // Resize observer
  useEffect(() => {
    const ro = new ResizeObserver(e => setWidth(e[0].contentRect.width || 700));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch intraday data
  const fetchIntraday = useCallback(async () => {
    if (!symbol || is1D) return;
    try {
      const res = await axios.get(`/api/chart/${symbol}?interval=${tf.interval}&range=${tf.range}`, { timeout: 15000 });
      setIntradayData(res.data.data || []);
    } catch {}
    setLoadingChart(false);
  }, [symbol, tf.interval, tf.range, is1D]);

  // Schedule auto-refresh for intraday
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (!is1D && symbol) {
      setLoadingChart(true);
      setIntradayData(null);
      fetchIntraday();
      refreshTimerRef.current = setInterval(fetchIntraday, tf.refresh);
    }
    return () => clearInterval(refreshTimerRef.current);
  }, [symbol, tfIdx]);

  // Live price poll every 20s — updates last candle's close visually
  useEffect(() => {
    if (!symbol) return;
    const poll = async () => {
      try {
        const res = await axios.get(`/api/prices?symbols=${symbol}`, { timeout: 8000 });
        const p = res.data[symbol]?.price;
        if (p) setLivePrice(p);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 20_000);
    return () => clearInterval(t);
  }, [symbol]);

  if (!rawData?.length) return (
    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
      {loadingChart ? (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Chargement…
        </div>
      ) : 'Pas de données'}
    </div>
  );

  // Merge live price into last candle
  const visible = rawData.map((d, i) =>
    (i === rawData.length - 1 && livePrice)
      ? { ...d, close: livePrice, high: Math.max(d.high, livePrice), low: Math.min(d.low, livePrice) }
      : d
  );

  const H   = 340;
  const PAD = { t: 12, r: 72, b: 28, l: 8 };
  const cw  = width - PAD.l - PAD.r;
  const ch  = H - PAD.t - PAD.b;

  const allP = visible.flatMap(d => [d.high, d.low]);
  const minP = Math.min(...allP) * 0.997;
  const maxP = Math.max(...allP) * 1.003;

  const xScale = i => PAD.l + (i / Math.max(visible.length - 1, 1)) * cw;
  const yScale = p => PAD.t + ch - ((p - minP) / (maxP - minP)) * ch;

  const candleW = Math.max(Math.floor(cw / visible.length * 0.65), 1.5);

  const yTicks   = 5;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => ({
    price: minP + (i / yTicks) * (maxP - minP),
    y:     yScale(minP + (i / yTicks) * (maxP - minP)),
  }));

  const tickEvery = Math.ceil(visible.length / 5);
  const xTickIdxs = visible.map((_, i) => i).filter(i => i % tickEvery === 0 || i === visible.length - 1);

  const last = visible[visible.length - 1];
  const isLastUp = last.close >= last.open;
  const lastColor = isLastUp ? '#22c55e' : '#ef4444';

  const fmtP = p => {
    if (!p) return '';
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 100)   return p.toFixed(2);
    if (p >= 1)     return p.toFixed(4);
    return p.toFixed(6);
  };

  const hovItem = hovered != null ? visible[hovered] : last;
  const hovUp   = hovItem.close >= hovItem.open;

  return (
    <div className="flex flex-col h-full">
      {/* OHLC bar + timeframe selector */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs font-mono border-b border-border flex-wrap shrink-0">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          <span className="text-accent font-semibold">LIVE</span>
        </div>

        <span className="text-gray-600">|</span>
        <span className="text-gray-500">{hovItem.date}</span>
        <span className="text-gray-400">O <span className="text-white">{fmtP(hovItem.open)}</span></span>
        <span className="text-gray-400">H <span className="text-buy">{fmtP(hovItem.high)}</span></span>
        <span className="text-gray-400">L <span className="text-sell">{fmtP(hovItem.low)}</span></span>
        <span className="text-gray-400">C <span className={`font-bold ${hovUp ? 'text-buy' : 'text-sell'}`}>{fmtP(hovItem.close)}</span></span>
        <span className={hovUp ? 'text-buy' : 'text-sell'}>
          {hovUp ? '+' : ''}{(((hovItem.close - hovItem.open) / hovItem.open) * 100).toFixed(2)}%
        </span>

        {/* Timeframe selector */}
        <div className="ml-auto flex gap-1">
          {TIMEFRAMES.map((t, i) => (
            <button key={t.label} onClick={() => { setTfIdx(i); setHovered(null); }}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                tfIdx === i ? 'bg-accent text-black' : 'text-gray-500 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loadingChart && (
          <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin ml-1" />
        )}
      </div>

      {/* SVG chart */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <svg width={width} height={H} style={{ display: 'block' }}>
          {/* Grid */}
          {gridLines.map(({ price, y }, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={PAD.l + cw} y2={y} stroke="#1a1a1a" strokeWidth={1} />
              <text x={PAD.l + cw + 6} y={y + 4} fill="#444" fontSize={9.5} fontFamily="monospace">
                {fmtP(price)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTickIdxs.map(i => (
            <text key={i} x={xScale(i)} y={H - 4} fill="#444" fontSize={9} textAnchor="middle" fontFamily="monospace">
              {visible[i]?.date?.slice(-5)}
            </text>
          ))}

          {/* Reference lines */}
          {entryPrice && entryPrice >= minP && entryPrice <= maxP && <>
            <line x1={PAD.l} y1={yScale(entryPrice)} x2={PAD.l + cw} y2={yScale(entryPrice)} stroke="#f97316" strokeDasharray="5 3" strokeWidth={1} opacity={0.7} />
            <text x={PAD.l + cw + 6} y={yScale(entryPrice) + 4} fill="#f97316" fontSize={9} fontFamily="monospace">ENT</text>
          </>}
          {targetPrice && targetPrice >= minP && targetPrice <= maxP && <>
            <line x1={PAD.l} y1={yScale(targetPrice)} x2={PAD.l + cw} y2={yScale(targetPrice)} stroke="#22c55e" strokeDasharray="5 3" strokeWidth={1} opacity={0.7} />
            <text x={PAD.l + cw + 6} y={yScale(targetPrice) + 4} fill="#22c55e" fontSize={9} fontFamily="monospace">TP</text>
          </>}
          {stopLoss && stopLoss >= minP && stopLoss <= maxP && <>
            <line x1={PAD.l} y1={yScale(stopLoss)} x2={PAD.l + cw} y2={yScale(stopLoss)} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1} opacity={0.7} />
            <text x={PAD.l + cw + 6} y={yScale(stopLoss) + 4} fill="#ef4444" fontSize={9} fontFamily="monospace">SL</text>
          </>}

          {/* SMA50 — orange */}
          <path d={buildLinePath(visible, 'sma50', xScale, yScale)} fill="none" stroke="#f97316" strokeWidth={1.5} opacity={0.7} />
          {/* SMA20 — dim white */}
          <path d={buildLinePath(visible, 'sma20', xScale, yScale)} fill="none" stroke="#555" strokeWidth={1} opacity={0.6} />

          {/* Candles — green up, red down (standard) */}
          {visible.map((d, i) => {
            const up  = d.close >= d.open;
            const col = up ? '#22c55e' : '#ef4444';
            const cx  = xScale(i);
            const bTop = yScale(Math.max(d.open, d.close));
            const bBot = yScale(Math.min(d.open, d.close));
            const wTop = yScale(d.high);
            const wBot = yScale(d.low);
            const isHov = hovered === i;
            const isLast = i === visible.length - 1;
            return (
              <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                <rect x={cx - 8} y={PAD.t} width={16} height={ch} fill="transparent" />
                <line x1={cx} y1={wTop} x2={cx} y2={wBot} stroke={col} strokeWidth={1} opacity={isHov ? 1 : 0.9} />
                <rect
                  x={cx - candleW / 2} y={bTop} width={candleW} height={Math.max(bBot - bTop, 1)}
                  fill={col} stroke={col} strokeWidth={0.5} opacity={isHov || isLast ? 1 : 0.9}
                />
                {/* Pulse on last candle */}
                {isLast && (
                  <circle cx={cx} cy={yScale(d.close)} r={3} fill={col} opacity={0.9}>
                    <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Hover crosshair */}
          {hovered != null && (
            <line x1={xScale(hovered)} y1={PAD.t} x2={xScale(hovered)} y2={PAD.t + ch}
              stroke="#333" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {/* Current price pill on Y axis */}
          <rect x={PAD.l + cw + 2} y={yScale(last.close) - 9} width={66} height={16} fill={lastColor} rx={2} />
          <text x={PAD.l + cw + 35} y={yScale(last.close) + 4} fill="black" fontSize={9.5}
            fontFamily="monospace" textAnchor="middle" fontWeight="bold">
            {fmtP(last.close)}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-4 py-2 text-xs border-t border-border shrink-0">
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-4 h-3 bg-buy opacity-80 rounded-sm" />Haussier
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-4 h-3 bg-sell opacity-80 rounded-sm" />Baissier
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-5 border-t-2 border-orange-400 opacity-70" />SMA50
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-5 border-t border-gray-500 opacity-70" />SMA20
        </span>
        {entryPrice && <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-5 border-t border-dashed border-accent opacity-70" />Entrée
        </span>}
        {targetPrice && <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-5 border-t border-dashed border-buy opacity-70" />TP
        </span>}
        {stopLoss && <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block w-5 border-t border-dashed border-sell opacity-70" />SL
        </span>}
        <span className="ml-auto text-gray-600 text-xs">
          Prix mis à jour toutes les 20s
        </span>
      </div>
    </div>
  );
}
