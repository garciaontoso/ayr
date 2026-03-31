// ─── Persistent Storage helpers using localStorage (safe — no crash if unavailable) ────
export const storageAvailable = () => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch(e) { return false; }
};

const _available = typeof window !== 'undefined' && storageAvailable();

// Async-compatible API wrapping localStorage (drop-in replacement for old window.storage)
const storage = {
  async get(key) {
    if (!_available) return null;
    try {
      const value = localStorage.getItem(key);
      return value !== null ? { value } : null;
    } catch(e) { return null; }
  },
  async set(key, value) {
    if (!_available) return;
    try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch(e) {}
  },
  async delete(key) {
    if (!_available) return;
    try { localStorage.removeItem(key); } catch(e) {}
  }
};

// Expose on window for backward compat with App.jsx direct access
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = storage;
}

export async function saveCompanyToStorage(ticker, data) {
  if (!_available) return;
  try {
    const payload = JSON.stringify({ ...data, savedAt: new Date().toISOString() });
    await storage.set(`company:${ticker.toUpperCase()}`, payload);
    let portfolio = [];
    try {
      const idx = await storage.get("portfolio:index");
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch(e) { /* ignore */ }
    if (!portfolio.includes(ticker.toUpperCase())) {
      portfolio.push(ticker.toUpperCase());
      await storage.set("portfolio:index", JSON.stringify(portfolio));
    }
  } catch(e) { console.warn("Storage save error:", e); }
}

export async function loadCompanyFromStorage(ticker) {
  if (!_available) return null;
  try {
    const result = await storage.get(`company:${ticker.toUpperCase()}`);
    if (result?.value) return JSON.parse(result.value);
  } catch(e) { /* ignore */ }
  return null;
}

export async function loadPortfolioIndex() {
  if (!_available) return [];
  try {
    const result = await storage.get("portfolio:index");
    if (result?.value) return JSON.parse(result.value);
  } catch(e) { /* ignore */ }
  return [];
}

export async function removeCompanyFromStorage(ticker) {
  if (!_available) return;
  try {
    await storage.delete(`company:${ticker.toUpperCase()}`);
    let portfolio = [];
    try {
      const idx = await storage.get("portfolio:index");
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch(e) { /* ignore */ }
    portfolio = portfolio.filter(t => t !== ticker.toUpperCase());
    await storage.set("portfolio:index", JSON.stringify(portfolio));
  } catch(e) { /* ignore */ }
}
