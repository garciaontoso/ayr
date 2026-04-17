import { describe, it, expect } from 'vitest';
import { CURRENCIES, DISPLAY_CCYS, HOME_TABS, HOME_TAB_GROUPS, TABS, API_URL, APP_VERSION, WHT_TREATY_RATES, WHT_NET_RATE, DEFAULT_WHT_NET, DEFAULT_FX } from '../constants/index.js';

describe('Constants', () => {
  it('API_URL is correct', () => {
    expect(API_URL).toBe('https://api.onto-so.com');
  });

  it('APP_VERSION is defined', () => {
    expect(APP_VERSION).toBeDefined();
    expect(typeof APP_VERSION).toBe('string');
  });

  it('CURRENCIES has essential currencies', () => {
    expect(CURRENCIES.USD).toBeDefined();
    expect(CURRENCIES.EUR).toBeDefined();
    expect(CURRENCIES.GBP).toBeDefined();
    expect(CURRENCIES.HKD).toBeDefined();
    expect(CURRENCIES.USD.symbol).toBe('$');
    expect(CURRENCIES.EUR.symbol).toBe('€');
  });

  it('DISPLAY_CCYS includes USD and EUR', () => {
    expect(DISPLAY_CCYS).toContain('USD');
    expect(DISPLAY_CCYS).toContain('EUR');
  });

  it('HOME_TABS has essential tabs', () => {
    const ids = HOME_TABS.map(t => t.id);
    expect(ids).toContain('portfolio');
    expect(ids).toContain('dividendos');
    expect(ids).toContain('trades');
    expect(ids).toContain('fire');
    expect(ids).toContain('dashboard');
    expect(HOME_TABS.length).toBeGreaterThanOrEqual(14);
  });

  it('TABS has analysis tabs', () => {
    const ids = TABS.map(t => t.id);
    expect(ids).toContain('dash');
    expect(ids).toContain('options');
    expect(ids).toContain('chart');
    expect(TABS.length).toBeGreaterThanOrEqual(10);
  });

  it('every tab in TABS has id, lbl, ico', () => {
    for (const t of TABS) {
      expect(t.id, `tab ${t.id} missing id`).toBeDefined();
      expect(t.lbl, `tab ${t.id} missing lbl`).toBeDefined();
      expect(t.ico, `tab ${t.id} missing ico`).toBeDefined();
    }
  });

  it('HOME_TAB_GROUPS has 5 groups', () => {
    expect(HOME_TAB_GROUPS.length).toBe(5);
    for (const g of HOME_TAB_GROUPS) {
      expect(g.id).toBeDefined();
      expect(g.lbl).toBeDefined();
      expect(Array.isArray(g.tabs)).toBe(true);
      expect(g.tabs.length).toBeGreaterThan(0);
    }
  });

  it('HOME_TABS is flat derivation of HOME_TAB_GROUPS', () => {
    const fromGroups = HOME_TAB_GROUPS.flatMap(g => g.tabs);
    expect(HOME_TABS).toHaveLength(fromGroups.length);
    expect(HOME_TABS.map(t => t.id)).toEqual(fromGroups.map(t => t.id));
  });

  it('every HOME_TABS tab has id, lbl, ico', () => {
    for (const t of HOME_TABS) {
      expect(t.id, `home tab ${t.id} missing id`).toBeDefined();
      expect(t.lbl, `home tab ${t.id} missing lbl`).toBeDefined();
      expect(t.ico, `home tab ${t.id} missing ico`).toBeDefined();
    }
  });

  it('HOME_TABS tab ids are unique', () => {
    const ids = HOME_TABS.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('TABS tab ids are unique', () => {
    const ids = TABS.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe('WHT Treaty Rates', () => {
  it('WHT_TREATY_RATES has US rate 0.10 (China-US treaty)', () => {
    expect(WHT_TREATY_RATES.US).toBe(0.10);
  });

  it('WHT_TREATY_RATES has 0.00 for no-WHT countries', () => {
    expect(WHT_TREATY_RATES.GB).toBe(0.00);
    expect(WHT_TREATY_RATES.HK).toBe(0.00);
    expect(WHT_TREATY_RATES.IE).toBe(0.00);
    expect(WHT_TREATY_RATES.SG).toBe(0.00);
  });

  it('WHT_TREATY_RATES has _default fallback', () => {
    expect(WHT_TREATY_RATES._default).toBe(0.15);
  });

  it('WHT_NET_RATE returns 1 minus treaty rate', () => {
    expect(WHT_NET_RATE('US')).toBeCloseTo(0.90);
    expect(WHT_NET_RATE('GB')).toBeCloseTo(1.00);
    expect(WHT_NET_RATE('HK')).toBeCloseTo(1.00);
    expect(WHT_NET_RATE('CA')).toBeCloseTo(0.85);
  });

  it('WHT_NET_RATE falls back to _default for unknown country', () => {
    expect(WHT_NET_RATE('ZZ')).toBeCloseTo(1 - 0.15);
  });

  it('DEFAULT_WHT_NET is 0.90 (US dividend portfolio)', () => {
    expect(DEFAULT_WHT_NET).toBe(0.90);
  });
});

describe('DEFAULT_FX', () => {
  it('USD is 1 (base)', () => {
    expect(DEFAULT_FX.USD).toBe(1);
  });

  it('all rates are positive numbers', () => {
    for (const [ccy, rate] of Object.entries(DEFAULT_FX)) {
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
    }
  });

  it('has GBX equal to GBP (for pence conversion)', () => {
    expect(DEFAULT_FX.GBX).toBe(DEFAULT_FX.GBP);
  });

  it('covers all CURRENCIES keys (except GBX divisor note)', () => {
    const ccyKeys = Object.keys(CURRENCIES);
    for (const k of ccyKeys) {
      expect(DEFAULT_FX[k], `DEFAULT_FX missing ${k}`).toBeDefined();
    }
  });
});
