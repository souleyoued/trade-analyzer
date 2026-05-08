import { useState, useMemo, useEffect } from 'react';

const STORAGE_KEY = 'trade_analyzer_leverage_settings';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveSettings(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

const RISK_PROFILES = [
  { id: 'conservative', label: 'Conservateur', maxLev: 3,  riskPct: 1   },
  { id: 'moderate',     label: 'Modéré',       maxLev: 5,  riskPct: 2   },
  { id: 'aggressive',   label: 'Agressif',     maxLev: 10, riskPct: 5   },
];

function calcLeverage(item, balance, leverage, profile) {
  if (!item?.entryPrice) return null;
  const prof    = RISK_PROFILES.find(p => p.id === profile);
  const entry   = item.entryPrice;
  const tp      = item.targetPrice;
  const sl      = item.stopLoss;
  const isBuy   = item.action === 'ACHAT FORT' || item.action === 'ACHAT';

  const priceRisk = Math.abs(entry - sl) / entry;
  const riskAmount = balance * (prof.riskPct / 100);
  const riskPos  = priceRisk > 0 ? riskAmount / priceRisk : balance;
  const levPos   = balance * Math.min(leverage, prof.maxLev);
  const pos      = Math.min(riskPos, levPos);
  const lev      = pos / balance;
  const units    = pos / entry;

  const gainUSD  = isBuy ? units * (tp - entry) : units * (entry - tp);
  const lossUSD  = isBuy ? units * (entry - sl) : units * (sl - entry);
  const liqPrice = isBuy ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev);

  return { pos, lev, gainUSD, lossUSD, gainPct: gainUSD / balance * 100, lossPct: lossUSD / balance * 100, liqPrice, isBuy };
}

