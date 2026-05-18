import { describe, it, expect } from 'vitest';
import {
  calcPortfolioWeights,
  calcConcentrationBy,
  mergeWeightedAvgCost,
  mergePositionRows,
  toUsd,
  calcTotalInvertidoUsd,
  detectFxInconsistencies,
} from '../portfolioMetrics';

const FX = { USD: 1, EUR: 0.92, GBP: 0.79, HKD: 7.78, CAD: 1.35, AUD: 1.52 };

describe('calcPortfolioWeights — usd_value only', () => {
  it('weights sum to 100%', () => {
    const positions = [
      { ticker: 'KO', usd_value: 100000 },
      { ticker: 'PG', usd_value: 50000 },
      { ticker: 'JNJ', usd_value: 50000 },
    ];
    const weights = calcPortfolioWeights(positions);
    const sum = weights.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeCloseTo(1.0, 6);
    expect(weights[0].weightPct).toBeCloseTo(50);
  });

  it('regression Bug #014: HKD positions must use usd_value not market_value', () => {
    // HKG:2219 con market_value 100000 HKD = solo $12.8K USD
    // Bug viejo lo trataba como $100K → 4% NAV → trigger TRIM
    const positions = [
      { ticker: 'KO', usd_value: 100000, market_value: 100000, currency: 'USD' },
      { ticker: 'HKG:2219', usd_value: 12850, market_value: 100000, currency: 'HKD' },
    ];
    const weights = calcPortfolioWeights(positions);
    // KO debe ser 89% NAV, HKG:2219 solo 11%
    const ko = weights.find(w => w.ticker === 'KO');
    const hkg = weights.find(w => w.ticker === 'HKG:2219');
    expect(ko.weightPct).toBeGreaterThan(80);
    expect(hkg.weightPct).toBeLessThan(15);
  });

  it('handles zero total gracefully', () => {
    const weights = calcPortfolioWeights([{ ticker: 'X', usd_value: 0 }]);
    expect(weights[0].weight).toBe(0);
    expect(weights[0].weightPct).toBe(0);
  });

  it('returns empty array for empty input', () => {
    expect(calcPortfolioWeights([])).toEqual([]);
  });
});

describe('calcConcentrationBy', () => {
  it('groups by currency', () => {
    const positions = [
      { ticker: 'KO', usd_value: 50000, currency: 'USD' },
      { ticker: 'PG', usd_value: 30000, currency: 'USD' },
      { ticker: 'TEF.MC', usd_value: 20000, currency: 'EUR' },
    ];
    const conc = calcConcentrationBy(positions, p => p.currency);
    expect(conc.USD).toBeCloseTo(0.80);
    expect(conc.EUR).toBeCloseTo(0.20);
  });

  it('groups by sector with null safety', () => {
    const positions = [
      { ticker: 'KO', usd_value: 100, sector: 'Consumer Staples' },
      { ticker: 'XOM', usd_value: 100, sector: 'Energy' },
      { ticker: 'NEW', usd_value: 50, sector: null },  // unclassified
    ];
    const conc = calcConcentrationBy(positions, p => p.sector);
    expect(conc['Consumer Staples']).toBeCloseTo(100 / 250);
    expect(conc['Energy']).toBeCloseTo(100 / 250);
    // Null sector excluded — sum < 1
    const sum = Object.values(conc).reduce((s, v) => s + v, 0);
    expect(sum).toBeLessThan(1);
  });
});

describe('mergeWeightedAvgCost — weighted by shares', () => {
  it('weighted average for multi-account same ticker', () => {
    // Account A: 100 shares @ $50, Account B: 50 shares @ $60
    // Weighted = (100*50 + 50*60) / 150 = 8000/150 = 53.33
    const r = mergeWeightedAvgCost(100, 50, 50, 60);
    expect(r.shares).toBe(150);
    expect(r.avgCost).toBeCloseTo(53.333, 2);
  });

  it('regression: NO simple average ((50+60)/2 = 55) when shares dispar', () => {
    const r = mergeWeightedAvgCost(100, 50, 5, 200);
    // Weighted = (100*50 + 5*200) / 105 = (5000 + 1000) / 105 = 57.14
    // Simple avg sería (50+200)/2 = 125 ← WRONG
    expect(r.avgCost).toBeCloseTo(57.14, 1);
    expect(r.avgCost).toBeLessThan(125);
  });

  it('handles zero new shares', () => {
    const r = mergeWeightedAvgCost(100, 50, 0, 0);
    expect(r.shares).toBe(100);
    expect(r.avgCost).toBe(50);
  });

  it('handles fully sold (totalShares = 0)', () => {
    const r = mergeWeightedAvgCost(100, 50, -100, 60);
    expect(r.shares).toBe(0);
    // Avg cost retained for cost basis purposes
    expect(r.avgCost).toBeDefined();
  });
});

