// Sprint 8 — Walk-forward backtest engine + stress periods + Monte Carlo.
// Pure JS, runs in Cloudflare Worker. Uses Black-Scholes lib for option pricing.
//
// Why this matters (Gate 4 promotion criterion): a strategy that backtests well
// in calm markets but blows up in Mar20 / Aug24 / Apr25 should NEVER reach real
// money. This engine measures behavior across regimes that have actually occurred.

import * as BS from "./black-scholes.js";

// ─── Stress periods catalog ────────────────────────────────────────────────
// 7 historic stress events with curated date ranges. Each spans the full
// shock + recovery so backtest sees both crash AND mean-reversion.
//
// Sources:
//   COVID:        S&P -34% Feb19→Mar23, recovery to ATH by Aug
//   VOLMAGEDDON:  XIV blow-up Feb 5-6, 2018; SPY -10% in 2 weeks
//   YEN CARRY:    Aug 5 2024 yen unwind; SPY -8.5% intraday
//   TARIFFS:      Apr 2-9 2025 Trump tariff announcement; SPY -12% in week
//   FED PIVOT:    Sep-Dec 2018 Powell hike → recession scare; SPY -20%
//   DEBT CEILING: May-Jun 2011 + Aug 2011; S&P downgrade, SPY -19%
//   FLASH CRASH:  May 6 2010 single-day -9% intraday recovery
export const STRESS_PERIODS = [
  {
    id: 'covid_2020',
    label: 'COVID Crash (Feb-Apr 2020)',
    start_date: '2020-02-15',
    end_date: '2020-04-30',
    description: 'S&P -34% in 33 days. VIX peaked 82. Fastest bear in history.',
    expected_regime: 'volatile',
    relevance: 'CRITICAL — gold standard for tail risk testing.',
  },
  {
    id: 'volmageddon_2018',
    label: 'Volmageddon (Feb 2018)',
    start_date: '2018-01-25',
    end_date: '2018-03-15',
    description: 'XIV blow-up. SPY -10% in 2 weeks. VIX 14→50 in 5 days.',
    expected_regime: 'volatile',
    relevance: 'HIGH — short vol strategies got destroyed.',
  },
  {
    id: 'yen_carry_2024',
    label: 'Yen Carry Unwind (Aug 2024)',
    start_date: '2024-07-25',
    end_date: '2024-09-05',
    description: 'BoJ rate hike → yen carry trade unwind. SPY -8.5% intraday Aug 5.',
    expected_regime: 'volatile',
    relevance: 'HIGH — recent macro shock with rapid recovery.',
  },
  {
    id: 'tariffs_2025',
    label: 'Trump Tariffs (Apr 2025)',
    start_date: '2025-03-25',
    end_date: '2025-05-09',
    description: 'Apr 2 reciprocal tariffs. SPY -12% in 6 days. VIX 50+. Then 90-day pause Apr 9 → recovery.',
    expected_regime: 'volatile',
    relevance: 'HIGH — most recent gap-down + policy whipsaw.',
  },
  {
    id: 'fed_pivot_2018',
    label: 'Fed Pivot (Q4 2018)',
    start_date: '2018-09-01',
    end_date: '2019-01-15',
    description: 'Powell hike → recession scare. SPY -19.8% peak-to-trough Dec 24.',
    expected_regime: 'trending_down',
    relevance: 'MEDIUM — slow grinding bear, different from V-shaped crash.',
  },
  {
    id: 'debt_ceiling_2011',
    label: 'Debt Ceiling + S&P Downgrade (Aug 2011)',
    start_date: '2011-07-15',
    end_date: '2011-10-15',
    description: 'S&P US debt downgrade. VIX 17→48. SPY -19% in 3 weeks.',
    expected_regime: 'volatile',
    relevance: 'MEDIUM — political/macro shock, multiple weeks.',
  },
  {
    id: 'flash_crash_2010',
    label: 'Flash Crash (May 2010)',
    start_date: '2010-04-25',
    end_date: '2010-06-30',
    description: 'May 6 -9% intraday + recovery. Then mini-flash continuations into Jun.',
    expected_regime: 'volatile',
    relevance: 'LOW — single-day shock, less useful for swing strategies.',
  },
];

