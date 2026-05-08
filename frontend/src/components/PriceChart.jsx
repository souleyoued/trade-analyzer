import { useRef, useEffect, useState } from 'react';

function buildLinePath(data, key, xScale, yScale) {
  return data.reduce((acc, d, i) => {
    if (d[key] == null) return acc;
    const cmd = acc === '' ? 'M' : 'L';
    return `${acc}${cmd}${xScale(i).toFixed(1)},${yScale(d[key]).toFixed(1)} `;
  }, '');
}

const TIMEFRAMES = ['1M', '3M', '6M', 'MAX'];

export default function PriceChart({ chartData, entryPrice, targetPrice, stopLoss, symbol, action }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(700);
  const [tf, setTf] = useState('3M');
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(e => setWidth(e[0].contentRect.width || 700));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!chartData?.length) return null;

  const tfDays = { '1M': 22, '3M': 66, '6M': chartData.length, 'MAX': chartData.length };
  const visible = chartData.slice(-Math.min(tfDays[tf], chartData.length));

  const H = 340;
  const PAD = { t: 12, r: 70, b: 28, l: 8 };
  const cw = width - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  const allP = visible.flatMap(d => [d.high, d.low]);
  const minP = Math.min(...allP) * 0.997;
  const maxP = Math.max(...allP) * 1.003;

  const xScale = i => PAD.l + (i / Math.max(visible.length - 1, 1)) * cw;
  const yScale = p => PAD.t + ch - ((p - minP) / (maxP - minP)) * ch;

  const candleW = Math.max(Math.floor(cw / visible.length * 0.65), 1.5);

  const yTicks = 5;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const price = minP + (i / yTicks) * (maxP - minP);
    return { price, y: yScale(price) };
  });

  const tickEvery = Math.ceil(visible.length / 5);
  const xTickIdxs = visible.map((_, i) => i).filter(i => i % tickEvery === 0 || i === visible.length - 1);

  const last = visible[visible.length - 1];
  const isUp = last.close >= last.open;

  const fmtPrice = p => {
    if (!p) return '';
    if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 100)   return p.toFixed(2);
    if (p >= 1)     return p.toFixed(4);
    return p.toFixed(6);
  };

  const hovItem = hovered != null ? visible[hovered] : last;

  return (
    <div className="flex flex-col h-full">
      {/* OHLC bar */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs font-mono border-b border-border flex-wrap">
        <span className="text-gray-500">{hovItem.date}</span>
        <span className="text-gray-400">O <span className="text-white">{fmtPrice(hovItem.open)}</span></span>
        <span className="text-gray-400">H <span className="text-buy">{fmtPrice(hovItem.high)}</span></span>
        <span className="text-gray-400">L <span className="text-sell">{fmtPrice(hovItem.low)}</span></span>
        <span className="text-gray-400">C <span className="text-white font-bold">{fmtPrice(hovItem.close)}</span></span>
        <span className={hovItem.close >= hovItem.open ? 'text-accent' : 'text-sell'}>
          {hovItem.close >= hovItem.open ? '+' : ''}{(((hovItem.close - hovItem.open) / hovItem.open) * 100).toFixed(2)}%
        </span>

        {/* Timeframe selector */}
        <div className="ml-auto flex gap-1">
          {TIMEFRAMES.map(t => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                tf === t ? 'bg-accent text-black' : 'text-gray-500 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 relative">
        <svg width={width} height={H} style={{ display: 'block' }}>
          {/* Grid */}
          {gridLines.map(({ price, y }, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={PAD.l + cw} y2={y} stroke="#1a1a1a" strokeWidth={1} />
              <text x={PAD.l + cw + 6} y={y + 4} fill="#444" fontSize={9.5} fontFamily="monospace">
                {fmtPrice(price)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTickIdxs.map(i => (
            <text key={i} x={xScale(i)} y={H - 4} fill="#444" fontSize={9} textAnchor="middle" fontFamily="monospace">
              {visible[i]?.date?.slice(5)}
            </text>
          ))}

          {/* Ref lines */}
          {entryPrice && entryPrice >= minP && entryPrice <= maxP && (
            <>
              <line x1={PAD.l} y1={yScale(entryPrice)} x2={PAD.l + cw} y2={yScale(entryPrice)} stroke="#f97316" strokeDasharray="5 3" strokeWidth={1} opacity={0.7} />
              <text x={PAD.l + cw + 6} y={yScale(entryPrice) + 4} fill="#f97316" fontSize={9} fontFamily="monospace">ENT</text>
            </>
          )}
          {targetPrice && targetPrice >= minP && targetPrice <= maxP && (
            <>
              <line x1={PAD.l} y1={yScale(targetPrice)} x2={PAD.l + cw} y2={yScale(targetPrice)} stroke="#22c55e" strokeDasharray="5 3" strokeWidth={1} opacity={0.7} />
              <text x={PAD.l + cw + 6} y={yScale(targetPrice) + 4} fill="#22c55e" fontSize={9} fontFamily="monospace">TP</text>
            </>
          )}
          {stopLoss && stopLoss >= minP && stopLoss <= maxP && (
            <>
              <line x1={PAD.l} y1={yScale(stopLoss)} x2={PAD.l + cw} y2={yScale(stopLoss)} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1} opacity={0.7} />
              <text x={PAD.l + cw + 6} y={yScale(stopLoss) + 4} fill="#ef4444" fontSize={9} fontFamily="monospace">SL</text>
            </>
          )}

          {/* SMA50 — orange */}
          <path d={buildLinePath(visible, 'sma50', xScale, yScale)} fill="none" stroke="#f97316" strokeWidth={1.5} opacity={0.7} />
          {/* SMA20 — white/dim */}
          <path d={buildLinePath(visible, 'sma20', xScale, yScale)} fill="none" stroke="#666" strokeWidth={1} opacity={0.6} />

          {/* Candles */}
          {visible.map((d, i) => {
            const up = d.close >= d.open;
            const col = up ? '#f97316' : '#ef4444';
            const cx = xScale(i);
            const bTop = yScale(Math.max(d.open, d.close));
            const bBot = yScale(Math.min(d.open, d.close));
            const wTop = yScale(d.high);
            const wBot = yScale(d.low);
            const isHov = hovered === i;
            return (
              <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                <rect x={cx - 8} y={PAD.t} width={16} height={ch} fill="transparent" />
                <line x1={cx} y1={wTop} x2={cx} y2={wBot} stroke={col} strokeWidth={1} opacity={isHov ? 1 : 0.85} />
                <rect
                  x={cx - candleW / 2}
                  y={bTop}
                  width={candleW}
                  height={Math.max(bBot - bTop, 1)}
                  fill={up ? col : col}
                  stroke={col}
                  strokeWidth={0.5}
                  opacity={isHov ? 1 : 0.85}
                />
              </g>
            );
          })}

          {/* Hover vertical line */}
          {hovered != null && (
            <line
              x1={xScale(hovered)} y1={PAD.t}
              x2={xScale(hovered)} y2={PAD.t + ch}
              stroke="#333" strokeWidth={1} strokeDasharray="3 3"
            />
          )}

          {/* Current price label on right axis */}
          <rect x={PAD.l + cw + 2} y={yScale(last.close) - 9} width={64} height={16} fill={isUp ? '#f97316' : '#ef4444'} rx={2} />
          <text x={PAD.l + cw + 34} y={yScale(last.close) + 4} fill="black" fontSize={9.5} fontFamily="monospace" textAnchor="middle" fontWeight="bold">
            {fmtPrice(last.close)}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-4 py-2 text-xs border-t border-border">
        <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-px bg-orange-400 opacity-70" />SMA50</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-px bg-gray-500" />SMA20</span>
        {entryPrice && <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t border-dashed border-orange-400" />Entrée</span>}
        {targetPrice && <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t border-dashed border-buy" />Objectif</span>}
        {stopLoss && <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t border-dashed border-sell" />Stop Loss</span>}
      </div>
    </div>
  );
}
