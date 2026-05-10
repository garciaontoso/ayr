// Theta Gang — Sprint 7: Tail Hedges programáticos.
// PURE engine (no DB, no fetch). Side-effect-free helpers consumed by
// /api/thetagang/tail-hedge/* endpoints + scheduled cron.
//
// Three hedge primitives:
//   1. put_roll              — Long SPY OTM put delta ~0.05, DTE 60-90, monthly roll
//   2. vix_call              — Long VIX call delta ~0.20, conditional on calm regime
//   3. convexity_backspread  — 1×2 put backspread (sell 1 ATM, buy 2 OTM) for cheap convexity
//
// Design rules (Spitznagel/Universa-inspired):
//   - Hedge cost should be ~0.5% NAV/mo for put_roll (compounds to ~6%/yr drag in calm regime)
//   - Skip when vol expensive (VIX > 30) — paying premium top-tick is wealth destruction
//   - Double size when puts cheap (VIX < 13) — "buy convexity when nobody wants it"
//   - VIX calls only fire in trending_up + low IVR (positive carry tail)
//
// All functions return plain objects. Time = years (consistent with black-scholes.js).

import {
  bsPrice,
  bsGreeks,
  multiLegPayoff,
  DEFAULT_RISK_FREE_RATE,
  DIVIDEND_YIELDS,
} from './black-scholes.js';

// ─── Defaults (overrideable via params) ─────────────────────────────────────
export const HEDGE_DEFAULTS = {
  put_roll: {
    allocation_pct: 0.005,    // 0.5% NAV/month
    target_delta: 0.05,       // ~25% OTM
    target_dte: 75,           // sweet spot 60-90
    roll_dte: 30,             // roll when DTE drops below this
    vix_skip_above: 30,       // suspend new entries
    vix_double_below: 13,     // 2× size when cheap
    underlying: 'SPY',
  },
  vix_call: {
    allocation_pct: 0.0025,   // 0.25% NAV
    target_delta: 0.20,
    target_dte: 45,
    close_vix_above: 25,      // take profits on vol expansion
    close_dte_below: 14,
    open_vix_below: 14,
    open_ivr_below: 30,
    underlying: 'VIX',
  },
  convexity_backspread: {
    allocation_pct: 0.003,    // 0.3% NAV (debit)
    short_delta: 0.30,        // sell 1 ATM-ish
    long_delta: 0.10,         // buy 2 further OTM
    target_dte: 60,
    underlying: 'SPY',
    open_when_ivr_below: 35,
  },
};

// ─── computeHedgeBudget ─────────────────────────────────────────────────────
// Returns dollar budget available for a hedge type given NAV.
// nav: total portfolio NAV in $
// allocation_pct: fraction of NAV to spend (0.005 = 0.5%)
// scaler: 1.0 normal, 2.0 double-size regime, 0 = suspend
export function computeHedgeBudget(nav, allocation_pct = 0.005, scaler = 1.0) {
  if (!nav || nav <= 0 || !Number.isFinite(nav)) {
    return { budget: 0, reason: 'NAV missing or zero' };
  }
  if (scaler === 0) return { budget: 0, reason: 'suspended' };
  const budget = Math.round(nav * allocation_pct * scaler * 100) / 100;
  return { budget, nav, allocation_pct, scaler };
}

// ─── strikeFromTargetDelta ──────────────────────────────────────────────────
// Inverse-search for strike that yields a desired absolute delta.
// Used to size puts at delta 0.05 / calls at delta 0.20 etc.
// Returns rounded strike or null if no convergence.
export function strikeFromTargetDelta(S, T, r, sigma, type, targetDelta, q = 0, tick = 1) {
  if (!Number.isFinite(S) || !Number.isFinite(sigma) || sigma <= 0 || T <= 0) return null;
  const targetAbs = Math.abs(targetDelta);
  // Bisect strike: for puts, lower strike → smaller |delta|; for calls, higher strike → smaller delta.
  let lo, hi;
  if (type === 'put') {
    lo = S * 0.3;
    hi = S * 1.05;
  } else {
    lo = S * 0.95;
    hi = S * 3.0;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const g = bsGreeks(S, mid, T, r, sigma, type, q);
    const absD = Math.abs(g.delta);
    if (Math.abs(absD - targetAbs) < 0.002) {
      return Math.round(mid / tick) * tick;
    }
    if (type === 'put') {
      if (absD < targetAbs) lo = mid; else hi = mid;
    } else {
      if (absD < targetAbs) hi = mid; else lo = mid;
    }
  }
  return Math.round(((lo + hi) / 2) / tick) * tick;
}

