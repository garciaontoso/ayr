import { describe, it, expect } from 'vitest';
import { CURRENCIES, DISPLAY_CCYS, HOME_TABS, TABS, API_URL, APP_VERSION } from '../constants/index.js';

describe('Constants', () => {
  it('API_URL is correct', () => {
    expect(API_URL).toBe('https://aar-api.garciaontoso.workers.dev');
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
    expect(ids).toContain('covered-calls');
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
});
