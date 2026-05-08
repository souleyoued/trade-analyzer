import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const STORAGE_KEY = 'trade_analyzer_favorites';
const SIGNALS_KEY = 'trade_analyzer_fav_signals';
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

function loadFavs()    { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function saveFavs(f)   { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)); }
function loadSignals() { try { return JSON.parse(localStorage.getItem(SIGNALS_KEY) || '{}'); } catch { return {}; } }
function saveSignals(s){ localStorage.setItem(SIGNALS_KEY, JSON.stringify(s)); }

const ACTION_STYLE = {
  BUY:  { bg: 'bg-buy/10',   text: 'text-buy',   border: 'border-buy/30'   },
  SELL: { bg: 'bg-sell/10',  text: 'text-sell',  border: 'border-sell/30'  },
  HOLD: { bg: 'bg-hold/10',  text: 'text-hold',  border: 'border-hold/30'  },
};

export default function FavoritesPanel({ strategy, onAlert, onAnalyze }) {
  const [favs, setFavs]         = useState(loadFavs);
  const [signals, setSignals]   = useState(loadSignals);
  const [loading, setLoading]   = useState({});
  const [lastPoll, setLastPoll] = useState(null);

  // Listen for add/remove favorite events dispatched from AnalysisCard
  useEffect(() => {
    const add = (e) => {
      const { symbol, name } = e.detail;
      setFavs(prev => {
        if (prev.find(f => f.symbol === symbol)) return prev;
        const updated = [...prev, { symbol, name, addedAt: new Date().toISOString() }];
        saveFavs(updated);
        return updated;
      });
    };
    const remove = (e) => {
      setFavs(prev => { const u = prev.filter(f => f.symbol !== e.detail.symbol); saveFavs(u); return u; });
    };
    window.addEventListener('addFavorite', add);
    window.addEventListener('removeFavorite', remove);
    return () => { window.removeEventListener('addFavorite', add); window.removeEventListener('removeFavorite', remove); };
  }, []);

  const pollFavorite = useCallback(async (symbol) => {
    setLoading(p => ({ ...p, [symbol]: true }));
    try {
      const res  = await axios.get(`/api/signal/${symbol}?strategy=${strategy}`);
      const data = res.data;
      const prev = signals[symbol];

      setSignals(p => {
        const updated = { ...p, [symbol]: data };
        saveSignals(updated);
        return updated;
      });

      // Trigger alert if action changed to BUY or SELL
      if (prev && prev.action !== data.action && data.action !== 'HOLD') {
        onAlert({ id: `${symbol}-${Date.now()}`, ...data });
        // Browser notification
        if (Notification.permission === 'granted') {
          new Notification(`📊 ${symbol} — ${data.recommendation}`, {
            body: `${data.strategy?.emoji} ${data.strategy?.name}: ${data.timing}\nPrix: ${data.currency} ${Number(data.currentPrice).toFixed(2)}`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📈</text></svg>'
          });
        }
      }
    } catch { /* ignore network errors on poll */ }
    setLoading(p => ({ ...p, [symbol]: false }));
  }, [strategy, signals, onAlert]);

  const pollAll = useCallback(async () => {
    if (!favs.length) return;
    setLastPoll(new Date());
    for (const fav of favs) {
      await pollFavorite(fav.symbol);
      await new Promise(r => setTimeout(r, 800)); // slight delay between requests
    }
  }, [favs, pollFavorite]);

  // Poll on mount + interval
  useEffect(() => {
    pollAll();
    const t = setInterval(pollAll, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [strategy]); // re-poll when strategy changes

  const requestNotifPermission = async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const removeFav = (symbol) => {
    setFavs(prev => { const u = prev.filter(f => f.symbol !== symbol); saveFavs(u); return u; });
    setSignals(prev => { const u = { ...prev }; delete u[symbol]; saveSignals(u); return u; });
  };

  if (!favs.length) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-sm">Favoris & Alertes</h2>
          <span className="text-xs text-gray-600 bg-surface px-2 py-1 rounded-lg">0 favoris</span>
        </div>
        <p className="text-gray-600 text-sm text-center py-4">
          Cliquez sur ⭐ sur une analyse pour ajouter un favori et recevoir des alertes.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-bold text-sm">Favoris & Alertes</h2>
          <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">{favs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {lastPoll && (
            <span className="text-gray-600 text-xs hidden sm:block">
              Maj {lastPoll.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={requestNotifPermission}
            title="Activer les notifications"
            className={`text-sm px-2 py-1 rounded-lg border transition-colors ${
              Notification.permission === 'granted'
                ? 'border-buy/30 text-buy bg-buy/10'
                : 'border-border text-gray-500 hover:border-accent hover:text-accent'
            }`}
          >
            {Notification.permission === 'granted' ? '🔔 Alertes ON' : '🔕 Activer alertes'}
          </button>
          <button
            onClick={pollAll}
            className="text-xs px-2 py-1 rounded-lg border border-border text-gray-400 hover:border-accent hover:text-accent transition-colors"
            title="Actualiser maintenant"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {favs.map(fav => {
          const sig = signals[fav.symbol];
          const isLoading = loading[fav.symbol];
          const style = sig ? (ACTION_STYLE[sig.action] || ACTION_STYLE.HOLD) : null;

          return (
            <div
              key={fav.symbol}
              className={`relative rounded-xl border p-3 cursor-pointer transition-all hover:scale-[1.02] ${
                style ? `${style.border} ${style.bg}` : 'border-border bg-surface'
              }`}
              onClick={() => onAnalyze(fav.symbol)}
              title={`Analyser ${fav.symbol}`}
            >
              <button
                onClick={e => { e.stopPropagation(); removeFav(fav.symbol); }}
                className="absolute top-1.5 right-1.5 text-gray-700 hover:text-gray-400 text-xs leading-none"
                title="Retirer des favoris"
              >✕</button>

              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <div className="font-mono font-bold text-white text-sm">{fav.symbol}</div>

              {sig ? (
                <>
                  <div className={`text-xs font-bold mt-0.5 ${style.text}`}>
                    {sig.recommendation}
                  </div>
                  <div className="text-gray-300 text-xs mt-1 font-mono">
                    {Number(sig.currentPrice).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-xs ${parseFloat(sig.change24h) >= 0 ? 'text-buy' : 'text-sell'}`}>
                    {parseFloat(sig.change24h) >= 0 ? '+' : ''}{sig.change24h}%
                  </div>
                  <div className={`text-xs mt-1 ${style.text} opacity-70`}>{sig.confidence}% confiance</div>
                </>
              ) : (
                <div className="text-gray-600 text-xs mt-1">—</div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-gray-700 text-xs mt-3 text-center">
        Actualisation automatique toutes les 5 min · Cliquez sur un favori pour l'analyser
      </p>
    </div>
  );
}