describe('mergePositionRows — multi-account fusion', () => {
  it('fuses 3 accounts of same ticker', () => {
    const rows = [
      { ticker: 'PG', shares: 50, avgCost: 100, market_value: 5500, usd_value: 5500, pnl: 500, currency: 'USD', account: 'U1' },
      { ticker: 'PG', shares: 30, avgCost: 110, market_value: 3300, usd_value: 3300, pnl: 0, currency: 'USD', account: 'U2' },
      { ticker: 'PG', shares: 20, avgCost: 90, market_value: 2200, usd_value: 2200, pnl: 400, currency: 'USD', account: 'U3' },
    ];
    const merged = mergePositionRows(rows);
    expect(merged.shares).toBe(100);
    // Weighted = (50*100 + 30*110 + 20*90) / 100 = (5000+3300+1800)/100 = 101
    expect(merged.avgCost).toBeCloseTo(101.0, 3);
    expect(merged.usd_value).toBe(11000);
    expect(merged.pnl).toBe(900);
    expect(merged.account).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(mergePositionRows([])).toBeNull();
    expect(mergePositionRows(null)).toBeNull();
  });

  it('returns copy of single row when only one', () => {
    const rows = [{ ticker: 'KO', shares: 100, avgCost: 50 }];
    const m = mergePositionRows(rows);
    expect(m.ticker).toBe('KO');
    expect(m.shares).toBe(100);
    // Must be a different object reference (no mutation)
    expect(m).not.toBe(rows[0]);
  });
});

describe('toUsd — currency conversion with GBX handling', () => {
  it('USD passthrough', () => {
    expect(toUsd(1000, 'USD', FX)).toBe(1000);
  });

  it('EUR → USD', () => {
    // 920 EUR / 0.92 = 1000 USD
    expect(toUsd(920, 'EUR', FX)).toBeCloseTo(1000);
  });

  it('GBX (pence) → USD with /100', () => {
    // 79000 pence = 790 GBP = 1000 USD
    expect(toUsd(79000, 'GBX', FX)).toBeCloseTo(1000);
  });

  it('HKD → USD with proper rate', () => {
    // 7780 HKD / 7.78 = 1000 USD
    expect(toUsd(7780, 'HKD', FX)).toBeCloseTo(1000);
  });

  it('no fxRates returns original amount', () => {
    expect(toUsd(1000, 'EUR', null)).toBe(1000);
  });

  it('unknown currency returns original', () => {
    expect(toUsd(1000, 'XYZ', FX)).toBe(1000);
  });
});

describe('calcTotalInvertidoUsd — multi-currency aggregation', () => {
  it('mixed USD + EUR + GBX with proper FX conversion', () => {
    const positions = [
      { ticker: 'KO', shares: 100, avgCost: 50, currency: 'USD' },     // $5,000
      { ticker: 'TEF.MC', shares: 200, avgCost: 5, currency: 'EUR' },  // €1,000 = $1,086.96
      { ticker: 'ULVR.L', shares: 50, avgCost: 4000, currency: 'GBX' },// 200,000 pence = £2,000 = $2,531.65
    ];
    const total = calcTotalInvertidoUsd(positions, FX);
    expect(total).toBeCloseTo(5000 + 1000/0.92 + (50*4000/100)/0.79, 1);
  });

  it('skips positions with shares <= 0', () => {
    const positions = [
      { ticker: 'KO', shares: 100, avgCost: 50, currency: 'USD' },
      { ticker: 'PG', shares: 0, avgCost: 100, currency: 'USD' },     // saltado
      { ticker: 'JNJ', shares: -5, avgCost: 150, currency: 'USD' },   // short, saltado
    ];
    const total = calcTotalInvertidoUsd(positions, FX);
    expect(total).toBe(5000);
  });
});

describe('detectFxInconsistencies — guard against currency mismatch', () => {
  it('flags positions where reported usd_value diverges >5% from computed', () => {
    const positions = [
      // OK: HKD position correct
      { ticker: 'GOOD', market_value: 7780, currency: 'HKD', usd_value: 1000 },
      // BUG: RED stored as USD but is EUR (real bug from session)
      { ticker: 'RED.MC', market_value: 1000, currency: 'USD', usd_value: 1000 },
      // Same row corrected — currency EUR makes consistent
      // Inconsistent: HKG position with stale FX
      { ticker: 'STALE', market_value: 7780, currency: 'HKD', usd_value: 700 },  // wrong
    ];
    const issues = detectFxInconsistencies(positions, FX);
    expect(issues.find(i => i.ticker === 'STALE')).toBeTruthy();
    expect(issues.find(i => i.ticker === 'GOOD')).toBeFalsy();
  });

  it('returns empty when fxRates is null', () => {
    expect(detectFxInconsistencies([{ ticker: 'X', market_value: 100, currency: 'EUR' }], null)).toEqual([]);
  });
});
