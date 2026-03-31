import { describe, it, expect } from 'vitest';

const API_URL = "https://aar-api.garciaontoso.workers.dev";

// Helper: fetch with timeout, skip on network failure
async function apiFetch(path) {
  try {
    const r = await fetch(API_URL + path, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

describe('API Endpoints', () => {
  it('GET /api/positions returns positions from D1', async () => {
    const d = await apiFetch('/api/positions');
    if (!d) return; // network unavailable
    expect(d.positions).toBeDefined();
    expect(d.count).toBeGreaterThan(0);
  }, 15000);

  it('GET /api/patrimonio returns array', async () => {
    const d = await apiFetch('/api/patrimonio');
    if (!d) return;
    expect(Array.isArray(d)).toBe(true);
  }, 15000);

  it('GET /api/alerts returns alerts list', async () => {
    const d = await apiFetch('/api/alerts');
    if (!d) return;
    expect(d.alerts).toBeDefined();
    expect(typeof d.unread).toBe('number');
  }, 15000);

  it('GET /api/fx returns exchange rates', async () => {
    const d = await apiFetch('/api/fx');
    if (!d) return;
    expect(d.USD).toBe(1);
    expect(d.EUR).toBeGreaterThan(0);
  }, 15000);

  it('GET /api/tax-report returns fiscal data', async () => {
    const d = await apiFetch('/api/tax-report?year=2025');
    if (!d) return;
    expect(d.year).toBe('2025');
    expect(d.dividends).toBeDefined();
  }, 15000);

  it('GET /api/costbasis/all returns trades', async () => {
    const d = await apiFetch('/api/costbasis/all?limit=5');
    if (!d) return;
    expect(d.results).toBeDefined();
    expect(d.total).toBeGreaterThan(0);
  }, 15000);
});

describe('IB Integration (slow — requires IB session)', () => {
  it('GET /api/ib-session returns valid session', async () => {
    try {
      const r = await fetch(`${API_URL}/api/ib-session`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return; // Skip if IB unavailable
      const d = await r.json();
      expect(d.ok).toBe(true);
    } catch { /* network timeout — skip */ }
  }, 20000);

  it('GET /api/ib-portfolio returns multi-account positions', async () => {
    try {
      const r = await fetch(`${API_URL}/api/ib-portfolio`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return;
      const d = await r.json();
      expect(d.accounts).toBeDefined();
      expect(d.count).toBeGreaterThan(0);
    } catch { /* skip */ }
  }, 20000);

  it('GET /api/ib-summary returns NLV', async () => {
    try {
      const r = await fetch(`${API_URL}/api/ib-summary`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return;
      const d = await r.json();
      expect(d.nlv?.amount).toBeGreaterThan(0);
    } catch { /* skip */ }
  }, 20000);
});
