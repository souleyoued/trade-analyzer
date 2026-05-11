import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

function fmt(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (v >= 10000)   return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100)     return v.toFixed(2);
  if (v >= 1)       return v.toFixed(4);
  if (v >= 0.01)    return v.toFixed(5);
  if (v >= 0.0001)  return v.toFixed(7);
  return v.toFixed(10); // SHIB, PEPE, etc.
}

function Countdown({ minutes }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <span className="font-mono font-bold text-accent">
      {h > 0 ? `${h}h ` : ''}{String(m).padStart(2, '0')}min
    </span>
  );
}

function MarketBadge({ market }) {
  if (!market) return null;
  if (market.isOpen)    return <span className="flex items-center gap-1.5 text-buy text-xs font-bold"><span className="w-2 h-2 rounded-full bg-buy animate-pulse inline-block" />MARCHÉ OUVERT</span>;
  if (market.isPreMkt)  return <span className="flex items-center gap-1.5 text-accent text-xs font-bold"><span className="w-2 h-2 rounded-full bg-accent animate-pulse inline-block" />PRÉ-MARCHÉ</span>;
  if (market.isWeekend) return <span className="flex items-center gap-1.5 text-gray-500 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />WEEK-END — Signal pour lundi</span>;
  return <span className="flex items-center gap-1.5 text-gray-500 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />APRÈS-BOURSE</span>;
}

function TypeBadge({ type, price }) {
  const cfg = {
    crypto: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    etf:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
    stock:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    micro:  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  }[type] || 'bg-gray-700 text-gray-400 border-gray-600';
  const label = { crypto: 'CRYPTO', etf: 'ETF 3x', stock: 'ACTION', micro: '< $1' }[type] || type.toUpperCase();
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg}`}>{label}</span>;
}

function ConfidenceBar({ value }) {
  const color = value >= 75 ? 'bg-buy' : value >= 55 ? 'bg-accent' : 'bg-hold';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono ${color.replace('bg-', 'text-')}`}>{value}%</span>
    </div>
  );
}

