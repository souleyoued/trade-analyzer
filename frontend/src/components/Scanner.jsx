import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const TYPE_LABELS = { all: 'Tout', stocks: 'Actions', crypto: 'Cryptos' };

const ACTION_STYLE = {
  'ACHAT FORT':  { bg: 'bg-accent/15',  text: 'text-accent',      border: 'border-accent/40',  dot: 'bg-accent'     },
  'ACHAT':       { bg: 'bg-accent/8',   text: 'text-accent',      border: 'border-accent/25',  dot: 'bg-accent'     },
  'SURVEILLER':  { bg: 'bg-hold/10',    text: 'text-hold',        border: 'border-hold/30',    dot: 'bg-hold'       },
  'ÉVITER':      { bg: 'bg-gray-800',   text: 'text-gray-500',    border: 'border-gray-700',   dot: 'bg-gray-600'   },
};

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function ScoreBar({ score }) {
  const color = score >= 72 ? 'bg-accent' : score >= 52 ? 'bg-orange-400' : score >= 35 ? 'bg-hold' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-white w-8 text-right">{score}</span>
    </div>
  );
}

const RESCAN_INTERVAL  = 5 * 60 * 1000; // full rescan every 5 min
const PRICE_INTERVAL   = 45 * 1000;     // price-only refresh every 45s