// ─── suggestPutRoll ─────────────────────────────────────────────────────────
// Decide today's action for the long-OTM SPY put hedge.
//
// inputs:
//   spot         — SPY price
//   sigma        — IV (annualized decimal). If null, fallback to vix/100.
//   vix          — spot VIX (decimal index, e.g. 16.5)
//   ivRank       — 0-100 (informational; not used in primary decision)
//   nav          — portfolio NAV ($)
//   currentHedgePosition — { strike, expiry_iso, dte, qty } | null
//   params       — overrides for HEDGE_DEFAULTS.put_roll
//
// returns:
//   { action, reason, suggestion?, current? }
//   action ∈ 'open' | 'roll' | 'hold' | 'skip'
//   suggestion: { strike, dte, type:'put', qty, est_cost, target_delta }
export function suggestPutRoll({ spot, sigma, vix, ivRank, nav, currentHedgePosition, params } = {}) {
  const cfg = { ...HEDGE_DEFAULTS.put_roll, ...(params || {}) };
  if (!Number.isFinite(spot) || spot <= 0) {
    return { action: 'skip', reason: 'spot missing' };
  }
  if (!Number.isFinite(nav) || nav <= 0) {
    return { action: 'skip', reason: 'NAV missing' };
  }
  const vixOk = Number.isFinite(vix);
  // Vol regime — primary gate
  if (vixOk && vix > cfg.vix_skip_above) {
    return {
      action: 'skip',
      reason: `VIX ${vix.toFixed(1)} > ${cfg.vix_skip_above} — vol expensive, hold dry powder`,
      current: currentHedgePosition || null,
    };
  }
  const scaler = (vixOk && vix < cfg.vix_double_below) ? 2.0 : 1.0;
  const sigmaUse = Number.isFinite(sigma) && sigma > 0
    ? sigma
    : (vixOk ? vix / 100 : 0.18);

  // Existing position decision
  if (currentHedgePosition && Number.isFinite(currentHedgePosition.dte)) {
    if (currentHedgePosition.dte > cfg.roll_dte) {
      return {
        action: 'hold',
        reason: `DTE ${currentHedgePosition.dte} > roll threshold ${cfg.roll_dte}`,
        current: currentHedgePosition,
      };
    }
    // roll
  }

  const r = DEFAULT_RISK_FREE_RATE;
  const q = DIVIDEND_YIELDS[cfg.underlying] ?? DIVIDEND_YIELDS.default;
  const T = cfg.target_dte / 365;
  const strike = strikeFromTargetDelta(spot, T, r, sigmaUse, 'put', cfg.target_delta, q, spot > 500 ? 5 : 1);
  if (!strike) {
    return { action: 'skip', reason: 'strike search failed' };
  }
  const pricePerShare = bsPrice(spot, strike, T, r, sigmaUse, 'put', q);
  const costPerContract = pricePerShare * 100;
  if (!Number.isFinite(costPerContract) || costPerContract <= 0) {
    return { action: 'skip', reason: 'pricing failed' };
  }
  const { budget } = computeHedgeBudget(nav, cfg.allocation_pct, scaler);
  const qty = Math.max(0, Math.floor(budget / costPerContract));
  if (qty === 0) {
    return {
      action: 'skip',
      reason: `Budget $${budget.toFixed(0)} < 1 contract cost $${costPerContract.toFixed(0)}`,
    };
  }

  const action = currentHedgePosition ? 'roll' : 'open';
  return {
    action,
    reason: action === 'roll'
      ? `Current DTE ${currentHedgePosition.dte} ≤ ${cfg.roll_dte} → roll to fresh ${cfg.target_dte} DTE`
      : `Open new ${cfg.target_dte}-DTE Δ${cfg.target_delta} put ${scaler === 2 ? '(2× — VIX cheap)' : ''}`.trim(),
    suggestion: {
      symbol: cfg.underlying,
      type: 'put',
      strike,
      dte: cfg.target_dte,
      qty,
      est_cost: Math.round(costPerContract * qty * 100) / 100,
      cost_per_contract: Math.round(costPerContract * 100) / 100,
      target_delta: cfg.target_delta,
      scaler,
      vix: vix ?? null,
      sigma_used: sigmaUse,
    },
    current: currentHedgePosition || null,
  };
}

