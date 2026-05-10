// Black-Scholes engine tests — Sprint 2 Theta Gang.
// Validates pricing + Greeks against canonical test cases from
// Hull, "Options, Futures and Other Derivatives" (10th ed) Chapter 15.

import { describe, it, expect } from 'vitest';
import {
  normCdf, normPdf, bsPrice, bsGreeks, impliedVol,
  probabilityITM, multiLegGreeks, yearFraction,
} from '../../../api/src/lib/black-scholes.js';

describe('Black-Scholes — normal distribution helpers', () => {
  it('normCdf(0) ≈ 0.5', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 4);
  });
  it('normCdf(1.96) ≈ 0.975 (95% CI)', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
  });
  it('normCdf(-1.96) ≈ 0.025', () => {
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
  it('normPdf(0) ≈ 0.3989', () => {
    expect(normPdf(0)).toBeCloseTo(0.3989, 3);
  });
});

describe('Black-Scholes — pricing (Hull canonical examples)', () => {
  // Hull 15.7: S=42, K=40, T=0.5, r=0.10, sigma=0.20 → call ≈ 4.7594
  it('Hull 15.7 call: S=42 K=40 T=0.5 r=10% σ=20% ≈ 4.76', () => {
    const c = bsPrice(42, 40, 0.5, 0.10, 0.20, 'call');
    expect(c).toBeCloseTo(4.76, 1);
  });
  // Put-call parity check: C - P = S - K*e^(-rT)
  it('Put-call parity holds', () => {
    const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.30;
    const c = bsPrice(S, K, T, r, sigma, 'call');
    const p = bsPrice(S, K, T, r, sigma, 'put');
    expect(c - p).toBeCloseTo(S - K * Math.exp(-r * T), 4);
  });
  // ATM call at expiration: payoff = max(S-K, 0) = 0
  it('Call at expiration ITM: S=110 K=100 → 10 intrinsic', () => {
    expect(bsPrice(110, 100, 0, 0.05, 0.20, 'call')).toBe(10);
  });
  it('Put at expiration OTM: S=110 K=100 → 0', () => {
    expect(bsPrice(110, 100, 0, 0.05, 0.20, 'put')).toBe(0);
  });
});

describe('Black-Scholes — Greeks', () => {
  const S = 100, K = 100, T = 0.25, r = 0.05, sigma = 0.20;

  it('ATM call delta ≈ 0.55 for 3-month option', () => {
    const g = bsGreeks(S, K, T, r, sigma, 'call');
    expect(g.delta).toBeGreaterThan(0.50);
    expect(g.delta).toBeLessThan(0.65);
  });

  it('ATM put delta ≈ -0.45', () => {
    const g = bsGreeks(S, K, T, r, sigma, 'put');
    expect(g.delta).toBeGreaterThan(-0.50);
    expect(g.delta).toBeLessThan(-0.35);
  });

  it('Gamma symmetric for call/put same strike', () => {
    const gc = bsGreeks(S, K, T, r, sigma, 'call');
    const gp = bsGreeks(S, K, T, r, sigma, 'put');
    expect(gc.gamma).toBeCloseTo(gp.gamma, 6);
  });

  it('Theta negative for ATM long option', () => {
    const g = bsGreeks(S, K, T, r, sigma, 'call');
    expect(g.theta).toBeLessThan(0);
  });

  it('Vega positive for any long option', () => {
    const gc = bsGreeks(S, K, T, r, sigma, 'call');
    const gp = bsGreeks(S, K, T, r, sigma, 'put');
    expect(gc.vega).toBeGreaterThan(0);
    expect(gp.vega).toBeGreaterThan(0);
  });
});