export const CALM_PERIODS = [
  {
    id: 'calm_2017',
    label: 'Calm 2017 (low vol)',
    start_date: '2017-01-01',
    end_date: '2017-12-31',
    description: 'Year of historically low vol. VIX averaged 11. Anti-stress baseline.',
    expected_regime: 'trending_up',
  },
  {
    id: 'calm_2025',
    label: 'Calm 2025 H2 (post-tariff)',
    start_date: '2025-06-01',
    end_date: '2025-12-31',
    description: 'Vol comprimido post Apr tariffs. VIX 12-18 range.',
    expected_regime: 'trending_up',
  },
];

// ─── Compute basic stats from trades array ──────────────────────────────────
//
// trades: [{ pnl, hold_days, exit_reason, ... }]
// Returns { n, total_pnl, win_rate, avg_win, avg_loss, profit_factor,
//           sharpe, sortino, max_dd, calmar }
export function computeStats(trades, transactionCostPerLeg = 0.65) {
  if (!trades?.length) {
    return { n: 0, total_pnl: 0, win_rate: 0, sharpe: 0, max_dd: 0 };
  }
  const tradesAfterCost = trades.map(t => ({
    ...t,
    pnl_net: t.pnl - (t.legs_count || 2) * transactionCostPerLeg,
  }));

  const total = tradesAfterCost.reduce((a, t) => a + t.pnl_net, 0);
  const wins = tradesAfterCost.filter(t => t.pnl_net > 0);
  const losses = tradesAfterCost.filter(t => t.pnl_net <= 0);
  const winRate = (wins.length / tradesAfterCost.length) * 100;
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnl_net, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnl_net, 0) / losses.length : 0;
  const grossWin = wins.reduce((a, t) => a + t.pnl_net, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl_net, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);

  // Per-trade returns sequence (for Sharpe/Sortino)
  const returns = tradesAfterCost.map(t => t.pnl_net);
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / Math.max(1, returns.length - 1);
  const stdDev = Math.sqrt(variance);
  // Annualize: assume avg 12 trades/year for 35 DTE strategy → factor √12
  const tradesPerYear = 12;
  const sharpe = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(tradesPerYear) : 0;

  // Sortino (downside-only deviation)
  const negReturns = returns.filter(r => r < 0);
  const downsideVar = negReturns.length
    ? negReturns.reduce((a, b) => a + b ** 2, 0) / Math.max(1, negReturns.length - 1)
    : 0;
  const downsideStd = Math.sqrt(downsideVar);
  const sortino = downsideStd > 0 ? (meanRet / downsideStd) * Math.sqrt(tradesPerYear) : 0;

  // Max drawdown via running cumulative P&L
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of tradesAfterCost) {
    cum += t.pnl_net;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  // Calmar = annualized return / max drawdown
  const calmar = maxDD > 0 ? (total * (tradesPerYear / tradesAfterCost.length)) / maxDD : 0;

  return {
    n: tradesAfterCost.length,
    total_pnl: Math.round(total * 100) / 100,
    win_rate: Math.round(winRate * 10) / 10,
    avg_win: Math.round(avgWin * 100) / 100,
    avg_loss: Math.round(avgLoss * 100) / 100,
    profit_factor: profitFactor === Infinity ? 99 : Math.round(profitFactor * 100) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    sortino: Math.round(sortino * 100) / 100,
    max_dd: Math.round(maxDD * 100) / 100,
    calmar: Math.round(calmar * 100) / 100,
    transaction_cost_per_leg: transactionCostPerLeg,
    largest_win: Math.max(...returns),
    largest_loss: Math.min(...returns),
  };
}