// ─── suggestVIXCall ─────────────────────────────────────────────────────────
// VIX call overlay. Conditional: only fires in calm/uptrending regimes.
//
// inputs: { vix, spy_regime, ivRank, nav, currentHedgePosition?, params }
//   spy_regime ∈ 'trending_up' | 'trending_down' | 'volatile' | 'neutral'
export function suggestVIXCall({ vix, spy_regime, ivRank, nav, currentHedgePosition, params } = {}) {
  const cfg = { ...HEDGE_DEFAULTS.vix_call, ...(params || {}) };
  if (!Number.isFinite(nav) || nav <= 0) {
    return { action: 'skip', reason: 'NAV missing' };
  }
  // Close logic for an existing position
  if (currentHedgePosition) {
    if (Number.isFinite(vix) && vix > cfg.close_vix_above) {
      return {
        action: 'close',
        reason: `VIX ${vix.toFixed(1)} > ${cfg.close_vix_above} — vol expansion, take profits`,
        current: currentHedgePosition,
      };
    }
    if (Number.isFinite(currentHedgePosition.dte) && currentHedgePosition.dte < cfg.close_dte_below) {
      return {
        action: 'close',
        reason: `DTE ${currentHedgePosition.dte} < ${cfg.close_dte_below} — theta bleed, close before zero`,
        current: currentHedgePosition,
      };
    }
    return { action: 'hold', reason: 'Position OK', current: currentHedgePosition };
  }
  // Open logic
  if (!Number.isFinite(vix)) return { action: 'skip', reason: 'VIX missing' };
  if (vix >= cfg.open_vix_below) {
    return { action: 'skip', reason: `VIX ${vix.toFixed(1)} >= ${cfg.open_vix_below} — wait for calmer regime` };
  }
  if (spy_regime && spy_regime !== 'trending_up' && spy_regime !== 'neutral') {
    return { action: 'skip', reason: `SPY regime "${spy_regime}" — VIX call only in uptrend/neutral` };
  }
  if (Number.isFinite(ivRank) && ivRank >= cfg.open_ivr_below) {
    return { action: 'skip', reason: `IVR ${ivRank.toFixed(0)} >= ${cfg.open_ivr_below}` };
  }
  // VIX option pricing is non-standard (futures-based) — approximate via BS on
  // the VIX index itself with sigma ~1.0 (vol-of-vol). Good enough for sizing,
  // not for execution price.
  const T = cfg.target_dte / 365;
  const sigmaVol = 1.0;
  const strike = strikeFromTargetDelta(vix, T, DEFAULT_RISK_FREE_RATE, sigmaVol, 'call', cfg.target_delta, 0, 0.5);
  if (!strike) return { action: 'skip', reason: 'strike search failed' };
  const pricePerShare = bsPrice(vix, strike, T, DEFAULT_RISK_FREE_RATE, sigmaVol, 'call', 0);
  const costPerContract = pricePerShare * 100;
  if (!Number.isFinite(costPerContract) || costPerContract <= 0) {
    return { action: 'skip', reason: 'pricing failed' };
  }
  const { budget } = computeHedgeBudget(nav, cfg.allocation_pct, 1.0);
  const qty = Math.max(0, Math.floor(budget / costPerContract));
  if (qty === 0) return { action: 'skip', reason: `Budget $${budget.toFixed(0)} < 1 contract` };
  return {
    action: 'open',
    reason: `VIX ${vix.toFixed(1)} cheap + ${spy_regime || 'neutral'} regime — open Δ${cfg.target_delta} call`,
    suggestion: {
      symbol: cfg.underlying,
      type: 'call',
      strike,
      dte: cfg.target_dte,
      qty,
      est_cost: Math.round(costPerContract * qty * 100) / 100,
      cost_per_contract: Math.round(costPerContract * 100) / 100,
      target_delta: cfg.target_delta,
      vix,
    },
  };
}

