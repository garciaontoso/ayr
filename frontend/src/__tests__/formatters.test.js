import { describe, it, expect } from 'vitest';
import { _sf, fDol } from '../utils/formatters.js';

describe('Formatters', () => {
  it('_sf formats numbers with decimals', () => {
    expect(_sf(123.456, 2)).toBe('123.46');
    expect(_sf(0.1234, 1)).toBe('0.1');
    expect(_sf(-5.67, 0)).toBe('-6');
  });

  it('fDol formats dollar amounts', () => {
    expect(fDol(1234567)).toBe('1.23M');
    expect(fDol(50000)).toMatch(/50/);
    expect(fDol(0)).toBeDefined();
  });

  it('handles edge cases', () => {
    expect(_sf(0, 2)).toBe('0.00');
    expect(_sf(null, 2)).toBeDefined();
    expect(_sf(undefined, 2)).toBeDefined();
  });
});