// ─── Run BPS strategy on bars (shared core) ─────────────────────────────────
// Reusable engine: same logic as worker.js /backtest/run.
//
// strategyConfig: { dte = 35, target_profit = 0.5, stop_loss_x = 2.0,
//                   delta_short_pct = 1.0, delta_long_pct = 1.5, contracts = 1 }
//
// Returns { trades: [{...}], skip_counts: {...} }
export function runBPSOnBars(bars, strategyConfig = {}, opts = {}) {
  const TARGET_DTE = strategyConfig.dte || 35;
  const TAKE_PROFIT = strategyConfig.take_profit_pct || 0.5;
  const STOP_LOSS_X = strategyConfig.stop_loss_x || 2.0;
  const SHORT_PCT = strategyConfig.delta_short_pct || 1.0;
  const LONG_PCT = strategyConfig.delta_long_pct || 1.5;
  const symbol = opts.symbol || 'SPY';
  const r = opts.r ?? BS.DEFAULT_RISK_FREE_RATE;
  const q = opts.q ?? (BS.DIVIDEND_YIELDS[symbol] ?? BS.DIVIDEND_YIELDS.default);
  const ivrThreshold = opts.ivr_threshold ?? 0;
  const regimeFilter = opts.regime_filter ?? false;

  const trades = [];
  let cooldownUntil = 0;
  const skip = { ivr: 0, regime: 0, other: 0 };

  for (let i = 252; i < bars.length - TARGET_DTE; i++) {
    if (i < cooldownUntil) continue;
    const entryBar = bars[i];
    const S0 = entryBar.close;

    // 30d HV
    const window = bars.slice(i - 30, i).map(b => b.close);
    const returns = [];
    for (let k = 1; k < window.length; k++) {
      if (window[k - 1] > 0) returns.push(Math.log(window[k] / window[k - 1]));
    }
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / (returns.length - 1);
    const sigma = Math.sqrt(variance) * Math.sqrt(252);
    const hv30 = sigma * 100;

    // IV rank from 252-day rolling HV proxy
    let ivRank = 50;
    if (ivrThreshold > 0) {
      const hvHistory = [];
      for (let end = i - 252 + 30; end < i; end++) {
        const w = bars.slice(end - 30, end).map(b => b.close);
        if (w.length < 30) continue;
        const wRets = [];
        for (let k = 1; k < w.length; k++) {
          if (w[k - 1] > 0) wRets.push(Math.log(w[k] / w[k - 1]));
        }
        const wMean = wRets.reduce((a, b) => a + b, 0) / wRets.length;
        const wVar = wRets.reduce((a, b) => a + (b - wMean) ** 2, 0) / (wRets.length - 1);
        hvHistory.push(Math.sqrt(wVar) * Math.sqrt(252) * 100);
      }
      if (hvHistory.length) {
        const hvHigh = Math.max(...hvHistory, hv30);
        const hvLow = Math.min(...hvHistory, hv30);
        ivRank = hvHigh > hvLow ? ((hv30 - hvLow) / (hvHigh - hvLow)) * 100 : 50;
      }
      if (ivRank < ivrThreshold) { skip.ivr++; continue; }
    }

    // Regime filter
    if (regimeFilter) {
      if (hv30 > 25) { skip.regime++; continue; }
      const ma20 = bars.slice(i - 20, i).reduce((a, b) => a + b.close, 0) / 20;
      const ma50 = bars.slice(i - 50, i).reduce((a, b) => a + b.close, 0) / 50;
      const ret20 = (S0 / bars[i - 20].close - 1) * 100;
      if (Math.abs(ret20) > 5 && Math.sign(S0 - ma20) === Math.sign(ma20 - ma50)) {
        skip.regime++; continue;
      }
    }

    // Position sizing — strikes by 1 SD move
    const T = TARGET_DTE / 365;
    const sdMove = S0 * sigma * Math.sqrt(T);
    const tick = S0 > 500 ? 5 : 1;
    const Kshort = Math.round((S0 - sdMove * SHORT_PCT) / tick) * tick;
    const Klong  = Math.round((S0 - sdMove * LONG_PCT) / tick) * tick;
    if (Kshort <= Klong) { skip.other++; continue; }

    const shortPx = BS.bsPrice(S0, Kshort, T, r, sigma, 'put', q);
    const longPx  = BS.bsPrice(S0, Klong, T, r, sigma, 'put', q);
    const credit0 = shortPx - longPx;
    if (credit0 <= 0) { skip.other++; continue; }
    const width = Kshort - Klong;
    const maxLoss = (width - credit0);

    // Hold loop
    let exitIdx = i + TARGET_DTE;
    let exitReason = 'expiry';
    for (let j = i + 1; j <= Math.min(i + TARGET_DTE, bars.length - 1); j++) {
      const Sj = bars[j].close;
      const Tj = (TARGET_DTE - (j - i)) / 365;
      if (Tj <= 0) break;
      const sPx = BS.bsPrice(Sj, Kshort, Tj, r, sigma, 'put', q);
      const lPx = BS.bsPrice(Sj, Klong, Tj, r, sigma, 'put', q);
      const debit = sPx - lPx;
      const pnl = credit0 - debit;
      if (pnl >= credit0 * TAKE_PROFIT) { exitIdx = j; exitReason = 'take_profit'; break; }
      if (pnl <= -credit0 * STOP_LOSS_X) { exitIdx = j; exitReason = 'stop_loss'; break; }
      if (TARGET_DTE - (j - i) <= 7 && pnl < credit0 * 0.25) { exitIdx = j; exitReason = 'gamma_exit'; break; }
    }

    const Sexit = bars[exitIdx].close;
    const Texit = (TARGET_DTE - (exitIdx - i)) / 365;
    const finalDebit = Texit > 0
      ? BS.bsPrice(Sexit, Kshort, Texit, r, sigma, 'put', q) - BS.bsPrice(Sexit, Klong, Texit, r, sigma, 'put', q)
      : Math.max(0, Kshort - Sexit) - Math.max(0, Klong - Sexit);
    const pnlFinal = (credit0 - finalDebit) * 100; // dollars per contract
    cooldownUntil = exitIdx + 5;

    trades.push({
      entry_date: entryBar.date,
      exit_date: bars[exitIdx].date,
      hold_days: exitIdx - i,
      S_entry: Math.round(S0 * 100) / 100,
      S_exit: Math.round(Sexit * 100) / 100,
      Kshort, Klong,
      credit: Math.round(credit0 * 100) / 100,
      pnl: Math.round(pnlFinal * 100) / 100,
      max_loss_dollar: Math.round(maxLoss * 100),
      exit_reason: exitReason,
      ivr_at_entry: Math.round(ivRank * 10) / 10,
      hv_at_entry: Math.round(hv30 * 10) / 10,
      legs_count: 2,
    });
  }

  return { trades, skip_counts: skip };
}