// ─── suggestConvexityBackspread ─────────────────────────────────────────────
// 1×2 put backspread: sell 1 closer-to-money, buy 2 further-OTM.
// Net debit small; profits if big crash, capped loss in middle, no upside risk.
export function suggestConvexityBackspread({ spot, sigma, vix, ivRank, nav, params } = {}) {
  const cfg = { ...HEDGE_DEFAULTS.convexity_backspread, ...(params || {}) };
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(nav) || nav <= 0) {
    return { action: 'skip', reason: 'inputs missing' };
  }
  if (Number.isFinite(ivRank) && ivRank >= cfg.open_when_ivr_below) {
    return { action: 'skip', reason: `IVR ${ivRank.toFixed(0)} too high — debit structures hate elevated IV` };
  }
  const sigmaUse = Number.isFinite(sigma) && sigma > 0
    ? sigma
    : (Number.isFinite(vix) ? vix / 100 : 0.18);
  const r = DEFAULT_RISK_FREE_RATE;
  const q = DIVIDEND_YIELDS[cfg.underlying] ?? DIVIDEND_YIELDS.default;
  const T = cfg.target_dte / 365;
  const tick = spot > 500 ? 5 : 1;
  const k_short = strikeFromTargetDelta(spot, T, r, sigmaUse, 'put', cfg.short_delta, q, tick);
  const k_long  = strikeFromTargetDelta(spot, T, r, sigmaUse, 'put', cfg.long_delta,  q, tick);
  if (!k_short || !k_long || k_long >= k_short) {
    return { action: 'skip', reason: 'strike search failed or strikes inverted' };
  }
  const px_short = bsPrice(spot, k_short, T, r, sigmaUse, 'put', q);
  const px_long  = bsPrice(spot, k_long,  T, r, sigmaUse, 'put', q);
  const debitPerContract = (2 * px_long - px_short) * 100;
  if (!Number.isFinite(debitPerContract) || debitPerContract <= 0) {
    return { action: 'skip', reason: 'structure not a debit (improve strikes or skip)' };
  }
  const { budget } = computeHedgeBudget(nav, cfg.allocation_pct, 1.0);
  const qty = Math.max(0, Math.floor(budget / debitPerContract));
  if (qty === 0) return { action: 'skip', reason: `Budget $${budget.toFixed(0)} < 1 backspread cost $${debitPerContract.toFixed(0)}` };
  return {
    action: 'open',
    reason: `Convexity backspread — sell K=${k_short} buy 2× K=${k_long} (debit)`,
    suggestion: {
      symbol: cfg.underlying,
      structure: 'put_backspread_1x2',
      legs: [
        { type: 'put', strike: k_short, action: 'sell', qty },
        { type: 'put', strike: k_long,  action: 'buy',  qty: qty * 2 },
      ],
      dte: cfg.target_dte,
      qty,
      est_cost: Math.round(debitPerContract * qty * 100) / 100,
      debit_per_contract: Math.round(debitPerContract * 100) / 100,
    },
  };
}

// ─── computeHedgeProtection ─────────────────────────────────────────────────
// Given currently open hedge legs + a portfolio NAV, compute payoff at
// scenario shocks (e.g. -10/-20/-30%). Used to display "max protection".
//
// legs: [{ type:'put'|'call', strike, action:'buy'|'sell', qty, T (yrs), sigma, symbol }]
// scenarios: array of decimal returns, e.g. [-0.10, -0.20, -0.30]
// spot: current price of the underlying (assumed same for all legs of one symbol)
//
// Returns: [{ scenario, S, hedge_pnl, protection_per_dollar, breakeven? }]
export function computeHedgeProtection(legs, spot, scenarios = [-0.10, -0.20, -0.30, +0.05], opts = {}) {
  if (!Array.isArray(legs) || legs.length === 0 || !Number.isFinite(spot)) return [];
  const r = opts.r ?? DEFAULT_RISK_FREE_RATE;
  const q = opts.q ?? 0;
  const out = [];
  for (const scn of scenarios) {
    const S = spot * (1 + scn);
    let pnl = 0;
    for (const leg of legs) {
      const dir = (leg.action === 'sell' || leg.action === 'short') ? -1 : 1;
      const qty = Math.abs(leg.qty || 1);
      const T = Math.max(0, leg.T ?? 0);
      const sigma = leg.sigma ?? 0.20;
      const optType = leg.type === 'call' || leg.type === 'C' ? 'call' : 'put';
      // Value at scenario = current BS price at S' (assumes no time passage)
      const px = bsPrice(S, leg.strike, T, r, sigma, optType, q);
      pnl += dir * qty * 100 * px;
    }
    out.push({
      scenario: scn,
      S: Math.round(S * 100) / 100,
      hedge_pnl: Math.round(pnl * 100) / 100,
    });
  }
  return out;
}

