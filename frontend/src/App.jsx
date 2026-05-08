import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import SearchBar from './components/SearchBar';
import AnalysisCard from './components/AnalysisCard';
import PriceChart from './components/PriceChart';
import IndicatorsPanel from './components/IndicatorsPanel';
import TradeTracker from './components/TradeTracker';
import StrategySelector from './components/StrategySelector';
import FavoritesPanel from './components/FavoritesPanel';
import AlertToast from './components/AlertToast';
import Scanner from './components/Scanner';

const POPULAR = [
  { symbol: 'AAPL',    label: 'Apple' },
  { symbol: 'TSLA',    label: 'Tesla' },
  { symbol: 'NVDA',    label: 'Nvidia' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
  { symbol: 'ETH-USD', label: 'Ethereum' },
  { symbol: 'SPY',     label: 'S&P 500' },
];

export default function App() {
  const [tab, setTab]           = useState('scanner');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [symbol, setSymbol]     = useState('');
  const [strategy, setStrategy] = useState('buffett');
  const [alerts, setAlerts]     = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshIn, setRefreshIn]     = useState(null);
  const autoRefreshRef = useRef(null);
  const symbolRef      = useRef('');
  const strategyRef    = useRef('buffett');

  const REFRESH_INTERVAL = 60 * 1000;

  const analyze = useCallback(async (sym, strat, silent = false) => {
    const s = (sym || symbolRef.current).trim().toUpperCase();
    const st = strat || strategyRef.current;
    if (!s) return;
    if (!silent) {
      setTab('analyze');
      setLoading(true);
      setError(null);
      setData(null);
      setSymbol(s);
    }
    symbolRef.current   = s;
    strategyRef.current = st;
    if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current);
    try {
      const res = await axios.get(`/api/analyze/${s}?strategy=${st}`);
      setData(res.data);
      setLastRefresh(new Date());
      autoRefreshRef.current = setTimeout(() => analyze(s, st, true), REFRESH_INTERVAL);
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || 'Impossible de récupérer les données.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!lastRefresh) { setRefreshIn(null); return; }
    const t = setInterval(() => {
      const remaining = Math.max(0, REFRESH_INTERVAL - (Date.now() - lastRefresh.getTime()));
      setRefreshIn(Math.ceil(remaining / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  useEffect(() => () => { if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current); }, []);

  const handleStrategyChange = (s) => {
    setStrategy(s);
    strategyRef.current = s;
    if (symbolRef.current) analyze(symbolRef.current, s);
  };

  const handleAlert = useCallback((alert) => {
    setAlerts(prev => [alert, ...prev].slice(0, 5));
  }, []);

  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      <AlertToast alerts={alerts} onDismiss={dismissAlert} />

      {/* Header */}
      <header className="border-b border-border bg-card shrink-0 h-14 flex items-center px-5 gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-black font-black text-sm">T</div>
          <span className="text-white font-bold text-base">TradeAnalyzer</span>
        </div>

        <nav className="flex gap-1">
          {[
            { id: 'scanner', label: 'Scanner' },
            { id: 'analyze', label: 'Analyser' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === id ? 'bg-accent text-black font-bold' : 'text-gray-500 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {tab === 'analyze' && lastRefresh && refreshIn != null && (
            <span className="text-xs text-gray-600">
              <span className="text-green-500 font-semibold">● LIVE</span> — {refreshIn}s
            </span>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="w-2 h-2 rounded-full bg-buy animate-pulse" />
            Marché ouvert
          </div>
        </div>
      </header>

      {/* Scanner tab */}
      {tab === 'scanner' && (
        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          <FavoritesPanel strategy={strategy} onAlert={handleAlert} onAnalyze={analyze} />
          <Scanner onAnalyze={analyze} onAlert={handleAlert} />
        </main>
      )}

      {/* Analyze tab — 3-column layout */}
      {tab === 'analyze' && (
        <div className="flex-1 flex overflow-hidden">

          {/* LEFT: Trade panel */}
          <aside className="w-[260px] shrink-0 border-r border-border overflow-y-auto">
            {data && !loading ? (
              <AnalysisCard data={data} onAddTrade={(trade) => {
                window.dispatchEvent(new CustomEvent('addTrade', { detail: trade }));
              }} />
            ) : (
              <div className="p-4 space-y-4">
                <StrategySelector selected={strategy} onChange={handleStrategyChange} compact />
                <div className="space-y-2">
                  <div className="text-xs text-gray-600 uppercase tracking-wider">Favoris</div>
                  <FavoritesPanel strategy={strategy} onAlert={handleAlert} onAnalyze={analyze} />
                </div>
              </div>
            )}
          </aside>

          {/* CENTER: Chart */}
          <main className="flex-1 flex flex-col overflow-hidden border-r border-border">
            {/* Asset header */}
            {data && !loading ? (
              <>
                <div className="shrink-0 border-b border-border px-5 py-3 flex items-center gap-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-lg font-mono">{data.symbol}</span>
                      <span className="text-gray-500 text-sm">{data.name}</span>
                    </div>
                    <div className="flex items-baseline gap-3 mt-0.5">
                      <span className="text-2xl font-bold font-mono text-white">
                        {data.currentPrice >= 1000
                          ? data.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })
                          : data.currentPrice >= 1
                          ? data.currentPrice.toFixed(4)
                          : data.currentPrice.toFixed(6)}
                      </span>
                      <span className={`text-sm font-semibold ${parseFloat(data.change24h) >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {parseFloat(data.change24h) >= 0 ? '+' : ''}{data.change24h}%
                      </span>
                      <span className="text-gray-600 text-xs">{data.currency}</span>
                    </div>
                  </div>

                  <div className="flex gap-4 ml-auto">
                    <div className="text-right">
                      <div className="text-gray-600 text-xs">24h Haut</div>
                      <div className="text-buy font-mono text-sm font-bold">{data.chartData?.[data.chartData.length - 1]?.high?.toFixed(2) ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-600 text-xs">24h Bas</div>
                      <div className="text-sell font-mono text-sm font-bold">{data.chartData?.[data.chartData.length - 1]?.low?.toFixed(2) ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-600 text-xs">ATR</div>
                      <div className="text-gray-300 font-mono text-sm">{data.indicators?.atr ?? '—'}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => { setData(null); setSymbol(''); }}
                    className="ml-4 text-gray-600 hover:text-white text-xl leading-none"
                    title="Fermer"
                  >×</button>
                </div>

                <div className="flex-1 overflow-hidden bg-card2">
                  <PriceChart
                    chartData={data.chartData}
                    entryPrice={data.entryPrice}
                    targetPrice={data.targetPrice}
                    stopLoss={data.stopLoss}
                    symbol={data.symbol}
                    action={data.action}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
                {loading ? (
                  <>
                    <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500">Analyse de {symbol}…</p>
                  </>
                ) : (
                  <>
                    <div className="text-5xl opacity-20">📊</div>
                    <div className="text-center">
                      <p className="text-gray-400 font-semibold text-lg mb-1">Analyser un symbole</p>
                      <p className="text-gray-600 text-sm">Actions, cryptos, ETFs — ex: AAPL, BTC-USD</p>
                    </div>
                    <SearchBar onAnalyze={analyze} loading={loading} />
                    {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-3 text-red-400 text-sm max-w-md">{error}</div>}
                    <div className="flex flex-wrap gap-2 justify-center">
                      {POPULAR.map(p => (
                        <button
                          key={p.symbol}
                          onClick={() => analyze(p.symbol)}
                          className="px-3 py-1.5 rounded-lg bg-card border border-border text-gray-400 text-sm hover:border-accent/40 hover:text-white transition-all"
                        >
                          {p.label} <span className="text-gray-600 text-xs">{p.symbol}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Trade tracker below chart */}
            {data && !loading && (
              <div className="shrink-0 border-t border-border">
                <TradeTracker currentData={data} />
              </div>
            )}
          </main>

          {/* RIGHT: Indicators */}
          <aside className="w-[260px] shrink-0 overflow-y-auto">
            {data && !loading ? (
              <IndicatorsPanel indicators={data.indicators} signals={data.signals} />
            ) : (
              <div className="p-4">
                <StrategySelector selected={strategy} onChange={handleStrategyChange} compact />
              </div>
            )}
          </aside>

        </div>
      )}
    </div>
  );
}