// ─── Run IC strategy on bars (Iron Condor — 4 legs, both sides) ───────────
// Sprint 15+ — extends backtest to support neutral strategies, not just BPS
//
// strategyConfig: same as BPS plus delta_short_call_pct, delta_long_call_pct
// Iron Condor: short put Δshort + long put Δlong + short call Δshort + long call Δlong
// Profits when underlying stays between short strikes; max loss = wing width − credit
export function runICOnBars(bars, strategyConfig = {}, opts = {}) {
  const TARGET_DTE = strategyConfig.dte || 35;
  const TAKE_PROFIT = strategyConfig.take_profit_pct || 0.5;
  const STOP_LOSS_X = strategyConfig.stop_loss_x || 2.0;
  const SHORT_PCT = strategyConfig.delta_short_pct || 1.0;
  const LONG_PCT = strategyConfig.delta_long_pct || 1.5;
  const symbol = opts.symbol || 'SPY';
  const r = opts.r ?? BS.DEFAULT_RISK_FREE_RATE;
  const q = opts.q ?? (BS.DIVIDEND_YIELDS[symbol] ?? BS.DIVIDEND_YIELDS.default);
  const ivrThreshold = opts.ivr_threshold ?? 0;
  const regimeFilter = opts.regime_filter ?? false;

  const trades = [];
  let cooldownUntil = 0;
  const skip = { ivr: 0, regime: 0, other: 0 };

  for (let i = 252; i < bars.length - TARGET_DTE; i++) {
    if (i < cooldownUntil) continue;
    const entryBar = bars[i];
    const S0 = entryBar.close;

    // 30d HV
    const window = bars.slice(i - 30, i).map(b => b.close);
    const returns = [];
    for (let k = 1; k < window.length; k++) {
      if (window[k - 1] > 0) returns.push(Math.log(window[k] / window[k - 1]));
    }
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / Math.max(1, returns.length - 1);
    const sigma = Math.sqrt(variance) * Math.sqrt(252);

    // IV rank filter (same as BPS)
    if (ivrThreshold > 0) {
      const hvHistory = [];
      for (let end = i - 252 + 30; end < i; end++) {
        const w = bars.slice(end - 30, end).map(b => b.close);
        if (w.length < 30) continue;
        const wRets = [];
        for (let k = 1; k < w.length; k++) if (w[k - 1] > 0) wRets.push(Math.log(w[k] / w[k - 1]));
        const wMean = wRets.reduce((a, b) => a + b, 0) / wRets.length;
        const wVar = wRets.reduce((a, b) => a + (b - wMean) ** 2, 0) / Math.max(1, wRets.length - 1);
        hvHistory.push(Math.sqrt(wVar) * Math.sqrt(252) * 100);
      }
      if (hvHistory.length) {
        const hv30 = sigma * 100;
        const hvHigh = Math.max(...hvHistory, hv30);
        const hvLow = Math.min(...hvHistory, hv30);
        const ivRank = hvHigh > hvLow ? ((hv30 - hvLow) / (hvHigh - hvLow)) * 100 : 50;
        if (ivRank < ivrThreshold) { skip.ivr++; continue; }
      }
    }

    if (regimeFilter && sigma * 100 > 25) { skip.regime++; continue; }

    // Build IC strikes (4 legs)
    const T = TARGET_DTE / 365;
    const sdMove = S0 * sigma * Math.sqrt(T);
    const tick = S0 > 500 ? 5 : 1;
    const KshortPut = Math.round((S0 - sdMove * SHORT_PCT) / tick) * tick;
    const KlongPut = Math.round((S0 - sdMove * LONG_PCT) / tick) * tick;
    const KshortCall = Math.round((S0 + sdMove * SHORT_PCT) / tick) * tick;
    const KlongCall = Math.round((S0 + sdMove * LONG_PCT) / tick) * tick;
    if (KshortPut <= KlongPut || KshortCall >= KlongCall) { skip.other++; continue; }

    const shortPutPx = BS.bsPrice(S0, KshortPut, T, r, sigma, 'put', q);
    const longPutPx = BS.bsPrice(S0, KlongPut, T, r, sigma, 'put', q);
    const shortCallPx = BS.bsPrice(S0, KshortCall, T, r, sigma, 'call', q);
    const longCallPx = BS.bsPrice(S0, KlongCall, T, r, sigma, 'call', q);
    const credit0 = (shortPutPx - longPutPx) + (shortCallPx - longCallPx);
    if (credit0 <= 0) { skip.other++; continue; }
    const widthPut = KshortPut - KlongPut;
    const widthCall = KlongCall - KshortCall;
    const maxLoss = Math.max(widthPut, widthCall) - credit0;

    // Hold loop
    let exitIdx = i + TARGET_DTE;
    let exitReason = 'expiry';
    for (let j = i + 1; j <= Math.min(i + TARGET_DTE, bars.length - 1); j++) {
      const Sj = bars[j].close;
      const Tj = (TARGET_DTE - (j - i)) / 365;
      if (Tj <= 0) break;
      const sP = BS.bsPrice(Sj, KshortPut, Tj, r, sigma, 'put', q);
      const lP = BS.bsPrice(Sj, KlongPut, Tj, r, sigma, 'put', q);
      const sC = BS.bsPrice(Sj, KshortCall, Tj, r, sigma, 'call', q);
      const lC = BS.bsPrice(Sj, KlongCall, Tj, r, sigma, 'call', q);
      const debit = (sP - lP) + (sC - lC);
      const pnl = credit0 - debit;
      if (pnl >= credit0 * TAKE_PROFIT) { exitIdx = j; exitReason = 'take_profit'; break; }
      if (pnl <= -credit0 * STOP_LOSS_X) { exitIdx = j; exitReason = 'stop_loss'; break; }
      if (TARGET_DTE - (j - i) <= 7 && pnl < credit0 * 0.25) { exitIdx = j; exitReason = 'gamma_exit'; break; }
    }

    const Sexit = bars[exitIdx].close;
    const Texit = (TARGET_DTE - (exitIdx - i)) / 365;
    const finalDebit = Texit > 0
      ? (BS.bsPrice(Sexit, KshortPut, Texit, r, sigma, 'put', q) - BS.bsPrice(Sexit, KlongPut, Texit, r, sigma, 'put', q))
        + (BS.bsPrice(Sexit, KshortCall, Texit, r, sigma, 'call', q) - BS.bsPrice(Sexit, KlongCall, Texit, r, sigma, 'call', q))
      : Math.max(0, KshortPut - Sexit) - Math.max(0, KlongPut - Sexit)
        + Math.max(0, Sexit - KshortCall) - Math.max(0, Sexit - KlongCall);
    const pnlFinal = (credit0 - finalDebit) * 100;
    cooldownUntil = exitIdx + 5;

    trades.push({
      entry_date: entryBar.date,
      exit_date: bars[exitIdx].date,
      hold_days: exitIdx - i,
      S_entry: Math.round(S0 * 100) / 100,
      S_exit: Math.round(Sexit * 100) / 100,
      KshortPut, KlongPut, KshortCall, KlongCall,
      credit: Math.round(credit0 * 100) / 100,
      pnl: Math.round(pnlFinal * 100) / 100,
      max_loss_dollar: Math.round(maxLoss * 100),
      exit_reason: exitReason,
      strategy_type: 'IC',
      legs_count: 4,
    });
  }

  return { trades, skip_counts: skip };
}