describe('Black-Scholes — Δ16 strike approximation (BPS short put)', () => {
  // SPY ~$737, σ=17%, 35 DTE — looking for ~Δ16 short put strike
  it('Short put 1 SD OTM ≈ delta 16-18', () => {
    const S = 737, T = 35 / 365, r = 0.045, sigma = 0.17, q = 0.013;
    const sdMove = S * sigma * Math.sqrt(T);
    const K = Math.round(S - sdMove); // ~717
    const g = bsGreeks(S, K, T, r, sigma, 'put', q);
    expect(Math.abs(g.delta)).toBeGreaterThan(0.10);
    expect(Math.abs(g.delta)).toBeLessThan(0.20);
  });
});

describe('Black-Scholes — Implied volatility solver', () => {
  it('Recovers original sigma 20%', () => {
    const S = 100, K = 100, T = 0.5, r = 0.05, sigma = 0.20;
    const price = bsPrice(S, K, T, r, sigma, 'call');
    const ivSolved = impliedVol(price, S, K, T, r, 'call');
    expect(ivSolved).toBeCloseTo(sigma, 3);
  });

  it('Recovers high vol 80%', () => {
    const S = 100, K = 100, T = 0.25, r = 0.05, sigma = 0.80;
    const price = bsPrice(S, K, T, r, sigma, 'call');
    const ivSolved = impliedVol(price, S, K, T, r, 'call');
    expect(ivSolved).toBeCloseTo(sigma, 2);
  });

  it('Recovers OTM put vol', () => {
    const S = 100, K = 90, T = 0.25, r = 0.05, sigma = 0.30;
    const price = bsPrice(S, K, T, r, sigma, 'put');
    const ivSolved = impliedVol(price, S, K, T, r, 'put');
    expect(ivSolved).toBeCloseTo(sigma, 2);
  });
});

describe('Black-Scholes — Probability ITM', () => {
  it('ATM ≈ 50%', () => {
    const p = probabilityITM(100, 100, 0.5, 0.05, 0.20, 'call');
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });
  it('Far OTM call ≈ 0%', () => {
    const p = probabilityITM(100, 200, 0.25, 0.05, 0.20, 'call');
    expect(p).toBeLessThan(0.001);
  });
  it('Far ITM put ≈ 100%', () => {
    const p = probabilityITM(50, 100, 0.25, 0.05, 0.20, 'put');
    expect(p).toBeGreaterThan(0.99);
  });
});

describe('Multi-leg Greeks aggregator (BPS example)', () => {
  // BPS SPY: sell 700P + buy 695P, 35 DTE
  it('BPS net delta is positive (bullish)', () => {
    const S = 737, T = 35/365, r = 0.045, sigma = 0.17, q = 0.013;
    const legs = [
      { S, K: 700, T, r, sigma, type: 'put', q, qty: 1, action: 'sell' },
      { S, K: 695, T, r, sigma, type: 'put', q, qty: 1, action: 'buy'  },
    ];
    const g = multiLegGreeks(legs);
    // Sell put = +delta, buy further OTM put = -smaller delta → net +
    expect(g.delta).toBeGreaterThan(0);
  });

  it('BPS net theta is positive (you collect time decay)', () => {
    const S = 737, T = 35/365, r = 0.045, sigma = 0.17, q = 0.013;
    const legs = [
      { S, K: 700, T, r, sigma, type: 'put', q, qty: 1, action: 'sell' },
      { S, K: 695, T, r, sigma, type: 'put', q, qty: 1, action: 'buy'  },
    ];
    const g = multiLegGreeks(legs);
    expect(g.theta).toBeGreaterThan(0);
  });
});

describe('yearFraction helper', () => {
  it('Today + 35 days ≈ 0.0959 years', () => {
    const today = new Date('2026-05-10T12:00:00Z');
    const t = yearFraction('2026-06-14', today);
    expect(t).toBeGreaterThan(0.085);
    expect(t).toBeLessThan(0.105);
  });
  it('Past date returns 0', () => {
    const today = new Date('2026-05-10T12:00:00Z');
    expect(yearFraction('2026-04-01', today)).toBe(0);
  });
});
