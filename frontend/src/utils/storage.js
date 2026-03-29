// ─── Persistent Storage helpers (safe — no crash if unavailable) ────
export const storageAvailable = () => typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';

export async function saveCompanyToStorage(ticker, data) {
  if (!storageAvailable()) return;
  try {
    const payload = JSON.stringify({ ...data, savedAt: new Date().toISOString() });
    await window.storage.set(`company:${ticker.toUpperCase()}`, payload, true);
    let portfolio = [];
    try {
      const idx = await window.storage.get("portfolio:index", true);
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch(e) { /* ignore */ }
    if (!portfolio.includes(ticker.toUpperCase())) {
      portfolio.push(ticker.toUpperCase());
      await window.storage.set("portfolio:index", JSON.stringify(portfolio), true);
    }
  } catch(e) { console.warn("Storage save error:", e); }
}

export async function loadCompanyFromStorage(ticker) {
  if (!storageAvailable()) return null;
  try {
    const result = await window.storage.get(`company:${ticker.toUpperCase()}`, true);
    if (result?.value) return JSON.parse(result.value);
  } catch(e) { /* ignore */ }
  return null;
}

export async function loadPortfolioIndex() {
  if (!storageAvailable()) return [];
  try {
    const result = await window.storage.get("portfolio:index", true);
    if (result?.value) return JSON.parse(result.value);
  } catch(e) { /* ignore */ }
  return [];
}

export async function removeCompanyFromStorage(ticker) {
  if (!storageAvailable()) return;
  try {
    await window.storage.delete(`company:${ticker.toUpperCase()}`, true);
    let portfolio = [];
    try {
      const idx = await window.storage.get("portfolio:index", true);
      if (idx?.value) portfolio = JSON.parse(idx.value);
    } catch(e) { /* ignore */ }
    portfolio = portfolio.filter(t => t !== ticker.toUpperCase());
    await window.storage.set("portfolio:index", JSON.stringify(portfolio), true);
  } catch(e) { /* ignore */ }
}
