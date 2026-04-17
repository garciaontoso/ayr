import { describe, it, expect } from 'vitest';
import { CURRENCIES, DISPLAY_CCYS, DEFAULT_FX } from '../constants/index.js';

describe('CURRENCIES definitions', () => {
  it('each currency has symbol, name, flag', () => {
    for (const [code, def] of Object.entries(CURRENCIES)) {
      expect(def.symbol, `${code} missing symbol`).toBeDefined();
      expect(def.name, `${code} missing name`).toBeDefined();
      expect(def.flag, `${code} missing flag`).toBeDefined();
    }
  });

  it('USD symbol is $', () => expect(CURRENCIES.USD.symbol).toBe('$'));
  it('EUR symbol is €', () => expect(CURRENCIES.EUR.symbol).toBe('€'));
  it('GBP symbol is £', () => expect(CURRENCIES.GBP.symbol).toBe('£'));
  it('GBX symbol is p (pence)', () => expect(CURRENCIES.GBX.symbol).toBe('p'));
  it('HKD symbol is HK$', () => expect(CURRENCIES.HKD.symbol).toBe('HK$'));
  it('JPY symbol is ¥', () => expect(CURRENCIES.JPY.symbol).toBe('¥'));
  it('CAD symbol is C$', () => expect(CURRENCIES.CAD.symbol).toBe('C$'));
  it('AUD symbol is A$', () => expect(CURRENCIES.AUD.symbol).toBe('A$'));
  it('SGD symbol is S$', () => expect(CURRENCIES.SGD.symbol).toBe('S$'));

  it('GBX has parentCcy GBP and divisor 100', () => {
    expect(CURRENCIES.GBX.parentCcy).toBe('GBP');
    expect(CURRENCIES.GBX.divisor).toBe(100);
  });

  it('has at least 10 currencies', () => {
    expect(Object.keys(CURRENCIES).length).toBeGreaterThanOrEqual(10);
  });
});

describe('DISPLAY_CCYS', () => {
  it('is an array', () => expect(Array.isArray(DISPLAY_CCYS)).toBe(true));
  it('contains USD', () => expect(DISPLAY_CCYS).toContain('USD'));
  it('contains EUR', () => expect(DISPLAY_CCYS).toContain('EUR'));
  it('contains GBP', () => expect(DISPLAY_CCYS).toContain('GBP'));
  it('all items exist in CURRENCIES', () => {
    for (const ccy of DISPLAY_CCYS) {
      expect(CURRENCIES[ccy], `${ccy} in DISPLAY_CCYS but not in CURRENCIES`).toBeDefined();
    }
  });
  it('does not contain GBX (pence — not a display currency)', () => {
    expect(DISPLAY_CCYS).not.toContain('GBX');
  });
});

describe('DEFAULT_FX fallback rates', () => {
  it('USD is 1.0 (base currency)', () => expect(DEFAULT_FX.USD).toBe(1));
  it('EUR is less than 1 (strong vs USD)', () => expect(DEFAULT_FX.EUR).toBeLessThan(1));
  it('GBP is less than 1 (strong vs USD)', () => expect(DEFAULT_FX.GBP).toBeLessThan(1));
  it('JPY is greater than 100 (weak vs USD)', () => expect(DEFAULT_FX.JPY).toBeGreaterThan(100));
  it('HKD is approximately 7.8 (pegged)', () => {
    expect(DEFAULT_FX.HKD).toBeGreaterThan(7);
    expect(DEFAULT_FX.HKD).toBeLessThan(8);
  });
  it('CAD is between 1.2 and 1.6', () => {
    expect(DEFAULT_FX.CAD).toBeGreaterThan(1.2);
    expect(DEFAULT_FX.CAD).toBeLessThan(1.6);
  });
  it('GBX equals GBP (internal parity)', () => {
    expect(DEFAULT_FX.GBX).toBe(DEFAULT_FX.GBP);
  });
  it('all rates are positive finite numbers', () => {
    for (const [k, v] of Object.entries(DEFAULT_FX)) {
      expect(typeof v, `${k} rate is not a number`).toBe('number');
      expect(isFinite(v), `${k} rate is not finite`).toBe(true);
      expect(v, `${k} rate is not positive`).toBeGreaterThan(0);
    }
  });
});
