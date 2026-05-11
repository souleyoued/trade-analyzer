import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Yahoo Finance crumb cache — refreshed every 55 min
const yfAuth = { crumb: null, cookie: '', expiresAt: 0 };

async function getYFAuth() {
  if (yfAuth.crumb && Date.now() < yfAuth.expiresAt) return yfAuth;

  let cookie = '';
  for (const url of ['https://fc.yahoo.com/', 'https://finance.yahoo.com/']) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': YF_UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow',
      });
      const raw = r.headers.get('set-cookie') || '';
      const parts = [];
      for (const seg of raw.split(/,(?=[^ ])/)) {
        const m = seg.match(/^([^=]+=\S+)/);
        if (m) parts.push(m[1].split(';')[0]);
      }
      if (parts.length) { cookie = parts.join('; '); break; }
    } catch {}
  }

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YF_UA, 'Accept': '*/*', 'Cookie': cookie },
  });
  if (!crumbRes.ok) throw new Error(`Crumb fetch failed: ${crumbRes.status}`);

  yfAuth.crumb     = await crumbRes.text();
  yfAuth.cookie    = cookie;
  yfAuth.expiresAt = Date.now() + 55 * 60 * 1000;
  return yfAuth;
}

// ── Strategy Profiles ─────────────────────────────────────────────────────────

const STRATEGIES = {
  buffett: {
    id: 'buffett',
    name: 'Warren Buffett',
    emoji: '🏦',
    style: 'Value Investing',
    philosophy: 'Acheter des actifs solides en solde, tenir très longtemps. "Soyez craintif quand les autres sont avides."',
    targetPct: 0.20,  // 20% profit target — patient, long term
    stopPct:   0.10,  // 10% stop — he holds through volatility
  },
  momentum: {
    id: 'momentum',
    name: 'William O\'Neil',
    emoji: '🚀',
    style: 'CAN SLIM / Momentum',
    philosophy: 'Acheter des actions en forte tendance haussière avec volume. Couper les pertes rapidement à -7%.',
    targetPct: 0.12,
    stopPct:   0.07,
  },
  contrarian: {
    id: 'contrarian',
    name: 'Paul Tudor Jones',
    emoji: '↩️',
    style: 'Contrarian / Mean Reversion',
    philosophy: 'Identifier les extrêmes de marché et trader le retour à la moyenne. Excellente gestion du risque.',
    targetPct: 0.06,
    stopPct:   0.025,
  },
  trend: {
    id: 'trend',
    name: 'Jesse Livermore',
    emoji: '📈',
    style: 'Trend Following',
    philosophy: 'Suivre la tendance dominante. Ne jamais trader contre le marché. "The big money is made in the big swings."',
    targetPct: 0.15,
    stopPct:   0.05,
  },
};

// ── Technical Indicators ──────────────────────────────────────────────────────

function sma(prices, period) {
  const out = [];
  for (let i = period - 1; i < prices.length; i++) {
    out.push(prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

function ema(prices, period) {
  const k = 2 / (period + 1);
  const first = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [first];
  for (let i = period; i < prices.length; i++) {
    out.push(prices[i] * k + out[out.length - 1] * (1 - k));
  }
  return out;
}

function rsi(closes, period = 14) {
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const out = [];
  for (let i = period - 1; i < gains.length; i++) {
    const sl = (arr) => arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const ag = sl(gains), al = sl(losses);
    out.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return out;
}

function macd(closes) {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const offset = e12.length - e26.length;
  const macdLine = e26.map((v, i) => e12[i + offset] - v);
  if (macdLine.length < 9) return null;
  const signalLine = ema(macdLine, 9);
  const sigOffset  = macdLine.length - signalLine.length;
  return {
    macdLine:   macdLine.slice(sigOffset),
    signalLine,
    histogram:  signalLine.map((v, i) => macdLine[i + sigOffset] - v)
  };
}

function bollingerBands(closes, period = 20) {
  return closes.slice(period - 1).map((_, idx) => {
    const slice = closes.slice(idx, idx + period);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
  });
}

function atrValue(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── Strategy Signal Engines ───────────────────────────────────────────────────

function scoreBuffett({ cur, curRSI, prevRSI, curSMA20, curSMA50, bbPos, curBB, macdData, closes }) {
  let score = 0;
  const signals = [];
  const recent52w = closes.slice(-252);
  const low52w  = Math.min(...recent52w);
  const high52w = Math.max(...recent52w);
  const pctFrom52wLow = ((cur - low52w) / low52w) * 100;

  // Buffett loves buying near 52-week lows — "price is what you pay, value is what you get"
  if (pctFrom52wLow < 10) {
    score += 3;
    signals.push({ indicator: 'Position 52 sem.', value: `+${pctFrom52wLow.toFixed(0)}% du bas`, signal: 'ACHAT', color: 'green', reason: 'Proche du plus bas annuel — zone valeur' });
  } else if (pctFrom52wLow < 25) {
    score += 1.5;
    signals.push({ indicator: 'Position 52 sem.', value: `+${pctFrom52wLow.toFixed(0)}% du bas`, signal: 'POSITIF', color: 'green', reason: 'Dans la zone inférieure annuelle' });
  } else if (pctFrom52wLow > 80) {
    score -= 2;
    signals.push({ indicator: 'Position 52 sem.', value: `+${pctFrom52wLow.toFixed(0)}% du bas`, signal: 'CHER', color: 'red', reason: 'Proche du plus haut — "soyez craintif"' });
  } else {
    signals.push({ indicator: 'Position 52 sem.', value: `+${pctFrom52wLow.toFixed(0)}% du bas`, signal: 'NEUTRE', color: 'gray', reason: 'Zone médiane' });
  }

  // RSI — Buffett buys deeply oversold, avoids extreme overbought
  if (curRSI < 35) {
    score += 2.5;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'SOLDE', color: 'green', reason: 'Survente extrême — opportunité valeur' });
  } else if (curRSI < 50) {
    score += 1;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'ATTRACTIF', color: 'green', reason: 'Prix faible — moment d\'acheter' });
  } else if (curRSI > 75) {
    score -= 2.5;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'SURÉVALUÉ', color: 'red', reason: '"Soyez craintif" — surachat extrême' });
  } else if (curRSI > 60) {
    score -= 1;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'CHER', color: 'red', reason: 'Momentum haussier — Buffett attend' });
  } else {
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'NEUTRE', color: 'gray', reason: 'Zone neutre' });
  }

  // Bollinger — price below middle = "on sale"
  if (bbPos < 0.25) {
    score += 2;
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'EN SOLDE', color: 'green', reason: 'Prix sous la moyenne — valeur' });
  } else if (bbPos > 0.75) {
    score -= 1.5;
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'AU-DESSUS', color: 'red', reason: 'Prix sur-étendu au-dessus de la moyenne' });
  } else {
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'NEUTRE', color: 'gray', reason: 'Dans les bandes' });
  }

  // Long-term trend (Buffett uses 200-day SMA)
  const sma200 = sma(closes, Math.min(200, closes.length - 1));
  const curSMA200 = sma200[sma200.length - 1];
  if (cur < curSMA200 * 0.95) {
    score += 1.5;
    signals.push({ indicator: 'SMA 200j', value: curSMA200.toFixed(2), signal: 'SOUS LA MOYENNE', color: 'green', reason: 'Prix en dessous de la moyenne longue — valeur' });
  } else if (cur > curSMA200 * 1.1) {
    score -= 1;
    signals.push({ indicator: 'SMA 200j', value: curSMA200.toFixed(2), signal: 'SURÉTENDU', color: 'red', reason: 'Prix très au-dessus de la tendance longue' });
  } else {
    signals.push({ indicator: 'SMA 200j', value: curSMA200.toFixed(2), signal: 'NORMAL', color: 'gray', reason: 'Autour de la tendance longue' });
  }

  return { score, signals };
}

