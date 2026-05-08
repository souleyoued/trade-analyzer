const SIGNAL_COLORS = {
  ACHAT:       { bg: 'bg-buy/10',   text: 'text-buy',   border: 'border-buy/30'   },
  'ACHAT FORT':{ bg: 'bg-buy/20',   text: 'text-buy',   border: 'border-buy'      },
  VENTE:       { bg: 'bg-sell/10',  text: 'text-sell',  border: 'border-sell/30'  },
  'VENTE FORTE':{ bg: 'bg-sell/20', text: 'text-sell',  border: 'border-sell'     },
  HAUSSIER:    { bg: 'bg-buy/10',   text: 'text-buy',   border: 'border-buy/20'   },
  POSITIF:     { bg: 'bg-buy/10',   text: 'text-buy',   border: 'border-buy/20'   },
  BAISSIER:    { bg: 'bg-sell/10',  text: 'text-sell',  border: 'border-sell/20'  },
  NÉGATIF:     { bg: 'bg-sell/10',  text: 'text-sell',  border: 'border-sell/20'  },
  NEUTRE:      { bg: 'bg-gray-800', text: 'text-gray-400', border: 'border-gray-700' },
};

function RSIGauge({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = value < 30 ? '#22c55e' : value > 70 ? '#ef4444' : '#6366f1';
  const angle = (pct / 100) * 180 - 90;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-12 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full">
          <path d="M5 50 A45 45 0 0 1 95 50" fill="none" stroke="#2a2d3a" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M5 50 A45 45 0 0 1 95 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${pct * 1.41} 141`}
          />
          <line
            x1="50" y1="50"
            x2={50 + 35 * Math.cos((angle * Math.PI) / 180)}
            y2={50 - 35 * Math.sin(((angle + 180) * Math.PI) / 180 - Math.PI)}
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-xl font-bold" style={{ color }}>{value}</span>
      <span className="text-gray-500 text-xs mt-0.5">
        {value < 30 ? 'Survente' : value > 70 ? 'Surachat' : 'Neutre'}
      </span>
    </div>
  );
}

export default function IndicatorsPanel({ indicators, signals }) {
  if (!indicators) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 h-full">
      <h2 className="text-white font-bold text-base mb-4">Indicateurs techniques</h2>

      {/* RSI */}
      <div className="bg-surface rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm font-medium">RSI (14)</span>
        </div>
        <RSIGauge value={parseFloat(indicators.rsi)} />
      </div>

      {/* MACD */}
      {indicators.macd && (
        <div className="bg-surface rounded-xl p-4 mb-3">
          <p className="text-gray-400 text-sm font-medium mb-2">MACD (12,26,9)</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">MACD</span>
              <span className={`font-mono font-bold ${indicators.macd.macd >= 0 ? 'text-buy' : 'text-sell'}`}>
                {indicators.macd.macd}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Signal</span>
              <span className="font-mono text-gray-300">{indicators.macd.signal}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Histogramme</span>
              <span className={`font-mono font-bold ${indicators.macd.histogram >= 0 ? 'text-buy' : 'text-sell'}`}>
                {indicators.macd.histogram}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bollinger */}
      <div className="bg-surface rounded-xl p-4 mb-3">
        <p className="text-gray-400 text-sm font-medium mb-2">Bollinger Bands</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Haut</span>
            <span className="text-sell font-mono">{indicators.bb.upper}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Milieu (SMA20)</span>
            <span className="text-gray-300 font-mono">{indicators.bb.middle}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Bas</span>
            <span className="text-buy font-mono">{indicators.bb.lower}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Position</span>
            <span className="text-accent font-bold">{indicators.bb.position}%</span>
          </div>
        </div>
      </div>

      {/* Signals summary */}
      <div className="space-y-2">
        <p className="text-gray-400 text-sm font-medium">Signaux</p>
        {signals.map((s, i) => {
          const cfg = SIGNAL_COLORS[s.signal] || SIGNAL_COLORS.NEUTRE;
          return (
            <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
              <div>
                <span className="text-gray-300 text-xs font-medium">{s.indicator}</span>
                <p className="text-gray-500 text-xs">{s.reason}</p>
              </div>
              <span className={`text-xs font-bold ${cfg.text}`}>{s.signal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
