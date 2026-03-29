import { describe, it, expect } from 'vitest';
import { calcGrowthRate } from '../growthRate.js';

describe('calcGrowthRate', () => {
  it('calculates sustainable growth rate', () => {
    const r = calcGrowthRate({
      netIncome: 100, equity: 500, dps: 2, sharesOut: 10,
    });
    // ROE = 100/500 = 0.20
    // payout = (2*10)/100 = 0.20
    // retention = 0.80
    // sustainable = 0.20 * 0.80 = 0.16
    expect(r.roe).toBeCloseTo(0.20);
    expect(r.payoutRatio).toBeCloseTo(0.20);
    expect(r.retentionRate).toBeCloseTo(0.80);
    expect(r.sustainableGrowth).toBeCloseTo(0.16);
  });

  it('handles company that pays no dividends', () => {
    const r = calcGrowthRate({
      netIncome: 200, equity: 1000, dps: 0, sharesOut: 50,
    });
    expect(r.payoutRatio).toBe(0);
    expect(r.retentionRate).toBe(1);
    expect(r.sustainableGrowth).toBeCloseTo(0.20);
  });

  it('caps retention at 0 when payout > 100%', () => {
    const r = calcGrowthRate({
      netIncome: 10, equity: 500, dps: 5, sharesOut: 50,
    });
    // payout = (5*50)/10 = 25 (250%)
    expect(r.retentionRate).toBe(0);
    expect(r.sustainableGrowth).toBe(0);
  });

  it('handles zero equity gracefully', () => {
    const r = calcGrowthRate({
      netIncome: 100, equity: 0, dps: 1, sharesOut: 10,
    });
    // div(100, 0) returns null, so roe is null
    expect(r.sustainableGrowth).toBe(0);
  });
});
