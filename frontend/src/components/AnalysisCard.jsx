import { useState, useEffect } from 'react';

const ACTION_CONFIG = {
  BUY:  { text: 'text-buy',  bg: 'bg-buy/10',  border: 'border-buy/40',  label: 'ACHETER', emoji: '↑' },
  SELL: { text: 'text-sell', bg: 'bg-sell/10', border: 'border-sell/40', label: 'VENDRE',  emoji: '↓' },
  HOLD: { text: 'text-hold', bg: 'bg-hold/10', border: 'border-hold/40', label: 'ATTENDRE',emoji: '—' },
};

const FAV_KEY = 'trade_analyzer_favorites';
function isFavorite(symbol) {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]').some(f => f.symbol === symbol); } catch { return false; }
}

function fmt(n, d = 2) {
  if (n == null) return '—';
  const num = Number(n);
  if (num >= 10000) return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (num >= 100)   return num.toFixed(2);
  if (num >= 1)     return num.toFixed(4);
  return num.toFixed(6);
}

function pct(a, b) {
  if (!a || !b) return '';
  const v = ((b - a) / a * 100);
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

export default function AnalysisCard({ data, onAddTrade }) {
  const [tradeAdded, setTradeAdded] = useState(false);
  const [fav, setFav] = useState(() => isFavorite(data.symbol));
  const cfg = ACTION_CONFIG[data.action] || ACTION_CONFIG.HOLD;

  useEffect(() => { setFav(isFavorite(data.symbol)); }, [data.symbol]);

  const toggleFav = () => {
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
      id: Date.now(), symbol: data.symbol, name: data.name, action: data.action,
      entryPrice: data.entryPrice, targetPrice: data.targetPrice, stopLoss: data.stopLoss,
      riskReward: data.riskReward, confidence: data.confidence, strategy: data.strategy?.name,
      date: new Date().toISOString().split('T')[0], status: 'open', exitPrice: null, exitDate: null,
    });
    setTradeAdded(true);
    setTimeout(() => setTradeAdded(false), 3000);
  };

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto">
      {/* Signal badge */}
      <div className={`mx-4 mt-4 rounded-xl border ${cfg.border} ${cfg.bg} p-4 text-center`}>
        <div className={`text-4xl font-black ${cfg.text}`}>{cfg.emoji}</div>
        <div className={`text-xl font-black mt-1 ${cfg.text}`}>{cfg.label}</div>
        <div className="text-gray-500 text-xs mt-1">{data.confidence}% confiance</div>
        <div className="mt-2 h-1.5 bg-black/40 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${data.action === 'BUY' ? 'bg-buy' : data.action === 'SELL' ? 'bg-sell' : 'bg-hold'}`}
            style={{ width: `${data.confidence}%` }} />
        </div>
      </div>

      {/* Price */}
      <div className="px-4 pt-4">
        <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">Prix actuel</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white">{fmt(data.currentPrice)}</span>
          <span className="text-sm text-gray-500">{data.currency}</span>
          <span className={`text-sm font-semibold ml-auto ${parseFloat(data.change24h) >= 0 ? 'text-buy' : 'text-sell'}`}>
            {parseFloat(data.change24h) >= 0 ? '+' : ''}{data.change24h}%
          </span>
        </div>
      </div>

      <div className="mx-4 mt-3 h-px bg-border" />

      {/* Entry / TP / SL */}
      <div className="px-4 pt-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-xs">Entrée</span>
          <span className="font-mono text-sm text-white font-bold">{fmt(data.entryPrice)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-xs">Objectif (TP)</span>
          <div className="text-right">
            <span className="font-mono text-sm text-buy font-bold">{fmt(data.targetPrice)}</span>
            <span className="text-buy/60 text-xs ml-2">{pct(data.entryPrice, data.targetPrice)}</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-xs">Stop Loss</span>
          <div className="text-right">
            <span className="font-mono text-sm text-sell font-bold">{fmt(data.stopLoss)}</span>
            <span className="text-sell/60 text-xs ml-2">{pct(data.entryPrice, data.stopLoss)}</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-xs">Risk / Reward</span>
          <span className={`font-bold text-sm ${parseFloat(data.riskReward) >= 2 ? 'text-buy' : 'text-hold'}`}>
            1 : {data.riskReward}
          </span>
        </div>
      </div>

      <div className="mx-4 mt-3 h-px bg-border" />

      {/* Timing */}
      <div className="px-4 pt-3">
        <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">Timing</div>
        <p className={`text-xs leading-relaxed ${cfg.text}`}>{data.timing}</p>
      </div>

      {/* Strategy */}
      {data.strategy && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-card2 rounded-lg px-3 py-2">
          <span className="text-lg">{data.strategy.emoji}</span>
          <div>
            <div className="text-white text-xs font-semibold">{data.strategy.name}</div>
            <div className="text-gray-600 text-xs">{data.strategy.style}</div>
          </div>
        </div>
      )}

      {/* Support / Resistance */}
      <div className="px-4 mt-3">
        <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">Support / Résistance</div>
        <div className="flex gap-2">
          <div className="flex-1 bg-buy/5 border border-buy/20 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Support</div>
            <div className="text-buy font-mono text-sm font-bold">{fmt(data.support)}</div>
          </div>
          <div className="flex-1 bg-sell/5 border border-sell/20 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Résistance</div>
            <div className="text-sell font-mono text-sm font-bold">{fmt(data.resistance)}</div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="px-4 mt-4 mb-4 flex flex-col gap-2">
        <button
          onClick={handleAddTrade}
          disabled={tradeAdded}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all bg-accent hover:bg-orange-500 text-black disabled:opacity-60"
        >
          {tradeAdded ? '✓ Ajouté au suivi' : '+ Ajouter au portefeuille'}
        </button>
        <button
          onClick={toggleFav}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all border ${
            fav ? 'border-yellow-500/40 text-yellow-400 bg-yellow-400/10' : 'border-border text-gray-500 hover:border-accent/40 hover:text-accent'
          }`}
        >
          {fav ? '⭐ Dans les favoris' : '☆ Ajouter aux favoris'}
        </button>
      </div>
    </div>
  );
}
