import { describe, it, expect } from 'vitest';
import { n, div, cagrFn, f0, fP, fM, fDol, clamp } from '../formatters.js';

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