function scoreMomentum({ cur, curRSI, prevRSI, curSMA20, curSMA50, bbPos, macdData, closes }) {
  let score = 0;
  const signals = [];

  // Momentum needs RSI 45-70 — not oversold, not extreme overbought
  if (curRSI >= 50 && curRSI <= 70 && curRSI > prevRSI) {
    score += 2.5;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'MOMENTUM', color: 'green', reason: 'RSI en zone de force avec élan haussier' });
  } else if (curRSI >= 45 && curRSI <= 75) {
    score += 1;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'POSITIF', color: 'green', reason: 'Zone momentum acceptable' });
  } else if (curRSI < 40) {
    score -= 2;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'FAIBLE', color: 'red', reason: 'Pas de momentum — éviter selon O\'Neil' });
  } else if (curRSI > 80) {
    score -= 1;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'TROP CHAUD', color: 'red', reason: 'RSI extrême — attendre retrait' });
  } else {
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'NEUTRE', color: 'gray', reason: 'Zone neutre' });
  }

  // MACD is key for momentum — crossovers are strong signals
  if (macdData) {
    const len = macdData.macdLine.length;
    const cm = macdData.macdLine[len-1], cs = macdData.signalLine[len-1];
    const pm = macdData.macdLine[len-2], ps = macdData.signalLine[len-2];
    if (cm > cs && pm <= ps) {
      score += 3;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'SIGNAL!', color: 'green', reason: 'Croisement haussier — signal CAN SLIM fort' });
    } else if (cm > cs && cm > 0) {
      score += 2;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'HAUSSIER', color: 'green', reason: 'MACD positif et au-dessus du signal' });
    } else if (cm < cs && pm >= ps) {
      score -= 3;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'SORTIR!', color: 'red', reason: 'Croisement baissier — couper la perte à -7%' });
    } else {
      score -= 1.5;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'BAISSIER', color: 'red', reason: 'Pas de momentum MACD' });
    }
  }

  // SMA 20/50 — golden cross is key for O'Neil
  const smaGap = ((curSMA20 - curSMA50) / curSMA50) * 100;
  if (curSMA20 > curSMA50 && smaGap > 2) {
    score += 2.5;
    signals.push({ indicator: 'SMA 20/50', value: `+${smaGap.toFixed(1)}%`, signal: 'TENDANCE FORTE', color: 'green', reason: 'SMA20 nettement au-dessus de SMA50 — momentum confirmé' });
  } else if (curSMA20 > curSMA50) {
    score += 1;
    signals.push({ indicator: 'SMA 20/50', value: `+${smaGap.toFixed(1)}%`, signal: 'HAUSSIER', color: 'green', reason: 'Tendance court terme positive' });
  } else {
    score -= 2;
    signals.push({ indicator: 'SMA 20/50', value: `${smaGap.toFixed(1)}%`, signal: 'BAISSIER', color: 'red', reason: 'Tendance cassée — O\'Neil dit: rester en cash' });
  }

  // Price vs SMA20 — price must be above for momentum
  if (cur > curSMA20 * 1.02) {
    score += 1.5;
    signals.push({ indicator: 'Prix/SMA20', value: `+${(((cur-curSMA20)/curSMA20)*100).toFixed(1)}%`, signal: 'AU-DESSUS', color: 'green', reason: 'Prix au-dessus de la tendance court terme' });
  } else if (cur < curSMA20) {
    score -= 2;
    signals.push({ indicator: 'Prix/SMA20', value: `${(((cur-curSMA20)/curSMA20)*100).toFixed(1)}%`, signal: 'SOUS SMA20', color: 'red', reason: 'Momentum brisé — attendre recovery' });
  } else {
    signals.push({ indicator: 'Prix/SMA20', value: '~SMA20', signal: 'NEUTRE', color: 'gray', reason: 'Proche de la SMA20' });
  }

  return { score, signals };
}

