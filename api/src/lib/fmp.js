// ═══════════════════════════════════════════════════════════════
// fmp.js — FMP (Financial Modeling Prep) low-level helpers
//
// Pure mechanical move from worker.js — NO logic changes.
// Exports: FMP_MAP, toFMP, fromFMP, fmpQuote, fmpRiskMetrics,
//          fmpSpyCloses, fmpSpark
//
// NOTE: cacheRiskMetrics / getRiskMetrics are NOT here because they
// depend on getAgentMemory/setAgentMemory (defined late in worker.js).
// Those stay in worker.js and are passed via deps to agents.
// ═══════════════════════════════════════════════════════════════

import { logEvent, errorBudget } from "./telegram.js";

// Mapping from our tickers to FMP symbols (foreign tickers need exchange suffix)
// CRITICAL: bare "ENG" on FMP = ENGlobal Corp (wrong!), "RAND" = Rand Capital (wrong!)
export const FMP_MAP = {
  "BME:VIS": "VIS.MC", "BME:AMS": "AMS.MC",
  "HKG:9618": "9618.HK", "HKG:1052": "1052.HK", "HKG:2219": "2219.HK",
  "HKG:9616": "9616.HK", "HKG:1910": "1910.HK",
  "FDJU": "FDJ.PA", "HEN3": "HEN3.DE",
  "LSEG": "LSEG.L", "ITRK": "ITRK.L",
  "ENG": "ENG.MC",       // Enagas (Spain), NOT ENGlobal Corp
  "AZJ": "AZJ.AX", "GQG": "GQG.AX",
  "WKL": "WKL.AS",
  "NESN": "NESN.SW",     // Nestlé (SIX Swiss Exchange) — bare "NESN" no existe en FMP
  "NESN:SWX": "NESN.SW", // notación BME-style para Swiss Exchange — mismo destino
  "SHUR": "SHUR.BR",     // Shurgard (Euronext Brussels) — was wrongly SHUR.AS
  "RAND": "RAND.AS",     // Randstad (Netherlands), NOT Rand Capital
  "NET.UN": "NET-UN.V",  // Canadian Net REIT (TSX Venture) — was wrongly NET-UN.TO
  "CNSWF": "CNSWF",
};
// Helper: convert our ticker to FMP symbol
export const toFMP = (t) => FMP_MAP[t] || t;
// Helper: reverse-map FMP symbol back to our ticker
export const FMP_REVERSE = Object.fromEntries(Object.entries(FMP_MAP).map(([k, v]) => [v, k]));
export const fromFMP = (fmpSym) => FMP_REVERSE[fmpSym] || fmpSym;

// Asset managers, BDCs, and partnerships that distribute from carry/NII/distributable
// earnings rather than free cash flow. The FCF-payout penalty in Safety scoring
// produces false positives for these because their distribution model is structurally
// different from traditional dividend payers. Q+S Safety should treat them with the
// same care as REITs (which are already carved out by sector).
export const FCF_PAYOUT_CARVEOUT = new Set([
  // Public-equity asset managers / partnerships (carry-driven)
  "BX",   // Blackstone
  "KKR",  // KKR
  "BAM",  // Brookfield Asset Management
  "ARES", // Ares Management
  "APO",  // Apollo Global
  "CG",   // Carlyle
  "TPG",  // TPG
  "OWL",  // Blue Owl
  "GQG",  // GQG Partners
  "BEN",  // Franklin Resources
  // BDCs (distribute net investment income)
  "OBDC", // Blue Owl Capital Corp
  "MSDL", // Morgan Stanley Direct Lending
  "ARCC", // Ares Capital
  "MAIN", // Main Street Capital
  "BIZD", // BDC ETF
  // MLPs and partnerships (distribute from DCF, not FCF)
  "EPD",  // Enterprise Products Partners
  "ET",   // Energy Transfer
  "MPLX", // MPLX
  "OKE",  // Oneok (technically C-corp now but legacy)
]);

// Currency map for international tickers (FMP /quote doesn't return currency)
export const CURRENCY_MAP = {
  "BME:VIS": "EUR", "BME:AMS": "EUR", "ENG": "EUR", "WKL": "EUR",
  "SHUR": "EUR", "RAND": "EUR", "FDJU": "EUR", "HEN3": "EUR",
  "HKG:9618": "HKD", "HKG:1052": "HKD", "HKG:2219": "HKD",
  "HKG:9616": "HKD", "HKG:1910": "HKD",
  "AZJ": "AUD", "GQG": "AUD",
  "ITRK": "GBp", "LSEG": "GBp",  // London quotes in pence (GBp)
  "NET.UN": "CAD",
};