// ─── Filter bars by date range (inclusive) ──────────────────────────────────
export function filterBarsByDate(bars, startDate, endDate) {
  return bars.filter(b => b.date >= startDate && b.date <= endDate);
}

// ─── Walk-forward sliding window ────────────────────────────────────────────
//
// Splits the data into N overlapping windows and runs strategy on each.
// Returns aggregated stats per window + overall summary.
//
// trainMonths: months of in-sample data (e.g. 12)
// testMonths:  months of out-of-sample to test (e.g. 3)
// stepMonths:  slide forward by N months each iteration (e.g. 3)
export function walkForwardWindows(bars, trainMonths = 12, testMonths = 3, stepMonths = 3) {
  if (!bars?.length) return [];
  const startDate = new Date(bars[0].date);
  const endDate = new Date(bars[bars.length - 1].date);
  const windows = [];

  let trainStart = new Date(startDate);
  while (true) {
    const trainEnd = new Date(trainStart);
    trainEnd.setMonth(trainEnd.getMonth() + trainMonths);
    const testStart = new Date(trainEnd);
    const testEnd = new Date(testStart);
    testEnd.setMonth(testEnd.getMonth() + testMonths);
    if (testEnd > endDate) break;

    windows.push({
      train_start: trainStart.toISOString().slice(0, 10),
      train_end:   trainEnd.toISOString().slice(0, 10),
      test_start:  testStart.toISOString().slice(0, 10),
      test_end:    testEnd.toISOString().slice(0, 10),
    });

    trainStart.setMonth(trainStart.getMonth() + stepMonths);
  }
  return windows;
}