function scoreContrarian({ cur, curRSI, prevRSI, curSMA20, curSMA50, bbPos, curBB, macdData }) {
  let score = 0;
  const signals = [];

  // Contrarian loves RSI extremes — buy extreme oversold, sell extreme overbought
  if (curRSI < 25) {
    score += 3.5;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'EXTRÊME VENTE', color: 'green', reason: 'RSI extrêmement bas — rebond quasi-certain' });
  } else if (curRSI < 32) {
    score += 2;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'SURVENTE', color: 'green', reason: 'Survente forte — potentiel de rebond' });
  } else if (curRSI > 75) {
    score -= 3.5;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'EXTRÊME ACHAT', color: 'red', reason: 'RSI extrêmement haut — retournement probable' });
  } else if (curRSI > 68) {
    score -= 2;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'SURACHAT', color: 'red', reason: 'Surachat fort — attention au retournement' });
  } else if (curRSI >= 45 && curRSI <= 55) {
    score -= 1; // Contrarian avoids "no man's land"
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'ZONE NEUTRE', color: 'gray', reason: 'Pas d\'extrême — pas de trade selon Tudor Jones' });
  } else {
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'NEUTRE', color: 'gray', reason: 'Zone moyenne' });
  }

  // Bollinger Bands — contrarian's primary tool for extremes
  if (cur < curBB.lower * 0.99) {
    score += 3;
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'CASSURE BAS', color: 'green', reason: 'Prix cassé sous la bande — rebond violent probable' });
  } else if (bbPos < 0.15) {
    score += 2;
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'EXTRÊME BAS', color: 'green', reason: 'Extrême inférieur — zone de rebond' });
  } else if (cur > curBB.upper * 1.01) {
    score -= 3;
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'CASSURE HAUT', color: 'red', reason: 'Prix cassé au-dessus — retournement violent probable' });
  } else if (bbPos > 0.85) {
    score -= 2;
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'EXTRÊME HAUT', color: 'red', reason: 'Extrême supérieur — zone de vente' });
  } else {
    signals.push({ indicator: 'Bollinger', value: `${(bbPos*100).toFixed(0)}%`, signal: 'MILIEU', color: 'gray', reason: 'Pas d\'extrême Bollinger' });
  }

  // RSI divergence signal — key contrarian tool
  if (prevRSI > curRSI && curRSI < 35) {
    score += 1;
    signals.push({ indicator: 'RSI Divergence', value: `${prevRSI.toFixed(0)} → ${curRSI.toFixed(0)}`, signal: 'DÉPRESSION MAX', color: 'green', reason: 'RSI en chute libre — climax de vente probable' });
  } else if (prevRSI < curRSI && curRSI > 65) {
    score -= 1;
    signals.push({ indicator: 'RSI Divergence', value: `${prevRSI.toFixed(0)} → ${curRSI.toFixed(0)}`, signal: 'EUPHORIE', color: 'red', reason: 'RSI montant encore — euphorie' });
  } else {
    signals.push({ indicator: 'RSI Divergence', value: `${prevRSI.toFixed(0)} → ${curRSI.toFixed(0)}`, signal: 'NORMAL', color: 'gray', reason: 'Pas de divergence notable' });
  }

  // MACD for confirmation
  if (macdData) {
    const h = macdData.histogram;
    const lastH = h[h.length - 1];
    const prevH = h[h.length - 2];
    if (lastH > prevH && lastH < 0) {
      score += 1.5;
      signals.push({ indicator: 'MACD Histo.', value: lastH.toFixed(3), signal: 'REBOND', color: 'green', reason: 'Histogramme qui remonte depuis négatif — confirmation rebond' });
    } else if (lastH < prevH && lastH > 0) {
      score -= 1.5;
      signals.push({ indicator: 'MACD Histo.', value: lastH.toFixed(3), signal: 'RETOURNEMENT', color: 'red', reason: 'Histogramme qui baisse depuis positif — confirmation retournement' });
    } else {
      signals.push({ indicator: 'MACD Histo.', value: lastH.toFixed(3), signal: 'NEUTRE', color: 'gray', reason: 'Histogramme sans signal fort' });
    }
  }

  return { score, signals };
}

function scoreTrend({ cur, curRSI, curSMA20, curSMA50, bbPos, macdData, closes }) {
  let score = 0;
  const signals = [];
  const sma200 = sma(closes, Math.min(200, closes.length - 1));
  const curSMA200 = sma200[sma200.length - 1];

  // Livermore: ONLY trade in direction of major trend (SMA200)
  if (cur > curSMA200 && curSMA20 > curSMA50) {
    score += 3;
    signals.push({ indicator: 'Tendance Majeure', value: `SMA200: ${curSMA200.toFixed(2)}`, signal: 'HAUSSIÈRE', color: 'green', reason: 'Prix et SMA en ordre haussier — "Big Swing" possible' });
  } else if (cur < curSMA200 && curSMA20 < curSMA50) {
    score -= 3;
    signals.push({ indicator: 'Tendance Majeure', value: `SMA200: ${curSMA200.toFixed(2)}`, signal: 'BAISSIÈRE', color: 'red', reason: 'Tendance baissière — Livermore vend à découvert' });
  } else if (cur > curSMA200) {
    score += 1;
    signals.push({ indicator: 'Tendance Majeure', value: `SMA200: ${curSMA200.toFixed(2)}`, signal: 'HAUSSIÈRE', color: 'green', reason: 'Au-dessus de SMA200 — tendance long terme OK' });
  } else {
    score -= 1;
    signals.push({ indicator: 'Tendance Majeure', value: `SMA200: ${curSMA200.toFixed(2)}`, signal: 'BAISSIÈRE', color: 'red', reason: 'Sous la SMA200 — Livermore évite' });
  }

  // SMA alignment (20 > 50 > 200 = perfect bull)
  if (curSMA20 > curSMA50) {
    score += 2;
    signals.push({ indicator: 'Alignement SMA', value: `20>${curSMA20.toFixed(0)} / 50>${curSMA50.toFixed(0)}`, signal: 'PARFAIT', color: 'green', reason: 'SMA 20 > 50 — alignement haussier parfait' });
  } else {
    score -= 2;
    signals.push({ indicator: 'Alignement SMA', value: `20<${curSMA20.toFixed(0)} / 50<${curSMA50.toFixed(0)}`, signal: 'INVERSÉ', color: 'red', reason: 'SMA non alignées — Livermore reste en cash' });
  }

  // RSI must confirm the trend, not be extreme
  if (curRSI > 50 && curRSI < 70) {
    score += 2;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'TENDANCE', color: 'green', reason: 'RSI confirme la tendance haussière (50-70)' });
  } else if (curRSI >= 70) {
    score += 0.5;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'FORT', color: 'green', reason: 'Tendance très forte — surveiller essoufflement' });
  } else if (curRSI < 40) {
    score -= 2;
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'FAIBLE', color: 'red', reason: 'RSI faible — tendance cassée' });
  } else {
    signals.push({ indicator: 'RSI', value: curRSI.toFixed(1), signal: 'NEUTRE', color: 'gray', reason: 'RSI en zone de transition' });
  }

  // MACD trend confirmation
  if (macdData) {
    const len = macdData.macdLine.length;
    const cm = macdData.macdLine[len-1], cs = macdData.signalLine[len-1];
    const pm = macdData.macdLine[len-2], ps = macdData.signalLine[len-2];
    if (cm > cs && pm <= ps) {
      score += 2.5;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'NOUVEAU SIGNAL', color: 'green', reason: 'Croisement MACD — Livermore entre en position' });
    } else if (cm > cs) {
      score += 1.5;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'HAUSSIER', color: 'green', reason: 'MACD confirme la tendance' });
    } else if (cm < cs && pm >= ps) {
      score -= 2.5;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'SIGNAL SORTIE', color: 'red', reason: 'Croisement baissier — Livermore sort' });
    } else {
      score -= 1.5;
      signals.push({ indicator: 'MACD', value: cm.toFixed(3), signal: 'BAISSIER', color: 'red', reason: 'MACD contre la tendance — attendre' });
    }
  }

  return { score, signals };
}

