import { useState, useEffect } from 'react';

const STORAGE_KEY = 'trade_analyzer_history';

function loadTrades() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveTrades(trades) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function TradeTracker({ currentData }) {
  const [trades, setTrades]       = useState(loadTrades);
  const [exitInputs, setExitInputs] = useState({});
  const [showHistory, setShowHistory] = useState(false);

  // Listen for add trade events from AnalysisCard
  useEffect(() => {
    const handler = (e) => {
      const trade = e.detail;
      setTrades(prev => {
        const updated = [trade, ...prev];
        saveTrades(updated);
        return updated;
      });
    };
    window.addEventListener('addTrade', handler);
    return () => window.removeEventListener('addTrade', handler);
  }, []);

  const closeTrade = (id, status) => {
    const exitPrice = parseFloat(exitInputs[id]);
    if (isNaN(exitPrice) || exitPrice <= 0) return;

    setTrades(prev => {
      const updated = prev.map(t => {
        if (t.id !== id) return t;
        const gain = t.action === 'BUY'
          ? ((exitPrice - t.entryPrice) / t.entryPrice) * 100
          : ((t.entryPrice - exitPrice) / t.entryPrice) * 100;
        return { ...t, status, exitPrice, exitDate: new Date().toISOString().split('T')[0], gain };
      });
      saveTrades(updated);
      return updated;
    });
    setExitInputs(prev => ({ ...prev, [id]: '' }));
  };

  const deleteTrade = (id) => {
    setTrades(prev => { const u = prev.filter(t => t.id !== id); saveTrades(u); return u; });
  };

  const openTrades  = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status !== 'open');
  const wonTrades   = closedTrades.filter(t => t.status === 'won');
  const winRate     = closedTrades.length > 0 ? (wonTrades.length / closedTrades.length) * 100 : null;
  const totalGain   = closedTrades.reduce((sum, t) => sum + (t.gain || 0), 0);
  const avgGain     = closedTrades.length > 0 ? totalGain / closedTrades.length : null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-bold text-base">Suivi des trades</h2>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-accent hover:text-indigo-300 transition-colors"
        >
          {showHistory ? 'Masquer historique' : 'Voir historique'}
        </button>
      </div>

      {/* Stats */}
      {closedTrades.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-surface rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs mb-1">Trades clôturés</p>
            <p className="text-white font-bold text-xl">{closedTrades.length}</p>
          </div>
          <div className="bg-surface rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs mb-1">% Réussite</p>
            <p className={`font-bold text-xl ${winRate >= 50 ? 'text-buy' : 'text-sell'}`}>
              {winRate != null ? `${winRate.toFixed(0)}%` : '—'}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs mb-1">Gain total</p>
            <p className={`font-bold text-xl ${totalGain >= 0 ? 'text-buy' : 'text-sell'}`}>
              {totalGain >= 0 ? '+' : ''}{totalGain.toFixed(2)}%
            </p>
          </div>
          <div className="bg-surface rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs mb-1">Gain moyen</p>
            <p className={`font-bold text-xl ${(avgGain || 0) >= 0 ? 'text-buy' : 'text-sell'}`}>
              {avgGain != null ? `${avgGain >= 0 ? '+' : ''}${avgGain.toFixed(2)}%` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Open trades */}
      {openTrades.length === 0 && closedTrades.length === 0 && (
        <p className="text-gray-600 text-center py-8">
          Aucun trade suivi — analysez un actif et cliquez sur "Ajouter ce trade au suivi"
        </p>
      )}

      {openTrades.length > 0 && (
        <div className="space-y-3 mb-4">
          <p className="text-gray-400 text-sm font-medium">Trades ouverts ({openTrades.length})</p>
          {openTrades.map(t => (
            <TradeRow
              key={t.id}
              trade={t}
              exitInput={exitInputs[t.id] || ''}
              onExitChange={v => setExitInputs(p => ({ ...p, [t.id]: v }))}
              onWin={() => closeTrade(t.id, 'won')}
              onLoss={() => closeTrade(t.id, 'lost')}
              onDelete={() => deleteTrade(t.id)}
            />
          ))}
        </div>
      )}

      {/* Closed trades history */}
      {showHistory && closedTrades.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-gray-400 text-sm font-medium">Historique ({closedTrades.length})</p>
          {closedTrades.map(t => (
            <ClosedTradeRow key={t.id} trade={t} onDelete={() => deleteTrade(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade, exitInput, onExitChange, onWin, onLoss, onDelete }) {
  const isPos = trade.action === 'BUY';
  return (
    <div className={`bg-surface border rounded-xl p-4 ${isPos ? 'border-buy/20' : 'border-sell/20'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${isPos ? 'bg-buy/10 text-buy' : 'bg-sell/10 text-sell'}`}>
            {trade.action}
          </span>
          <span className="text-white font-mono font-bold">{trade.symbol}</span>
          <span className="text-gray-500 text-xs">{trade.date}</span>
        </div>
        <button onClick={onDelete} className="text-gray-700 hover:text-gray-400 text-xs">✕</button>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Entrée</p>
          <p className="text-white font-mono">{fmt(trade.entryPrice)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Objectif</p>
          <p className="text-buy font-mono">{fmt(trade.targetPrice)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Stop Loss</p>
          <p className="text-sell font-mono">{fmt(trade.stopLoss)}</p>
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={exitInput}
          onChange={e => onExitChange(e.target.value)}
          placeholder="Prix de sortie…"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        <button
          onClick={onWin}
          disabled={!exitInput}
          className="px-3 py-2 rounded-lg bg-buy/10 text-buy border border-buy/30 text-sm font-semibold hover:bg-buy/20 disabled:opacity-40"
        >
          Gagné ✅
        </button>
        <button
          onClick={onLoss}
          disabled={!exitInput}
          className="px-3 py-2 rounded-lg bg-sell/10 text-sell border border-sell/30 text-sm font-semibold hover:bg-sell/20 disabled:opacity-40"
        >
          Perdu ❌
        </button>
      </div>
    </div>
  );
}

function ClosedTradeRow({ trade, onDelete }) {
  const won = trade.status === 'won';
  return (
    <div className={`flex items-center justify-between bg-surface border rounded-xl px-4 py-3 ${won ? 'border-buy/20' : 'border-sell/20'}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{won ? '✅' : '❌'}</span>
        <div>
          <span className="text-white font-mono font-bold text-sm">{trade.symbol}</span>
          <span className="text-gray-500 text-xs ml-2">{trade.action}</span>
        </div>
      </div>
      <div className="text-center hidden sm:block">
        <p className="text-gray-500 text-xs">Entrée → Sortie</p>
        <p className="text-gray-300 text-sm font-mono">{fmt(trade.entryPrice)} → {fmt(trade.exitPrice)}</p>
      </div>
      <div className="text-right">
        <p className={`font-bold ${won ? 'text-buy' : 'text-sell'}`}>
          {(trade.gain || 0) >= 0 ? '+' : ''}{fmt(trade.gain)}%
        </p>
        <p className="text-gray-600 text-xs">{trade.exitDate}</p>
      </div>
      <button onClick={onDelete} className="text-gray-700 hover:text-gray-400 text-xs ml-3">✕</button>
    </div>
  );
}
