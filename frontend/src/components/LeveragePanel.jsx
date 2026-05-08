import { useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'trade_analyzer_leverage_settings';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function save(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '+';
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Recommend leverage based on signal confidence and volatility
function recommendedLeverage(confidence, atrPct) {
  const c = Math.max(0, Math.min(100, confidence || 50)) / 100;
  const vol = Math.max(0, Math.min(10, atrPct || 2)) / 10;
  const raw = c * 10 * (1 - vol * 0.6);
  return Math.max(1, Math.min(10, Math.round(raw)));
}

// Risk-adjusted position size: risk X% of account on this trade
function riskBasedSize(accountBalance, riskPct, entryPrice, stopLoss) {
  if (!entryPrice || !stopLoss || entryPrice === stopLoss) return accountBalance;
  const riskAmount = accountBalance * (riskPct / 100);
  const priceRisk = Math.abs(entryPrice - stopLoss) / entryPrice;
  return riskAmount / priceRisk;
}

const RISK_PROFILES = [
  { id: 'conservative', label: 'Conservateur', maxLev: 3,  riskPct: 1,   color: 'text-buy',   desc: 'Perte max 3% / trade' },
  { id: 'moderate',     label: 'Modéré',       maxLev: 5,  riskPct: 2,   color: 'text-hold',  desc: 'Perte max 5% / trade' },
  { id: 'aggressive',   label: 'Agressif',     maxLev: 10, riskPct: 5,   color: 'text-sell',  desc: 'Perte max 10% / trade' },
];

export default function LeveragePanel({ data }) {
  const stored = load();
  const [open, setOpen]               = useState(false);
  const [accountBalance, setBalance]  = useState(stored.balance || 10000);
  const [balanceInput, setBalInput]   = useState(String(stored.balance || 10000));
  const [leverage, setLeverage]       = useState(stored.leverage || 3);
  const [profile, setProfile]         = useState(stored.profile || 'moderate');

  useEffect(() => {
    save({ balance: accountBalance, leverage, profile });
  }, [accountBalance, leverage, profile]);

  const prof    = RISK_PROFILES.find(p => p.id === profile);
  const recLev  = recommendedLeverage(data?.confidence, parseFloat(data?.indicators?.atr || 2));
  const isBuy   = data?.action === 'BUY';
  const isSell  = data?.action === 'SELL';

  const calc = useMemo(() => {
    if (!data?.entryPrice) return null;
    const entry  = data.entryPrice;
    const tp     = data.targetPrice;
    const sl     = data.stopLoss;
    const lev    = Math.min(leverage, prof.maxLev);

    // Position sizing — risk-based OR leverage-based (take the smaller)
    const riskPos  = riskBasedSize(accountBalance, prof.riskPct, entry, sl);
    const levPos   = accountBalance * lev;
    const posSizeUSD = Math.min(riskPos, levPos);
    const impliedLev = posSizeUSD / accountBalance;

    const units    = posSizeUSD / entry;
    const margin   = posSizeUSD / impliedLev;

    // P&L
    const gainUSD  = isSell
      ? units * (entry - tp)       // short: profit when price drops
      : units * (tp - entry);      // long: profit when price rises
    const lossUSD  = isSell
      ? units * (sl - entry)       // short: loss when price rises
      : units * (entry - sl);      // long: loss when price drops

    const gainPct  = (gainUSD / accountBalance) * 100;
    const lossPct  = (lossUSD / accountBalance) * 100;
    const impactPer1Pct = impliedLev;

    // Liquidation price (simplified: when margin fully lost)
    const liqPrice = isSell
      ? entry * (1 + 1 / impliedLev)
      : entry * (1 - 1 / impliedLev);

    // Partial take profit (TP1 = 50% of target distance)
    const tp1 = isSell
      ? entry - (entry - tp) * 0.5
      : entry + (tp - entry) * 0.5;

    // Margin call threshold (when 50% of margin lost)
    const marginCallPrice = isSell
      ? entry * (1 + 0.5 / impliedLev)
      : entry * (1 - 0.5 / impliedLev);

    return {
      lev: impliedLev, posSizeUSD, units, margin,
      gainUSD, lossUSD, gainPct, lossPct,
      impactPer1Pct, liqPrice, tp1, marginCallPrice,
      riskAmount: accountBalance * (prof.riskPct / 100),
    };
  }, [data, accountBalance, leverage, profile, isBuy, isSell, prof]);

  if (!data || data.action === 'HOLD') return null;

  const handleBalanceBlur = () => {
    const n = parseFloat(balanceInput.replace(/[^\d.]/g, ''));
    if (!isNaN(n) && n > 0) { setBalance(n); setBalInput(String(n)); }
    else setBalInput(String(accountBalance));
  };

  const riskColor = calc
    ? calc.lossPct > 10 ? 'text-sell' : calc.lossPct > 5 ? 'text-hold' : 'text-buy'
    : 'text-gray-400';

  return (
    <div className="border-t border-border">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-accent text-base">⚡</span>
          <span className="text-white font-semibold text-sm">Trading avec levier</span>
          {calc && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent`}>
              {calc.lev.toFixed(1)}x
            </span>
          )}
        </div>
        <span className={`text-gray-600 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-5 space-y-4">

          {/* Direction badge */}
          <div className={`rounded-lg p-3 text-center border ${
            isBuy ? 'bg-buy/5 border-buy/30' : 'bg-sell/5 border-sell/30'
          }`}>
            <div className={`text-xs font-bold uppercase tracking-wider ${isBuy ? 'text-buy' : 'text-sell'}`}>
              {isBuy ? '↑ Position LONG' : '↓ Position SHORT'}
            </div>
            <div className="text-gray-500 text-xs mt-0.5">
              {isBuy ? 'Achat à crédit — profite si le prix monte' : 'Vente à découvert — profite si le prix baisse'}
            </div>
          </div>

          {/* Risk profile selector */}
          <div>
            <div className="text-xs text-gray-600 uppercase tracking-wider mb-2">Profil de risque</div>
            <div className="grid grid-cols-3 gap-1">
              {RISK_PROFILES.map(p => (
                <button key={p.id} onClick={() => { setProfile(p.id); setLeverage(Math.min(leverage, p.maxLev)); }}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    profile === p.id
                      ? `${p.color} bg-white/5 border-white/20`
                      : 'text-gray-600 border-border hover:border-gray-600'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-gray-600 text-xs mt-1 text-center">{prof.desc}</div>
          </div>

          {/* Account balance */}
          <div>
            <div className="text-xs text-gray-600 uppercase tracking-wider mb-1.5">Capital disponible</div>
            <div className="flex items-center bg-card2 border border-border rounded-lg px-3 gap-2 focus-within:border-accent transition-colors">
              <span className="text-gray-500 text-sm">$</span>
              <input
                type="text"
                value={balanceInput}
                onChange={e => setBalInput(e.target.value)}
                onBlur={handleBalanceBlur}
                className="bg-transparent py-2 text-white text-sm font-mono focus:outline-none flex-1 w-0"
              />
            </div>
          </div>

          {/* Leverage slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-gray-600 uppercase tracking-wider">Levier</div>
              <div className="flex items-center gap-2">
                {recLev === leverage && (
                  <span className="text-xs text-buy bg-buy/10 px-1.5 py-0.5 rounded">✓ Recommandé</span>
                )}
                <span className="text-accent font-bold font-mono">{leverage}x</span>
              </div>
            </div>
            <input
              type="range" min={1} max={prof.maxLev} step={1} value={leverage}
              onChange={e => setLeverage(Number(e.target.value))}
              className="w-full accent-orange-500 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>1x — Sûr</span>
              <span className="text-accent">Recommandé: {recLev}x</span>
              <span>{prof.maxLev}x — Max</span>
            </div>
          </div>

          {calc && (
            <>
              {/* Position summary */}
              <div className="bg-card2 rounded-xl p-3 space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Position calculée</div>
                {[
                  { label: 'Levier appliqué',   val: `${calc.lev.toFixed(1)}x` },
                  { label: 'Taille position',    val: `$${fmt(calc.posSizeUSD, 0)}` },
                  { label: 'Marge requise',      val: `$${fmt(calc.margin, 0)}` },
                  { label: 'Quantité',           val: `${fmt(calc.units, calc.units < 1 ? 6 : 2)} ${data.symbol?.split('-')[0]}` },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-600">{label}</span>
                    <span className="text-white font-mono font-semibold">{val}</span>
                  </div>
                ))}
              </div>

              {/* Entry */}
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Niveaux d'entrée / sortie</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center bg-card2 rounded-lg px-3 py-2">
                    <span className="text-gray-500 text-xs">Entrée</span>
                    <span className="text-white font-mono text-sm font-bold">{fmt(data.entryPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-card2 rounded-lg px-3 py-2 border border-buy/20">
                    <div>
                      <span className="text-gray-500 text-xs">TP1 (50% position)</span>
                      <span className="text-gray-600 text-xs ml-2">clôturer la moitié</span>
                    </div>
                    <span className="text-buy font-mono text-sm font-bold">{fmt(calc.tp1)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-card2 rounded-lg px-3 py-2 border border-buy/30">
                    <span className="text-gray-500 text-xs">TP2 (100% position)</span>
                    <span className="text-buy font-mono text-sm font-bold">{fmt(data.targetPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-card2 rounded-lg px-3 py-2 border border-sell/20">
                    <span className="text-gray-500 text-xs">Stop Loss (sortie forcée)</span>
                    <span className="text-sell font-mono text-sm font-bold">{fmt(data.stopLoss)}</span>
                  </div>
                </div>
              </div>

              {/* P&L impact */}
              <div className="bg-card2 rounded-xl p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Impact sur le compte</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <div className="text-buy font-bold text-lg">{fmtUSD(calc.gainUSD)}</div>
                    <div className="text-buy/70 text-xs">+{calc.gainPct.toFixed(1)}% compte</div>
                    <div className="text-gray-600 text-xs mt-0.5">Si TP atteint</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sell font-bold text-lg">{fmtUSD(-calc.lossUSD)}</div>
                    <div className="text-sell/70 text-xs">-{calc.lossPct.toFixed(1)}% compte</div>
                    <div className="text-gray-600 text-xs mt-0.5">Si SL touché</div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs">
                  <span className="text-gray-600">Impact / 1% mouvement</span>
                  <span className="text-accent font-bold">±{calc.impactPer1Pct.toFixed(1)}% compte</span>
                </div>
              </div>

              {/* Liquidation warning */}
              <div className={`rounded-xl p-3 border ${
                calc.lev >= 7 ? 'bg-sell/5 border-sell/30' :
                calc.lev >= 4 ? 'bg-hold/5 border-hold/30' :
                'bg-gray-800 border-border'
              }`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span>{calc.lev >= 7 ? '🔴' : calc.lev >= 4 ? '🟡' : '🟢'}</span>
                  <span className={calc.lev >= 7 ? 'text-sell' : calc.lev >= 4 ? 'text-hold' : 'text-buy'}>
                    Risques de liquidation
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Appel de marge si prix atteint</span>
                    <span className="text-hold font-mono font-bold">{fmt(calc.marginCallPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Liquidation totale si prix atteint</span>
                    <span className="text-sell font-mono font-bold">{fmt(calc.liqPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Distance à la liquidation</span>
                    <span className="text-white font-mono">
                      {(Math.abs(calc.liqPrice - data.entryPrice) / data.entryPrice * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                {calc.lev >= 7 && (
                  <p className="text-sell/80 text-xs mt-2 leading-relaxed">
                    ⚠️ Levier élevé : un mouvement de {(100 / calc.lev).toFixed(1)}% contre vous liquidera votre position. Réduire à {Math.min(calc.lev - 2, 5)}x recommandé.
                  </p>
                )}
              </div>

              {/* Timing guidance */}
              <div className="bg-card2 rounded-xl p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Guide d'entrée / sortie</div>
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2">
                    <span className="text-accent shrink-0 font-bold">→</span>
                    <span className="text-gray-300">
                      <span className="text-white font-semibold">Entrer</span> : {isBuy
                        ? `Achetez si le prix revient sur ${fmt(data.entryPrice)} avec confirmation de volume`
                        : `Vendez à découvert si le prix rebondit vers ${fmt(data.entryPrice)}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-buy shrink-0 font-bold">✓</span>
                    <span className="text-gray-300">
                      <span className="text-white font-semibold">TP1</span> à {fmt(calc.tp1)} — clôturer 50% de la position, déplacer le SL au prix d'entrée (trade sans risque)
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-buy shrink-0 font-bold">✓</span>
                    <span className="text-gray-300">
                      <span className="text-white font-semibold">TP2</span> à {fmt(data.targetPrice)} — clôturer le reste
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-sell shrink-0 font-bold">✗</span>
                    <span className="text-gray-300">
                      <span className="text-white font-semibold">Stop</span> à {fmt(data.stopLoss)} — sortie automatique, ne pas déplacer à la baisse
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-hold shrink-0">⚡</span>
                    <span className="text-gray-300">
                      <span className="text-white font-semibold">Attention</span> : ne jamais ajouter à une position perdante avec levier
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