// ── Main Signal Generator ─────────────────────────────────────────────────────

function generateSignal(quotes, strategyId = 'buffett') {
  const strategy = STRATEGIES[strategyId] || STRATEGIES.buffett;

  const closes  = quotes.map(q => q.close);
  const highs   = quotes.map(q => q.high);
  const lows    = quotes.map(q => q.low);

  const cur  = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const change24h = ((cur - prev) / prev) * 100;

  const rsiVals  = rsi(closes);
  const curRSI   = rsiVals[rsiVals.length - 1];
  const prevRSI  = rsiVals[rsiVals.length - 2];

  const macdData = macd(closes);
  const bbData   = bollingerBands(closes);
  const curBB    = bbData[bbData.length - 1];
  const bbPos    = (cur - curBB.lower) / (curBB.upper - curBB.lower);

  const sma20    = sma(closes, 20);
  const sma50    = sma(closes, 50);
  const curSMA20 = sma20[sma20.length - 1];
  const curSMA50 = sma50[sma50.length - 1];
  const curATR   = atrValue(highs, lows, closes);

  const ctx = { cur, curRSI, prevRSI, curSMA20, curSMA50, bbPos, curBB, macdData, closes };

  let score, signals;
  if (strategyId === 'buffett')     ({ score, signals } = scoreBuffett(ctx));
  else if (strategyId === 'momentum')   ({ score, signals } = scoreMomentum(ctx));
  else if (strategyId === 'contrarian') ({ score, signals } = scoreContrarian(ctx));
  else                                  ({ score, signals } = scoreTrend(ctx));

  // ── Recommendation thresholds ─────────────────────────────────────────────
  let recommendation, confidence, action, timing;
  const maxScore = 10;

  if (score >= 5) {
    recommendation = 'ACHAT FORT'; confidence = Math.min(93, 72 + score * 2); action = 'BUY';
    timing = strategyId === 'buffett'     ? 'ACHETER MAINTENANT — rare opportunité valeur'
           : strategyId === 'momentum'    ? 'ENTRER — momentum fort, tendance confirmée'
           : strategyId === 'contrarian'  ? 'REBOND FORT — extrême de vente, entrer vite'
           : 'SUIVRE LA TENDANCE — entrer maintenant';
  } else if (score >= 2.5) {
    recommendation = 'ACHAT'; confidence = Math.min(76, 62 + score * 2); action = 'BUY';
    timing = strategyId === 'buffett'    ? 'ACCUMULER — bon prix, positions partielles'
           : strategyId === 'momentum'   ? 'ENTRER SUR REPLI — momentum se forme'
           : strategyId === 'contrarian' ? 'POTENTIEL DE REBOND — entrer sur confirmation'
           : 'TENDANCE HAUSSIÈRE — entrer sur correction';
  } else if (score <= -5) {
    recommendation = 'VENTE FORTE'; confidence = Math.min(93, 72 + Math.abs(score) * 2); action = 'SELL';
    timing = strategyId === 'buffett'    ? 'SURÉVALUÉ — Buffett dirait "soyez craintif"'
           : strategyId === 'momentum'   ? 'SORTIR VITE — couper la perte à -7% (règle O\'Neil)'
           : strategyId === 'contrarian' ? 'VENDRE — extrême d\'achat, retournement probable'
           : 'TENDANCE CASSÉE — Livermore sort immédiatement';
  } else if (score <= -2.5) {
    recommendation = 'VENTE'; confidence = Math.min(76, 62 + Math.abs(score) * 2); action = 'SELL';
    timing = strategyId === 'buffett'    ? 'ALLÉGER — trop cher pour Buffett'
           : strategyId === 'momentum'   ? 'RÉDUIRE — momentum s\'affaiblit'
           : strategyId === 'contrarian' ? 'ALLÉGER — tendance vers l\'extrême haut'
           : 'PRUDENCE — tendance s\'affaiblit';
  } else {
    recommendation = 'NEUTRE'; confidence = 50; action = 'HOLD';
    timing = strategyId === 'buffett'    ? 'ATTENDRE — pas encore en solde selon Buffett'
           : strategyId === 'momentum'   ? 'PAS DE MOMENTUM — rester en cash selon O\'Neil'
           : strategyId === 'contrarian' ? 'AUCUN EXTRÊME — Tudor Jones attend'
           : 'PAS DE TENDANCE CLAIRE — Livermore attend';
  }

  // ── Entry/Exit levels per strategy ────────────────────────────────────────
  const dir = action === 'BUY' ? 1 : action === 'SELL' ? -1 : 0;
  const atrMult = strategyId === 'contrarian' ? 1.0 : strategyId === 'momentum' ? 1.5 : 2.0;
  const dynStopPct = Math.max(strategy.stopPct * 0.5, curATR / cur * atrMult);
  const actualStopPct = Math.max(strategy.stopPct * 0.6, dynStopPct);

  const entryPrice  = cur;
  const targetPrice = dir !== 0 ? cur * (1 + dir * strategy.targetPct) : cur * (1 + strategy.targetPct);
  const stopLoss    = dir !== 0 ? cur * (1 - dir * actualStopPct)       : cur * (1 - strategy.stopPct);
  const riskReward  = Math.abs(targetPrice - cur) / Math.abs(stopLoss - cur);

  const recent20 = closes.slice(-20);
  const support    = Math.min(...recent20);
  const resistance = Math.max(...recent20);

  return {
    recommendation,
    confidence: Math.round(confidence),
    action,
    timing,
    score: score.toFixed(1),
    currentPrice: cur,
    change24h: change24h.toFixed(2),
    entryPrice,
    targetPrice,
    stopLoss,
    riskReward: riskReward.toFixed(2),
    support,
    resistance,
    strategy: {
      id:          strategy.id,
      name:        strategy.name,
      emoji:       strategy.emoji,
      style:       strategy.style,
      philosophy:  strategy.philosophy,
    },
    indicators: {
      rsi: parseFloat(curRSI.toFixed(2)),
      macd: macdData ? {
        macd:      parseFloat(macdData.macdLine[macdData.macdLine.length - 1].toFixed(4)),
        signal:    parseFloat(macdData.signalLine[macdData.signalLine.length - 1].toFixed(4)),
        histogram: parseFloat(macdData.histogram[macdData.histogram.length - 1].toFixed(4))
      } : null,
      bb: {
        upper:    parseFloat(curBB.upper.toFixed(2)),
        middle:   parseFloat(curBB.middle.toFixed(2)),
        lower:    parseFloat(curBB.lower.toFixed(2)),
        position: parseFloat((bbPos * 100).toFixed(1))
      },
      sma20: parseFloat(curSMA20.toFixed(2)),
      sma50: parseFloat(curSMA50.toFixed(2))
    },
    signals
  };
}

