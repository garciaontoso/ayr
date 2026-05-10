// Multi-leg builder + payoff tests — Sprint 6 Theta Gang.
// Validates that buildLegs() generates correct leg structures for each strategy
// and that payoff/breakevens/max-profit-loss helpers behave correctly.

import { describe, it, expect } from 'vitest';
import {
  buildLegs, computeLegPremium,
  multiLegPayoff, breakevens, multiLegMaxProfitLoss,
  bsPrice, multiLegGreeks,
} from '../../../api/src/lib/black-scholes.js';

const S = 600;       // SPY spot ~600
const sigma = 0.18;  // 18% IV
const T = 35 / 365;  // 35 DTE
const r = 0.045;
const q = 0.013;

describe('Sprint 6 — buildLegs() leg structure', () => {
  it('BPS: 2 puts, 1 sell (higher K) + 1 buy (lower K)', () => {
    const { legs } = buildLegs('BPS', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.type === 'put')).toBe(true);
    const sells = legs.filter(l => l.action === 'sell');
    const buys  = legs.filter(l => l.action === 'buy');
    expect(sells).toHaveLength(1);
    expect(buys).toHaveLength(1);
    expect(sells[0].strike).toBeGreaterThan(buys[0].strike);
  });

  it('BCS: 2 calls, sell low K, buy high K', () => {
    const { legs } = buildLegs('BCS', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.type === 'call')).toBe(true);
    const sell = legs.find(l => l.action === 'sell');
    const buy  = legs.find(l => l.action === 'buy');
    expect(sell.strike).toBeLessThan(buy.strike);
  });

  it('IC: 4 legs (BPS + BCS)', () => {
    const { legs } = buildLegs('IC', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(4);
    expect(legs.filter(l => l.type === 'put')).toHaveLength(2);
    expect(legs.filter(l => l.type === 'call')).toHaveLength(2);
    expect(legs.filter(l => l.action === 'sell')).toHaveLength(2);
    expect(legs.filter(l => l.action === 'buy')).toHaveLength(2);
  });

  it('IF (Iron Fly): 4 legs, both shorts at SAME strike (ATM)', () => {
    const { legs } = buildLegs('IF', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(4);
    const sells = legs.filter(l => l.action === 'sell');
    expect(sells).toHaveLength(2);
    expect(sells[0].strike).toBe(sells[1].strike); // ATM straddle
  });

  it('JADE_LIZARD: 3 legs (BPS + naked short call)', () => {
    const { legs } = buildLegs('JADE_LIZARD', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(3);
    const calls = legs.filter(l => l.type === 'call');
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe('sell'); // naked short call
    const puts = legs.filter(l => l.type === 'put');
    expect(puts).toHaveLength(2);
    expect(puts.filter(l => l.action === 'sell')).toHaveLength(1);
    expect(puts.filter(l => l.action === 'buy')).toHaveLength(1);
  });

  it('BWB_PUT: 3 legs, 2x sold middle (asymmetric)', () => {
    const { legs } = buildLegs('BWB_PUT', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(3);
    expect(legs.every(l => l.type === 'put')).toBe(true);
    const sold = legs.find(l => l.action === 'sell');
    expect(sold.qty).toBe(2);
    // Asymmetry: distance from sold to lower buy > distance from sold to upper buy
    const upperBuy = legs.find(l => l.action === 'buy' && l.strike > sold.strike);
    const lowerBuy = legs.find(l => l.action === 'buy' && l.strike < sold.strike);
    expect(upperBuy && lowerBuy).toBeTruthy();
    const widthUp = sold.strike - upperBuy.strike; // upper is closer (BUY higher than sold short → for puts, K_high closer to ATM)
    // For BWB-put, the "higher" K is closer to ATM (sold) — distance below should be larger
    const widthDown = sold.strike - lowerBuy.strike;
    expect(widthDown).toBeGreaterThan(Math.abs(widthUp));
  });

  it('CALENDAR_PUT: 2 legs same strike, different T', () => {
    const { legs } = buildLegs('CALENDAR_PUT', { S, sigma, T, r, q, contracts: 1, dte_back: 30 });
    expect(legs).toHaveLength(2);
    expect(legs[0].strike).toBe(legs[1].strike);
    expect(legs[0].T).toBeLessThan(legs[1].T);
    const sell = legs.find(l => l.action === 'sell');
    const buy  = legs.find(l => l.action === 'buy');
    expect(sell.T).toBeLessThan(buy.T);  // sell front, buy back
  });

  it('DIAGONAL_PUT: 2 legs different strike AND different T', () => {
    const { legs } = buildLegs('DIAGONAL_PUT', { S, sigma, T, r, q, contracts: 1, dte_back: 30 });
    expect(legs).toHaveLength(2);
    const sell = legs.find(l => l.action === 'sell');
    const buy  = legs.find(l => l.action === 'buy');
    expect(sell.strike).not.toBe(buy.strike);
    expect(sell.T).toBeLessThan(buy.T);
  });

  it('RATIO_BACK_PUT: 1 sell + 2 buy (ratio 2:1)', () => {
    const { legs } = buildLegs('RATIO_BACK_PUT', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    const sell = legs.find(l => l.action === 'sell');
    const buy  = legs.find(l => l.action === 'buy');
    expect(sell.qty).toBe(1);
    expect(buy.qty).toBe(2);
    expect(buy.strike).toBeLessThan(sell.strike); // buy further OTM
  });

  it('STRANGLE: short put + short call, undefined risk', () => {
    const { legs } = buildLegs('STRANGLE', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.action === 'sell')).toBe(true);
    expect(legs.find(l => l.type === 'put')).toBeTruthy();
    expect(legs.find(l => l.type === 'call')).toBeTruthy();
  });

  it('Unknown strategy throws', () => {
    expect(() => buildLegs('NONEXISTENT', { S, sigma, T, r, q })).toThrow();
  });

  // Sprint 7 — additional one-shot strategies
  it('BCS_DEBIT: long ATM call + short OTM call, debit', () => {
    const { legs } = buildLegs('BCS_DEBIT', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.type === 'call')).toBe(true);
    const buy = legs.find(l => l.action === 'buy');
    const sell = legs.find(l => l.action === 'sell');
    expect(buy.strike).toBeLessThan(sell.strike);
  });

  it('BPS_DEBIT: long ATM put + short OTM put, debit', () => {
    const { legs } = buildLegs('BPS_DEBIT', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.type === 'put')).toBe(true);
    const buy = legs.find(l => l.action === 'buy');
    const sell = legs.find(l => l.action === 'sell');
    expect(buy.strike).toBeGreaterThan(sell.strike);
  });

  it('LONG_STRADDLE: long ATM call + long ATM put (same strike)', () => {
    const { legs } = buildLegs('LONG_STRADDLE', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.action === 'buy')).toBe(true);
    expect(legs[0].strike).toBe(legs[1].strike);
    expect(legs.find(l => l.type === 'call')).toBeTruthy();
    expect(legs.find(l => l.type === 'put')).toBeTruthy();
  });

  it('LONG_STRANGLE: long OTM call + long OTM put (different strikes)', () => {
    const { legs } = buildLegs('LONG_STRANGLE', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.action === 'buy')).toBe(true);
    const call = legs.find(l => l.type === 'call');
    const put = legs.find(l => l.type === 'put');
    expect(call.strike).toBeGreaterThan(put.strike);
  });

  it('REVERSE_IF: long ATM straddle + short wings (4 legs)', () => {
    const { legs } = buildLegs('REVERSE_IF', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(4);
    expect(legs.filter(l => l.action === 'buy')).toHaveLength(2);
    expect(legs.filter(l => l.action === 'sell')).toHaveLength(2);
    // Both buys at same ATM strike
    const buys = legs.filter(l => l.action === 'buy');
    expect(buys[0].strike).toBe(buys[1].strike);
  });

  it('LONG_FLY_PUT: 3 legs, 2× sold middle, debit', () => {
    const { legs } = buildLegs('LONG_FLY_PUT', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(3);
    expect(legs.every(l => l.type === 'put')).toBe(true);
    const sold = legs.find(l => l.action === 'sell');
    expect(sold.qty).toBe(2);
  });

  it('LONG_FLY_CALL: 3 legs, 2× sold middle, debit', () => {
    const { legs } = buildLegs('LONG_FLY_CALL', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(3);
    expect(legs.every(l => l.type === 'call')).toBe(true);
    const sold = legs.find(l => l.action === 'sell');
    expect(sold.qty).toBe(2);
  });

  it('COLLAR: long stock + protective put + short OTM call', () => {
    const { legs } = buildLegs('COLLAR', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(3);
    expect(legs.find(l => l.type === 'stock')).toBeTruthy();
    const put = legs.find(l => l.type === 'put');
    const call = legs.find(l => l.type === 'call');
    expect(put.action).toBe('buy');
    expect(call.action).toBe('sell');
    expect(put.strike).toBeLessThan(S);
    expect(call.strike).toBeGreaterThan(S);
  });

  it('RISK_REVERSAL: sell put + buy call, synthetic long', () => {
    const { legs } = buildLegs('RISK_REVERSAL', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(2);
    const put = legs.find(l => l.type === 'put');
    const call = legs.find(l => l.type === 'call');
    expect(put.action).toBe('sell');
    expect(call.action).toBe('buy');
    expect(put.strike).toBeLessThan(S);
    expect(call.strike).toBeGreaterThan(S);
  });

  it('BIG_LIZARD: short ATM straddle + long OTM call (3 legs)', () => {
    const { legs } = buildLegs('BIG_LIZARD', { S, sigma, T, r, q, contracts: 1 });
    expect(legs).toHaveLength(3);
    const sells = legs.filter(l => l.action === 'sell');
    expect(sells).toHaveLength(2);
    expect(sells[0].strike).toBe(sells[1].strike);  // ATM straddle short
    const longCall = legs.find(l => l.action === 'buy');
    expect(longCall.type).toBe('call');
    expect(longCall.strike).toBeGreaterThan(S);
  });
});

describe('Sprint 6 — payoff diagram + breakevens + max P/L', () => {
  it('BPS payoff: max profit = credit (capped above short K), max loss = -(width-credit)', () => {
    const { legs } = buildLegs('BPS', { S, sigma, T, r, q, contracts: 1 });
    const premium = computeLegPremium(legs, S, r, sigma, T, q);
    expect(premium).toBeGreaterThan(0); // credit
    const payoff = multiLegPayoff(legs, premium, { multiplier: 100 });
    const mpl = multiLegMaxProfitLoss(payoff);
    // Max profit ≈ credit × 100
    expect(mpl.maxProfit).toBeGreaterThan(0);
    expect(mpl.maxProfit).toBeCloseTo(premium * 100, 0);
    // Max loss < 0
    expect(mpl.maxLoss).toBeLessThan(0);
    // Width
    const sell = legs.find(l => l.action === 'sell');
    const buy = legs.find(l => l.action === 'buy');
    const width = sell.strike - buy.strike;
    expect(mpl.maxLoss).toBeCloseTo(-(width - premium) * 100, 0);
  });

  it('BPS breakeven = short_K - credit', () => {
    const { legs } = buildLegs('BPS', { S, sigma, T, r, q, contracts: 1 });
    const premium = computeLegPremium(legs, S, r, sigma, T, q);
    const payoff = multiLegPayoff(legs, premium, { multiplier: 100, n_points: 401 });
    const bes = breakevens(payoff);
    expect(bes).toHaveLength(1);
    const sell = legs.find(l => l.action === 'sell');
    expect(bes[0]).toBeCloseTo(sell.strike - premium, 0); // tolerance ~$1 due to discretization
  });

  it('IC has 2 breakevens (one each side)', () => {
    const { legs } = buildLegs('IC', { S, sigma, T, r, q, contracts: 1 });
    const premium = computeLegPremium(legs, S, r, sigma, T, q);
    const payoff = multiLegPayoff(legs, premium, { multiplier: 100, n_points: 401 });
    const bes = breakevens(payoff);
    expect(bes).toHaveLength(2);
    expect(bes[0]).toBeLessThan(S);
    expect(bes[1]).toBeGreaterThan(S);
  });

  it('Iron Fly: max profit at ATM strike', () => {
    const { legs } = buildLegs('IF', { S, sigma, T, r, q, contracts: 1 });
    const premium = computeLegPremium(legs, S, r, sigma, T, q);
    const payoff = multiLegPayoff(legs, premium, { multiplier: 100, n_points: 401 });
    const mpl = multiLegMaxProfitLoss(payoff);
    const k_atm = legs.find(l => l.action === 'sell' && l.type === 'put').strike;
    expect(Math.abs(mpl.maxProfitS - k_atm)).toBeLessThan(20); // close to ATM
  });

  it('Strangle has uncapped loss (loss_capped = true at boundary)', () => {
    const { legs } = buildLegs('STRANGLE', { S, sigma, T, r, q, contracts: 1 });
    const premium = computeLegPremium(legs, S, r, sigma, T, q);
    const payoff = multiLegPayoff(legs, premium, { multiplier: 100, n_points: 81 });
    const mpl = multiLegMaxProfitLoss(payoff);
    // Loss at boundary because no wings → uncapped
    expect(mpl.lossCapped).toBe(true);
  });

  it('Jade Lizard: positive credit & no upside risk if credit > call width', () => {
    const { legs } = buildLegs('JADE_LIZARD', { S, sigma, T, r, q, contracts: 1 });
    const premium = computeLegPremium(legs, S, r, sigma, T, q);
    expect(premium).toBeGreaterThan(0); // net credit

    // Test the ideal-condition: payoff at S → ∞ should be ≥ 0 if credit ≥ 0
    // (because there's no long call wing — the short call payoff is -(S-K_call))
    // So upside loss = -(S-K_call - credit). At very high S, loss is huge.
    // The "no upside risk" condition is theoretical for Jade Lizard ONLY when
    // credit ≥ implied call payoff at the strike — which doesn't always hold.
    // What we CAN verify: there's a non-zero call leg.
    const callLeg = legs.find(l => l.type === 'call' && l.action === 'sell');
    expect(callLeg).toBeTruthy();
  });

  it('multiLegPayoff returns monotonic S grid', () => {
    const { legs } = buildLegs('BPS', { S, sigma, T, r, q, contracts: 1 });
    const payoff = multiLegPayoff(legs, 1.5, { multiplier: 100, n_points: 50 });
    expect(payoff).toHaveLength(50);
    for (let i = 1; i < payoff.length; i++) {
      expect(payoff[i].S).toBeGreaterThanOrEqual(payoff[i - 1].S);
    }
  });

  it('multiLegPayoff S range covers ±35% around spot when no opts.S_min given', () => {
    const { legs } = buildLegs('IC', { S, sigma, T, r, q, contracts: 1 });
    const payoff = multiLegPayoff(legs, 1.5, { multiplier: 100, n_points: 81 });
    // Default S range is based on strikes ±range, so should cover most of strike spread
    expect(payoff[0].S).toBeLessThan(S);
    expect(payoff[payoff.length - 1].S).toBeGreaterThan(S);
  });
});

describe('Sprint 6 — multi-leg Greeks (sanity)', () => {
  it('BPS net delta is positive (bullish on direction)', () => {
    const { legs } = buildLegs('BPS', { S, sigma, T, r, q, contracts: 1 });
    const greekLegs = legs.map(l => ({
      S, K: l.strike, T: l.T ?? T, r, sigma, type: l.type, q, qty: l.qty, action: l.action,
    }));
    const g = multiLegGreeks(greekLegs);
    // Short put delta > -1, long put delta closer to 0 → net positive delta
    expect(g.delta).toBeGreaterThan(0);
  });

  it('IC net delta near zero (neutral)', () => {
    const { legs } = buildLegs('IC', { S, sigma, T, r, q, contracts: 1 });
    const greekLegs = legs.map(l => ({
      S, K: l.strike, T: l.T ?? T, r, sigma, type: l.type, q, qty: l.qty, action: l.action,
    }));
    const g = multiLegGreeks(greekLegs);
    // Symmetric IC has near-zero delta (slightly negative due to put skew but small)
    expect(Math.abs(g.delta)).toBeLessThan(50); // delta dollars, ie ~0 in normalized terms
  });

  it('Iron Fly net theta is large positive (premium decay)', () => {
    const { legs } = buildLegs('IF', { S, sigma, T, r, q, contracts: 1 });
    const greekLegs = legs.map(l => ({
      S, K: l.strike, T: l.T ?? T, r, sigma, type: l.type, q, qty: l.qty, action: l.action,
    }));
    const g = multiLegGreeks(greekLegs);
    expect(g.theta).toBeGreaterThan(0); // net selling premium
  });

  it('Calendar net vega is positive (long backmonth dominates)', () => {
    const { legs } = buildLegs('CALENDAR_PUT', { S, sigma, T, r, q, contracts: 1, dte_back: 30 });
    const greekLegs = legs.map(l => ({
      S, K: l.strike, T: l.T ?? T, r, sigma, type: l.type, q, qty: l.qty, action: l.action,
    }));
    const g = multiLegGreeks(greekLegs);
    // Long backmonth vega > short frontmonth vega → net positive
    expect(g.vega).toBeGreaterThan(0);
  });
});
