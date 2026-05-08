import { useState, useEffect } from 'react';

const ACTION_CONFIG = {
  BUY:  { bg: 'bg-buy/10',  border: 'border-buy',  text: 'text-buy',  glow: 'glow-green', emoji: '🚀', label: 'ACHETER' },
  SELL: { bg: 'bg-sell/10', border: 'border-sell', text: 'text-sell', glow: 'glow-red',   emoji: '🔻', label: 'VENDRE'  },
  HOLD: { bg: 'bg-hold/10', border: 'border-hold', text: 'text-hold', glow: 'glow-amber', emoji: '⏸️', label: 'ATTENDRE' },
};

const FAV_KEY = 'trade_analyzer_favorites';
function isFavorite(symbol) {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]').some(f => f.symbol === symbol); } catch { return false; }
}

function fmt(n, decimals = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(entry, target) {
  if (!entry || !target) return '—';
  const v = ((target - entry) / entry * 100);
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

export default function AnalysisCard({ data, onAddTrade }) {
  const [tradeAdded, setTradeAdded] = useState(false);
  const [fav, setFav]               = useState(() => isFavorite(data.symbol));
  const cfg = ACTION_CONFIG[data.action] || ACTION_CONFIG.HOLD;

  useEffect(() => { setFav(isFavorite(data.symbol)); }, [data.symbol]);

  const toggleFavorite = () => {
    if (fav) {
      window.dispatchEvent(new CustomEvent('removeFavorite', { detail: { symbol: data.symbol } }));
      setFav(false);
    } else {
      window.dispatchEvent(new CustomEvent('addFavorite', { detail: { symbol: data.symbol, name: data.name } }));
      setFav(true);
    }
  };

  const handleAddTrade = () => {
    onAddTrade({
      id:          Date.now(),
      symbol:      data.symbol,
      name:        data.name,
      action:      data.action,
      entryPrice:  data.entryPrice,
      targetPrice: data.targetPrice,
      stopLoss:    data.stopLoss,
      riskReward:  data.riskReward,
      confidence:  data.confidence,
      strategy:    data.strategy?.name,
      date:        new Date().toISOString().split('T')[0],
      status:      'open',
      exitPrice:   null,
      exitDate:    null,
    });
    setTradeAdded(true);
    setTimeout(() => setTradeAdded(false), 3000);
  };

  return (
    <div className={`bg-card border ${cfg.border} rounded-2xl p-6 ${cfg.glow}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-2xl font-bold text-white">{data.symbol}</span>
            <span className="text-gray-400 text-sm">{data.name}</span>
            {/* Favorite star */}
            <button
              onClick={toggleFavorite}
              title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`ml-1 text-xl transition-transform hover:scale-125 ${fav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
            >
              {fav ? '⭐' : '☆'}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl font-bold text-white">{data.currency} {fmt(data.currentPrice)}</span>
            <span className={`text-sm font-semibold ${parseFloat(data.change24h) >= 0 ? 'text-buy' : 'text-sell'}`}>
              {parseFloat(data.change24h) >= 0 ? '+' : ''}{data.change24h}%
            </span>
          </div>
        </div>

        {/* Action badge */}
        <div className={`text-center ${cfg.bg} border ${cfg.border} rounded-xl px-4 py-3 min-w-[90px]`}>
          <div className="text-3xl mb-1">{cfg.emoji}</div>
          <div className={`font-black text-lg ${cfg.text}`}>{cfg.label}</div>
          <div className="text-gray-400 text-xs mt-0.5">{data.confidence}% confiance</div>
        </div>
      </div>

      {/* Strategy badge */}
      {data.strategy && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-surface rounded-xl text-sm">
          <span className="text-xl">{data.strategy.emoji}</span>
          <div>
            <span className="text-gray-300 font-medium">{data.strategy.name}</span>
            <span className="text-gray-600 text-xs ml-2">{data.strategy.style}</span>
          </div>
        </div>
      )}

      {/* Confidence bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Confiance du signal</span>
          <span>{data.confidence}%</span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${data.action === 'BUY' ? 'bg-buy' : data.action === 'SELL' ? 'bg-sell' : 'bg-hold'}`}
            style={{ width: `${data.confidence}%` }}
          />
        </div>
      </div>

      {/* Timing */}
      <div className="bg-surface rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
        <span className="text-xl mt-0.5">⏱️</span>
        <div>
          <p className="text-gray-500 text-xs">Timing recommandé</p>
          <p className={`font-bold text-sm ${cfg.text} leading-snug`}>{data.timing}</p>
        </div>
      </div>

      {/* Entry / Target / Stop */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-surface rounded-xl p-3 text-center">
          <p className="text-gray-500 text-xs mb-1">Entrée</p>
          <p className="text-white font-bold">{fmt(data.entryPrice)}</p>
          <p className="text-gray-600 text-xs mt-0.5">{data.currency}</p>
        </div>
        <div className="bg-surface rounded-xl p-3 text-center border border-buy/30">
          <p className="text-gray-500 text-xs mb-1">Objectif</p>
          <p className="text-buy font-bold">{fmt(data.targetPrice)}</p>
          <p className="text-buy/60 text-xs mt-0.5">{pct(data.entryPrice, data.targetPrice)}</p>
        </div>
        <div className="bg-surface rounded-xl p-3 text-center border border-sell/30">
          <p className="text-gray-500 text-xs mb-1">Stop Loss</p>
          <p className="text-sell font-bold">{fmt(data.stopLoss)}</p>
          <p className="text-sell/60 text-xs mt-0.5">{pct(data.entryPrice, data.stopLoss)}</p>
        </div>
      </div>

      {/* Risk/Reward + Support/Resistance */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-surface rounded-xl p-3">
          <p className="text-gray-500 text-xs mb-1">Risque / Récompense</p>
          <p className="text-white font-bold text-lg">1 : {data.riskReward}</p>
          <p className="text-gray-600 text-xs">{parseFloat(data.riskReward) >= 2 ? '✅ Favorable' : '⚠️ Risqué'}</p>
        </div>
        <div className="bg-surface rounded-xl p-3">
          <p className="text-gray-500 text-xs mb-1">Support / Résistance (20j)</p>
          <p className="text-gray-300 text-sm">
            <span className="text-buy">{fmt(data.support)}</span>
            <span className="text-gray-600 mx-2">—</span>
            <span className="text-sell">{fmt(data.resistance)}</span>
          </p>
        </div>
      </div>

      {/* Buttons row */}
      <div className="flex gap-2">
        <button
          onClick={toggleFavorite}
          className={`flex-shrink-0 py-3 px-4 rounded-xl font-semibold transition-all border ${
            fav
              ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/20'
              : 'bg-surface border-border text-gray-400 hover:border-yellow-400/40 hover:text-yellow-400'
          }`}
        >
          {fav ? '⭐ Favori' : '☆ Favori'}
        </button>
        <button
          onClick={handleAddTrade}
          disabled={tradeAdded}
          className="flex-1 py-3 rounded-xl font-semibold transition-all bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {tradeAdded ? '✅ Ajouté au suivi !' : '+ Ajouter ce trade au suivi'}
        </button>
      </div>
    </div>
  );
}
