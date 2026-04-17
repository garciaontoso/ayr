import { describe, it, expect } from 'vitest';
import {
  n, div, cagrFn, f0, fP, fM, fDol, clamp,
  _sf, _sl, f1, f2, fX, fC, fmtUSD, fmtPct, fmtDate,
  fmtUsdCompact, fmtBnUsd, fmtPctFrac, fmtPctFracSigned,
  fmtPctSigned, fmtNumD, fmtMul, fmtBytes, fmtMC, fmtDateES,
  fmtDateESLong, DASH,
} from '../formatters.js';

describe('n (null-safe number)', () => {
  it('returns number for valid input', () => expect(n(42)).toBe(42));
  it('returns null for null', () => expect(n(null)).toBeNull());
  it('returns null for NaN', () => expect(n(NaN)).toBeNull());
  it('returns null for Infinity', () => expect(n(Infinity)).toBeNull());
  it('returns 0 for 0', () => expect(n(0)).toBe(0));
});

describe('div (safe division)', () => {
  it('divides normally', () => expect(div(10, 2)).toBe(5));
  it('returns null for zero divisor', () => expect(div(10, 0)).toBeNull());
  it('returns null for null numerator', () => expect(div(null, 5)).toBeNull());
  it('returns null for NaN denominator', () => expect(div(10, NaN)).toBeNull());
  it('handles negative numbers', () => expect(div(-10, 2)).toBe(-5));
});

describe('cagrFn', () => {
  it('calculates CAGR correctly', () => {
    expect(cagrFn(200, 100, 5)).toBeCloseTo(0.1487, 3); // (200/100)^(1/5)-1
  });
  it('returns null for zero start', () => expect(cagrFn(200, 0, 5)).toBeNull());
  it('returns null for negative years', () => expect(cagrFn(200, 100, -1)).toBeNull());
  it('returns null for null values', () => expect(cagrFn(null, 100, 5)).toBeNull());
});

describe('formatters', () => {
  it('f0 formats integers with thousands', () => expect(f0(12345)).toBe('12,345'));
  it('f0 returns — for null', () => expect(f0(null)).toBe('—'));
  it('fP formats as percentage', () => expect(fP(0.156)).toBe('15.6%'));
  it('fM formats millions', () => expect(fM(1500)).toBe('1.5B'));
  it('fM formats trillions', () => expect(fM(1500000)).toBe('1.5T'));
  it('fDol formats dollars', () => expect(fDol(1234567)).toBe('1.23M'));
  it('fDol handles small amounts', () => expect(fDol(500)).toBe('500'));
});

describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('passes through in range', () => expect(clamp(5, 0, 10)).toBe(5));
});

describe('_sf (safe toFixed)', () => {
  it('formats positive float', () => expect(_sf(3.14159, 2)).toBe('3.14'));
  it('formats negative float', () => expect(_sf(-2.5, 1)).toBe('-2.5'));
  it('returns "0" for null', () => expect(_sf(null, 2)).toBe('0'));
  it('returns "0" for undefined', () => expect(_sf(undefined, 2)).toBe('0'));
  it('returns "0" for NaN', () => expect(_sf(NaN, 2)).toBe('0'));
  it('returns "0" for string input', () => expect(_sf('abc', 2)).toBe('0'));
  it('formats zero correctly', () => expect(_sf(0, 3)).toBe('0.000'));
});

describe('_sl (safe toLocaleString)', () => {
  it('formats large integer', () => expect(_sl(1234567)).toBe('1,234,567'));
  it('returns "0" for null', () => expect(_sl(null)).toBe('0'));
  it('returns "0" for NaN', () => expect(_sl(NaN)).toBe('0'));
});

describe('f1, f2 formatters', () => {
  it('f1 returns 1 decimal', () => expect(f1(3.14)).toBe('3.1'));
  it('f1 returns — for null', () => expect(f1(null)).toBe('—'));
  it('f2 returns 2 decimals', () => expect(f2(3.14159)).toBe('3.14'));
  it('f2 returns — for NaN', () => expect(f2(NaN)).toBe('—'));
});

describe('fX (multiplier formatter)', () => {
  it('appends x suffix', () => expect(fX(2.5)).toBe('2.5x'));
  it('returns — for null', () => expect(fX(null)).toBe('—'));
  it('handles negative values', () => expect(fX(-1.2)).toBe('-1.2x'));
});

describe('fC (currency formatter)', () => {
  it('prepends dollar symbol by default', () => expect(fC(12.34)).toBe('$12.34'));
  it('uses custom symbol', () => expect(fC(9.99, '€')).toBe('€9.99'));
  it('returns — for null', () => expect(fC(null)).toBe('—'));
});

describe('fmtUSD', () => {
  it('formats integer with thousands separator', () => expect(fmtUSD(1234567)).toBe('$1,234,567'));
  it('rounds to nearest dollar', () => expect(fmtUSD(99.9)).toBe('$100'));
  it('returns — for null', () => expect(fmtUSD(null)).toBe('—'));
  it('returns — for NaN', () => expect(fmtUSD(NaN)).toBe('—'));
});

