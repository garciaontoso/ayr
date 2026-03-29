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
});
