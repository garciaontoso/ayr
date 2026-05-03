// User preferences with optional multi-user namespacing.
//
// Set `ayr_active_user` in localStorage to scope a curated set of preferences
// per user (Ricardo / Amparo / etc). Keys NOT in SCOPED_KEYS stay global —
// auth, offline cache, app version markers etc must NOT be per-user.
//
// 2026-05-03: introduced for chrono year order + future per-user tab/column
// preferences without doing a full multi-tenant rewrite.

import type { KnownUser, UserId, YearOrder } from '../types';
// Cross-device sync via /api/preferences (D1 agent_memory)
import { API_URL } from '../constants/index.js';

export const KNOWN_USERS: ReadonlyArray<KnownUser> = [
  { id: 'ricardo', label: 'Ricardo', icon: '👨‍💻', color: '#c8a44e' },
  { id: 'amparo',  label: 'Amparo',  icon: '👩',     color: '#bf5af2' },
];

// Keys that should be scoped per user. Anything else stays global.
// Patterns supported: exact match or prefix (ending in "*").
const SCOPED_KEYS: ReadonlyArray<string> = [
  'ayr_year_order',
  'ayr-tab-order',
  'ayr-tab-order-*',     // per-group tab order
  'ayr-col-order-*',     // per-tab column order
  'ayr-col-vis-*',       // per-tab column visibility
  'ayr-cols-*',
  'ayr-row-order-*',     // per-analysis-tab row (metric) order
  'ayr-section-order-*', // per-tab section (card block) order
  'ayr-cat-*',           // per-portfolio-row category color (verde/amarillo/azul/naranja/rojo)
  'ayr-theme',
  'ayr-currency',
  'ayr-zoom',
  'pnl_section',
  'home-tab',
  'home-group',
  'analysis-tab',
];

function isScopedKey(key: string): boolean {
  return SCOPED_KEYS.some((pat) => {
    if (pat.endsWith('*')) return key.startsWith(pat.slice(0, -1));
    return pat === key;
  });
}

export function getActiveUser(): UserId {
  try { return localStorage.getItem('ayr_active_user') || 'ricardo'; }
  catch { return 'ricardo'; }
}

export function setActiveUser(userId: UserId): void {
  try { localStorage.setItem('ayr_active_user', userId); } catch { /* ignore */ }
}

function scopedKey(key: string): string {
  if (!isScopedKey(key)) return key;
  const u = getActiveUser();
  return u === 'default' ? key : `u:${u}::${key}`;
}

export function getPref(key: string, fallback: string | null = null): string | null {
  try {
    const v = localStorage.getItem(scopedKey(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: string): void {
  const sk = scopedKey(key);
  try { localStorage.setItem(sk, value); } catch { /* ignore */ }
  // Fire-and-forget server sync so prefs follow the user across devices.
  // /api/preferences requires keys to match [a-z0-9_]+, so we encode the
  // raw scoped key into a safe form preserving full uniqueness.
  syncToServer(sk, value).catch(() => { /* ignore */ });
}

export function removePref(key: string): void {
  const sk = scopedKey(key);
  try { localStorage.removeItem(sk); } catch { /* ignore */ }
  syncToServer(sk, null).catch(() => { /* ignore */ });
}

// ─── Cross-device sync via /api/preferences (D1 agent_memory) ────────────
// 2026-05-03: prefs were localStorage-only → did not follow user across
// devices/incognito. Now we mirror to D1. Async, fire-and-forget, no UI block.

function safeKey(k: string): string {
  // /api/preferences regex is [a-z0-9_]+. Encode anything else.
  return 'p_' + (k || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 56);
}

async function syncToServer(scopedK: string, value: string | null): Promise<void> {
  if (!API_URL) return;
  try {
    await fetch(`${API_URL}/api/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: safeKey(scopedK), value: { raw_key: scopedK, v: value } }),
    });
  } catch { /* ignore */ }
}

interface ServerPrefPayload {
  raw_key?: string;
  v?: unknown;
}

let _serverPrefsLoaded = false;
export async function loadServerPrefs(): Promise<void> {
  // Call once at app startup. Hydrates localStorage with whatever the user
  // saved on a previous device. Doesn't overwrite existing local values
  // (user might have made local-only changes since last server sync) unless
  // the local copy is missing.
  if (_serverPrefsLoaded) return;
  _serverPrefsLoaded = true;
  try {
    const r = await fetch(`${API_URL}/api/preferences`);
    if (!r.ok) return;
    const j = (await r.json()) as { preferences?: Record<string, ServerPrefPayload> };
    const prefs = j.preferences || {};
    let restored = 0;
    for (const [_safeK, payload] of Object.entries(prefs)) {
      if (!payload || typeof payload !== 'object' || !payload.raw_key) continue;
      const localKey = payload.raw_key;
      const value = payload.v;
      // Only set if missing locally
      const existing = localStorage.getItem(localKey);
      if (existing == null && value != null) {
        try { localStorage.setItem(localKey, typeof value === 'string' ? value : JSON.stringify(value)); restored++; } catch { /* ignore */ }
      }
    }
    if (restored > 0) console.info(`[prefs] restored ${restored} from server`);
  } catch (_e) {
    // Silent — falls back to localStorage-only mode
  }
}

// Year-order helpers
export function getYearOrder(): YearOrder {
  // Default ASC (oldest left → newest right) — standard finance convention,
  // matches the price chart that already runs left-to-right chronological.
  const v = getPref('ayr_year_order', 'asc');
  return v === 'desc' ? 'desc' : 'asc';
}

export function setYearOrder(order: YearOrder | string): void {
  setPref('ayr_year_order', order === 'desc' ? 'desc' : 'asc');
}

export function isChronoAsc(): boolean {
  return getYearOrder() !== 'desc';
}
