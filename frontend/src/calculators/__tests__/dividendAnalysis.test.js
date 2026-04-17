import { describe, it, expect } from 'vitest';
import { calcDividendAnalysis } from '../dividendAnalysis.js';

const makeYears = (count) => Array.from({ length: count }, (_, i) => String(2024 - i));

describe('calcDividendAnalysis', () => {
  it('returns zero streak with insufficient data', () => {
    const r = calcDividendAnalysis({}, {}, ['2024']);
    expect(r.streak).toBe(0);
    expect(r.cagr3).toBeNull();
  });

  it('calculates streak correctly', () => {
    const YEARS = makeYears(6);
    const fin = {};
    YEARS.forEach((y, i) => { fin[y] = { dps: 2 + i * 0.1, revenue: 1000, netIncome: 100, sharesOut: 50 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    expect(r.streak).toBe(6);
  });

  it('breaks streak on missing dividend', () => {
    const YEARS = makeYears(5);
    const fin = {};
    YEARS.forEach(y => { fin[y] = { dps: 2, revenue: 1000 }; });
    fin[YEARS[2]] = { dps: 0, revenue: 1000 }; // break at year 3
    const r = calcDividendAnalysis(fin, {}, YEARS);
    expect(r.streak).toBe(2);
  });

  it('calculates CAGR-3 correctly', () => {
    const YEARS = makeYears(5);
    const fin = {};
    // DPS: 2024=4, 2023=3.5, 2022=3, 2021=2.5, 2020=2
    YEARS.forEach((y, i) => { fin[y] = { dps: 4 - i * 0.5, revenue: 1000 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    // cagr3 = (4/2.5)^(1/3) - 1 ≈ 0.1696
    expect(r.cagr3).toBeCloseTo(0.1696, 3);
  });

  it('calculates payout ratios', () => {
    const YEARS = makeYears(3);
    const fin = {
      '2024': { dps: 2, sharesOut: 50, netIncome: 200, revenue: 1000 },
      '2023': { dps: 1.8, revenue: 900 },
      '2022': { dps: 1.6, revenue: 800 },
    };
    const comp = { '2024': { fcf: 250 } };
    const r = calcDividendAnalysis(fin, comp, YEARS);
    // payoutEarnings = (2*50)/200 = 0.5
    expect(r.payoutEarnings).toBeCloseTo(0.5);
    // payoutFCF = (2*50)/250 = 0.4
    expect(r.payoutFCF).toBeCloseTo(0.4);
  });

  it('returns null CAGR when not enough years', () => {
    const YEARS = makeYears(3);
    const fin = {};
    YEARS.forEach(y => { fin[y] = { dps: 2, revenue: 100 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    expect(r.cagr5).toBeNull();
    expect(r.cagr10).toBeNull();
  });

  it('calculates CAGR-5 with at least 6 years', () => {
    const YEARS = makeYears(7);
    const fin = {};
    // DPS: year[0]=6, year[5]=3 → CAGR5 = (6/3)^(1/5)-1 ≈ 0.1487
    YEARS.forEach((y, i) => { fin[y] = { dps: 6 - i * 0.5, revenue: 1000 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    expect(r.cagr5).not.toBeNull();
    expect(r.cagr5).toBeGreaterThan(0);
  });

  it('calculates CAGR-10 with at least 11 years', () => {
    const YEARS = makeYears(12);
    const fin = {};
    YEARS.forEach((y, i) => { fin[y] = { dps: 5 - i * 0.2, revenue: 1000 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    expect(r.cagr10).not.toBeNull();
    expect(r.cagr10).toBeGreaterThan(0);
  });

  it('returns years array containing only years with dps > 0', () => {
    const YEARS = makeYears(5);
    const fin = {};
    YEARS.forEach((y, i) => { fin[y] = { dps: i === 2 ? 0 : 2, revenue: 100 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    // year[2] has dps=0, so it should be excluded
    expect(r.years).not.toContain(YEARS[2]);
  });

  it('payoutFCF returns null when FCF is 0', () => {
    const YEARS = makeYears(3);
    const fin = {};
    YEARS.forEach(y => { fin[y] = { dps: 2, sharesOut: 50, netIncome: 200, revenue: 1000 }; });
    const comp = { [YEARS[0]]: { fcf: 0 } };
    const r = calcDividendAnalysis(fin, comp, YEARS);
    expect(r.payoutFCF).toBeNull();
  });

  it('returns years array from calcDividendAnalysis', () => {
    const YEARS = makeYears(6);
    const fin = {};
    YEARS.forEach(y => { fin[y] = { dps: 2, revenue: 100 }; });
    const r = calcDividendAnalysis(fin, {}, YEARS);
    expect(Array.isArray(r.years)).toBe(true);
    expect(r.years).toHaveLength(6);
  });
});
