// Black-Scholes pricing + Greeks for European options.
// Pure JS, no dependencies. Runs in Cloudflare Worker.
// Used by Theta Gang for server-side Greeks calculation cuando TT bridge
// no expone greeks en positions raw.
//
// 2026-05-10 Sprint 2.

// ── Standard normal CDF (Abramowitz & Stegun approximation, ε ~7.5e-8) ──
export function normCdf(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

// ── Standard normal PDF ──
export function normPdf(x) {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

// ── Black-Scholes price for European call/put ──
//
// S      = underlying spot price
// K      = strike
// T      = time to expiration in years (e.g. 35/365 for 35 DTE)
// r      = risk-free rate (annualized, decimal — 0.045 = 4.5%)
// sigma  = implied volatility (annualized, decimal — 0.20 = 20%)
// q      = continuous dividend yield (annualized, decimal — 0.015 = 1.5%) — default 0
// type   = 'call' or 'put'
export function bsPrice(S, K, T, r, sigma, type = 'call', q = 0) {
  // Sprint 13 audit fix C4: guard against degenerate inputs that produce NaN/Infinity
  if (!Number.isFinite(S) || !Number.isFinite(K) || S <= 0 || K <= 0) return 0;
  if (T <= 0 || sigma <= 0) {
    // At expiration: intrinsic value
    return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const Nmd1 = normCdf(-d1);
  const Nmd2 = normCdf(-d2);
  if (type === 'call') {
    return S * Math.exp(-q * T) * Nd1 - K * Math.exp(-r * T) * Nd2;
  } else {
    return K * Math.exp(-r * T) * Nmd2 - S * Math.exp(-q * T) * Nmd1;
  }
}

// ── Black-Scholes Greeks ──
// Returns { delta, gamma, theta, vega, rho }.
// theta is per CALENDAR day (annual / 365).
// vega per 1% change in IV (sigma * 0.01).
// rho per 1% change in r.
export function bsGreeks(S, K, T, r, sigma, type = 'call', q = 0) {
  // Sprint 13 audit fix C4: guard against degenerate inputs
  if (!Number.isFinite(S) || !Number.isFinite(K) || S <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  if (T <= 0 || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = normCdf(d1);
  const Nmd1 = normCdf(-d1);
  const Nd2 = normCdf(d2);
  const Nmd2 = normCdf(-d2);
  const phi_d1 = normPdf(d1);
  const expMrT = Math.exp(-r * T);
  const expMqT = Math.exp(-q * T);

  // Delta
  const delta = type === 'call'
    ? expMqT * Nd1
    : expMqT * (Nd1 - 1);

  // Gamma (same call/put)
  const gamma = (expMqT * phi_d1) / (S * sigma * sqrtT);

  // Theta — annualized then divide by 365 for per-day
  const thetaAnnual = type === 'call'
    ? -(S * phi_d1 * sigma * expMqT) / (2 * sqrtT) - r * K * expMrT * Nd2 + q * S * expMqT * Nd1
    : -(S * phi_d1 * sigma * expMqT) / (2 * sqrtT) + r * K * expMrT * Nmd2 - q * S * expMqT * Nmd1;
  const theta = thetaAnnual / 365;

  // Vega — per 1 unit of sigma; divide by 100 for per 1% change
  const vega = (S * expMqT * phi_d1 * sqrtT) / 100;

  // Rho — per 1 unit of r; divide by 100 for per 1% change
  const rho = type === 'call'
    ? (K * T * expMrT * Nd2) / 100
    : -(K * T * expMrT * Nmd2) / 100;

  return { delta, gamma, theta, vega, rho };
}

// ── Implied Volatility via Newton-Raphson + bisection fallback ──
// Returns sigma such that bsPrice(S, K, T, r, sigma, type, q) ≈ marketPrice.
// Uses Newton-Raphson with vega derivative; falls back to bisection if Newton diverges.
export function impliedVol(marketPrice, S, K, T, r, type = 'call', q = 0, tol = 1e-5, maxIter = 100) {
  if (marketPrice <= 0 || T <= 0) return null;
  // Initial guess: Brenner-Subrahmanyam (1988) approximation
  let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
  sigma = Math.max(0.01, Math.min(5.0, sigma));

  for (let i = 0; i < maxIter; i++) {
    const price = bsPrice(S, K, T, r, sigma, type, q);
    const diff = price - marketPrice;
    if (Math.abs(diff) < tol) return sigma;

    // Vega for Newton step (in original scale, not /100)
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / (sigma * sqrtT);
    const vega = S * Math.exp(-q * T) * normPdf(d1) * sqrtT;
    if (vega < 1e-10) break; // Newton would diverge

    sigma = sigma - diff / vega;
    if (sigma <= 0 || sigma > 10) break; // Out of bounds
  }

  // Fallback: bisection
  let low = 0.001, high = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const price = bsPrice(S, K, T, r, mid, type, q);
    if (Math.abs(price - marketPrice) < tol) return mid;
    if (price < marketPrice) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

// ── Probability of profit / probability ITM at expiration (under Black-Scholes) ──
// For a SHORT option position, prob_otm = prob option expires worthless.
// For a LONG option, prob_itm = prob option finishes in-the-money.
export function probabilityITM(S, K, T, r, sigma, type = 'call', q = 0) {
  if (T <= 0 || sigma <= 0) {
    return type === 'call' ? (S > K ? 1 : 0) : (S < K ? 1 : 0);
  }
  const d2 = (Math.log(S / K) + (r - q - sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  return type === 'call' ? normCdf(d2) : normCdf(-d2);
}

// ── Multi-leg position Greeks aggregator ──
// legs: [{ S, K, T, r, sigma, type, q?, qty, multiplier?, action? }]
//   action: 'sell' | 'buy' (default 'buy')
//   qty: number of contracts (positive)
// Returns aggregated { delta, gamma, theta, vega, rho } in per-share terms,
// scaled by qty × multiplier × direction.
export function multiLegGreeks(legs) {
  let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;
  for (const leg of legs) {
    const dir = leg.action === 'sell' ? -1 : 1;
    const mult = leg.multiplier || 100;
    const qty = leg.qty || 1;
    const g = bsGreeks(leg.S, leg.K, leg.T, leg.r, leg.sigma, leg.type, leg.q || 0);
    delta += g.delta * qty * mult * dir;
    gamma += g.gamma * qty * mult * dir;
    theta += g.theta * qty * mult * dir;
    vega  += g.vega  * qty * mult * dir;
    rho   += g.rho   * qty * mult * dir;
  }
  return { delta, gamma, theta, vega, rho };
}

// ── Year fraction from date string YYYY-MM-DD to today ──
// Assumes 365-day year for option pricing (standard).
export function yearFraction(expiryDateStr, fromDate = new Date()) {
  // Sprint 13 audit fix C5: guard malformed/missing date → 0 instead of NaN
  if (!expiryDateStr || typeof expiryDateStr !== 'string') return 0;
  const expiry = new Date(expiryDateStr + 'T16:00:00Z'); // assume 16:00 UTC market close
  if (isNaN(expiry.getTime())) return 0;
  const ms = expiry.getTime() - fromDate.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 365));
}

// ── Default risk-free rate (3-month T-bill proxy) ──
// Sprint 5 implementará fetch real desde FMP. Por ahora 4.5% fijo (2026 contexto).
export const DEFAULT_RISK_FREE_RATE = 0.045;

// ── Default dividend yields para underlyings comunes ──
export const DIVIDEND_YIELDS = {
  SPY: 0.013,  // 1.3% TTM
  IWM: 0.011,
  QQQ: 0.005,
  SPX: 0,      // index, no dividends
  RUT: 0,
  default: 0.015,
};

// ─── Sprint 6 — multi-leg payoff + breakeven helpers ────────────────────────
// Used by /api/thetagang/multileg/payoff for diagrams + max/loss + breakevens.

// Payoff at expiration for one leg, per share (no multiplier here).
//
// leg: { type: 'call'|'put', strike, action: 'sell'|'buy', qty }
// premiumPaid: net debit/credit per share for this leg (positive = paid, negative = received)
//   (when constructing payoff from costless legs, premium is folded into base intercept)
function legIntrinsicAtExpiry(leg, S) {
  const intrinsic = leg.type === 'call' || leg.type === 'C'
    ? Math.max(0, S - leg.strike)
    : Math.max(0, leg.strike - S);
  const dir = (leg.action === 'sell' || leg.action === 'short') ? -1 : 1;
  const qty = Math.abs(leg.qty || 1);
  return dir * qty * intrinsic;
}

// ── multiLegPayoff(legs, options) ──
// Returns array of { S, pnl } points covering the price range.
// Includes net premium received/paid (premium > 0 = credit, premium < 0 = debit).
//
// legs: [{ type, strike, action, qty, T?, sigma? }]
//   T is per-leg time-to-expiration in years. Defaults to opts.evalAt for
//   intrinsic-only payoff at expiration of all legs.
// premium: net credit ($/share); positive when net selling > buying
// opts: {
//   S_min, S_max, n_points = 81, multiplier = 100,
//   evalAt = 0,        — point in time (years from snapshot) at which to evaluate
//                        Legs with T > evalAt → residual BS price (not yet expired)
//                        Legs with T <= evalAt → intrinsic value
//   r = 0.045, q = 0   — required for BS residual pricing of unexpired legs
// }
//
// CALENDAR/DIAGONAL: pass evalAt = T_front so back-month leg keeps time value.
// Single-expiry strategies (BPS/IC/IF/...): evalAt = 0 = at expiry of all legs.
export function multiLegPayoff(legs, premium, opts = {}) {
  const strikes = legs.map(l => l.strike).filter(Number.isFinite);
  const minK = Math.min(...strikes);
  const maxK = Math.max(...strikes);
  const range = maxK - minK || maxK * 0.1 || 10;
  const S_min = opts.S_min ?? Math.max(0, minK - range * 1.0);
  const S_max = opts.S_max ?? maxK + range * 1.0;
  const N = opts.n_points || 81;
  const multiplier = opts.multiplier || 100;
  const evalAt = opts.evalAt ?? null;
  const r = opts.r ?? DEFAULT_RISK_FREE_RATE;
  const q = opts.q ?? 0;

  // Auto-detect: single-expiry → evaluate at expiry of all legs (intrinsic only).
  // Calendar/diagonal (varying T) → evaluate at front expiry; back-month leg keeps
  // residual time value via BS price.
  let evalAtUse = evalAt;
  if (evalAtUse == null) {
    const ts = legs.map(l => l.T).filter(t => t != null);
    if (ts.length === 0) evalAtUse = 0;
    else {
      const tMin = Math.min(...ts);
      const tMax = Math.max(...ts);
      // If all legs same T → evaluate at that T (all expire = intrinsic).
      // If varying T → evaluate at front (tMin); back-month gets residual BS.
      evalAtUse = (tMax > tMin) ? tMin : tMax;
    }
  }

  const points = [];
  for (let i = 0; i < N; i++) {
    const S = S_min + (S_max - S_min) * (i / (N - 1));
    let payoffSum = 0;
    for (const leg of legs) {
      if (leg.type === 'stock') {
        // Stock leg: S - entry (entry baked into premium at construction)
        const dir = (leg.action === 'sell' || leg.action === 'short') ? -1 : 1;
        const qty = Math.abs(leg.qty || 1);
        payoffSum += dir * qty * S / multiplier; // stock qty already in shares; divide by multiplier so total scales correctly
        continue;
      }
      const legT = leg.T ?? 0;
      const remainingT = legT - evalAtUse;
      if (remainingT > 0.0001 && leg.sigma != null) {
        // Leg has remaining time: use BS price (calendar back-month case)
        const optType = (leg.type === 'C' || leg.type === 'call') ? 'call' : 'put';
        const px = bsPrice(S, leg.strike, remainingT, r, leg.sigma, optType, q);
        const dir = (leg.action === 'sell' || leg.action === 'short') ? -1 : 1;
        const qty = Math.abs(leg.qty || 1);
        payoffSum += dir * qty * px;
      } else {
        // Leg expired: intrinsic
        payoffSum += legIntrinsicAtExpiry(leg, S);
      }
    }
    const pnl = (premium + payoffSum) * multiplier;
    points.push({ S: Math.round(S * 100) / 100, pnl: Math.round(pnl * 100) / 100 });
  }
  return points;
}

// ── breakevens(payoffPoints) ──
// Linear-interpolated zero crossings of the payoff curve.
// Returns array of underlying prices where P/L = 0.
// Dedupes nearby crossings (within $0.50) to avoid double-counts at floating-point boundaries.
export function breakevens(payoffPoints) {
  const bes = [];
  for (let i = 1; i < payoffPoints.length; i++) {
    const a = payoffPoints[i - 1], b = payoffPoints[i];
    let be = null;
    if (a.pnl === 0) be = a.S;
    else if (Math.sign(a.pnl) !== Math.sign(b.pnl) && a.pnl !== b.pnl) {
      const t = a.pnl / (a.pnl - b.pnl);
      be = Math.round((a.S + (b.S - a.S) * t) * 100) / 100;
    }
    if (be != null && (bes.length === 0 || Math.abs(be - bes[bes.length - 1]) > 0.5)) {
      bes.push(be);
    }
  }
  return bes;
}

// ── multiLegMaxProfitLoss(payoffPoints) ──
// Returns { maxProfit, maxLoss, maxProfitS, maxLossS, profitCapped, lossCapped }.
// "Capped" = max occurs at boundary S (not interior) → likely unbounded.
export function multiLegMaxProfitLoss(payoffPoints) {
  if (!payoffPoints?.length) return { maxProfit: 0, maxLoss: 0 };
  let maxP = -Infinity, maxL = Infinity, maxPS = 0, maxLS = 0, maxPi = 0, maxLi = 0;
  for (let i = 0; i < payoffPoints.length; i++) {
    const p = payoffPoints[i];
    if (p.pnl > maxP) { maxP = p.pnl; maxPS = p.S; maxPi = i; }
    if (p.pnl < maxL) { maxL = p.pnl; maxLS = p.S; maxLi = i; }
  }
  return {
    maxProfit: Math.round(maxP * 100) / 100,
    maxLoss: Math.round(maxL * 100) / 100,
    maxProfitS: maxPS,
    maxLossS: maxLS,
    profitCapped: maxPi === 0 || maxPi === payoffPoints.length - 1,
    lossCapped: maxLi === 0 || maxLi === payoffPoints.length - 1,
  };
}

// ── buildLegs(strategyType, params) ──
// Strategy → leg construction for Sprint 6 multi-leg builder.
//
// strategyType: 'BPS'|'BCS'|'IC'|'IF'|'CALENDAR'|'BWB_PUT'|'BWB_CALL'|'JADE_LIZARD'|'RATIO_BACK_PUT'|'DIAGONAL_PUT'|'STRANGLE'|'COVERED_CALL'
// params: { S, sigma, T, r, q, contracts = 1, ... strategy-specific }
//
// Returns { legs: [{type,strike,action,qty,T?,sigma?}], notes }
// Each leg may carry its own T (calendar/diagonal use 2 expiries).
// Strikes are computed via SD-move proxy (Δ16 ≈ 1 SD short, Δ5 ≈ 1.5 SD long).
export function buildLegs(strategyType, params) {
  const { S, sigma, T, r, q = 0, contracts = 1 } = params;
  const sd = S * sigma * Math.sqrt(T);

  // Strike rounding: indices to 5, equities to 1
  const tick = (params.tick) ?? (S > 500 ? 5 : 1);
  const round = (x) => Math.round(x / tick) * tick;
  const ks_short = round(S - sd);
  const kl_short = round(S - sd * 1.5);
  const kc_short = round(S + sd);
  const kc_long  = round(S + sd * 1.5);

  switch (strategyType) {
    case 'BPS': // Bull Put Spread (sell short put, buy long put further OTM)
      return {
        legs: [
          { type: 'put',  strike: ks_short, action: 'sell', qty: contracts, T, sigma },
          { type: 'put',  strike: kl_short, action: 'buy',  qty: contracts, T, sigma },
        ],
        notes: 'Bull Put Spread — defined-risk credit. Max profit at expiry above short strike.',
      };

    case 'BCS': // Bear Call Spread
      return {
        legs: [
          { type: 'call', strike: kc_short, action: 'sell', qty: contracts, T, sigma },
          { type: 'call', strike: kc_long,  action: 'buy',  qty: contracts, T, sigma },
        ],
        notes: 'Bear Call Spread — defined-risk credit. Max profit at expiry below short strike.',
      };

    case 'IC': // Iron Condor (BPS + BCS)
      return {
        legs: [
          { type: 'put',  strike: ks_short, action: 'sell', qty: contracts, T, sigma },
          { type: 'put',  strike: kl_short, action: 'buy',  qty: contracts, T, sigma },
          { type: 'call', strike: kc_short, action: 'sell', qty: contracts, T, sigma },
          { type: 'call', strike: kc_long,  action: 'buy',  qty: contracts, T, sigma },
        ],
        notes: 'Iron Condor — neutral defined-risk. Max profit between short strikes.',
      };

    case 'IF': // Iron Butterfly (sell ATM call + put, buy wings)
      {
        const wing = round(sd);
        const k_atm = round(S);
        return {
          legs: [
            { type: 'put',  strike: k_atm,         action: 'sell', qty: contracts, T, sigma },
            { type: 'call', strike: k_atm,         action: 'sell', qty: contracts, T, sigma },
            { type: 'put',  strike: k_atm - wing,  action: 'buy',  qty: contracts, T, sigma },
            { type: 'call', strike: k_atm + wing,  action: 'buy',  qty: contracts, T, sigma },
          ],
          notes: 'Iron Butterfly — sell ATM straddle, buy wings. Max profit pin-at-strike.',
        };
      }

    case 'STRANGLE': // Naked short strangle (UNDEFINED RISK)
      return {
        legs: [
          { type: 'put',  strike: ks_short, action: 'sell', qty: contracts, T, sigma },
          { type: 'call', strike: kc_short, action: 'sell', qty: contracts, T, sigma },
        ],
        notes: 'Short Strangle — undefined risk. Max profit between strikes; uncapped loss outside.',
      };

    case 'BWB_PUT': // Broken-Wing Butterfly put-side
      // Sell 2× ATM put, buy 1 wing OTM put, buy 1 ITM put NEAR sold strike (asymmetric)
      // Standard BWB-put: BUY 1 K_high (closer to ATM), SELL 2 K_mid, BUY 1 K_low (further OTM)
      // K_low chosen so width(K_low→K_mid) > width(K_mid→K_high) → net credit + no upside risk
      {
        const k_mid  = round(S - sd * 0.5);  // short body (Δ ~30)
        const k_high = round(S - sd * 0.2);  // long inner wing (Δ ~40)
        const k_low  = round(S - sd * 1.4);  // long outer wing far OTM
        return {
          legs: [
            { type: 'put', strike: k_high, action: 'buy',  qty: contracts,     T, sigma },
            { type: 'put', strike: k_mid,  action: 'sell', qty: contracts * 2, T, sigma },
            { type: 'put', strike: k_low,  action: 'buy',  qty: contracts,     T, sigma },
          ],
          notes: 'Broken-Wing Butterfly (put) — asymmetric. Designed to credit + reduced max loss vs symmetric.',
        };
      }

    case 'BWB_CALL':
      {
        const k_mid  = round(S + sd * 0.5);
        const k_low  = round(S + sd * 0.2);
        const k_high = round(S + sd * 1.4);
        return {
          legs: [
            { type: 'call', strike: k_low,  action: 'buy',  qty: contracts,     T, sigma },
            { type: 'call', strike: k_mid,  action: 'sell', qty: contracts * 2, T, sigma },
            { type: 'call', strike: k_high, action: 'buy',  qty: contracts,     T, sigma },
          ],
          notes: 'Broken-Wing Butterfly (call) — asymmetric. Lopsided wings.',
        };
      }

    case 'JADE_LIZARD': // BPS + naked call short OTM, no upside risk if credit ≥ call width
      {
        const k_short_call = round(S + sd);  // Δ ~16 short call
        return {
          legs: [
            { type: 'put',  strike: ks_short,    action: 'sell', qty: contracts, T, sigma },
            { type: 'put',  strike: kl_short,    action: 'buy',  qty: contracts, T, sigma },
            { type: 'call', strike: k_short_call, action: 'sell', qty: contracts, T, sigma },
          ],
          notes: 'Jade Lizard — BPS + short OTM call. NO UPSIDE RISK if credit ≥ width above short call (designed-condition).',
        };
      }

    case 'RATIO_BACK_PUT': // Ratio backspread put: sell 1 close, buy 2 further OTM (debit)
      // Profits if big move down, capped loss if small move down
      {
        const k_short = round(S - sd * 0.5);   // sell 1
        const k_long  = round(S - sd * 1.2);   // buy 2
        return {
          legs: [
            { type: 'put', strike: k_short, action: 'sell', qty: contracts,     T, sigma },
            { type: 'put', strike: k_long,  action: 'buy',  qty: contracts * 2, T, sigma },
          ],
          notes: 'Ratio Backspread (put) — long convexity hedge. Profits on big down moves, defined max loss between strikes.',
        };
      }

    case 'CALENDAR_PUT': // Sell front-month put, buy back-month same strike
      {
        const T_front = T;
        const T_back  = T + (params.dte_back || 30) / 365;
        const k_atm = round(S);
        return {
          legs: [
            { type: 'put', strike: k_atm, action: 'sell', qty: contracts, T: T_front, sigma },
            { type: 'put', strike: k_atm, action: 'buy',  qty: contracts, T: T_back,  sigma },
          ],
          notes: 'Put Calendar — vol skew + theta diff. Front decays faster. Profits at expiry of front near strike.',
        };
      }

    case 'CALENDAR_CALL':
      {
        const T_front = T;
        const T_back  = T + (params.dte_back || 30) / 365;
        const k_atm = round(S);
        return {
          legs: [
            { type: 'call', strike: k_atm, action: 'sell', qty: contracts, T: T_front, sigma },
            { type: 'call', strike: k_atm, action: 'buy',  qty: contracts, T: T_back,  sigma },
          ],
          notes: 'Call Calendar — vol skew + theta diff. Front decays faster.',
        };
      }

    case 'DIAGONAL_PUT': // Sell front-month higher-strike put, buy back-month lower-strike put
      {
        const T_front = T;
        const T_back  = T + (params.dte_back || 30) / 365;
        const k_short = round(S - sd * 0.3);
        const k_long  = round(S - sd * 1.0);
        return {
          legs: [
            { type: 'put', strike: k_short, action: 'sell', qty: contracts, T: T_front, sigma },
            { type: 'put', strike: k_long,  action: 'buy',  qty: contracts, T: T_back,  sigma },
          ],
          notes: 'Diagonal Put — calendar-vertical hybrid. Theta + slight bearish bias.',
        };
      }

    case 'COVERED_CALL': // Long stock + sell call OTM (poor-man variant)
      {
        const k_call = round(S + sd);
        return {
          legs: [
            { type: 'stock', strike: 0,        action: 'buy',  qty: contracts * 100, T: 0, sigma: 0 },
            { type: 'call',  strike: k_call,   action: 'sell', qty: contracts,       T,    sigma },
          ],
          notes: 'Covered Call — long 100 sh + short call. Bull-neutral income.',
        };
      }

    // ─── Sprint 7 — additional one-shot strategies ────────────────────────
    case 'BCS_DEBIT': // Bull Call Spread (debit) — bullish bias
      {
        const k_long  = round(S);              // ATM long call
        const k_short = round(S + sd * 1.0);   // OTM short call
        return {
          legs: [
            { type: 'call', strike: k_long,  action: 'buy',  qty: contracts, T, sigma },
            { type: 'call', strike: k_short, action: 'sell', qty: contracts, T, sigma },
          ],
          notes: 'Bull Call Spread (debit) — direccional alcista. Cost = debit, max profit = width − debit.',
        };
      }

    case 'BPS_DEBIT': // Bear Put Spread (debit) — bearish bias
      {
        const k_long  = round(S);              // ATM long put
        const k_short = round(S - sd * 1.0);   // OTM short put
        return {
          legs: [
            { type: 'put', strike: k_long,  action: 'buy',  qty: contracts, T, sigma },
            { type: 'put', strike: k_short, action: 'sell', qty: contracts, T, sigma },
          ],
          notes: 'Bear Put Spread (debit) — direccional bajista. Cost = debit, max profit = width − debit.',
        };
      }

    case 'LONG_STRADDLE': // Buy ATM call + ATM put — big move ANY direction
      {
        const k_atm = round(S);
        return {
          legs: [
            { type: 'call', strike: k_atm, action: 'buy', qty: contracts, T, sigma },
            { type: 'put',  strike: k_atm, action: 'buy', qty: contracts, T, sigma },
          ],
          notes: 'Long Straddle — long volatility play. Profits si gran movimiento ANY direction. Best pre-earnings/binary.',
        };
      }

    case 'LONG_STRANGLE': // Buy OTM call + OTM put — cheaper long-vol
      {
        const k_call = round(S + sd * 0.5);
        const k_put  = round(S - sd * 0.5);
        return {
          legs: [
            { type: 'call', strike: k_call, action: 'buy', qty: contracts, T, sigma },
            { type: 'put',  strike: k_put,  action: 'buy', qty: contracts, T, sigma },
          ],
          notes: 'Long Strangle — long vol, más barato que straddle pero requiere mayor movimiento.',
        };
      }

    case 'REVERSE_IF': // Long ATM straddle + short wings — big move bounded
      {
        const k_atm = round(S);
        const wing = round(sd);
        return {
          legs: [
            { type: 'put',  strike: k_atm,        action: 'buy',  qty: contracts, T, sigma },
            { type: 'call', strike: k_atm,        action: 'buy',  qty: contracts, T, sigma },
            { type: 'put',  strike: k_atm - wing, action: 'sell', qty: contracts, T, sigma },
            { type: 'call', strike: k_atm + wing, action: 'sell', qty: contracts, T, sigma },
          ],
          notes: 'Reverse Iron Fly — long ATM straddle + short wings. Profits big move ±. Max loss limited (debit).',
        };
      }

    case 'LONG_FLY_PUT': // Long Put Butterfly — pin-at-strike bearish (debit)
      {
        const k_high = round(S);              // ATM upper wing (buy)
        const k_mid  = round(S - sd * 0.7);   // body (sell 2)
        const k_low  = round(S - sd * 1.4);   // lower wing (buy)
        return {
          legs: [
            { type: 'put', strike: k_high, action: 'buy',  qty: contracts,     T, sigma },
            { type: 'put', strike: k_mid,  action: 'sell', qty: contracts * 2, T, sigma },
            { type: 'put', strike: k_low,  action: 'buy',  qty: contracts,     T, sigma },
          ],
          notes: 'Long Put Butterfly — pin-at-K_mid bajista. Debit pequeño, max profit en K_mid.',
        };
      }

    case 'LONG_FLY_CALL': // Long Call Butterfly — pin-at-strike bullish (debit)
      {
        const k_low  = round(S);              // ATM lower wing (buy)
        const k_mid  = round(S + sd * 0.7);   // body (sell 2)
        const k_high = round(S + sd * 1.4);   // upper wing (buy)
        return {
          legs: [
            { type: 'call', strike: k_low,  action: 'buy',  qty: contracts,     T, sigma },
            { type: 'call', strike: k_mid,  action: 'sell', qty: contracts * 2, T, sigma },
            { type: 'call', strike: k_high, action: 'buy',  qty: contracts,     T, sigma },
          ],
          notes: 'Long Call Butterfly — pin-at-K_mid alcista. Debit pequeño, max profit en K_mid.',
        };
      }

    case 'COLLAR': // Long stock + protective put + short OTM call (defensive overlay)
      {
        const k_put  = round(S - sd * 0.7);   // protective put
        const k_call = round(S + sd * 1.0);   // covered call
        return {
          legs: [
            { type: 'stock', strike: 0,       action: 'buy',  qty: contracts * 100, T: 0, sigma: 0 },
            { type: 'put',   strike: k_put,   action: 'buy',  qty: contracts,       T,    sigma },
            { type: 'call',  strike: k_call,  action: 'sell', qty: contracts,       T,    sigma },
          ],
          notes: 'Collar — long stock + protective put + short OTM call. Defensive: caps upside, floors downside.',
        };
      }

    case 'RISK_REVERSAL': // Sell put + buy call (synthetic long, often net credit)
      {
        const k_put  = round(S - sd * 1.0);   // sell OTM put
        const k_call = round(S + sd * 1.0);   // buy OTM call
        return {
          legs: [
            { type: 'put',  strike: k_put,  action: 'sell', qty: contracts, T, sigma },
            { type: 'call', strike: k_call, action: 'buy',  qty: contracts, T, sigma },
          ],
          notes: 'Risk Reversal — sell OTM put + buy OTM call. Synthetic long bias, often net credit. Asignación si S < put.',
        };
      }

    case 'BIG_LIZARD': // Short ATM straddle + long OTM call (no upside risk if credit ≥ width)
      {
        const k_atm = round(S);
        const k_call = round(S + sd * 1.5);   // long OTM call protection (caps upside)
        return {
          legs: [
            { type: 'put',  strike: k_atm,   action: 'sell', qty: contracts, T, sigma },
            { type: 'call', strike: k_atm,   action: 'sell', qty: contracts, T, sigma },
            { type: 'call', strike: k_call,  action: 'buy',  qty: contracts, T, sigma },
          ],
          notes: 'Big Lizard — short ATM straddle + long OTM call. Theta + neutral, NO UPSIDE RISK si credit ≥ width call.',
        };
      }

    default:
      throw new Error(`Unknown strategy type: ${strategyType}`);
  }
}

// ── computeLegPremium(legs, S, r, defaultSigma, defaultT, q) ──
// Returns net credit (>0) or net debit (<0) per share for the strategy.
// Each leg can override its own T or sigma (calendars).
export function computeLegPremium(legs, S, r, defaultSigma, defaultT, q = 0) {
  let credit = 0;
  for (const leg of legs) {
    if (leg.type === 'stock') continue; // pure stock, premium = 0 here
    const T_use = leg.T ?? defaultT;
    const sig_use = leg.sigma ?? defaultSigma;
    const optType = (leg.type === 'C' || leg.type === 'call') ? 'call' : 'put';
    const px = bsPrice(S, leg.strike, T_use, r, sig_use, optType, q);
    const dir = (leg.action === 'sell' || leg.action === 'short') ? 1 : -1;
    const qty = Math.abs(leg.qty || 1);
    credit += dir * px * qty;
  }
  return credit;
}
