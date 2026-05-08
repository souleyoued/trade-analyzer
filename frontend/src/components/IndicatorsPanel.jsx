const SIGNAL_COLORS = {
  ACHAT:         { dot: 'bg-buy',   text: 'text-buy'  },
  'ACHAT FORT':  { dot: 'bg-buy',   text: 'text-buy'  },
  VENTE:         { dot: 'bg-sell',  text: 'text-sell' },
  'VENTE FORTE': { dot: 'bg-sell',  text: 'text-sell' },
  HAUSSIER:      { dot: 'bg-buy',   text: 'text-buy'  },
  POSITIF:       { dot: 'bg-buy',   text: 'text-buy'  },
  BAISSIER:      { dot: 'bg-sell',  text: 'text-sell' },
  NÉGATIF:       { dot: 'bg-sell',  text: 'text-sell' },
  NEUTRE:        { dot: 'bg-gray-600', text: 'text-gray-400' },
};

function RSIArc({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = value < 30 ? '#22c55e' : value > 70 ? '#ef4444' : '#f97316';
  const angle = (pct / 100) * 180;
  const toRad = a => (a - 90) * Math.PI / 180;
  const r = 40;
  const cx = 50, cy = 50;
  const startAngle = -180;
  const endAngle = startAngle + angle;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = angle > 180 ? 1 : 0;
  return (
    <div className="flex flex-col items-center py-2">
      <svg width={100} height={55} viewBox="0 0 100 55">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1e1e1e" strokeWidth={8} strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
        )}
        <text x={cx} y={cy + 2} textAnchor="middle" fill={color} fontSize={16} fontWeight="bold" fontFamily="monospace">{value}</text>
      </svg>
      <span className="text-xs" style={{ color }}>
        {value < 30 ? 'Survente' : value > 70 ? 'Surachat' : 'Neutre'}
      </span>
    </div>
  );
}

export default function IndicatorsPanel({ indicators, signals }) {
  if (!indicators) return null;

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-2 border-b border-border">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Indicateurs</span>
      </div>

      {/* RSI */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">RSI (14)</span>
          <span className={`text-xs font-bold ${parseFloat(indicators.rsi) < 30 ? 'text-buy' : parseFloat(indicators.rsi) > 70 ? 'text-sell' : 'text-hold'}`}>
            {parseFloat(indicators.rsi) < 30 ? 'SURVENTE' : parseFloat(indicators.rsi) > 70 ? 'SURACHAT' : 'NEUTRE'}
          </span>
        </div>
        <RSIArc value={parseFloat(indicators.rsi)} />
      </div>

      {/* MACD */}
      {indicators.macd && (
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs text-gray-500 block mb-2">MACD (12,26,9)</span>
          <div className="space-y-1.5">
            {[
              { label: 'MACD', val: indicators.macd.macd, colored: true },
              { label: 'Signal', val: indicators.macd.signal, colored: false },
              { label: 'Histogramme', val: indicators.macd.histogram, colored: true },
            ].map(({ label, val, colored }) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-gray-600">{label}</span>
                <span className={`font-mono font-bold ${colored ? (Number(val) >= 0 ? 'text-buy' : 'text-sell') : 'text-gray-300'}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bollinger */}
      <div className="px-4 py-3 border-b border-border">
        <span className="text-xs text-gray-500 block mb-2">Bollinger (20)</span>
        <div className="space-y-1.5 text-xs">
          {[
            { label: 'Haut', val: indicators.bb.upper, cls: 'text-sell' },
            { label: 'Milieu', val: indicators.bb.middle, cls: 'text-gray-300' },
            { label: 'Bas', val: indicators.bb.lower, cls: 'text-buy' },
          ].map(({ label, val, cls }) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-600">{label}</span>
              <span className={`font-mono ${cls}`}>{val}</span>
            </div>
          ))}
          <div className="mt-2">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Position</span>
              <span className="text-accent font-bold">{indicators.bb.position}%</span>
            </div>
            <div className="h-1 bg-black/50 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${indicators.bb.position}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Signals */}
      <div className="px-4 py-3">
        <span className="text-xs text-gray-500 uppercase tracking-wider block mb-2">Signaux</span>
        <div className="space-y-2">
          {signals.map((s, i) => {
            const cfg = SIGNAL_COLORS[s.signal] || SIGNAL_COLORS.NEUTRE;
            return (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-gray-400 text-xs font-medium truncate">{s.indicator}</span>
                    <span className={`text-xs font-bold shrink-0 ${cfg.text}`}>{s.signal}</span>
                  </div>
                  <p className="text-gray-600 text-xs leading-snug">{s.reason}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
