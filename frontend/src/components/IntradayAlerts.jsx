import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

function fmt(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (v >= 10000)  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100)    return v.toFixed(2);
  if (v >= 1)      return v.toFixed(4);
  if (v >= 0.01)   return v.toFixed(5);
  if (v >= 0.0001) return v.toFixed(7);
  return v.toFixed(10);
}

function TypeBadge({ type }) {
  const cfg = {
    crypto: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    etf:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
    stock:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    micro:  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  }[type] || 'bg-gray-700 text-gray-400 border-gray-600';
  const label = { crypto: 'CRYPTO', etf: 'ETF 3x', stock: 'ACTION', micro: '< $1' }[type] || type.toUpperCase();
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg}`}>{label}</span>;
}

function MarketBadge({ market, cryptoOnly }) {
  if (!market) return null;
  if (cryptoOnly) return (
    <span className="flex items-center gap-1.5 text-orange-400 text-xs font-bold">
      <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse inline-block" />
      CRYPTO ONLY — Marché US fermé
    </span>
  );
  if (market.isOpen)    return <span className="flex items-center gap-1.5 text-buy text-xs font-bold"><span className="w-2 h-2 rounded-full bg-buy animate-pulse inline-block" />MARCHÉ OUVERT</span>;
  if (market.isPreMkt)  return <span className="flex items-center gap-1.5 text-accent text-xs font-bold"><span className="w-2 h-2 rounded-full bg-accent animate-pulse inline-block" />PRÉ-MARCHÉ</span>;
  if (market.isWeekend) return <span className="flex items-center gap-1.5 text-gray-500 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />WEEK-END</span>;
  return <span className="flex items-center gap-1.5 text-gray-500 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />APRÈS-BOURSE</span>;
}

function SignalCard({ signal, onAnalyze, isNew, showAge }) {
  const up      = signal.action === 'BUY';
  const timeStr = new Date(signal.timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const ageMin  = Math.floor((Date.now() - new Date(signal.timestamp).getTime()) / 60000);
  const ttlMin  = 30;
  const remaining = ttlMin - ageMin;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${
      isNew
        ? up ? 'border-buy/50 bg-buy/5 shadow-lg' : 'border-sell/50 bg-sell/5 shadow-lg'
        : up ? 'border-buy/20 hover:border-buy/35' : 'border-sell/20 hover:border-sell/35'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isNew && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent text-black animate-pulse">NOUVEAU</span>
          )}
          <button
            onClick={() => onAnalyze(signal.symbol)}
            className="text-white font-black font-mono text-lg hover:text-accent transition-colors"
          >
            {signal.symbol}
          </button>
          <TypeBadge type={signal.type} />
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${up ? 'bg-buy/15 text-buy' : 'bg-sell/15 text-sell'}`}>
            {up ? '↑ ENTRÉE' : '↓ SORTIE'}
          </span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-white font-mono font-bold">{fmt(signal.currentPrice)}</div>
          <div className={`text-xs ${parseFloat(signal.change5m) >= 0 ? 'text-buy' : 'text-sell'}`}>
            {parseFloat(signal.change5m) >= 0 ? '+' : ''}{signal.change5m}% (5m)
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between -mt-1">
        <span className="text-gray-500 text-xs">{signal.name} · {timeStr}</span>
        {showAge && (
          <span className={`text-[10px] font-mono ${remaining <= 5 ? 'text-sell' : 'text-gray-600'}`}>
            ⏱ expire dans {remaining}min
          </span>
        )}
      </div>

      {/* Price targets */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card2 rounded-lg p-2 text-center">
          <div className="text-gray-600 text-[10px] mb-0.5">Entrée</div>
          <div className="text-white font-mono text-xs font-bold">{fmt(signal.entryPrice)}</div>
        </div>
        <div className={`border rounded-lg p-2 text-center ${up ? 'bg-buy/5 border-buy/20' : 'bg-sell/5 border-sell/20'}`}>
          <div className={`text-[10px] mb-0.5 ${up ? 'text-buy/60' : 'text-sell/60'}`}>
            {up ? `TP +${signal.tpPct}%` : `TP -${signal.tpPct}%`}
          </div>
          <div className={`font-mono text-xs font-bold ${up ? 'text-buy' : 'text-sell'}`}>
            {fmt(signal.targetPrice)}
          </div>
        </div>
        <div className="bg-sell/5 border border-sell/20 rounded-lg p-2 text-center">
          <div className="text-sell/60 text-[10px] mb-0.5">SL -{signal.slPct}%</div>
          <div className="text-sell font-mono text-xs font-bold">{fmt(signal.stopLoss)}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs">
        <div>
          <span className="text-gray-600">Levier </span>
          <span className="text-accent font-bold font-mono">x{signal.leverage}</span>
          <span className="text-gray-600 ml-0.5">→ +25%</span>
        </div>
        <div>
          <span className="text-gray-600">RSI </span>
          <span className="text-gray-300 font-mono">{signal.rsi}</span>
        </div>
        <div>
          <span className="text-gray-600">ATR </span>
          <span className="text-gray-300 font-mono">{signal.atrPct}%</span>
        </div>
      </div>

      {/* Reasons */}
      {signal.reasons?.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          {signal.reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
              <span className="text-accent shrink-0 mt-0.5">▸</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => onAnalyze(signal.symbol)}
        className="w-full py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-semibold hover:bg-accent/10 transition-all"
      >
        Analyse complète →
      </button>
    </div>
  );
}

