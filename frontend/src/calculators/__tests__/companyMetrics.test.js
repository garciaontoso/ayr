import { describe, it, expect } from 'vitest';
import {
  calcEbitdaRobust,
  calcFcfAllocation,
  calcRoeSafe,
  calcPbSafe,
  calcRoicSafe,
  calcFcfDivCoverage,
  calcYoc,
  calcNetDebt,
  isNetCash,
} from '../companyMetrics';

describe('calcEbitdaRobust — REIT proxy logic', () => {
  it('uses accounting EBITDA for industrials (margin > 10%)', () => {
    // KO 2024: revenue 47B, opInc 13B, D&A 1.1B → accounting EBITDA 14.1B (30%)
    const r = calcEbitdaRobust({ revenue: 47000, operatingIncome: 13000, depreciation: 1100, ocf: 12000, interestExpense: 500 });
    expect(r.source).toBe('accounting');
    expect(r.ebitda).toBe(14100);
  });

  it('switches to proxy when accounting EBITDA < 10% revenue (REIT case)', () => {
    // Realty Income 2024: revenue 5B, opInc 600M, D&A 1.5B → accounting EBITDA 2.1B (42%)
    // pero después de ajustes contables a veces queda en 4% rev
    const r = calcEbitdaRobust({ revenue: 5000, operatingIncome: 50, depreciation: 150, ocf: 4200, interestExpense: 800 });
    // accounting = 200 (4% rev) → cae a proxy = 5000
    expect(r.source).toBe('proxy');
    expect(r.ebitda).toBe(5000);
    expect(r.ebitdaAccounting).toBe(200);
    expect(r.ebitdaProxy).toBe(5000);
  });

  it('uses proxy when operatingIncome is negative', () => {
    const r = calcEbitdaRobust({ revenue: 1000, operatingIncome: -50, depreciation: 100, ocf: 200, interestExpense: 30 });
    expect(r.source).toBe('proxy');
    expect(r.ebitda).toBe(230);
  });

  it('returns unknown when all data is zero', () => {
    const r = calcEbitdaRobust({});
    expect(r.source).toBe('unknown');
    expect(r.ebitda).toBe(0);
  });

  it('keeps accounting if proxy is also bad', () => {
    // No OCF data → no proxy available
    const r = calcEbitdaRobust({ revenue: 1000, operatingIncome: 80, depreciation: 10, ocf: 0, interestExpense: 0 });
    // accounting 90 = 9% rev (< 10%) but proxy 0 — keep accounting
    expect(r.source).toBe('accounting');
    expect(r.ebitda).toBe(90);
  });
});

describe('calcFcfAllocation — retained CAN be negative', () => {
  it('typical KO allocation: positive retained', () => {
    // OCF 12B, CapEx 2B → FCF 10B
    // Divs 8B, Buybacks 1B, debt 0, acq 0 → retained 1B
    const r = calcFcfAllocation({ ocf: 12000, capex: 2000, dividendsPaid: 8000, buybacks: 1000, debtRepayment: 0, acquisitions: 0 });
    expect(r.fcf).toBe(10000);
    expect(r.totalDistributed).toBe(9000);
    expect(r.retained).toBe(1000);
    expect(r.overdistributing).toBe(false);
    expect(r.payoutPctOfFcf).toBe(0.9);
  });

  it('overdistributing company shows NEGATIVE retained (Phil Town red flag)', () => {
    // Empresa paga más en divs+buybacks que FCF
    const r = calcFcfAllocation({ ocf: 1000, capex: 200, dividendsPaid: 500, buybacks: 400, debtRepayment: 200, acquisitions: 100 });
    // FCF 800, distributed 1200 → retained -400
    expect(r.fcf).toBe(800);
    expect(r.retained).toBe(-400);
    expect(r.overdistributing).toBe(true);
    expect(r.payoutPctOfFcf).toBe(1.5);
  });

  it('regression: Math.max(0, retained) bug NO debe esconder negativo', () => {
    // Si alguien re-introdujera el bug, este test falla
    const r = calcFcfAllocation({ ocf: 100, capex: 50, dividendsPaid: 200 });
    // FCF 50, distributed 200 → retained -150
    expect(r.retained).toBe(-150);
    expect(r.retained).toBeLessThan(0);  // EXPLICIT: must remain negative
  });

  it('zero FCF returns null payoutPctOfFcf', () => {
    const r = calcFcfAllocation({ ocf: 100, capex: 100 });
    expect(r.fcf).toBe(0);
    expect(r.payoutPctOfFcf).toBeNull();
    expect(r.overdistributing).toBe(false);
  });

  it('handles undefined fields gracefully', () => {
    const r = calcFcfAllocation({});
    expect(r.fcf).toBe(0);
    expect(r.divs).toBe(0);
    expect(r.retained).toBe(0);
  });
});