// ── Day Trade Scanner ─────────────────────────────────────────────────────────

const WATCHLIST = {
  stocks: [
    { symbol: 'NVDA',  name: 'Nvidia' },
    { symbol: 'TSLA',  name: 'Tesla' },
    { symbol: 'AAPL',  name: 'Apple' },
    { symbol: 'AMD',   name: 'AMD' },
    { symbol: 'META',  name: 'Meta' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'AMZN',  name: 'Amazon' },
    { symbol: 'MSFT',  name: 'Microsoft' },
    { symbol: 'COIN',  name: 'Coinbase' },
    { symbol: 'MSTR',  name: 'MicroStrategy' },
    { symbol: 'PLTR',  name: 'Palantir' },
    { symbol: 'SOFI',  name: 'SoFi' },
    { symbol: 'HOOD',  name: 'Robinhood' },
    { symbol: 'SPY',   name: 'S&P 500 ETF' },
    { symbol: 'QQQ',   name: 'Nasdaq ETF' },
  ],
  crypto: [
    { symbol: 'BTC-USD',  name: 'Bitcoin' },
    { symbol: 'ETH-USD',  name: 'Ethereum' },
    { symbol: 'SOL-USD',  name: 'Solana' },
    { symbol: 'XRP-USD',  name: 'XRP' },
    { symbol: 'DOGE-USD', name: 'Dogecoin' },
    { symbol: 'BNB-USD',  name: 'BNB' },
    { symbol: 'AVAX-USD', name: 'Avalanche' },
    { symbol: 'ADA-USD',  name: 'Cardano' },
  ],
};

function scoreDayTrade(quotes, meta) {
  const closes  = quotes.map(q => q.close);
  const highs   = quotes.map(q => q.high);
  const lows    = quotes.map(q => q.low);
  const volumes = quotes.map(q => q.volume).filter(v => v > 0);

  const cur  = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const change24h = ((cur - prev) / prev) * 100;

  const curATR  = atrValue(highs, lows, closes, 14);
  const atrPct  = (curATR / cur) * 100;

  const rsiVals  = rsi(closes);
  const curRSI   = rsiVals[rsiVals.length - 1];
  const prevRSI  = rsiVals[rsiVals.length - 2];
  const rsiRising = curRSI > prevRSI;

  const macdData = macd(closes);
  const bbData   = bollingerBands(closes);
  const curBB    = bbData[bbData.length - 1];
  const bbPos    = Math.max(0, Math.min(1, (cur - curBB.lower) / (curBB.upper - curBB.lower)));

  const sma20v   = sma(closes, 20);
  const sma50v   = sma(closes, 50);
  const curSMA20 = sma20v[sma20v.length - 1];
  const curSMA50 = sma50v[sma50v.length - 1];

  // Volume spike vs 20-day avg
  let volumeBonus = 0;
  if (volumes.length >= 10) {
    const avgVol  = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
    const lastVol = volumes[volumes.length - 1];
    if (lastVol > avgVol * 2)   volumeBonus = 12;
    else if (lastVol > avgVol * 1.5) volumeBonus = 7;
  }

  let score   = 0;
  const reasons = [];

  // ── 1. RSI momentum (0-25) ──
  if (curRSI >= 48 && curRSI <= 65 && rsiRising) {
    score += 25; reasons.push('RSI en zone momentum idéale');
  } else if (curRSI >= 42 && curRSI <= 70) {
    score += 15;
  } else if (curRSI < 32) {
    score += 22; reasons.push('RSI survente — rebond imminent');
  } else {
    score += 5;
  }

  // ── 2. MACD (0-30) ──
  if (macdData) {
    const len  = macdData.macdLine.length;
    const cm   = macdData.macdLine[len-1], cs = macdData.signalLine[len-1];
    const pm   = macdData.macdLine[len-2], ps = macdData.signalLine[len-2];
    const hist = macdData.histogram;
    const histRising = hist[hist.length-1] > hist[hist.length-2];

    if (cm > cs && pm <= ps) {
      score += 30; reasons.push('MACD: croisement haussier frais !');
    } else if (cm > cs && histRising && cm > 0) {
      score += 22; reasons.push('MACD haussier et accélère');
    } else if (cm > cs && histRising) {
      score += 15; reasons.push('MACD momentum positif');
    } else if (cm > cs) {
      score += 10;
    }
  }

  // ── 3. Volatilité / ATR (0-20) ──
  if (atrPct >= 3.5) {
    score += 20; reasons.push(`Très volatile: ATR ${atrPct.toFixed(1)}%`);
  } else if (atrPct >= 2) {
    score += 15; reasons.push(`Bonne volatilité: ATR ${atrPct.toFixed(1)}%`);
  } else if (atrPct >= 1) {
    score += 8;
  } else {
    score += 3;
  }

  // ── 4. Bollinger position (0-15) ──
  if (bbPos >= 0.35 && bbPos <= 0.65 && cur > curSMA20) {
    score += 15; reasons.push('Prix en zone centrale — place pour progresser');
  } else if (bbPos <= 0.25) {
    score += 12; reasons.push('Bas de bande — zone de rebond');
  } else if (bbPos >= 0.4 && bbPos <= 0.75) {
    score += 10;
  }

  // ── 5. Alignement SMA (0-10) ──
  if (cur > curSMA20 && curSMA20 > curSMA50) {
    score += 10; reasons.push('Tendance SMA parfaitement alignée');
  } else if (cur > curSMA20) {
    score += 5;
  }

  // ── 6. Volume spike bonus (0-12) ──
  score += volumeBonus;
  if (volumeBonus > 0) reasons.push('Volume anormalement élevé !');

  score = Math.min(100, Math.round(score));

  let action;
  if (score >= 72)     action = 'ACHAT FORT';
  else if (score >= 52) action = 'ACHAT';
  else if (score >= 35) action = 'SURVEILLER';
  else                  action = 'ÉVITER';

  const stopPct    = Math.max(0.015, curATR / cur * 0.7);
  const targetPctV = Math.max(0.025, curATR / cur * 1.6);
  const stopLoss   = cur * (1 - stopPct);
  const targetPrice = cur * (1 + targetPctV);
  const rr = (targetPctV / stopPct).toFixed(2);

  return {
    score,
    action,
    confidence:      Math.min(95, Math.round(score * 0.93)),
    currentPrice:    cur,
    change24h:       change24h.toFixed(2),
    atrPct:          atrPct.toFixed(2),
    entryPrice:      cur,
    stopLoss,
    targetPrice,
    riskReward:      rr,
    expectedGainPct: (atrPct * (score / 100) * 0.85).toFixed(2),
    reasons:         reasons.slice(0, 3),
    currency:        meta?.currency || 'USD',
  };
}

