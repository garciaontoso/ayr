// ─── Persistent Storage helpers using localStorage (safe — no crash if unavailable) ────

interface StorageEntry {
  value: string;
}

interface AsyncStorage {
  get(key: string): Promise<StorageEntry | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

declare global {
  interface Window {
    storage?: AsyncStorage;
  }
}

export const storageAvailable = (): boolean => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (_e) { return false; }
};

const _available: boolean = typeof window !== 'undefined' && storageAvailable();

// Async-compatible API wrapping localStorage (drop-in replacement for old window.storage)
const storage: AsyncStorage = {
  async get(key: string): Promise<StorageEntry | null> {
    if (!_available) return null;
    try {
      const value = localStorage.getItem(key);
      return value !== null ? { value } : null;
    } catch (_e) { return null; }
  },
  async set(key: string, value: unknown): Promise<void> {
    if (!_available) return;
    try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch (_e) { /* ignore */ }
  },
  async delete(key: string): Promise<void> {
    if (!_available) return;
    try { localStorage.removeItem(key); } catch (_e) { /* ignore */ }
  },
};

// Expose on window for backward compat with App.jsx direct access
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = storage;
}

export async function saveCompanyToStorage(ticker: string, data: Record<string, unknown>): Promise<void> {
  if (!_available) return;
  try {
    const payload = JSON.stringify({ ...data, savedAt: new Date().toISOString() });
    await storage.set(`company:${ticker.toUpperCase()}`, payload);
    let portfolio: string[] = [];
    try {
      const idx = await storage.get('portfolio:index');
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch (_e) { /* ignore */ }
    if (!portfolio.includes(ticker.toUpperCase())) {
      portfolio.push(ticker.toUpperCase());
      await storage.set('portfolio:index', JSON.stringify(portfolio));
    }
  } catch (e) { console.warn('Storage save error:', e); }
}

export async function loadCompanyFromStorage(ticker: string): Promise<Record<string, unknown> | null> {
  if (!_available) return null;
  try {
    const result = await storage.get(`company:${ticker.toUpperCase()}`);
    if (result?.value) return JSON.parse(result.value);
  } catch (_e) { /* ignore */ }
  return null;
}

export async function loadPortfolioIndex(): Promise<string[]> {
  if (!_available) return [];
  try {
    const result = await storage.get('portfolio:index');
    if (result?.value) return JSON.parse(result.value);
  } catch (_e) { /* ignore */ }
  return [];
}

export async function removeCompanyFromStorage(ticker: string): Promise<void> {
  if (!_available) return;
  try {
    await storage.delete(`company:${ticker.toUpperCase()}`);
    let portfolio: string[] = [];
    try {
      const idx = await storage.get('portfolio:index');
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch (_e) { /* ignore */ }
    portfolio = portfolio.filter((t) => t !== ticker.toUpperCase());
    await storage.set('portfolio:index', JSON.stringify(portfolio));
  } catch (_e) { /* ignore */ }
}