describe('fmtPct', () => {
  it('formats decimal with % sign', () => expect(fmtPct(12.345)).toBe('12.3%'));
  it('returns — for null', () => expect(fmtPct(null)).toBe('—'));
  it('handles 0', () => expect(fmtPct(0)).toBe('0.0%'));
  it('handles negative', () => expect(fmtPct(-5.5)).toBe('-5.5%'));
});

describe('fmtDate', () => {
  it('formats a valid date string', () => {
    const result = fmtDate('2026-04-17');
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/17/);
  });
  it('returns — for null', () => expect(fmtDate(null)).toBe('—'));
  it('returns — for invalid string', () => expect(fmtDate('not-a-date')).toBe('—'));
  it('accepts Date object', () => {
    const d = new Date('2026-01-15');
    expect(fmtDate(d)).toMatch(/Jan/);
  });
});

describe('fmtUsdCompact', () => {
  it('formats millions', () => expect(fmtUsdCompact(1500000)).toBe('$1.50M'));
  it('formats thousands', () => expect(fmtUsdCompact(2500)).toBe('$2.5k'));
  it('formats sub-thousand', () => expect(fmtUsdCompact(12.34)).toBe('$12.34'));
  it('formats negatives', () => expect(fmtUsdCompact(-2500)).toBe('-$2.5k'));
  it('returns DASH for null', () => expect(fmtUsdCompact(null)).toBe(DASH));
  it('returns DASH for NaN', () => expect(fmtUsdCompact(NaN)).toBe(DASH));
});

describe('fmtBnUsd', () => {
  it('formats billions', () => expect(fmtBnUsd(1.2e9)).toBe('$1.2B'));
  it('formats millions', () => expect(fmtBnUsd(500e6)).toBe('$500M'));
  it('formats sub-million', () => expect(fmtBnUsd(999)).toBe('$999'));
  it('returns DASH for null', () => expect(fmtBnUsd(null)).toBe(DASH));
});

describe('fmtPctFrac', () => {
  it('converts fraction 0.15 to 15.0%', () => expect(fmtPctFrac(0.15)).toBe('15.0%'));
  it('respects decimal param', () => expect(fmtPctFrac(0.1234, 2)).toBe('12.34%'));
  it('returns DASH for null', () => expect(fmtPctFrac(null)).toBe(DASH));
});

describe('fmtPctFracSigned', () => {
  it('formats negative fraction with sign', () => expect(fmtPctFracSigned(-0.025)).toBe('-2.50%'));
  it('formats positive with + sign', () => expect(fmtPctFracSigned(0.10)).toBe('+10.00%'));
  it('returns DASH for null', () => expect(fmtPctFracSigned(null)).toBe(DASH));
});

describe('fmtPctSigned', () => {
  it('formats positive value with + sign', () => expect(fmtPctSigned(5.3)).toBe('+5.3%'));
  it('formats negative value without extra sign', () => expect(fmtPctSigned(-3.1)).toBe('-3.1%'));
  it('returns DASH for null', () => expect(fmtPctSigned(null)).toBe(DASH));
  it('formats zero as +0.0%', () => expect(fmtPctSigned(0)).toBe('+0.0%'));
});

describe('fmtNumD', () => {
  it('formats to 2 decimals by default', () => expect(fmtNumD(3.14159)).toBe('3.14'));
  it('respects custom decimals', () => expect(fmtNumD(3.14159, 4)).toBe('3.1416'));
  it('returns DASH for null', () => expect(fmtNumD(null)).toBe(DASH));
});

describe('fmtMul', () => {
  it('appends x to 2 decimals', () => expect(fmtMul(2.5)).toBe('2.50x'));
  it('respects decimals param', () => expect(fmtMul(1.5, 1)).toBe('1.5x'));
  it('returns DASH for null', () => expect(fmtMul(null)).toBe(DASH));
});

describe('fmtBytes', () => {
  it('formats bytes under 1KB', () => expect(fmtBytes(512)).toBe('512 B'));
  it('formats kilobytes', () => expect(fmtBytes(2048)).toBe('2 KB'));
  it('formats megabytes', () => expect(fmtBytes(2097152)).toBe('2.0 MB'));
  it('returns DASH for null', () => expect(fmtBytes(null)).toBe(DASH));
});

describe('fmtMC (market cap)', () => {
  it('formats billions', () => expect(fmtMC(85)).toBe('$85B'));
  it('formats trillions', () => expect(fmtMC(1500)).toBe('$1.5T'));
  it('returns DASH for 0', () => expect(fmtMC(0)).toBe(DASH));
  it('returns DASH for null', () => expect(fmtMC(null)).toBe(DASH));
  it('returns DASH for negative', () => expect(fmtMC(-10)).toBe(DASH));
});

describe('fmtDateES', () => {
  it('formats a date in Spanish locale', () => {
    const result = fmtDateES('2026-04-17');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe(DASH);
  });
  it('returns DASH for null', () => expect(fmtDateES(null)).toBe(DASH));
});

describe('fmtDateESLong', () => {
  it('formats ISO date in Spanish long format', () => {
    const result = fmtDateESLong('2026-04-17');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
  it('returns DASH for null', () => expect(fmtDateESLong(null)).toBe(DASH));
  it('returns raw string on invalid input', () => {
    const result = fmtDateESLong('not-a-date');
    expect(typeof result).toBe('string');
  });
});