// ─── Monte Carlo bootstrap simulator ────────────────────────────────────────
//
// Resamples observed trades with replacement (Efron's bootstrap) to produce
// nSims simulated equity curves of length nTradesPerSim.
// Returns aggregated distributions for total return / sharpe / max DD.
export function monteCarloBootstrap(trades, nSims = 10000, nTradesPerSim = null, transactionCostPerLeg = 0.65) {
  if (!trades?.length) return { n_sims: 0 };
  const N = nTradesPerSim || trades.length;
  const netReturns = trades.map(t => t.pnl - (t.legs_count || 2) * transactionCostPerLeg);
  const totals = [];
  const maxDDs = [];

  for (let s = 0; s < nSims; s++) {
    let cum = 0, peak = 0, mdd = 0;
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(Math.random() * netReturns.length);
      cum += netReturns[idx];
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > mdd) mdd = dd;
    }
    totals.push(cum);
    maxDDs.push(mdd);
  }

  totals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.floor(arr.length * p)];

  return {
    n_sims: nSims,
    n_trades_per_sim: N,
    total_pnl_p05: Math.round(pct(totals, 0.05) * 100) / 100,
    total_pnl_p25: Math.round(pct(totals, 0.25) * 100) / 100,
    total_pnl_p50: Math.round(pct(totals, 0.50) * 100) / 100,
    total_pnl_p75: Math.round(pct(totals, 0.75) * 100) / 100,
    total_pnl_p95: Math.round(pct(totals, 0.95) * 100) / 100,
    max_dd_p50: Math.round(pct(maxDDs, 0.50) * 100) / 100,
    max_dd_p95: Math.round(pct(maxDDs, 0.95) * 100) / 100,
    max_dd_p99: Math.round(pct(maxDDs, 0.99) * 100) / 100,
    prob_profitable_pct: Math.round(totals.filter(t => t > 0).length / nSims * 1000) / 10,
    prob_blowup_pct: Math.round(totals.filter(t => t < -10000).length / nSims * 1000) / 10,
  };
}

