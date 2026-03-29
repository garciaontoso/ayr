import { describe, it, expect } from 'vitest';
import { calcWACC } from '../wacc.js';

describe('calcWACC', () => {
  it('calculates WACC with typical inputs', () => {
    const r = calcWACC({
      equity: 800, totalDebt: 200, interestExpense: 10,
      taxRate: 0.25, beta: 1.2, riskFreeRate: 0.04, marketPremium: 0.055,
    });
    // costEquity=0.106, costDebt=0.05*(1-0.25)=0.0375
    // wacc = 0.8*0.106 + 0.2*0.0375 = 0.0923
    expect(r.wacc).toBeCloseTo(0.0923, 3);
    expect(r.costEquity).toBeCloseTo(0.106, 3);
    expect(r.weightE).toBeCloseTo(0.8);
    expect(r.weightD).toBeCloseTo(0.2);
  });

  it('handles zero debt', () => {
    const r = calcWACC({ equity: 1000, totalDebt: 0, interestExpense: 0 });
    expect(r.weightD).toBe(0);
    expect(r.wacc).toBeCloseTo(r.costEquity, 6);
  });

  it('uses defaults for missing optional params', () => {
    const r = calcWACC({ equity: 500, totalDebt: 500, interestExpense: 25 });
    expect(r.wacc).toBeGreaterThan(0);
    expect(r.wacc).toBeLessThan(0.15);
  });

  it('handles null equity gracefully (falls back to 1)', () => {
    const r = calcWACC({ equity: null, totalDebt: 100, interestExpense: 5 });
    expect(r.wacc).toBeGreaterThan(0);
    expect(isFinite(r.wacc)).toBe(true);
  });
});