export default function Scanner({ onAnalyze, onAlert }) {
  const [type, setType]             = useState('all');
  const [results, setResults]       = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [lastScan, setLastScan]     = useState(null);
  const [nextScanIn, setNextScanIn] = useState(null);
  const [filter, setFilter]         = useState('all');
  const prevScores    = useRef({});
  const sourceRef     = useRef(null);
  const rescanTimer   = useRef(null);
  const priceTimer    = useRef(null);

  // Fake progress ticks
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => setProgress(p => ({ ...p, done: Math.min(p.done + 1, p.total - 2) })), 600);
    return () => clearInterval(t);
  }, [scanning]);

  // Countdown to next scan
  useEffect(() => {
    if (!lastScan || scanning) { setNextScanIn(null); return; }
    const t = setInterval(() => {
      const rem = Math.max(0, RESCAN_INTERVAL - (Date.now() - lastScan.getTime()));
      setNextScanIn(Math.ceil(rem / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastScan, scanning]);

  // Live price polling — lightweight, runs between full scans
  const fetchLivePrices = useCallback(async (currentResults) => {
    const list = currentResults || results;
    if (!list.length) return;
    const syms = list.map(r => r.symbol).join(',');
    try {
      const res = await axios.get(`/api/prices?symbols=${syms}`, { timeout: 15000 });
      setLivePrices(res.data || {});
    } catch {}
  }, [results]);

  // Start price polling once results exist
  useEffect(() => {
    if (!results.length) return;
    if (priceTimer.current) clearInterval(priceTimer.current);
    fetchLivePrices(results);
    priceTimer.current = setInterval(() => fetchLivePrices(results), PRICE_INTERVAL);
    return () => clearInterval(priceTimer.current);
  }, [results]);

  const startScan = useCallback(async (scanType = type) => {
    if (sourceRef.current) sourceRef.current.cancelled = true;
    const ctrl = { cancelled: false };
    sourceRef.current = ctrl;
    if (rescanTimer.current) clearTimeout(rescanTimer.current);

    setScanning(true);
    setResults([]);
    setLivePrices({});
    setProgress({ done: 0, total: 23 });

    try {
      const res = await axios.get(`/api/scanner?type=${scanType}`, { timeout: 30000 });
      if (ctrl.cancelled) return;

      const incoming = res.data.results || [];
      setResults(incoming);
      setProgress({ done: res.data.scanned || incoming.length, total: res.data.total || 23 });

      incoming.forEach(r => {
        const prev = prevScores.current[r.symbol];
        if (r.action === 'ACHAT FORT' && (!prev || prev.action !== 'ACHAT FORT')) {
          onAlert?.({
            id: `scanner-${r.symbol}-${Date.now()}`,
            symbol: r.symbol, name: r.name,
            recommendation: r.action,
            timing: `Score ${r.score}/100 — Gain estimé +${r.expectedGainPct}%`,
            action: 'BUY',
            currentPrice: r.currentPrice, change24h: r.change24h, currency: r.currency,
            strategy: { emoji: '🔍', name: 'Scanner du jour' },
          });
          if (Notification.permission === 'granted') {
            new Notification(`🚀 Opportunité : ${r.symbol}`, {
              body: `Score ${r.score}/100 — ${r.reasons?.[0] || ''}\nPrix: ${r.currency} ${fmt(r.currentPrice)}`
            });
          }
        }
        prevScores.current[r.symbol] = r;
      });
    } catch (err) {
      if (!ctrl.cancelled) console.error('Scanner error:', err.message);
    } finally {
      if (!ctrl.cancelled) {
        setScanning(false);
        setLastScan(new Date());
        rescanTimer.current = setTimeout(() => startScan(scanType), RESCAN_INTERVAL);
      }
    }
  }, [type, onAlert]);

  useEffect(() => { startScan(); }, []);

  const handleTypeChange = (t) => { setType(t); startScan(t); };

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
                ? <>
                    <span className="text-accent font-semibold">● LIVE</span>
                    {' '}— Mis à jour {lastScan.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    {nextScanIn != null && ` — prochain scan dans ${Math.floor(nextScanIn / 60)}:${String(nextScanIn % 60).padStart(2, '0')}`}
                  </>
                : 'Scan des meilleures opportunités du jour'}
            </p>
          </div>

          <div className="flex bg-surface rounded-xl p-1 gap-1">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => handleTypeChange(k)} disabled={scanning}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  type === k ? 'bg-accent text-black font-bold' : 'text-gray-400 hover:text-white'
                }`}>{v}</button>
            ))}
          </div>

          <button onClick={() => startScan()} disabled={scanning}
            className="px-4 py-2 rounded-xl border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 text-sm font-semibold transition-all flex items-center gap-2">
            <span className={scanning ? 'animate-spin' : ''}>↻</span>
            {scanning ? 'Scan…' : 'Rescanner'}
          </button>
        </div>

        {scanning && progress.total > 0 && (
          <div className="mt-4">
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="flex gap-3 mt-4 flex-wrap">
            <button onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'all' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-gray-300'}`}>
              Tous ({results.length})
            </button>
            <button onClick={() => setFilter('buy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'buy' ? 'bg-accent/20 text-accent' : 'text-gray-500 hover:text-accent'}`}>
              🚀 Achats ({buyCount})
            </button>
            <button onClick={() => setFilter('watch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === 'watch' ? 'bg-hold/20 text-hold' : 'text-gray-500 hover:text-yellow-400'}`}>
              👁 Surveiller ({watchCount})
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 && !scanning && (
        <div className="text-center py-16 text-gray-600">
          {results.length > 0 ? 'Aucun résultat pour ce filtre.' : 'Démarrage du scan…'}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => {
          const style = ACTION_STYLE[item.action] || ACTION_STYLE['ÉVITER'];
          const rank  = results.findIndex(r => r.symbol === item.symbol) + 1;
          const live  = livePrices[item.symbol];
          return (
            <ScannerRow key={item.symbol} item={item} rank={rank} style={style}
              livePrice={live?.price} liveChange={live?.change24h}
              onAnalyze={() => onAnalyze(item.symbol)} />
          );
        })}
      </div>
    </div>
  );
}

function ScannerRow({ item, rank, style, livePrice, liveChange, onAnalyze }) {
  const [expanded, setExpanded] = useState(false);
  const [flashClass, setFlashClass] = useState('');
  const prevPriceRef = useRef(null);

  const displayPrice  = livePrice  ?? item.currentPrice;
  const displayChange = liveChange ?? item.change24h;

  // Flash when live price updates
  useEffect(() => {
    if (livePrice == null) return;
    if (prevPriceRef.current == null) { prevPriceRef.current = livePrice; return; }
    if (livePrice !== prevPriceRef.current) {
      const dir = livePrice > prevPriceRef.current ? 'flash-up' : 'flash-down';
      setFlashClass(dir);
      const t = setTimeout(() => setFlashClass(''), 1300);
      prevPriceRef.current = livePrice;
      return () => clearTimeout(t);
    }
  }, [livePrice]);

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${style.border}`}>
      <div className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] rounded-xl ${flashClass}`}
        onClick={() => setExpanded(e => !e)}>

        <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
          {rank}
        </div>

        <div className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-mono font-bold">{item.symbol}</span>
            <span className="text-gray-500 text-xs hidden sm:inline">{item.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
              item.type === 'crypto' ? 'bg-accent/10 text-accent' : 'bg-white/5 text-gray-400'
            }`}>
              {item.type === 'crypto' ? 'CRYPTO' : 'ACTION'}
            </span>
          </div>
          <ScoreBar score={item.score} />
        </div>

        <div className={`text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0 hidden sm:block ${style.bg} ${style.text} ${style.border}`}>
          {item.action}
        </div>

        <div className="text-right shrink-0">
          <div className="text-white font-mono text-sm font-bold">
            {fmt(displayPrice, displayPrice > 100 ? 2 : 4)}
          </div>
          <div className={`text-xs font-semibold ${parseFloat(displayChange) >= 0 ? 'text-accent' : 'text-sell'}`}>
            {parseFloat(displayChange) >= 0 ? '+' : ''}{displayChange}%
          </div>
        </div>

        <div className="text-right shrink-0 hidden md:block">
          <div className="text-accent text-sm font-bold">+{item.expectedGainPct}%</div>
          <div className="text-gray-600 text-xs">estimé</div>
        </div>

        <div className={`text-gray-600 text-xs shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</div>
      </div>

      {expanded && (
        <div className={`border-t border-border px-4 py-4 ${style.bg}`}>
          {item.reasons?.length > 0 && (
            <div className="mb-4 space-y-1">
              {item.reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-accent">✓</span>
                  <span className="text-gray-300">{r}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-gray-500 text-xs">Entrée</p>
              <p className="text-white font-mono font-bold text-sm">{fmt(item.entryPrice)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center border border-accent/20">
              <p className="text-gray-500 text-xs">Objectif</p>
              <p className="text-accent font-mono font-bold text-sm">{fmt(item.targetPrice)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center border border-sell/20">
              <p className="text-gray-500 text-xs">Stop Loss</p>
              <p className="text-sell font-mono font-bold text-sm">{fmt(item.stopLoss)}</p>
            </div>
            <div className="bg-surface rounded-lg p-2 text-center">
              <p className="text-gray-500 text-xs">R/R</p>
              <p className={`font-bold text-sm ${parseFloat(item.riskReward) >= 2 ? 'text-accent' : 'text-hold'}`}>
                1:{item.riskReward}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-xs">ATR: {item.atrPct}%</span>
            <span className="text-gray-500 text-xs">Confiance: {item.confidence}%</span>
            <button onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
              className="ml-auto px-4 py-2 rounded-lg bg-accent/10 border border-accent/40 text-accent text-sm font-semibold hover:bg-accent/20 transition-all">
              Analyser en détail →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