// ── Daily AI Picks ────────────────────────────────────────────────────────────

const DAILY_WATCHLIST = [
  // High-volatility stocks
  { symbol: 'NVDA',  name: 'Nvidia',          type: 'stock' },
  { symbol: 'TSLA',  name: 'Tesla',           type: 'stock' },
  { symbol: 'AMD',   name: 'AMD',             type: 'stock' },
  { symbol: 'META',  name: 'Meta',            type: 'stock' },
  { symbol: 'COIN',  name: 'Coinbase',        type: 'stock' },
  { symbol: 'MSTR',  name: 'MicroStrategy',   type: 'stock' },
  { symbol: 'PLTR',  name: 'Palantir',        type: 'stock' },
  { symbol: 'HOOD',  name: 'Robinhood',       type: 'stock' },
  // Leveraged ETFs — amplify moves x3
  { symbol: 'TQQQ',  name: 'Nasdaq 3x Bull',  type: 'etf'   },
  { symbol: 'SOXL',  name: 'Semi 3x Bull',    type: 'etf'   },
  { symbol: 'SPXL',  name: 'S&P500 3x Bull',  type: 'etf'   },
  { symbol: 'LABU',  name: 'Biotech 3x Bull', type: 'etf'   },
  // Crypto — can move 25%+ in days
  { symbol: 'BTC-USD', name: 'Bitcoin',   type: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum',  type: 'crypto' },
  { symbol: 'SOL-USD', name: 'Solana',    type: 'crypto' },
  { symbol: 'XRP-USD', name: 'XRP',       type: 'crypto' },
];

function scoreDailyPick(quotes, meta, symbol) {
  const closes  = quotes.map(q => q.close);
  const highs   = quotes.map(q => q.high);
  const lows    = quotes.map(q => q.low);
  const volumes = quotes.map(q => q.volume).filter(v => v > 0);

  const cur     = closes[closes.length - 1];
  const prev    = closes[closes.length - 2];
  const change24h = ((cur - prev) / prev) * 100;

  const curATR  = atrValue(highs, lows, closes, 14);
  const atrPct  = (curATR / cur) * 100;

  const rsiVals  = rsi(closes);
  const curRSI   = rsiVals[rsiVals.length - 1];
  const prevRSI  = rsiVals[rsiVals.length - 2];

  const macdData = macd(closes);
  const bbData   = bollingerBands(closes);
  const curBB    = bbData[bbData.length - 1];
  const bbPos    = Math.max(0, Math.min(1, (cur - curBB.lower) / (curBB.upper - curBB.lower)));

  const sma20v   = sma(closes, 20);
  const sma50v   = sma(closes, 50);
  const curSMA20 = sma20v[sma20v.length - 1];
  const curSMA50 = sma50v[sma50v.length - 1];

  let score   = 0;
  const reasons = [];

  // 1. RSI momentum zone (25 pts)
  if (curRSI >= 52 && curRSI <= 70 && curRSI > prevRSI) {
    score += 25; reasons.push(`RSI ${curRSI.toFixed(0)} — momentum haussier confirmé`);
  } else if (curRSI <= 32 && curRSI > prevRSI) {
    score += 22; reasons.push(`RSI ${curRSI.toFixed(0)} — survente extrême, rebond probable`);
  } else if (curRSI >= 45 && curRSI <= 75) {
    score += 14;
  } else {
    score += 4;
  }

  // 2. MACD crossover (30 pts)
  if (macdData) {
    const len = macdData.macdLine.length;
    const cm  = macdData.macdLine[len - 1], cs = macdData.signalLine[len - 1];
    const pm  = macdData.macdLine[len - 2], ps = macdData.signalLine[len - 2];
    const hist = macdData.histogram;
    const histRising = hist[hist.length - 1] > hist[hist.length - 2];
    if (cm > cs && pm <= ps) {
      score += 30; reasons.push('Croisement MACD haussier — signal d\'entrée fort');
    } else if (cm > cs && histRising && cm > 0) {
      score += 22; reasons.push('MACD haussier et accélère au-dessus de zéro');
    } else if (cm > cs && histRising) {
      score += 15; reasons.push('MACD en reprise haussière');
    } else if (cm > cs) {
      score += 9;
    }
  }

  // 3. Volatility — ATR must be high enough to reach 25% (20 pts)
  if (atrPct >= 5)   { score += 20; reasons.push(`Volatilité élevée ATR ${atrPct.toFixed(1)}% — idéal pour +25%`); }
  else if (atrPct >= 3) { score += 15; reasons.push(`Bonne volatilité ATR ${atrPct.toFixed(1)}%`); }
  else if (atrPct >= 1.5) { score += 8; }
  else               { score -= 8; } // trop faible pour 25% rapidement

  // 4. Trend alignment SMA 20/50 (15 pts)
  if (cur > curSMA20 && curSMA20 > curSMA50) {
    score += 15; reasons.push('Tendances SMA 20/50 parfaitement alignées haussières');
  } else if (cur > curSMA20) {
    score += 8;
  } else if (cur < curSMA20 && curRSI < 35) {
    score += 5; // rebond contrarian
  }

  // 5. Volume spike (10 pts)
  if (volumes.length >= 21) {
    const avgVol  = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const lastVol = volumes[volumes.length - 1];
    const ratio   = lastVol / avgVol;
    if (ratio >= 2)   { score += 10; reasons.push(`Volume x${ratio.toFixed(1)} supérieur à la moyenne`); }
    else if (ratio >= 1.4) { score += 5; }
  }

  // 6. Recent 3-day momentum (5 pts)
  const avg3 = closes.slice(-4, -1).reduce((a, b) => a + b, 0) / 3;
  const mom3 = ((cur - avg3) / avg3) * 100;
  if (mom3 > 4) { score += 5; reasons.push(`Momentum 3j : +${mom3.toFixed(1)}%`); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Action direction
  let action = 'BUY';
  if (macdData) {
    const len = macdData.macdLine.length;
    if (macdData.macdLine[len - 1] < macdData.signalLine[len - 1] && curRSI > 68) action = 'SELL';
  }

  // Target always at +25% from entry (objective of the module)
  const targetPct = 0.25;
  const stopPct   = Math.max(0.04, curATR / cur * 1.2);
  const entryPrice  = cur;
  const targetPrice = action === 'BUY' ? cur * (1 + targetPct) : cur * (1 - targetPct);
  const stopLoss    = action === 'BUY' ? cur * (1 - stopPct)   : cur * (1 + stopPct);
  const riskReward  = (targetPct / stopPct).toFixed(2);

  // Leverage to reach 25% in one session if asset ATR allows it
  const leverageNeeded = atrPct >= 25 ? 1 : atrPct >= 12 ? 2 : atrPct >= 6 ? 3 : atrPct >= 3 ? 5 : 10;

  // Days estimate to reach 25% without leverage (based on ATR)
  const daysEstimate = atrPct > 0 ? Math.ceil(targetPct / (atrPct / 100)) : '?';

  return {
    score,
    action,
    confidence:      Math.min(93, Math.round(score * 0.91)),
    currentPrice:    cur,
    change24h:       change24h.toFixed(2),
    atrPct:          atrPct.toFixed(2),
    entryPrice,
    targetPrice,
    stopLoss,
    riskReward,
    targetPct:       25,
    leverageNeeded,
    daysEstimate,
    bbPos:           parseFloat((bbPos * 100).toFixed(1)),
    reasons:         reasons.slice(0, 4),
    currency:        meta?.currency || 'USD',
    name:            meta?.longName || meta?.shortName || symbol,
  };
}

// Market timing helpers (EST = UTC-5, EDT = UTC-4)
function getMarketStatus() {
  const now   = new Date();
  const utcH  = now.getUTCHours();
  const utcM  = now.getUTCMinutes();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  // Use EDT offset (-4) for DST simplification (roughly Mar–Nov)
  const month = now.getUTCMonth(); // 0-indexed
  const isDST = month >= 2 && month <= 10;
  const estOffset = isDST ? -4 : -5;
  const estTotalMin = (utcH * 60 + utcM + (24 + estOffset) * 60) % (24 * 60);
  const estH = Math.floor(estTotalMin / 60);
  const estM = estTotalMin % 60;
  const estDayAdj = utcDay; // simplified — good enough for ±1 day

  const isWeekend  = estDayAdj === 0 || estDayAdj === 6;
  const openMin    = 9 * 60 + 30;
  const closeMin   = 16 * 60;
  const nowMin     = estH * 60 + estM;
  const isOpen     = !isWeekend && nowMin >= openMin && nowMin < closeMin;
  const isPreMkt   = !isWeekend && nowMin < openMin;
  const isAfterMkt = !isWeekend && nowMin >= closeMin;

  let minutesUntilOpen = null;
  if (isPreMkt)    minutesUntilOpen = openMin - nowMin;
  if (isWeekend)   minutesUntilOpen = ((8 - estDayAdj) % 7) * 24 * 60 + openMin - nowMin;

  return { isOpen, isPreMkt, isAfterMkt, isWeekend, minutesUntilOpen, estH, estM };
}

app.get('/api/daily-picks', async (req, res) => {
  const DEADLINE = Date.now() + 25_000;
  const results  = [];

  for (const item of DAILY_WATCHLIST) {
    if (Date.now() >= DEADLINE) break;
    try {
      const result = await fetchChart(item.symbol, '6mo', '1d');
      const quotes  = parseQuotes(result);
      if (quotes.length < 40) continue;
      const pick = scoreDailyPick(quotes, result.meta, item.symbol);
      if (pick.score < 35) continue; // skip weak setups
      results.push({ symbol: item.symbol, type: item.type, ...pick });
    } catch { /* skip */ }
  }

  results.sort((a, b) => b.score - a.score);
  const picks = results.slice(0, 5);

  res.json({ picks, total: results.length, market: getMarketStatus(), generatedAt: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/strategies', (req, res) => {
  res.json(Object.values(STRATEGIES));
});

// SSE scanner — streams results as they arrive
app.get('/api/scanner/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const { type = 'all' } = req.query;
  const list = type === 'crypto'  ? WATCHLIST.crypto
             : type === 'stocks'  ? WATCHLIST.stocks
             : [...WATCHLIST.stocks, ...WATCHLIST.crypto];

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  send({ type: 'start', total: list.length });

  const results = [];
  let done = 0;

  for (const item of list) {
    if (res.destroyed) break;
    try {
      const result = await fetchChart(item.symbol, '6mo', '1d');
      const quotes  = parseQuotes(result);
      if (quotes.length >= 30) {
        const score = scoreDayTrade(quotes, result.meta);
        const entry = {
          symbol:   item.symbol,
          name:     item.name,
          type:     WATCHLIST.crypto.some(c => c.symbol === item.symbol) ? 'crypto' : 'stock',
          ...score,
        };
        results.push(entry);
        results.sort((a, b) => b.score - a.score);
      }
    } catch { /* skip failed symbols */ }

    done++;
    send({ type: 'update', results: results.slice(0, 20), done, total: list.length });
    await new Promise(r => setTimeout(r, 550));
  }

  send({ type: 'done', results: results.slice(0, 20), done, total: list.length });
  res.end();
  req.on('close', () => res.end());
});

app.get('/api/analyze/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { strategy = 'buffett' } = req.query;

    const result = await fetchChart(symbol, '1y', '1d');
    const quotes  = parseQuotes(result);

    if (quotes.length < 60) {
      return res.status(400).json({ error: 'Données insuffisantes (< 60 jours)' });
    }

    const analysis = generateSignal(quotes, strategy);
    const meta     = result.meta || {};

    const closes   = quotes.map(q => q.close);
    const sma20raw = sma(closes, 20);
    const sma50raw = sma(closes, 50);
    const last90   = quotes.slice(-90);

    const chartData = last90.map((q, i) => {
      const absIdx = quotes.length - 90 + i;
      return {
        date:   q.date.toISOString().split('T')[0],
        close:  parseFloat(q.close.toFixed(4)),
        high:   parseFloat(q.high.toFixed(4)),
        low:    parseFloat(q.low.toFixed(4)),
        open:   parseFloat(q.open.toFixed(4)),
        volume: q.volume,
        sma20:  absIdx >= 19 ? parseFloat(sma20raw[absIdx - 19].toFixed(4)) : null,
        sma50:  absIdx >= 49 ? parseFloat(sma50raw[absIdx - 49].toFixed(4)) : null
      };
    });

    res.json({
      symbol:   symbol.toUpperCase(),
      name:     meta.longName || meta.shortName || symbol.toUpperCase(),
      currency: meta.currency || 'USD',
      ...analysis,
      chartData
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Lightweight signal-only endpoint for favorites polling
app.get('/api/signal/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { strategy = 'buffett' } = req.query;

    const result = await fetchChart(symbol, '6mo', '1d');
    const quotes  = parseQuotes(result);
    if (quotes.length < 60) return res.status(400).json({ error: 'Pas assez de données' });

    const analysis = generateSignal(quotes, strategy);
    const meta     = result.meta || {};

    res.json({
      symbol:          symbol.toUpperCase(),
      name:            meta.longName || meta.shortName || symbol.toUpperCase(),
      currency:        meta.currency || 'USD',
      action:          analysis.action,
      recommendation:  analysis.recommendation,
      confidence:      analysis.confidence,
      currentPrice:    analysis.currentPrice,
      change24h:       analysis.change24h,
      timing:          analysis.timing,
      strategy:        analysis.strategy,
      checkedAt:       new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search/:query', async (req, res) => {
  try {
    const { crumb, cookie } = await getYFAuth();
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(req.params.query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&crumb=${encodeURIComponent(crumb)}`;
    const r   = await fetch(url, { headers: { 'User-Agent': YF_UA, 'Accept': 'application/json', 'Cookie': cookie } });
    const json = await r.json();
    const quotes = (json?.quotes || [])
      .filter(q => ['EQUITY', 'CRYPTOCURRENCY', 'ETF'].includes(q.quoteType))
      .slice(0, 7)
      .map(q => ({ symbol: q.symbol, name: q.longname || q.shortname || q.symbol, type: q.quoteType, exchange: q.exchange }));
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchChart(symbol, range = '1y', interval = '1d') {
  const { crumb, cookie } = await getYFAuth();
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': YF_UA, 'Accept': 'application/json', 'Cookie': cookie },
  });
  if (res.status === 401 || res.status === 403) {
    // Crumb expired — invalidate and retry once
    yfAuth.crumb = null;
    const { crumb: c2, cookie: k2 } = await getYFAuth();
    const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false&crumb=${encodeURIComponent(c2)}`;
    const res2 = await fetch(url2, {
      headers: { 'User-Agent': YF_UA, 'Accept': 'application/json', 'Cookie': k2 },
    });
    if (!res2.ok) throw new Error(`Yahoo Finance error: ${res2.status}`);
    const json2 = await res2.json();
    const result2 = json2?.chart?.result?.[0];
    if (!result2) throw new Error('Symbole introuvable');
    return result2;
  }
  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Symbole introuvable');
  return result;
}

function parseQuotes(result) {
  const timestamps = result.timestamp || [];
  const { open = [], high = [], low = [], close = [], volume = [] } = result.indicators?.quote?.[0] || {};
  return timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000), open: open[i], high: high[i], low: low[i], close: close[i], volume: volume[i] }))
    .filter(q => q.close != null);
}

// ── Non-SSE scanner for Vercel (parallel batch, 9s timeout) ──────────────────

app.get('/api/scanner', async (req, res) => {
  const { type = 'all' } = req.query;
  const list = type === 'crypto'  ? WATCHLIST.crypto
             : type === 'stocks'  ? WATCHLIST.stocks
             : [...WATCHLIST.stocks, ...WATCHLIST.crypto];

  const BATCH = 4;
  const DEADLINE = Date.now() + 9000; // hard 9s deadline for Vercel
  const results = [];

  for (let i = 0; i < list.length; i += BATCH) {
    if (Date.now() >= DEADLINE) break;
    const batch = list.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (item) => {
        const r = await fetchChart(item.symbol, '6mo', '1d');
        const q = parseQuotes(r);
        if (q.length < 30) return null;
        return {
          symbol: item.symbol,
          name:   item.name,
          type:   WATCHLIST.crypto.some(c => c.symbol === item.symbol) ? 'crypto' : 'stock',
          ...scoreDayTrade(q, r.meta),
        };
      })
    );
    settled.forEach(s => { if (s.status === 'fulfilled' && s.value) results.push(s.value); });
    if (Date.now() < DEADLINE - 600 && i + BATCH < list.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  results.sort((a, b) => b.score - a.score);
  res.json({ results: results.slice(0, 20), total: list.length, scanned: results.length });
});

// Intraday chart endpoint — returns OHLCV candles for given interval/range
app.get('/api/chart/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { interval = '5m', range = '2d' } = req.query;
  try {
    const result = await fetchChart(symbol, range, interval);
    const quotes  = parseQuotes(result);
    if (!quotes.length) return res.status(404).json({ error: 'No data' });

    const closes   = quotes.map(q => q.close);
    const sma20raw = sma(closes, 20);
    const sma50raw = sma(closes, 50);

    const isIntraday = !['1d', '5d', '1wk', '1mo'].includes(interval);
    const data = quotes.map((q, i) => ({
      date:   isIntraday
        ? q.date.toLocaleString('fr-FR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : q.date.toISOString().split('T')[0],
      open:   parseFloat((q.open  || q.close).toFixed(6)),
      high:   parseFloat(q.high.toFixed(6)),
      low:    parseFloat(q.low.toFixed(6)),
      close:  parseFloat(q.close.toFixed(6)),
      volume: q.volume,
      sma20:  i >= 19 ? parseFloat(sma20raw[i - 19].toFixed(6)) : null,
      sma50:  i >= 49 ? parseFloat(sma50raw[i - 49].toFixed(6)) : null,
    }));
    res.json({ symbol, interval, range, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lightweight batch price endpoint — polls current price for up to 25 symbols
app.get('/api/prices', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 25);
  if (!symbols.length) return res.json({});
  const out = {};
  await Promise.allSettled(symbols.map(async sym => {
    try {
      const r = await fetchChart(sym, '5d', '1d');
      const meta = r.meta;
      const prev = meta.chartPreviousClose || meta.previousClose || 0;
      if (meta?.regularMarketPrice && prev) {
        out[sym] = {
          price:     meta.regularMarketPrice,
          change24h: (((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2),
        };
      }
    } catch {}
  }));
  res.json(out);
});

// Export app for Vercel serverless
export default app;

// Local dev server
if (process.env.NODE_ENV !== 'production') {
  app.listen(3001, () => console.log('🚀 Trade Analyzer backend — http://localhost:3001'));
}
