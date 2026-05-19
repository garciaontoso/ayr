import { describe, it, expect } from 'vitest';
import { nz, nzStrict, filterRealYears, safeDiv, safePct, safeCAGR, isGhostRow, usdYield, usdDps } from '../dataGuards';

describe('nz — null-safe number', () => {
  it('preserves 0 (since 0 is a real number)', () => {
    expect(nz(0)).toBe(0);
  });
  it('returns null for null/undefined', () => {
    expect(nz(null)).toBeNull();
    expect(nz(undefined)).toBeNull();
  });
  it('returns null for NaN/Infinity', () => {
    expect(nz(NaN)).toBeNull();
    expect(nz(Infinity)).toBeNull();
    expect(nz(-Infinity)).toBeNull();
  });
  it('returns number when valid', () => {
    expect(nz(42)).toBe(42);
    expect(nz(-3.14)).toBeCloseTo(-3.14);
  });
  it('accepts custom fallback', () => {
    expect(nz(null, 0)).toBe(0);
    expect(nz(undefined, 5)).toBe(5);
  });
});

describe('filterRealYears — guard ghost rows', () => {
  it('filters year with revenue=0 and eps=null (ghost)', () => {
    const fin = {
      2025: { revenue: 0, eps: null },         // ghost
      2024: { revenue: 100, eps: 5 },           // real
      2023: { revenue: 90, eps: 4 },            // real
    };
    expect(filterRealYears(fin, [2025, 2024, 2023])).toEqual([2024, 2023]);
  });

  it('keeps year with revenue>0 and negative EPS (write-down real)', () => {
    const fin = {
      2025: { revenue: 100, eps: -10.83 },      // TAP write-down — real
      2024: { revenue: 90, eps: 5 },
    };
    expect(filterRealYears(fin, [2025, 2024])).toEqual([2025, 2024]);
  });

  it('filters year with revenue>0 but EPS missing (PATH TTM)', () => {
    const fin = {
      2026: { revenue: 1000, eps: null },       // partial TTM, ghost
      2025: { revenue: 900, eps: 5 },
    };
    expect(filterRealYears(fin, [2026, 2025])).toEqual([2025]);
  });

  it('handles null/empty fin gracefully', () => {
    expect(filterRealYears(null, [2024, 2023])).toEqual([]);
    expect(filterRealYears({}, [2024])).toEqual([]);
  });
});

describe('safeDiv — division anti-NaN', () => {
  it('basic division', () => {
    expect(safeDiv(100, 4)).toBe(25);
  });
  it('returns null for divisor 0', () => {
    expect(safeDiv(100, 0)).toBeNull();
  });
  it('returns null for null inputs', () => {
    expect(safeDiv(null, 4)).toBeNull();
    expect(safeDiv(100, null)).toBeNull();
  });
  it('returns null for NaN inputs', () => {
    expect(safeDiv(NaN, 4)).toBeNull();
  });
});

describe('safeCAGR — Phil Town/Gorka CAGR', () => {
  it('positive growth', () => {
    // 100 → 200 in 10 years
    expect(safeCAGR(200, 100, 10)).toBeCloseTo(Math.pow(2, 1/10) - 1);
  });
  it('returns null for negative start', () => {
    expect(safeCAGR(100, -50, 10)).toBeNull();
  });
  it('returns null for zero start', () => {
    expect(safeCAGR(100, 0, 10)).toBeNull();
  });
  it('returns null for invalid years', () => {
    expect(safeCAGR(100, 50, 0)).toBeNull();
    expect(safeCAGR(100, 50, -1)).toBeNull();
  });
});

describe('isGhostRow — detection helper', () => {
  it('detects ghost row (revenue=0)', () => {
    expect(isGhostRow({ revenue: 0, eps: null })).toBe(true);
  });
  it('detects ghost row (eps missing)', () => {
    expect(isGhostRow({ revenue: 100, eps: null })).toBe(true);
  });
  it('does NOT flag real row with negative EPS', () => {
    expect(isGhostRow({ revenue: 100, eps: -5 })).toBe(false);  // write-down real
  });
  it('handles null/undefined', () => {
    expect(isGhostRow(null)).toBe(true);
    expect(isGhostRow(undefined)).toBe(true);
  });
});

describe('usdYield — cross-currency yield correcto', () => {
  it('USD position basic', () => {
    expect(usdYield(2000, 50000)).toBeCloseTo(0.04);  // 4% yield
  });
  it('NVO scenario (the actual bug case)', () => {
    // NVO antes: divYieldTTM raw = 19.82% (DKK div / DKK price)
    // Correct: divAnnualUSD $440 / valueUSD $14628 = 3% yield real
    expect(usdYield(440, 14628)).toBeCloseTo(0.03, 2);
  });
  it('null inputs', () => {
    expect(usdYield(null, 1000)).toBeNull();
    expect(usdYield(100, 0)).toBeNull();
  });
});

describe('usdDps — DPS in USD from totals', () => {
  it('basic case', () => {
    // 100 shares, $200/yr dividends → $2/share
    expect(usdDps(200, 100)).toBe(2);
  });
  it('NVO scenario (DKK to USD bug)', () => {
    // Antes: app mostraba "$7.30" para NVO porque tomaba divTTM (DKK)
    // Real: divAnnualUSD ~$143 / 130 shares = $1.10
    expect(usdDps(143, 130)).toBeCloseTo(1.10, 1);
  });
});