export async function fmpQuote(tickers, env) {
  if (!tickers?.length) return {};
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return {};
  const result = {};
  // Stable batch-quote accepts comma-separated symbols in ?symbols=
  for (let i = 0; i < tickers.length; i += 50) {
    const batch = tickers.slice(i, i + 50);
    const fmpToOurs = {};
    const fmpSyms = batch.map(t => {
      const f = toFMP(t);
      fmpToOurs[f] = t;
      return f;
    });
    try {
      const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${fmpSyms.map(encodeURIComponent).join(',')}&apikey=${FMP_KEY}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data)) continue;
      for (const q of data) {
        const ourTicker = fmpToOurs[q.symbol] || fromFMP(q.symbol) || q.symbol;
        result[ourTicker] = q;
      }
    } catch (e) {
      // Audit 2026-05-01: was silent. Now logged so callers can detect partial failure.
      await logEvent(env, 'error', 'fmp.quote_batch_failed', {
        batch_index: i, batch_size: batch.length, error: e.message?.slice(0, 200),
      });
      await errorBudget(env, 'fmp.quote_batch_failed', 10);
    }
  }
  return result;
}

// FMP-derived risk metrics (replaces GuruFocus beta/volatility/sharpe/sortino/maxDrawdown).
// Calculates from 1y daily closes vs SPY benchmark. Returns null if no data.
// Uses /stable/historical-price-eod/light for the same low-bandwidth payload as fmpSpark.
export async function fmpRiskMetrics(ticker, env, spyCloses = null) {
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return null;
  const sym = toFMP(ticker);
  const fromDate = new Date(Date.now() - 380 * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(sym)}&from=${fromDate}&apikey=${FMP_KEY}`
    );
    if (!r.ok) return null;
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    if (arr.length < 60) return null;
    // Sort chronological
    const sorted = [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const closes = sorted.map(h => h.close ?? h.price).filter(v => v != null && !isNaN(v));
    if (closes.length < 60) return null;

    // Daily returns
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    // Annualized volatility (std dev × √252)
    const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const volatility1y = stdDev * Math.sqrt(252);

    // Annualized return (geometric)
    const totalReturn = closes[closes.length - 1] / closes[0] - 1;
    const annualReturn = (1 + totalReturn) ** (252 / returns.length) - 1;

    // Sharpe ratio (assume risk-free 4.5%)
    const RF = 0.045;
    const sharpe = volatility1y > 0 ? (annualReturn - RF) / volatility1y : null;

    // Sortino ratio (downside-only deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideStd = downsideReturns.length
      ? Math.sqrt(downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length) * Math.sqrt(252)
      : 0;
    const sortino = downsideStd > 0 ? (annualReturn - RF) / downsideStd : null;

    // Max drawdown (rolling peak)
    let peak = closes[0];
    let maxDD = 0;
    for (const c of closes) {
      if (c > peak) peak = c;
      const dd = (c - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
    const maxDrawdown1y = Math.abs(maxDD);

    // Beta vs SPY (if benchmark closes provided)
    let beta = null;
    if (Array.isArray(spyCloses) && spyCloses.length >= returns.length + 1) {
      // Align to last N returns
      const benchSlice = spyCloses.slice(-(returns.length + 1));
      const benchReturns = [];
      for (let i = 1; i < benchSlice.length; i++) {
        benchReturns.push((benchSlice[i] - benchSlice[i - 1]) / benchSlice[i - 1]);
      }
      if (benchReturns.length === returns.length) {
        const meanB = benchReturns.reduce((s, r) => s + r, 0) / benchReturns.length;
        let cov = 0, varB = 0;
        for (let i = 0; i < returns.length; i++) {
          cov += (returns[i] - meanRet) * (benchReturns[i] - meanB);
          varB += (benchReturns[i] - meanB) ** 2;
        }
        beta = varB > 0 ? cov / varB : null;
      }
    }

    return {
      beta: beta != null ? Math.round(beta * 100) / 100 : null,
      volatility1y: Math.round(volatility1y * 10000) / 100, // % annualized
      sharpe: sharpe != null ? Math.round(sharpe * 100) / 100 : null,
      sortino: sortino != null ? Math.round(sortino * 100) / 100 : null,
      maxDrawdown1y: Math.round(maxDrawdown1y * 10000) / 100, // % positive
      annualReturn: Math.round(annualReturn * 10000) / 100,
    };
  } catch (e) {
    return null;
  }
}

// Fetch SPY closes for beta calculation (1 call, reused across portfolio)
export async function fmpSpyCloses(env, days = 380) {
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return null;
  const fromDate = new Date(Date.now() - (days + 5) * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=SPY&from=${fromDate}&apikey=${FMP_KEY}`
    );
    if (!r.ok) return null;
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return sorted.map(h => h.close ?? h.price).filter(v => v != null);
  } catch { return null; }
}

// Per-ticker historical spark (last N daily closes) — uses /stable/historical-price-eod
export async function fmpSpark(ticker, env, days = 5) {
  const FMP_KEY = env.FMP_KEY;
  if (!FMP_KEY) return [];
  const sym = toFMP(ticker);
  // Need a few extra calendar days to ensure we get N trading days
  const fromDate = new Date(Date.now() - (days + 5) * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(sym)}&from=${fromDate}&apikey=${FMP_KEY}`
    );
    if (!r.ok) return [];
    const data = await r.json();
    // Stable returns array directly (most recent first or chronological depending on endpoint)
    const arr = Array.isArray(data) ? data : (data?.historical || []);
    if (!arr.length) return [];
    // Sort by date ascending to ensure chronological
    const sorted = [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return sorted.slice(-days).map(h => h.close ?? h.price).filter(v => v != null);
  } catch { return []; }
}