function PickCard({ pick, onAnalyze }) {
  const up     = pick.action === 'BUY';
  const border = up ? 'border-buy/20 hover:border-buy/40' : 'border-sell/20 hover:border-sell/40';
  const glow   = up ? 'bg-buy/3' : 'bg-sell/3';

  return (
    <div className={`rounded-xl border ${border} ${glow} p-4 flex flex-col gap-3 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onAnalyze(pick.symbol)}
            className="text-white font-black font-mono text-lg hover:text-accent transition-colors"
          >
            {pick.symbol}
          </button>
          <TypeBadge type={pick.type} />
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${up ? 'bg-buy/15 text-buy' : 'bg-sell/15 text-sell'}`}>
            {up ? '↑ ACHETER' : '↓ VENDRE'}
          </span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-white font-mono font-bold">{fmt(pick.currentPrice)}</div>
          <div className={`text-xs font-semibold ${parseFloat(pick.change24h) >= 0 ? 'text-buy' : 'text-sell'}`}>
            {parseFloat(pick.change24h) >= 0 ? '+' : ''}{pick.change24h}%
          </div>
        </div>
      </div>

      <div className="text-gray-500 text-xs -mt-1">{pick.name}</div>

      {/* Confidence */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-600">Confiance IA</span>
          <span className="text-gray-500">Score {pick.score}/100</span>
        </div>
        <ConfidenceBar value={pick.confidence} />
      </div>

      {/* Price targets */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card2 rounded-lg p-2 text-center">
          <div className="text-gray-600 text-[10px] mb-0.5">Entrée</div>
          <div className="text-white font-mono text-xs font-bold">{fmt(pick.entryPrice)}</div>
        </div>
        <div className="bg-buy/5 border border-buy/20 rounded-lg p-2 text-center">
          <div className="text-buy/60 text-[10px] mb-0.5">Objectif +25%</div>
          <div className="text-buy font-mono text-xs font-bold">{fmt(pick.targetPrice)}</div>
        </div>
        <div className="bg-sell/5 border border-sell/20 rounded-lg p-2 text-center">
          <div className="text-sell/60 text-[10px] mb-0.5">Stop Loss</div>
          <div className="text-sell font-mono text-xs font-bold">{fmt(pick.stopLoss)}</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 text-xs">
        <div>
          <span className="text-gray-600">R/R </span>
          <span className={`font-bold font-mono ${parseFloat(pick.riskReward) >= 2 ? 'text-buy' : 'text-hold'}`}>
            1:{pick.riskReward}
          </span>
        </div>
        <div>
          <span className="text-gray-600">ATR </span>
          <span className="text-gray-300 font-mono">{pick.atrPct}%</span>
        </div>
        <div>
          <span className="text-gray-600">Levier conseillé </span>
          <span className="text-accent font-bold font-mono">x{pick.leverageNeeded}</span>
        </div>
        <div className="ml-auto">
          <span className="text-gray-600">≈ </span>
          <span className="text-gray-400 font-mono">{pick.daysEstimate}j sans levier</span>
        </div>
      </div>

      {/* AI Reasons */}
      {pick.reasons?.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Analyse IA</div>
          {pick.reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
              <span className="text-accent shrink-0 mt-0.5">▸</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => onAnalyze(pick.symbol)}
        className="w-full py-2 rounded-lg border border-accent/30 text-accent text-xs font-semibold hover:bg-accent/10 transition-all"
      >
        Voir l'analyse complète →
      </button>
    </div>
  );
}

export default function DailyAIPicks({ onAnalyze }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [countdown, setCountdown] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/daily-picks', { timeout: 30000 });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Impossible de charger les picks du jour.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live countdown to market open
  useEffect(() => {
    if (!data?.market?.minutesUntilOpen) return;
    let rem = data.market.minutesUntilOpen * 60; // in seconds
    const t = setInterval(() => {
      rem--;
      if (rem <= 0) { clearInterval(t); load(); }
      else setCountdown(Math.ceil(rem / 60));
    }, 1000);
    setCountdown(data.market.minutesUntilOpen);
    return () => clearInterval(t);
  }, [data?.market?.minutesUntilOpen, load]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-white font-black text-lg">🤖 Daily IA Picks</span>
            <MarketBadge market={data?.market} />
          </div>
          <p className="text-gray-600 text-xs mt-0.5">
            Top actifs sélectionnés par l'IA — objectif minimum <span className="text-accent font-bold">+25%</span> par trade
          </p>
        </div>

        {countdown != null && !data?.market?.isOpen && (
          <div className="ml-auto text-right">
            <div className="text-gray-600 text-xs">Ouverture dans</div>
            <Countdown minutes={countdown} />
          </div>
        )}

        <button
          onClick={load}
          disabled={loading}
          className="ml-auto shrink-0 px-3 py-1.5 rounded-lg border border-border text-gray-500 text-xs hover:border-accent/40 hover:text-accent transition-all disabled:opacity-40"
        >
          {loading ? '⟳ Analyse…' : '↻ Actualiser'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-gray-400 font-semibold">Analyse IA en cours…</p>
              <p className="text-gray-600 text-sm mt-1">Scan de 24 actifs (stocks, ETF 3x, crypto, micro) — peut prendre 25s</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl opacity-30">⚠️</div>
            <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>
            <button onClick={load} className="px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-sm">
              Réessayer
            </button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-6 mb-6 p-3 rounded-xl bg-card border border-border">
              <div className="text-center">
                <div className="text-accent font-black text-xl">{data.picks.length}</div>
                <div className="text-gray-600 text-xs">Picks sélectionnés</div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <div className="text-buy font-black text-xl">+25%</div>
                <div className="text-gray-600 text-xs">Objectif min.</div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <div className="text-white font-black text-xl">{data.total}</div>
                <div className="text-gray-600 text-xs">Actifs analysés</div>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-xs text-gray-600 ml-auto">
                Mis à jour : {new Date(data.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {data.picks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="text-4xl opacity-20">📊</div>
                <p className="text-gray-500 text-center">
                  Aucun signal fort détecté aujourd'hui.<br />
                  <span className="text-gray-600 text-sm">L'IA attend un meilleur point d'entrée.</span>
                </p>
              </div>
            )}

            {/* Pick cards — 2-col grid on large screens */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {data.picks.map(pick => (
                <PickCard key={pick.symbol} pick={pick} onAnalyze={onAnalyze} />
              ))}
            </div>

            {/* Disclaimer */}
            <p className="text-gray-700 text-[10px] text-center mt-6 leading-relaxed">
              Analyse technique automatisée — pas un conseil en investissement. Le levier amplifie les gains ET les pertes.
              Toujours utiliser un stop loss. L'objectif +25% est basé sur le mouvement technique prévu, non garanti.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
