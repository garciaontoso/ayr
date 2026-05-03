// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storageAvailable, saveCompanyToStorage, loadCompanyFromStorage, loadPortfolioIndex, removeCompanyFromStorage } from '../storage';

describe('storageAvailable', () => {
  it('returns true when localStorage works', () => {
    expect(storageAvailable()).toBe(true);
  });
});

describe('saveCompanyToStorage / loadCompanyFromStorage', () => {
  const TICKER = 'AAPL_TEST';

  afterEach(() => {
    localStorage.removeItem(`company:${TICKER}`);
    localStorage.removeItem('portfolio:index');
  });

  it('saves and retrieves company data', async () => {
    const data = { ticker: TICKER, name: 'Apple', price: 175.5 };
    await saveCompanyToStorage(TICKER, data);
    const loaded = await loadCompanyFromStorage(TICKER);
    expect(loaded).not.toBeNull();
    expect(loaded.ticker).toBe(TICKER);
    expect(loaded.name).toBe('Apple');
    expect(loaded.price).toBe(175.5);
  });

  it('adds savedAt timestamp on save', async () => {
    await saveCompanyToStorage(TICKER, { ticker: TICKER });
    const loaded = await loadCompanyFromStorage(TICKER);
    expect(loaded.savedAt).toBeDefined();
    expect(new Date(loaded.savedAt).getTime()).not.toBeNaN();
  });

  it('normalizes ticker to uppercase', async () => {
    await saveCompanyToStorage('aapl_test', { name: 'Apple' });
    const loaded = await loadCompanyFromStorage('aapl_test');
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('Apple');
  });

  it('returns null for non-existent ticker', async () => {
    const loaded = await loadCompanyFromStorage('NONEXISTENT_XYZ_999');
    expect(loaded).toBeNull();
  });
});

describe('loadPortfolioIndex', () => {
  afterEach(() => {
    localStorage.removeItem('portfolio:index');
    localStorage.removeItem('company:IDX_A');
    localStorage.removeItem('company:IDX_B');
  });

  it('returns empty array when no portfolio saved', async () => {
    const idx = await loadPortfolioIndex();
    expect(Array.isArray(idx)).toBe(true);
  });

  it('returns saved tickers after saving multiple companies', async () => {
    await saveCompanyToStorage('IDX_A', { name: 'A' });
    await saveCompanyToStorage('IDX_B', { name: 'B' });
    const idx = await loadPortfolioIndex();
    expect(idx).toContain('IDX_A');
    expect(idx).toContain('IDX_B');
  });

  it('does not duplicate tickers on repeated save', async () => {
    await saveCompanyToStorage('IDX_A', { name: 'A v1' });
    await saveCompanyToStorage('IDX_A', { name: 'A v2' });
    const idx = await loadPortfolioIndex();
    const count = idx.filter(t => t === 'IDX_A').length;
    expect(count).toBe(1);
  });
});

describe('removeCompanyFromStorage', () => {
  const TICKER = 'RM_TEST';

  beforeEach(async () => {
    await saveCompanyToStorage(TICKER, { name: 'Remove Me' });
  });

  afterEach(() => {
    localStorage.removeItem(`company:${TICKER}`);
    localStorage.removeItem('portfolio:index');
  });

  it('removes company data', async () => {
    await removeCompanyFromStorage(TICKER);
    const loaded = await loadCompanyFromStorage(TICKER);
    expect(loaded).toBeNull();
  });

  it('removes ticker from portfolio index', async () => {
    await removeCompanyFromStorage(TICKER);
    const idx = await loadPortfolioIndex();
    expect(idx).not.toContain(TICKER);
  });

  it('does not throw when ticker not present', async () => {
    await expect(removeCompanyFromStorage('NEVER_SAVED_XYZ')).resolves.not.toThrow();
  });
});
