import { describe, it, expect } from 'vitest';
import { calcAltmanZ } from '../altmanZ.js';

describe('calcAltmanZ', () => {
  it('returns null score with no data', () => {
    const r = calcAltmanZ(null, 0);
    expect(r.score).toBeNull();
    expect(r.zone).toBe('—');
  });

  it('returns null if revenue is 0', () => {
    const r = calcAltmanZ({ revenue: 0, equity: 100, totalDebt: 50 }, 1000);
    expect(r.score).toBeNull();
  });

  it('classifies a healthy company as "Segura"', () => {
    const data = {
      equity: 800, totalDebt: 200, cash: 300,
      retainedEarnings: 500, operatingIncome: 150,
      revenue: 1200,
    };
    const r = calcAltmanZ(data, 5000);
    expect(r.score).toBeGreaterThan(2.99);
    expect(r.zone).toBe('Segura');
  });

  it('classifies a risky company as "Peligro"', () => {
    const data = {
      equity: 100, totalDebt: 900, cash: 50,
      retainedEarnings: -200, operatingIncome: 10,
      revenue: 300,
    };
    const r = calcAltmanZ(data, 50);
    expect(r.score).toBeLessThan(1.81);
    expect(r.zone).toBe('Peligro');
  });

  it('returns 5 items with correct labels', () => {
    const data = {
      equity: 500, totalDebt: 500, cash: 200,
      retainedEarnings: 300, operatingIncome: 100, revenue: 800,
    };
    const r = calcAltmanZ(data, 2000);
    expect(r.items).toHaveLength(5);
    expect(r.items[0].name).toContain('Working Cap');
    expect(r.items[4].name).toContain('Sales');
  });

  it('handles zero totalDebt in D component', () => {
    const data = {
      equity: 1000, totalDebt: 0, cash: 500,
      retainedEarnings: 400, operatingIncome: 200, revenue: 1500,
    };
    const r = calcAltmanZ(data, 3000);
    // D = 0.6 * (mktCap / 1) — uses fallback divisor of 1
    expect(r.score).toBeGreaterThan(0);
    expect(isFinite(r.score)).toBe(true);
  });

  it('classifies a grey-zone company as "Gris"', () => {
    // Construct a company that lands in 1.81 < z < 2.99
    // Verified: equity=600, debt=400, cash=150, re=100, ebit=100, rev=700, mktCap=800 → z≈2.41
    const data = {
      equity: 600, totalDebt: 400, cash: 150,
      retainedEarnings: 100, operatingIncome: 100,
      revenue: 700,
    };
    const r = calcAltmanZ(data, 800);
    expect(r.score).toBeGreaterThan(1.81);
    expect(r.score).toBeLessThan(2.99);
    expect(r.zone).toBe('Gris');
  });

  it('zoneColor is green for Segura', () => {
    const data = {
      equity: 900, totalDebt: 100, cash: 400,
      retainedEarnings: 600, operatingIncome: 200, revenue: 1500,
    };
    const r = calcAltmanZ(data, 8000);
    expect(r.zone).toBe('Segura');
    expect(r.zoneColor).toBe('var(--green)');
  });

  it('zoneColor is red for Peligro', () => {
    const data = {
      equity: 50, totalDebt: 950, cash: 20,
      retainedEarnings: -300, operatingIncome: 5, revenue: 200,
    };
    const r = calcAltmanZ(data, 20);
    expect(r.zone).toBe('Peligro');
    expect(r.zoneColor).toBe('var(--red)');
  });

  it('weighted values in items sum to overall score', () => {
    const data = {
      equity: 500, totalDebt: 500, cash: 200,
      retainedEarnings: 300, operatingIncome: 100, revenue: 800,
    };
    const r = calcAltmanZ(data, 2000);
    const sumWeighted = r.items.reduce((acc, i) => acc + i.weighted, 0);
    expect(sumWeighted).toBeCloseTo(r.score, 6);
  });

  it('returns empty items array on null input', () => {
    expect(calcAltmanZ(null, 1000).items).toHaveLength(0);
  });

  it('handles negative retained earnings (accumulated losses)', () => {
    const data = {
      equity: 300, totalDebt: 700, cash: 100,
      retainedEarnings: -400, operatingIncome: 50, revenue: 600,
    };
    const r = calcAltmanZ(data, 150);
    expect(r.score).not.toBeNull();
    expect(isFinite(r.score)).toBe(true);
  });
});