function fmtUSD(n) {
  if (!n || isNaN(n)) return '—';
  const s = n < 0 ? '-' : '+';
  return `${s}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Inline leverage detail panel
function LevDetail({ item, balance, leverage, profile }) {
  const c = calcLeverage(item, balance, leverage, profile);
  if (!c) return null;
  const tp1  = c.isBuy
    ? item.entryPrice + (item.targetPrice - item.entryPrice) * 0.5
    : item.entryPrice - (item.entryPrice - item.targetPrice) * 0.5;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Actif sélectionné</div>
        <div className="flex items-center gap-2">
          <span className="text-white font-mono font-bold text-lg">{item.symbol}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.isBuy ? 'bg-accent/10 text-accent' : 'bg-sell/10 text-sell'}`}>
            {c.isBuy ? '↑ LONG' : '↓ SHORT'}
          </span>
        </div>
        <div className="text-gray-500 text-sm">{item.name}</div>
      </div>

      <div className="bg-card2 rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Position</div>
        {[
          ['Levier appliqué', `${c.lev.toFixed(1)}x`],
          ['Taille position', `$${fmt(c.pos, 0)}`],
          ['Marge requise', `$${fmt(balance, 0)}`],
          ['Quantité', `${fmt(c.pos / item.entryPrice, c.pos / item.entryPrice < 1 ? 6 : 2)} ${item.symbol.split('-')[0]}`],
        ].map(([l, v]) => (
          <div key={l} className="flex justify-between text-xs">
            <span className="text-gray-600">{l}</span>
            <span className="text-white font-mono font-semibold">{v}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Niveaux</div>
        {[
          { label: 'Entrée', val: fmt(item.entryPrice), cls: 'text-white' },
          { label: 'TP1 (50%)', val: fmt(tp1), cls: 'text-accent' },
          { label: 'TP2 (100%)', val: fmt(item.targetPrice), cls: 'text-buy' },
          { label: 'Stop Loss', val: fmt(item.stopLoss), cls: 'text-sell' },
          { label: 'Liquidation', val: fmt(c.liqPrice), cls: 'text-sell font-bold' },
        ].map(({ label, val, cls }) => (
          <div key={label} className="flex justify-between items-center bg-card2 rounded-lg px-3 py-1.5">
            <span className="text-gray-600 text-xs">{label}</span>
            <span className={`font-mono text-sm font-bold ${cls}`}>{val}</span>
          </div>
        ))}
      </div>

      <div className="bg-card2 rounded-xl p-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Impact compte</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-buy font-bold">{fmtUSD(c.gainUSD)}</div>
            <div className="text-buy/60 text-xs">+{c.gainPct.toFixed(1)}%</div>
            <div className="text-gray-600 text-xs">Si TP</div>
          </div>
          <div>
            <div className="text-sell font-bold">{fmtUSD(-c.lossUSD)}</div>
            <div className="text-sell/60 text-xs">-{c.lossPct.toFixed(1)}%</div>
            <div className="text-gray-600 text-xs">Si SL</div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs">
          <span className="text-gray-600">Impact / 1% mvt</span>
          <span className="text-accent font-bold">±{c.lev.toFixed(1)}% compte</span>
        </div>
      </div>

      <div className="bg-card2 rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Guide</div>
        {[
          { icon: '→', color: 'text-accent', text: `Entrer à ${fmt(item.entryPrice)} ${c.isBuy ? '(achat)' : '(vente à découvert)'}` },
          { icon: '✓', color: 'text-buy',    text: `TP1 à ${fmt(tp1)} — fermer 50%, déplacer SL à l'entrée` },
          { icon: '✓', color: 'text-buy',    text: `TP2 à ${fmt(item.targetPrice)} — fermer le reste` },
          { icon: '✗', color: 'text-sell',   text: `Stop à ${fmt(item.stopLoss)} — sortie immédiate` },
        ].map(({ icon, color, text }, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className={`${color} font-bold shrink-0`}>{icon}</span>
            <span className="text-gray-400">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeverageTradingTab({ scannerResults, onAnalyze }) {
  const stored = loadSettings();
  const [balance, setBalance]     = useState(stored.balance || 10000);
  const [balInput, setBalInput]   = useState(String(stored.balance || 10000));
  const [leverage, setLeverage]   = useState(stored.leverage || 3);
  const [profile, setProfile]     = useState(stored.profile || 'moderate');
  const [selected, setSelected]   = useState(null);
  const [sortBy, setSortBy]       = useState('gainUSD'); // gainUSD | score | lossPct

  const prof = RISK_PROFILES.find(p => p.id === profile);

  useEffect(() => { saveSettings({ balance, leverage, profile }); }, [balance, leverage, profile]);

  const handleBalBlur = () => {
    const n = parseFloat(balInput.replace(/[^\d.]/g, ''));
    if (!isNaN(n) && n > 0) { setBalance(n); setBalInput(String(n)); }
    else setBalInput(String(balance));
  };

  // Only show tradeable signals (not ÉVITER)
  const tradeable = scannerResults.filter(r => r.action !== 'ÉVITER');

  const rows = useMemo(() => {
    return tradeable
      .map(item => ({ item, calc: calcLeverage(item, balance, leverage, profile) }))
      .filter(r => r.calc)
      .sort((a, b) => {
        if (sortBy === 'gainUSD') return b.calc.gainUSD - a.calc.gainUSD;
        if (sortBy === 'score')   return b.item.score - a.item.score;
        if (sortBy === 'lossPct') return a.calc.lossPct - b.calc.lossPct;
        return 0;
      });
  }, [tradeable, balance, leverage, profile, sortBy]);

  const selectedItem = selected ? scannerResults.find(r => r.symbol === selected) : null;

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* LEFT: Settings */}
      <aside className="w-[220px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-accent">⚡</span>
            <span className="text-white font-bold text-sm">Configuration</span>
          </div>
          <p className="text-gray-600 text-xs">Paramétrez votre compte et votre levier</p>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Capital */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Capital disponible</div>
            <div className="flex items-center bg-card2 border border-border rounded-lg px-3 gap-1.5 focus-within:border-accent transition-colors">
              <span className="text-gray-500 text-sm">$</span>
              <input type="text" value={balInput}
                onChange={e => setBalInput(e.target.value)}
                onBlur={handleBalBlur}
                className="bg-transparent py-2 text-white text-sm font-mono focus:outline-none flex-1 w-0" />
            </div>
          </div>

          {/* Risk profile */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Profil de risque</div>
            <div className="space-y-1">
              {RISK_PROFILES.map(p => (
                <button key={p.id} onClick={() => { setProfile(p.id); setLeverage(Math.min(leverage, p.maxLev)); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                    profile === p.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border text-gray-500 hover:border-gray-600'
                  }`}>
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-gray-600 text-xs">Risque {p.riskPct}% / trade · max {p.maxLev}x</div>
                </button>
              ))}
            </div>
          </div>

          {/* Leverage slider */}
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Levier</span>
              <span className="text-accent font-bold font-mono">{leverage}x</span>
            </div>
            <input type="range" min={1} max={prof.maxLev} step={1} value={leverage}
              onChange={e => setLeverage(Number(e.target.value))}
              className="w-full accent-orange-500 cursor-pointer" />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>1x</span><span>{prof.maxLev}x max</span>
            </div>
          </div>

          {/* Account impact reminder */}
          <div className="bg-card2 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-2">Avec {leverage}x de levier :</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Mvt 1% → impact</span>
                <span className="text-accent font-bold">±{leverage}% compte</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Position max</span>
                <span className="text-white font-mono">${(balance * leverage).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Risque max / trade</span>
                <span className="text-sell font-bold">{prof.riskPct}% = ${(balance * prof.riskPct / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>

          {leverage >= 7 && (
            <div className="bg-sell/5 border border-sell/30 rounded-xl p-3 text-xs text-sell/80">
              Levier élevé : un mouvement de {(100 / leverage).toFixed(0)}% contre vous peut liquider votre position.
            </div>
          )}
        </div>
      </aside>

      {/* CENTER: Opportunities table */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Table header */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-white font-bold">Opportunités avec levier</span>
            <span className="text-gray-600 text-xs ml-2">{rows.length} actifs tradables</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-xs">Trier par :</span>
            {[
              { id: 'gainUSD', label: 'Gain max' },
              { id: 'score',   label: 'Score' },
              { id: 'lossPct', label: 'Risque min' },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  sortBy === s.id ? 'bg-accent/20 text-accent' : 'text-gray-600 hover:text-gray-300'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="shrink-0 border-b border-border px-4 py-2 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 text-xs text-gray-600 uppercase tracking-wider">
          <span>Actif</span>
          <span className="text-right">Prix</span>
          <span className="text-right">Levier</span>
          <span className="text-right">Position</span>
          <span className="text-right">Gain potentiel</span>
          <span className="text-right">Perte max</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
              <span className="text-4xl opacity-20">⚡</span>
              <p className="text-sm">Lancez d'abord le scanner pour voir les opportunités</p>
            </div>
          ) : rows.map(({ item, calc }) => (
            <div
              key={item.symbol}
              onClick={() => setSelected(selected === item.symbol ? null : item.symbol)}
              className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-3 border-b border-border cursor-pointer transition-all hover:bg-white/[0.02] items-center ${
                selected === item.symbol ? 'bg-accent/5 border-l-2 border-l-accent' : ''
              }`}
            >
              {/* Asset */}
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${calc.isBuy ? 'bg-accent' : 'bg-sell'}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-mono font-bold text-sm">{item.symbol}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                      item.type === 'crypto' ? 'bg-accent/10 text-accent' : 'bg-white/5 text-gray-400'
                    }`}>{item.type === 'crypto' ? 'CRYPTO' : 'ACTION'}</span>
                  </div>
                  <div className="text-gray-600 text-xs truncate">{item.name}</div>
                </div>
              </div>

              {/* Price */}
              <div className="text-right">
                <div className="text-white font-mono text-sm">{fmt(item.currentPrice, item.currentPrice > 100 ? 2 : 4)}</div>
                <div className={`text-xs ${parseFloat(item.change24h) >= 0 ? 'text-accent' : 'text-sell'}`}>
                  {parseFloat(item.change24h) >= 0 ? '+' : ''}{item.change24h}%
                </div>
              </div>

              {/* Leverage */}
              <div className="text-right">
                <span className="text-accent font-bold font-mono">{calc.lev.toFixed(1)}x</span>
                <div className={`text-xs ${
                  item.action === 'ACHAT FORT' ? 'text-accent' : item.action === 'ACHAT' ? 'text-accent/70' : 'text-hold'
                }`}>{item.action}</div>
              </div>

              {/* Position size */}
              <div className="text-right">
                <div className="text-white font-mono text-sm">${fmt(calc.pos, 0)}</div>
                <div className="text-gray-600 text-xs">Score {item.score}</div>
              </div>

              {/* Gain */}
              <div className="text-right">
                <div className="text-buy font-bold font-mono">{fmtUSD(calc.gainUSD)}</div>
                <div className="text-buy/60 text-xs">+{calc.gainPct.toFixed(1)}%</div>
              </div>

              {/* Max loss */}
              <div className="text-right">
                <div className="text-sell font-mono">{fmtUSD(-calc.lossUSD)}</div>
                <div className="text-sell/60 text-xs">-{calc.lossPct.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer summary */}
        {rows.length > 0 && (
          <div className="shrink-0 border-t border-border px-4 py-2 flex gap-6 text-xs text-gray-600">
            <span>Total gain potentiel : <span className="text-buy font-bold">{fmtUSD(rows.reduce((a, r) => a + r.calc.gainUSD, 0))}</span></span>
            <span>Perte max cumulée : <span className="text-sell font-bold">{fmtUSD(-rows.reduce((a, r) => a + r.calc.lossUSD, 0))}</span></span>
            <span className="ml-auto text-gray-700">Cliquez sur une ligne pour voir le détail →</span>
          </div>
        )}
      </main>

      {/* RIGHT: Detail panel */}
      <aside className="w-[260px] shrink-0 border-l border-border overflow-y-auto">
        <div className="px-4 pt-4 pb-2 border-b border-border">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Détail du trade</span>
        </div>
        {selectedItem ? (
          <LevDetail item={selectedItem} balance={balance} leverage={leverage} profile={profile} />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
            <span className="text-3xl opacity-10 mb-3">⚡</span>
            <p className="text-gray-600 text-xs">Sélectionnez un actif dans la liste pour voir le calcul détaillé du levier</p>
          </div>
        )}
      </aside>

    </div>
  );
}