// ─── Strategy tournament — Sprint 15 ───────────────────────────────────────
//
// Runs the BPS engine across a SET of parameter combinations and returns a
// ranked leaderboard. Used to pick which strategies to actually paper-trade.
//
// configs: [{ id, dte, take_profit_pct, stop_loss_x, delta_short_pct,
//             delta_long_pct, ivr_threshold, regime_filter, symbol? }]
// barsBySymbol: { SPY: [...], QQQ: [...], IWM: [...] }
// opts: { initial_capital }
// Returns: [{ id, symbol, stats, verdict, score }] sorted by score desc
export function runStrategyTournament(configs, barsBySymbol, opts = {}) {
  const results = [];
  for (const cfg of configs) {
    const symbol = cfg.symbol || 'SPY';
    const bars = barsBySymbol[symbol];
    if (!bars || bars.length < 504) {
      results.push({
        id: cfg.id, symbol, error: 'insufficient_bars', n_bars: bars?.length || 0,
      });
      continue;
    }
    try {
      // Sprint 15+ — dispatch by strategy_type. BPS = default. IC = iron condor.
      const engineFn = (cfg.strategy_type === 'IC') ? runICOnBars : runBPSOnBars;
      const { trades } = engineFn(bars, cfg, {
        symbol,
        ivr_threshold: cfg.ivr_threshold ?? 0,
        regime_filter: cfg.regime_filter ?? false,
      });
      const stats = computeStats(trades);
      const verdict = promotionVerdict(stats, opts);
      // Composite score: balance return, risk-adjusted, and consistency
      // Normalizes to roughly 0-100. Higher = better.
      const score = scoreStrategy(stats);
      results.push({
        id: cfg.id, symbol, config: cfg,
        n_trades: trades.length, stats, verdict, score,
      });
    } catch (e) {
      results.push({ id: cfg.id, symbol, error: e.message });
    }
  }
  return results.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

// ─── scoreStrategy(stats) — composite ranking metric ───────────────────────
// Combines: total_pnl (return), sharpe (risk-adjusted), profit_factor (efficiency),
// max_dd penalty (risk), win_rate baseline. Returns 0-100 normalized.
export function scoreStrategy(stats) {
  if (!stats || !stats.n || stats.n < 5) return 0;
  // Components clamped to reasonable ranges
  const sharpe = Math.max(-2, Math.min(3, stats.sharpe || 0));     // -2..3
  const pf = Math.max(0, Math.min(5, stats.profit_factor || 0));   // 0..5
  const winRate = Math.max(0, Math.min(100, stats.win_rate || 0)); // 0..100
  // Max DD as % of total_pnl (if total > 0): smaller = better
  const ddPenalty = stats.total_pnl > 0
    ? Math.min(1, (stats.max_dd || 0) / Math.max(1, stats.total_pnl))
    : 1;  // if no profit, full penalty

  const score = (
    Math.max(0, sharpe) * 25            // 0-75 for sharpe up to 3
    + Math.min(pf, 2) * 10              // 0-20 for pf up to 2 (above is diminishing)
    + (winRate / 100) * 15              // 0-15 for win rate
    - ddPenalty * 20                    // -20 max for terrible DD
  );
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Promotion gate verdict ────────────────────────────────────────────────
// Given stats from a backtest, returns PASS / FAIL_GATE_X / MARGINAL.
//
// Gates per Theta Gang doctrine:
//   Gate 1: Sharpe ≥1.5 + MaxDD ≤10% of initial capital
//   Gate 2: Profit factor ≥1.3 with realistic costs
//   Gate 3: (paper) — n/a here, requires paper trading
//   Gate 4: (stress) — survives all stress periods with MaxDD ≤25%
//   Gate 5: (real) — n/a here
export function promotionVerdict(stats, opts = {}) {
  const initialCapital = opts.initial_capital || 10000;
  const maxDDPct = (stats.max_dd / initialCapital) * 100;

  const gates = {
    gate1_sharpe:  stats.sharpe >= 1.5,
    gate1_maxdd:   maxDDPct <= 10,
    gate2_pf:      stats.profit_factor >= 1.3,
    sample_size:   stats.n >= 20,
  };

  if (!gates.sample_size) return { verdict: 'INSUFFICIENT_DATA', gates, n: stats.n };
  if (!gates.gate1_sharpe) return { verdict: 'FAIL_GATE_1_SHARPE', gates, sharpe: stats.sharpe };
  if (!gates.gate1_maxdd)  return { verdict: 'FAIL_GATE_1_MAXDD', gates, maxdd_pct: maxDDPct };
  if (!gates.gate2_pf)     return { verdict: 'FAIL_GATE_2_PF', gates, pf: stats.profit_factor };
  return { verdict: 'PASS_GATES_1_2', gates };
}
