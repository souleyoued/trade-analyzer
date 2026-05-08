import { useState, useEffect, useRef, useCallback } from 'react';

const TYPE_LABELS = { all: 'Tout', stocks: 'Actions', crypto: 'Cryptos' };

const ACTION_STYLE = {
  'ACHAT FORT':  { bg: 'bg-buy/15',   text: 'text-buy',       border: 'border-buy/40',   dot: 'bg-buy'    },
  'ACHAT':       { bg: 'bg-buy/8',    text: 'text-buy',       border: 'border-buy/25',   dot: 'bg-buy'    },
  'SURVEILLER':  { bg: 'bg-hold/10',  text: 'text-hold',      border: 'border-hold/30',  dot: 'bg-hold'   },
  'ÉVITER':      { bg: 'bg-gray-800', text: 'text-gray-500',  border: 'border-gray-700', dot: 'bg-gray-600'},
};

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function ScoreBar({ score }) {
  const color = score >= 72 ? 'bg-buy' : score >= 52 ? 'bg-green-400' : score >= 35 ? 'bg-hold' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-white w-8 text-right">{score}</span>
    </div>
  );
}

export default function Scanner({ onAnalyze, onAlert }) {
  const [type, setType]         = useState('all');
  const [results, setResults]   = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastScan, setLastScan] = useState(null);
  const [filter, setFilter]     = useState('all'); // all | buy | watch
  const prevScores              = useRef({});
  const sourceRef               = useRef(null);

  const startScan = useCallback((scanType = type) => {
    if (sourceRef.current) sourceRef.current.close();

    setScanning(true);
    setResults([]);
    setProgress({ done: 0, total: 0 });

    // Connect directly to backend — Vite proxy buffers SSE and breaks streaming
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const source = new EventSource(`${backendUrl}/api/scanner/stream?type=${scanType}`);
    sourceRef.current = source;

    source.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'start') {
        setProgress({ done: 0, total: data.total });
      } else if (data.type === 'update' || data.type === 'done') {
        setResults(data.results || []);
        setProgress({ done: data.done, total: data.total });

        // Fire alert if a new ACHAT FORT appears
        if (data.results) {
          data.results.forEach(r => {
            const prev = prevScores.current[r.symbol];
            if (r.action === 'ACHAT FORT' && (!prev || prev.action !== 'ACHAT FORT')) {
              onAlert?.({
                id:             `scanner-${r.symbol}-${Date.now()}`,
                symbol:         r.symbol,
                name:           r.name,
                recommendation: r.action,
                timing:         `Score ${r.score}/100 — Gain estimé +${r.expectedGainPct}%`,
                action:         'BUY',
                currentPrice:   r.currentPrice,
                change24h:      r.change24h,
                currency:       r.currency,
                strategy:       { emoji: '🔍', name: 'Scanner du jour' },
              });
              // Browser notification
              if (Notification.permission === 'granted') {
                new Notification(`🚀 Opportunité : ${r.symbol}`, {
                  body: `Score ${r.score}/100 — ${r.reasons?.[0] || ''}\nPrix: ${r.currency} ${fmt(r.currentPrice)}`
                });
              }
            }
            prevScores.current[r.symbol] = r;
          });
        }

        if (data.type === 'done') {
          setScanning(false);
          setLastScan(new Date());
          source.close();
        }
      }
    };

    source.onerror = () => { setScanning(false); source.close(); };
  }, [type, onAlert]);

  // Auto-scan on mount
  useEffect(() => { startScan(); }, []);

  const handleTypeChange = (t) => {
    setType(t);
    startScan(t);
  };

  const filtered = filter === 'buy'
    ? results.filter(r => r.action === 'ACHAT FORT' || r.action === 'ACHAT')
    : filter === 'watch'
    ? results.filter(r => r.action === 'SURVEILLER')
    : results;

  const buyCount   = results.filter(r => r.action === 'ACHAT FORT' || r.action === 'ACHAT').length;
  const watchCount = results.filter(r => r.action === 'SURVEILLER').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-white font-bold text-lg">Scanner de marché</h2>
              {scanning && <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
            </div>
            <p className="text-gray-500 text-sm">
              {scanning
                ? `Analyse en cours… ${progress.done}/${progress.total} symboles`
                : lastScan
                ? `Dernier scan: ${lastScan.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — ${results.length} symboles analysés`
                : 'Scan des meilleures opportunités du jour'}
            </p>
          </div>

          {/* Type filter */}
          <div className="flex bg-surface rounded-xl p-1 gap-1">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <button
                key={k}
                onClick={() => handleTypeChange(k)}
                disabled={scanning}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  type === k ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={() => startScan()}
            disabled={scanning}
            className="px-4 py-2 rounded-xl border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 text-sm font-semibold transition-all flex items-center gap-2"
          >
            <span className={scanning ? 'animate-spin' : ''}>↻</span>
            {scanning ? 'Scan…' : 'Rescanner'}
          </button>
        </div>

        {/* Progress bar */}
        {scanning && progress.total > 0 && (
          <div className="mt-4">
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats summary */}
        {results.length > 0 && (
          <div className="flex gap-3 mt-4 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'all' ? 'bg-border text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Tous ({results.length})
            </button>
            <button
              onClick={() => setFilter('buy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'buy' ? 'bg-buy/20 text-buy' : 'text-gray-500 hover:text-green-400'}`}
            >
              🚀 Achats ({buyCount})
            </button>
            <button
              onClick={() => setFilter('watch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'watch' ? 'bg-hold/20 text-hold' : 'text-gray-500 hover:text-yellow-400'}`}
            >
              👁 Surveiller ({watchCount})
            </button>
          </div>
        )}
      </div>

      {/* Results list */}
      {filtered.length === 0 && !scanning && (
        <div className="text-center py-16 text-gray-600">
          {results.length > 0 ? 'Aucun résultat pour ce filtre.' : 'Démarrage du scan…'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item, idx) => {
          const style = ACTION_STYLE[item.action] || ACTION_STYLE['ÉVITER'];
          const rank  = results.findIndex(r => r.symbol === item.symbol) + 1;
          return (
            <ScannerRow
              key={item.symbol}
              item={item}
              rank={rank}
              style={style}
              onAnalyze={() => onAnalyze(item.symbol)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ScannerRow({ item, rank, style, onAnalyze }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${style.border}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02]"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Rank */}
        <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
          {rank}
        </div>

        {/* Type dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />

        {/* Symbol + name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-mono font-bold">{item.symbol}</span>
            <span className="text-gray-500 text-xs hidden sm:inline">{item.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
              item.type === 'crypto' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
            }`}>
              {item.type === 'crypto' ? 'CRYPTO' : 'ACTION'}
            </span>
          </div>
          <ScoreBar score={item.score} />
        </div>

        {/* Action */}
        <div className={`text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0 hidden sm:block ${style.bg} ${style.text} ${style.border}`}>
          {item.action}
        </div>

        {/* Price + change */}
        <div className="text-right shrink-0">
          <div className="text-white font-mono text-sm font-bold">
            {fmt(item.currentPrice, item.currentPrice > 100 ? 2 : 4)}
          </div>
          <div className={`text-xs font-semibold ${parseFloat(item.change24h) >= 0 ? 'text-buy' : 'text-sell'}`}>
            {parseFloat(item.change24h) >= 0 ? '+' : ''}{item.change24h}%
          </div>
        </div>

        {/* Expected gain */}
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-buy text-sm font-bold">+{item.expectedGainPct}%</div>
          <div className="text-gray-600 text-xs">estimé</div>
        </div>

        {/* Expand arrow */}
        <div className={`text-gray-600 text-xs shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className={`border-t border-border px-4 py-4 ${style.bg}`}>
          {/* Reasons */}
          {item.reasons?.length > 0 && (
            <div className="mb-4 space-y-1">
              {item.reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-buy">✓</span>
                  <span className="text-gray-300">{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Levels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-gray-500 text-xs">Entrée</p>
              <p className="text-white font-mono font-bold text-sm">{fmt(item.entryPrice)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center border border-buy/20">
              <p className="text-gray-500 text-xs">Objectif</p>
              <p className="text-buy font-mono font-bold text-sm">{fmt(item.targetPrice)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center border border-sell/20">
              <p className="text-gray-500 text-xs">Stop Loss</p>
              <p className="text-sell font-mono font-bold text-sm">{fmt(item.stopLoss)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-gray-500 text-xs">R/R</p>
              <p className={`font-bold text-sm ${parseFloat(item.riskReward) >= 2 ? 'text-buy' : 'text-hold'}`}>
                1:{item.riskReward}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-xs">Volatilité ATR: {item.atrPct}%</span>
            <span className="text-gray-500 text-xs">Confiance: {item.confidence}%</span>
            <button
              onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
              className="ml-auto px-4 py-2 rounded-lg bg-accent/10 border border-accent/40 text-accent text-sm font-semibold hover:bg-accent/20 transition-all"
            >
              Analyser en détail →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
