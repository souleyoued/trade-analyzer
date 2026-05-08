import { useState, useCallback } from 'react';
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
  const [tab, setTab]           = useState('scanner'); // 'scanner' | 'analyze'
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [symbol, setSymbol]     = useState('');
  const [strategy, setStrategy] = useState('buffett');
  const [alerts, setAlerts]     = useState([]);

  const analyze = useCallback(async (sym, strat) => {
    const s = sym.trim().toUpperCase();
    const st = strat || strategy;
    if (!s) return;
    setTab('analyze');
    setLoading(true);
    setError(null);
    setData(null);
    setSymbol(s);
    try {
      const res = await axios.get(`/api/analyze/${s}?strategy=${st}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de récupérer les données. Vérifiez le symbole.');
    } finally {
      setLoading(false);
    }
  }, [strategy]);

  // Re-analyze current symbol when strategy changes
  const handleStrategyChange = (newStrategy) => {
    setStrategy(newStrategy);
    if (symbol) analyze(symbol, newStrategy);
  };

  const handleAlert = useCallback((alert) => {
    setAlerts(prev => [alert, ...prev].slice(0, 5));
  }, []);

  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      {/* Alerts */}
      <AlertToast alerts={alerts} onDismiss={dismissAlert} />

      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-2xl">📈</span>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">Trade Analyzer</h1>
              <p className="text-gray-500 text-xs hidden sm:block">Assistant Robinhood — Signaux en temps réel</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-surface rounded-xl p-1 gap-1">
            <button
              onClick={() => setTab('scanner')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                tab === 'scanner' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🔍 <span className="hidden sm:inline">Scanner</span>
            </button>
            <button
              onClick={() => setTab('analyze')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                tab === 'analyze' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              📊 <span className="hidden sm:inline">Analyse</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-buy animate-pulse" />
            <span className="text-gray-400 text-xs hidden sm:block">Marché connecté</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Scanner tab ── */}
        {tab === 'scanner' && (
          <>
            <FavoritesPanel
              strategy={strategy}
              onAlert={handleAlert}
              onAnalyze={(sym) => analyze(sym)}
            />
            <Scanner
              onAnalyze={(sym) => analyze(sym)}
              onAlert={handleAlert}
            />
          </>
        )}

        {/* ── Analyze tab ── */}
        {tab === 'analyze' && (
          <>
            {/* Strategy selector */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <StrategySelector selected={strategy} onChange={handleStrategyChange} />
            </div>

            {/* Search */}
            <SearchBar onAnalyze={(sym) => analyze(sym)} loading={loading} />

            {/* Popular shortcuts */}
            <div className="flex flex-wrap gap-2">
              {POPULAR.map(p => (
                <button
                  key={p.symbol}
                  onClick={() => analyze(p.symbol)}
                  className="px-3 py-1.5 rounded-lg bg-card border border-border text-gray-300 text-sm hover:border-accent hover:text-white transition-all"
                >
                  {p.label} <span className="text-gray-500 text-xs ml-1">{p.symbol}</span>
                </button>
              ))}
            </div>

            {/* Favorites panel */}
            <FavoritesPanel
              strategy={strategy}
              onAlert={handleAlert}
              onAnalyze={(sym) => analyze(sym)}
            />

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400">
                  Analyse {strategy === 'buffett' ? 'Buffett' : strategy === 'momentum' ? "O'Neil" : strategy === 'contrarian' ? 'Tudor Jones' : 'Livermore'} de {symbol}…
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400">{error}</div>
            )}

            {/* Results */}
            {data && !loading && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <AnalysisCard data={data} onAddTrade={(trade) => {
                      window.dispatchEvent(new CustomEvent('addTrade', { detail: trade }));
                    }} />
                  </div>
                  <div>
                    <IndicatorsPanel indicators={data.indicators} signals={data.signals} />
                  </div>
                </div>
                <PriceChart
                  chartData={data.chartData}
                  entryPrice={data.entryPrice}
                  targetPrice={data.targetPrice}
                  stopLoss={data.stopLoss}
                  action={data.action}
                  symbol={data.symbol}
                />
                <TradeTracker currentData={data} />
              </div>
            )}

            {/* Empty state */}
            {!data && !loading && !error && (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">📊</div>
                <p className="text-gray-400 text-lg">Entrez un symbole pour analyser</p>
                <p className="text-gray-600 text-sm mt-2">Actions US, cryptos, ETFs — ex: AAPL, BTC-USD, SPY</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