// ─── historicalHedgeBacktest ────────────────────────────────────────────────
// Simulates rolling SPY OTM put hedge across N years of daily bars.
//
// bars: [{ date, close, sigma_proxy? }] — daily SPY closes
// vix_bars: [{ date, vix }] — daily VIX
// params: { initial_nav, allocation_pct, target_delta, target_dte, roll_dte,
//           vix_skip_above, vix_double_below }
//
// Methodology (intentionally simple — a Worker isn't a backtest farm):
//   - On the 1st trading day of each calendar month, open a position iff vix_skip_above check passes
//   - Hold until DTE drops below roll_dte → close at BS-priced value, open next month
//   - Closing value uses bsPrice with sigma=vix_at_close/100
//   - Skipped months count as $0 cost and $0 protection
export function historicalHedgeBacktest(bars, vix_bars, params = {}) {
  const cfg = { ...HEDGE_DEFAULTS.put_roll, ...params };
  const initial_nav = params.initial_nav || 1_400_000;
  if (!Array.isArray(bars) || bars.length < 30) {
    return { trades: [], summary: { error: 'insufficient bars' } };
  }
  const vixMap = new Map((vix_bars || []).map(v => [v.date, v.vix]));
  const trades = [];
  let openTrade = null;
  const r = DEFAULT_RISK_FREE_RATE;
  const q = DIVIDEND_YIELDS.SPY;

  let lastMonth = null;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const dt = new Date(bar.date + 'T00:00:00Z');
    const month = dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    const vix = vixMap.get(bar.date);
    const sigma = bar.sigma_proxy != null
      ? bar.sigma_proxy
      : (Number.isFinite(vix) ? vix / 100 : 0.18);

    // First trading day of month → consider opening
    const isFirstOfMonth = lastMonth !== month;
    lastMonth = month;

    // Roll if existing position has decayed
    if (openTrade) {
      const T_remaining = Math.max(0, (new Date(openTrade.expiry + 'T00:00:00Z') - dt) / (365 * 86400 * 1000));
      const dte_remaining = Math.round(T_remaining * 365);
      if (dte_remaining <= cfg.roll_dte) {
        const closeValue = bsPrice(bar.close, openTrade.strike, T_remaining, r, sigma, 'put', q) * 100 * openTrade.qty;
        openTrade.close_date = bar.date;
        openTrade.close_value = Math.round(closeValue * 100) / 100;
        openTrade.pnl = Math.round((closeValue - openTrade.cost) * 100) / 100;
        trades.push(openTrade);
        openTrade = null;
      }
    }

    // Open new at start of month if budget permits and VIX OK
    if (isFirstOfMonth && !openTrade) {
      if (Number.isFinite(vix) && vix > cfg.vix_skip_above) continue;
      const scaler = (Number.isFinite(vix) && vix < cfg.vix_double_below) ? 2.0 : 1.0;
      const T = cfg.target_dte / 365;
      const strike = strikeFromTargetDelta(bar.close, T, r, sigma, 'put', cfg.target_delta, q, bar.close > 500 ? 5 : 1);
      if (!strike) continue;
      const px = bsPrice(bar.close, strike, T, r, sigma, 'put', q);
      const costPerContract = px * 100;
      if (!Number.isFinite(costPerContract) || costPerContract <= 0) continue;
      const budget = initial_nav * cfg.allocation_pct * scaler;
      const qty = Math.max(0, Math.floor(budget / costPerContract));
      if (qty === 0) continue;
      const expiryMs = dt.getTime() + cfg.target_dte * 86400 * 1000;
      const expiry = new Date(expiryMs).toISOString().slice(0, 10);
      openTrade = {
        open_date: bar.date,
        expiry,
        strike,
        dte: cfg.target_dte,
        qty,
        cost: Math.round(costPerContract * qty * 100) / 100,
        spot_at_open: bar.close,
        vix_at_open: vix ?? null,
        scaler,
      };
    }
  }
  // Liquidate any open position at last bar
  if (openTrade) {
    const lastBar = bars[bars.length - 1];
    const dt = new Date(lastBar.date + 'T00:00:00Z');
    const T = Math.max(0, (new Date(openTrade.expiry + 'T00:00:00Z') - dt) / (365 * 86400 * 1000));
    const sigma = Number.isFinite(vixMap.get(lastBar.date)) ? vixMap.get(lastBar.date) / 100 : 0.18;
    const closeValue = bsPrice(lastBar.close, openTrade.strike, T, r, sigma, 'put', q) * 100 * openTrade.qty;
    openTrade.close_date = lastBar.date;
    openTrade.close_value = Math.round(closeValue * 100) / 100;
    openTrade.pnl = Math.round((closeValue - openTrade.cost) * 100) / 100;
    trades.push(openTrade);
  }

  const total_cost = trades.reduce((s, t) => s + (t.cost || 0), 0);
  const total_value = trades.reduce((s, t) => s + (t.close_value || 0), 0);
  const net_pnl = total_value - total_cost;
  const yearsCovered = (new Date(bars[bars.length - 1].date) - new Date(bars[0].date)) / (365 * 86400 * 1000);
  const annualCost = yearsCovered > 0 ? -net_pnl / yearsCovered : 0;
  const cost_of_insurance_pct_per_year = initial_nav > 0 ? annualCost / initial_nav : null;

  // Worst drawdown protection: max single-trade pnl
  const best = trades.reduce((b, t) => (t.pnl > (b?.pnl ?? -Infinity) ? t : b), null);

  return {
    trades,
    summary: {
      n_trades: trades.length,
      total_cost: Math.round(total_cost * 100) / 100,
      total_value: Math.round(total_value * 100) / 100,
      net_pnl: Math.round(net_pnl * 100) / 100,
      years_covered: Math.round(yearsCovered * 100) / 100,
      cost_of_insurance_pct_per_year: cost_of_insurance_pct_per_year != null
        ? Math.round(cost_of_insurance_pct_per_year * 10000) / 10000
        : null,
      best_trade: best ? {
        open_date: best.open_date, close_date: best.close_date, pnl: best.pnl,
      } : null,
    },
  };
}

