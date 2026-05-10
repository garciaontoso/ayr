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
  const expiry = new Date(expiryDateStr + 'T16:00:00Z'); // assume 16:00 UTC market close
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
