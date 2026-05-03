import { describe, it, expect } from 'vitest';
import { calcWACC } from '../wacc';

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

  it('weightE + weightD always sum to 1.0', () => {
    const cases = [
      { equity: 800, totalDebt: 200, interestExpense: 10 },
      { equity: 500, totalDebt: 500, interestExpense: 25 },
      { equity: 1000, totalDebt: 0, interestExpense: 0 },
      { equity: 100, totalDebt: 900, interestExpense: 45 },
    ];
    for (const c of cases) {
      const r = calcWACC(c);
      expect(r.weightE + r.weightD).toBeCloseTo(1.0, 10);
    }
  });

  it('costEquity = riskFree + beta * marketPremium', () => {
    const r = calcWACC({
      equity: 1000, totalDebt: 0, interestExpense: 0,
      taxRate: 0.25, beta: 1.5, riskFreeRate: 0.035, marketPremium: 0.06,
    });
    expect(r.costEquity).toBeCloseTo(0.035 + 1.5 * 0.06, 6);
  });

  it('after-tax cost of debt = pretax * (1 - taxRate)', () => {
    // equity=500, debt=500, interest=25 → pretax=0.05, after-tax=0.05*(1-0.25)=0.0375
    const r = calcWACC({ equity: 500, totalDebt: 500, interestExpense: 25, taxRate: 0.25 });
    expect(r.costDebt).toBeCloseTo(0.05 * (1 - 0.25), 6);
  });

  it('high-debt company has WACC dominated by debt cost', () => {
    // 90% debt, 10% equity
    const r = calcWACC({
      equity: 100, totalDebt: 900, interestExpense: 36,
      taxRate: 0.25, beta: 1.0, riskFreeRate: 0.04, marketPremium: 0.055,
    });
    // cost of debt (after-tax) ≈ 0.04 * 0.75 = 0.03
    // cost of equity ≈ 0.04 + 1 * 0.055 = 0.095
    // wacc ≈ 0.10 * 0.095 + 0.90 * 0.03 = 0.0365
    expect(r.wacc).toBeCloseTo(0.1 * r.costEquity + 0.9 * r.costDebt, 6);
  });
});
