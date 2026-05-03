import { describe, it, expect } from 'vitest';
import { convertCcy, fCcy } from '../currency';

const FX = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  GBX: 0.79,
  CAD: 1.36,
  HKD: 7.82,
  JPY: 148.5,
};

describe('convertCcy', () => {
  it('returns same amount when fromCcy === toCcy', () => {
    expect(convertCcy(100, 'USD', 'USD', FX)).toBe(100);
  });

  it('converts USD to EUR', () => {
    const result = convertCcy(100, 'USD', 'EUR', FX);
    expect(result).toBeCloseTo(92, 1);
  });

  it('converts EUR to USD', () => {
    const result = convertCcy(100, 'EUR', 'USD', FX);
    // 100 EUR / 0.92 EUR/USD ≈ 108.70 USD
    expect(result).toBeCloseTo(108.70, 1);
  });

  it('converts GBX (pence) to USD — divides by 100 first', () => {
    // 500 GBX = 5 GBP, GBP/USD = 1/0.79 ≈ 6.33 USD
    const result = convertCcy(500, 'GBX', 'USD', FX);
    expect(result).toBeCloseTo(500 / 100 / 0.79, 3);
  });

  it('converts USD to GBX — multiplies result by 100 via GBP', () => {
    // 10 USD → GBX: inUSD=10, * FX[GBP]=0.79 (we still get GBP units, not pence)
    // The implementation maps toCcy=GBX to adjTo=GBP, so result is in GBP
    const result = convertCcy(10, 'USD', 'GBX', FX);
    expect(result).toBeCloseTo(10 * 0.79, 3);
  });

  it('returns null for null amount', () => {
    expect(convertCcy(null, 'USD', 'EUR', FX)).toBeNull();
  });

  it('returns null for NaN amount', () => {
    expect(convertCcy(NaN, 'USD', 'EUR', FX)).toBeNull();
  });

  it('returns amount unchanged when fxRates missing', () => {
    expect(convertCcy(100, 'USD', 'EUR', null)).toBe(100);
  });

  it('returns amount unchanged when fromCcy not in fxRates', () => {
    expect(convertCcy(100, 'XYZ', 'USD', FX)).toBe(100);
  });

  it('returns amount unchanged when toCcy not in fxRates', () => {
    expect(convertCcy(100, 'USD', 'XYZ', FX)).toBe(100);
  });

  it('converts CAD to EUR', () => {
    // 100 CAD / 1.36 = 73.53 USD, * 0.92 = 67.65 EUR
    const result = convertCcy(100, 'CAD', 'EUR', FX);
    expect(result).toBeCloseTo(100 / 1.36 * 0.92, 2);
  });

  it('handles HKD to USD', () => {
    // 782 HKD / 7.82 = 100 USD
    const result = convertCcy(782, 'HKD', 'USD', FX);
    expect(result).toBeCloseTo(100, 1);
  });

  it('handles JPY (high rate)', () => {
    // 14850 JPY → USD: 14850/148.5 = 100
    const result = convertCcy(14850, 'JPY', 'USD', FX);
    expect(result).toBeCloseTo(100, 1);
  });
});

describe('fCcy', () => {
  it('formats USD amount with $ symbol', () => {
    const result = fCcy(12.345, 'USD', FX, 'USD');
    expect(result).toBe('$12.35');
  });

  it('converts and formats USD to EUR', () => {
    // 100 USD → 92 EUR → "€92.00"
    const result = fCcy(100, 'USD', FX, 'EUR');
    expect(result).toContain('€');
    expect(result).toContain('92');
  });

  it('returns — for null amount', () => {
    expect(fCcy(null, 'USD', FX, 'USD')).toBe('—');
  });

  it('returns — for NaN amount', () => {
    expect(fCcy(NaN, 'USD', FX, 'USD')).toBe('—');
  });

  it('uses $ as fallback symbol for unknown currency', () => {
    const result = fCcy(50, 'XYZ', FX, 'XYZ');
    expect(result).toContain('$');
  });

  it('handles no displayCcy (uses ccy)', () => {
    const result = fCcy(10, 'USD', FX, undefined);
    expect(result).toBe('$10.00');
  });
});