describe('calcRoeSafe — negative equity returns null', () => {
  it('typical case: 15% ROE', () => {
    expect(calcRoeSafe(150, 1000)).toBe(0.15);
  });

  it('MCD pattern: negative equity → null (not -300%)', () => {
    // MCD: NI = 8.5B, equity = -3.7B (buybacks > book value)
    // ROE crude = -230% → MUST return null
    expect(calcRoeSafe(8500, -3700)).toBeNull();
  });

  it('zero equity returns null', () => {
    expect(calcRoeSafe(100, 0)).toBeNull();
  });

  it('null inputs return null', () => {
    expect(calcRoeSafe(null, 100)).toBeNull();
    expect(calcRoeSafe(100, null)).toBeNull();
    expect(calcRoeSafe(undefined, undefined)).toBeNull();
  });

  it('NaN / Infinity returns null', () => {
    expect(calcRoeSafe(NaN, 100)).toBeNull();
    expect(calcRoeSafe(100, Infinity)).toBeNull();
  });
});

describe('calcPbSafe — negative or zero equity returns null', () => {
  it('typical case: P/B = 3', () => {
    // price 30, shares 100, equity 1000 → bvps 10 → P/B 3
    expect(calcPbSafe(30, 100, 1000)).toBe(3);
  });

  it('negative equity returns null (BA/HD pattern)', () => {
    expect(calcPbSafe(100, 100, -500)).toBeNull();
  });

  it('zero sharesOut returns null', () => {
    expect(calcPbSafe(30, 0, 1000)).toBeNull();
  });
});

describe('calcRoicSafe — REIT-aware', () => {
  it('typical industrial: 15% ROIC', () => {
    const curr = { operatingIncome: 200, equity: 500, totalDebt: 300, cash: 50 };
    const prev = { operatingIncome: 180, equity: 480, totalDebt: 310, cash: 40 };
    // ndCurr 250, invCapCurr 750, ndPrev 270, invCapPrev 750 → avg 750
    // ROIC = 200 * 0.75 / 750 = 0.20
    const r = calcRoicSafe(curr, prev, 25);
    expect(r).toBeCloseTo(0.20, 3);
  });

  it('returns null if avg invested capital ≤ 0', () => {
    // Negative equity + small debt
    const curr = { operatingIncome: 100, equity: -500, totalDebt: 100, cash: 0 };
    const r = calcRoicSafe(curr, null, 25);
    expect(r).toBeNull();
  });

  it('returns null if operating income ≤ 0', () => {
    const curr = { operatingIncome: -10, equity: 500, totalDebt: 100, cash: 50 };
    expect(calcRoicSafe(curr, null, 25)).toBeNull();
  });
});

describe('calcFcfDivCoverage', () => {
  it('healthy 2x coverage', () => {
    expect(calcFcfDivCoverage(2000, 1000)).toBe(2);
  });

  it('tight 1.1x coverage (REIT typical)', () => {
    expect(calcFcfDivCoverage(1100, 1000)).toBeCloseTo(1.1);
  });

  it('null when dividendsPaid ≤ 0', () => {
    expect(calcFcfDivCoverage(1000, 0)).toBeNull();
    expect(calcFcfDivCoverage(1000, null)).toBeNull();
  });
});

describe('calcYoc — must use adjustedBasis', () => {
  it('YOC with original cost basis', () => {
    // KO bought at $20, now pays $2/yr → YOC 10%
    expect(calcYoc(2, 20)).toBeCloseTo(0.10);
  });

  it('YOC much lower with adjusted basis (post DRIP)', () => {
    // Same KO but DRIP-adjusted basis $30 → YOC 6.7%
    expect(calcYoc(2, 30)).toBeCloseTo(2 / 30, 6);
  });

  it('null when adjustedBasis ≤ 0', () => {
    expect(calcYoc(2, 0)).toBeNull();
    expect(calcYoc(2, -5)).toBeNull();
    expect(calcYoc(2, null)).toBeNull();
  });
});

describe('calcNetDebt + isNetCash', () => {
  it('typical leveraged company has positive net debt', () => {
    expect(calcNetDebt(1000, 200)).toBe(800);
  });

  it('net cash company (AAPL) shows negative', () => {
    expect(calcNetDebt(100, 500)).toBe(-400);
  });

  it('isNetCash flag', () => {
    expect(isNetCash({ totalDebt: 100, cash: 500 })).toBe(true);
    expect(isNetCash({ totalDebt: 1000, cash: 200 })).toBe(false);
  });

  it('handles undefined gracefully', () => {
    expect(calcNetDebt(undefined, undefined)).toBe(0);
    expect(calcNetDebt(null, null)).toBe(0);
  });
});
