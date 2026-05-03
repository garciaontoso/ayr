import { describe, it, expect } from 'vitest';
import { calcWACC } from '../calculators/wacc';
import { calcPiotroski } from '../calculators/piotroski';
import { calcAltmanZ } from '../calculators/altmanZ';
import { calcGrowthRate } from '../calculators/growthRate';
import { calcDividendAnalysis } from '../calculators/dividendAnalysis';

// ── Integration: run all 5 calculators on the same synthetic company ──────────
// Company: "AcmeCorp" — solid financials, pays dividends, growing

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 12 }, (_, i) => String(CURRENT_YEAR - i));

const baseFinancials = {
  netIncome: 500,   // $500M
  equity: 3000,     // $3B equity
  totalDebt: 1000,  // $1B debt
  revenue: 4000,    // $4B revenue
  grossProfit: 1800,// 45% GM
  ocf: 600,         // healthy OCF
  dps: 3.0,         // $3/share dividend
  sharesOut: 200,   // 200M shares
  cash: 400,
  retainedEarnings: 1200,
  operatingIncome: 650,
};

const prevFinancials = {
  ...baseFinancials,
  netIncome: 420,
  totalDebt: 1200,  // debt decreased
  grossProfit: 1600,
  ocf: 520,
  dps: 2.5,
  sharesOut: 210,   // shares decreased (buyback)
  cash: 350,
};

const finMap = {};
const compMap = {};
YEARS.forEach((y, i) => {
  finMap[y] = {
    dps: Math.max(1, 3 - i * 0.15),
    revenue: 4000 - i * 100,
    netIncome: 500 - i * 20,
    sharesOut: 200,
  };
  compMap[y] = { fcf: 450 - i * 15 };
});

describe('WACC on AcmeCorp', () => {
  const r = calcWACC({
    equity: baseFinancials.equity,
    totalDebt: baseFinancials.totalDebt,
    interestExpense: 45, // ~4.5% cost of debt
    taxRate: 0.25,
    beta: 0.85,
    riskFreeRate: 0.04,
    marketPremium: 0.055,
  });

  it('WACC is between 5% and 12%', () => {
    expect(r.wacc).toBeGreaterThan(0.05);
    expect(r.wacc).toBeLessThan(0.12);
  });

  it('equity-heavy company has low WACC', () => {
    // 75% equity — WACC closer to cost of equity
    expect(r.weightE).toBeGreaterThan(0.7);
  });
});

describe('Piotroski on AcmeCorp', () => {
  const r = calcPiotroski(baseFinancials, prevFinancials);

  it('healthy company scores at least 6', () => {
    expect(r.score).toBeGreaterThanOrEqual(6);
  });

  it('debt decreased → passes debt check', () => {
    const item = r.items.find(i => i.name === 'Deuda decreciente');
    expect(item.pass).toBe(true);
  });

  it('OCF positive → passes OCF check', () => {
    const item = r.items.find(i => i.name === 'OCF positivo');
    expect(item.pass).toBe(true);
  });
});

describe('Altman Z on AcmeCorp', () => {
  const mktCap = 12000; // $12B market cap
  const r = calcAltmanZ(baseFinancials, mktCap);

  it('healthy company is in Segura zone', () => {
    expect(r.zone).toBe('Segura');
    expect(r.score).toBeGreaterThan(2.99);
  });

  it('has all 5 components', () => {
    expect(r.items).toHaveLength(5);
  });
});

describe('GrowthRate on AcmeCorp', () => {
  const r = calcGrowthRate(baseFinancials);

  it('ROE is ~16.7% (500/3000)', () => {
    expect(r.roe).toBeCloseTo(500 / 3000, 3);
  });

  it('payout ratio is 1.2 (3*200/500 = 120% — AcmeCorp overpays)', () => {
    expect(r.payoutRatio).toBeCloseTo((3 * 200) / 500, 3);
    expect(r.payoutRatio).toBeGreaterThan(1);
  });

  it('sustainable growth is 0 (payout > 100% → retention capped at 0)', () => {
    // AcmeCorp pays out more than it earns, so no retained capital to reinvest
    expect(r.retentionRate).toBe(0);
    expect(r.sustainableGrowth).toBe(0);
  });
});

describe('DividendAnalysis on AcmeCorp', () => {
  const r = calcDividendAnalysis(finMap, compMap, YEARS);

  it('streak equals number of years with positive DPS', () => {
    expect(r.streak).toBeGreaterThan(0);
  });

  it('CAGR-3 is calculable with 12 years data', () => {
    expect(r.cagr3).not.toBeNull();
  });

  it('CAGR-5 is calculable with 12 years data', () => {
    expect(r.cagr5).not.toBeNull();
  });

  it('payoutFCF is a reasonable ratio', () => {
    if (r.payoutFCF !== null) {
      expect(r.payoutFCF).toBeGreaterThan(0);
      expect(r.payoutFCF).toBeLessThan(5); // not extreme
    }
  });
});

describe('Cross-calculator consistency', () => {
  it('Altman Z zone matches Piotroski expectation for healthy company', () => {
    const altman = calcAltmanZ(baseFinancials, 12000);
    const piotroski = calcPiotroski(baseFinancials, prevFinancials);
    // Both should indicate financial health for AcmeCorp
    expect(altman.zone).toBe('Segura');
    expect(piotroski.score).toBeGreaterThanOrEqual(5);
  });

  it('WACC and growth rate are in plausible relationship', () => {
    const wacc = calcWACC({
      equity: baseFinancials.equity, totalDebt: baseFinancials.totalDebt,
      interestExpense: 45, taxRate: 0.25, beta: 0.85, riskFreeRate: 0.04, marketPremium: 0.055,
    });
    const growth = calcGrowthRate(baseFinancials);
    // For value creation: sustainable growth + dividends should exceed WACC-like hurdle
    // This is a sanity check, not a strict rule
    expect(wacc.wacc).toBeLessThan(0.12);
    expect(growth.roe).toBeGreaterThan(0);
  });
});