const SCAN_INTERVAL = 60;
const HISTORY_TTL   = 30 * 60 * 1000; // purge signals older than 30 min

export default function IntradayAlerts({ onAnalyze, onNewAlerts }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [countdown, setCountdown] = useState(SCAN_INTERVAL);
  const [history, setHistory]   = useState([]);
  const [newIds, setNewIds]     = useState(new Set());
  const seenRef  = useRef(new Set());
  const audioRef = useRef(null);

  const sigId   = (s) => `${s.symbol}-${s.candleTime}-${s.action}`;
  const isStale = (s) => Date.now() - new Date(s.timestamp).getTime() > HISTORY_TTL;

  const purgeHistory = useCallback(() => {
    setHistory(prev => {
      const fresh = prev.filter(s => !isStale(s));
      // Also remove from seenRef so a renewed signal can re-trigger
      if (fresh.length < prev.length) {
        prev.filter(isStale).forEach(s => seenRef.current.delete(sigId(s)));
      }
      return fresh;
    });
  }, []);

  const playBeep = useCallback((buy) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx  = audioRef.current;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(buy ? 880 : 440, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  const scan = useCallback(async () => {
    purgeHistory();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/intraday-scan', { timeout: 25000 });
      setData(res.data);

      const fresh = res.data.signals.filter(s => !seenRef.current.has(sigId(s)));

      if (fresh.length > 0) {
        const freshSet = new Set(fresh.map(sigId));
        fresh.forEach(s => seenRef.current.add(sigId(s)));

        setNewIds(prev => new Set([...prev, ...freshSet]));
        setHistory(prev => [...fresh, ...prev].slice(0, 50));
        onNewAlerts?.(fresh.length);
        playBeep(fresh[0].action === 'BUY');

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          fresh.forEach(s => {
            try {
              new Notification(
                `${s.action === 'BUY' ? '🟢' : '🔴'} ${s.symbol} — Signal ${s.action === 'BUY' ? 'ENTRÉE' : 'SORTIE'}`,
                { body: `Entrée: ${fmt(s.entryPrice)} | TP +${s.tpPct}% | ${s.reasons[0]}`, silent: true }
              );
            } catch {}
          });
        }

        // Clear "NOUVEAU" badge after 10s
        setTimeout(() => {
          setNewIds(prev => {
            const next = new Set(prev);
            freshSet.forEach(id => next.delete(id));
            return next;
          });
        }, 10000);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur lors du scan intraday');
    } finally {
      setLoading(false);
      setCountdown(SCAN_INTERVAL);
    }
  }, [playBeep, onNewAlerts, purgeHistory]);

  // Initial scan + periodic refresh
  useEffect(() => {
    scan();
    const interval = setInterval(scan, SCAN_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [scan]);

  // Countdown ticker
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // Purge stale signals every minute independently of scan
  useEffect(() => {
    const t = setInterval(purgeHistory, 60_000);
    return () => clearInterval(t);
  }, [purgeHistory]);

  // Request browser notification permission
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const activeSignals = data?.signals || [];
  // Merge active signals with history, deduplicating
  const activeIds  = new Set(activeSignals.map(sigId));
  const olderHistory = history.filter(s => !activeIds.has(sigId(s)));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white font-black text-lg">🔔 Alertes Intraday</span>
            <MarketBadge market={data?.market} cryptoOnly={data?.cryptoOnly} />
          </div>
          <p className="text-gray-600 text-xs mt-0.5">
            Signaux d'entrée/sortie en temps réel — scan toutes les{' '}
            <span className="text-accent font-bold">60s</span> · Notification navigateur + son
          </p>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-center">
            <div className="text-gray-600 text-[10px]">Prochain scan</div>
            <span className="font-mono font-bold text-accent">{String(countdown).padStart(2, '0')}s</span>
          </div>
          <button
            onClick={() => { scan(); setCountdown(SCAN_INTERVAL); }}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-border text-gray-500 text-xs hover:border-accent/40 hover:text-accent transition-all disabled:opacity-40"
          >
            {loading ? '⟳ Scan…' : '↻ Scanner'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Stats bar */}
        {data && (
          <div className="flex items-center gap-6 mb-6 p-3 rounded-xl bg-card border border-border">
            <div className="text-center">
              <div className="text-accent font-black text-xl">{activeSignals.length}</div>
              <div className="text-gray-600 text-xs">Signaux actifs</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-buy font-black text-xl">{activeSignals.filter(s => s.action === 'BUY').length}</div>
              <div className="text-gray-600 text-xs">Entrées</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-sell font-black text-xl">{activeSignals.filter(s => s.action === 'SELL').length}</div>
              <div className="text-gray-600 text-xs">Sorties</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-white font-black text-xl">{data.total}</div>
              <div className="text-gray-600 text-xs">Actifs surveillés</div>
            </div>
            <div className="text-xs text-gray-600 ml-auto">
              Scanné : {new Date(data.scannedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 font-semibold">Scan intraday en cours…</p>
            <p className="text-gray-600 text-sm">Analyse des bougies 5 minutes</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl opacity-30">⚠️</div>
            <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>
            <button onClick={scan} className="px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm">
              Réessayer
            </button>
          </div>
        )}

        {/* Empty state */}
        {data && activeSignals.length === 0 && olderHistory.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="text-4xl opacity-20">📡</div>
            <p className="text-gray-500 text-center">
              Aucun signal détecté pour l'instant.<br />
              <span className="text-gray-600 text-sm">
                L'IA surveille {data.total} actifs — prochain scan dans {countdown}s
              </span>
            </p>
          </div>
        )}

        {/* Active signals */}
        {activeSignals.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-gray-600 uppercase tracking-wider mb-3">
              Signaux actifs ({activeSignals.length})
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {activeSignals.map(s => (
                <SignalCard
                  key={sigId(s)}
                  signal={s}
                  onAnalyze={onAnalyze}
                  isNew={newIds.has(sigId(s))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Session history */}
        {olderHistory.length > 0 && (
          <div>
            <div className="text-xs text-gray-600 uppercase tracking-wider mb-3">
              Historique de session ({olderHistory.length})
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {olderHistory.map(s => (
                <SignalCard
                  key={`${sigId(s)}-hist`}
                  signal={s}
                  onAnalyze={onAnalyze}
                  isNew={false}
                  showAge
                />
              ))}
            </div>
          </div>
        )}

        <p className="text-gray-700 text-[10px] text-center mt-6 leading-relaxed">
          Signaux techniques automatisés — pas un conseil en investissement.
          Le levier amplifie les gains ET les pertes. Toujours utiliser un stop loss.
        </p>
      </div>
    </div>
  );
}