// ─── evaluateHedgeEffectiveness ─────────────────────────────────────────────
// Diagnostic metrics for a hedge overlay. Daily series.
//
// portfolioPnL: array of daily $ P&L (unhedged portfolio)
// hedgePnL:     array of daily $ P&L (hedge alone)
export function evaluateHedgeEffectiveness(portfolioPnL, hedgePnL) {
  if (!Array.isArray(portfolioPnL) || !Array.isArray(hedgePnL)) {
    return { error: 'inputs must be arrays' };
  }
  const n = Math.min(portfolioPnL.length, hedgePnL.length);
  if (n < 2) return { error: 'need ≥2 observations', n };
  const p = portfolioPnL.slice(0, n);
  const h = hedgePnL.slice(0, n);
  const combined = p.map((x, i) => x + h[i]);

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  };
  const correlation = (a, b) => {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      const xa = a[i] - ma, xb = b[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    const denom = Math.sqrt(da * db);
    return denom > 0 ? num / denom : 0;
  };
  const maxDD = (series) => {
    let peak = -Infinity, dd = 0, maxdd = 0;
    let cum = 0;
    for (const v of series) {
      cum += v;
      if (cum > peak) peak = cum;
      dd = cum - peak;
      if (dd < maxdd) maxdd = dd;
    }
    return maxdd; // negative
  };

  const sP = std(p), sH = std(combined);
  const ddU = maxDD(p);
  const ddH = maxDD(combined);
  const cost_of_insurance = -h.reduce((a, b) => a + b, 0); // positive when hedge bled

  return {
    n,
    correlation: Math.round(correlation(p, h) * 1000) / 1000,
    max_dd_unhedged: Math.round(ddU * 100) / 100,
    max_dd_hedged: Math.round(ddH * 100) / 100,
    dd_reduction_pct: ddU < 0
      ? Math.round((1 - ddH / ddU) * 1000) / 10
      : 0,
    cost_of_insurance: Math.round(cost_of_insurance * 100) / 100,
    sharpe_unhedged: sP > 0 ? Math.round((mean(p) / sP) * 1000) / 1000 : 0,
    sharpe_hedged:   sH > 0 ? Math.round((mean(combined) / sH) * 1000) / 1000 : 0,
  };
}

// ─── helper for endpoints: derive payoff curve for current hedge book ───────
export function hedgeBookPayoff(legs, spot, opts = {}) {
  if (!Array.isArray(legs) || legs.length === 0) return [];
  const enriched = legs.map(l => ({
    type: l.type,
    strike: l.strike,
    action: l.action,
    qty: l.qty,
    T: l.T ?? 0,
    sigma: l.sigma ?? 0.20,
  }));
  return multiLegPayoff(enriched, 0, {
    S_min: spot * 0.5,
    S_max: spot * 1.2,
    n_points: opts.n_points || 81,
  });
}

export default {
  HEDGE_DEFAULTS,
  computeHedgeBudget,
  strikeFromTargetDelta,
  suggestPutRoll,
  suggestVIXCall,
  suggestConvexityBackspread,
  computeHedgeProtection,
  historicalHedgeBacktest,
  evaluateHedgeEffectiveness,
  hedgeBookPayoff,
};
