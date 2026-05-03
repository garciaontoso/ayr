// User preferences with optional multi-user namespacing.
//
// Set `ayr_active_user` in localStorage to scope a curated set of preferences
// per user (Ricardo / Amparo / etc). Keys NOT in SCOPED_KEYS stay global —
// auth, offline cache, app version markers etc must NOT be per-user.
//
// 2026-05-03: introduced for chrono year order + future per-user tab/column
// preferences without doing a full multi-tenant rewrite.

export const KNOWN_USERS = [
  { id: 'ricardo', label: 'Ricardo', icon: '👨‍💻', color: '#c8a44e' },
  { id: 'amparo',  label: 'Amparo',  icon: '👩',     color: '#bf5af2' },
];

// Keys that should be scoped per user. Anything else stays global.
// Patterns supported: exact match or prefix (ending in "*").
const SCOPED_KEYS = [
  'ayr_year_order',
  'ayr-tab-order',
  'ayr-tab-order-*',     // per-group tab order
  'ayr-col-order-*',     // per-tab column order
  'ayr-col-vis-*',       // per-tab column visibility
  'ayr-cols-*',
  'ayr-row-order-*',     // per-analysis-tab row (metric) order
  'ayr-section-order-*', // per-tab section (card block) order
  'ayr-theme',
  'ayr-currency',
  'ayr-zoom',
  'pnl_section',
  'home-tab',
  'home-group',
  'analysis-tab',
];

function isScopedKey(key) {
  return SCOPED_KEYS.some(pat => {
    if (pat.endsWith('*')) return key.startsWith(pat.slice(0, -1));
    return pat === key;
  });
}

export function getActiveUser() {
  try { return localStorage.getItem('ayr_active_user') || 'ricardo'; }
  catch { return 'ricardo'; }
}

export function setActiveUser(userId) {
  try { localStorage.setItem('ayr_active_user', userId); } catch {}
}

function scopedKey(key) {
  if (!isScopedKey(key)) return key;
  const u = getActiveUser();
  return u === 'default' ? key : `u:${u}::${key}`;
}

export function getPref(key, fallback = null) {
  try {
    const v = localStorage.getItem(scopedKey(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try { localStorage.setItem(scopedKey(key), value); } catch {}
}

export function removePref(key) {
  try { localStorage.removeItem(scopedKey(key)); } catch {}
}

// Year-order helpers
export function getYearOrder() {
  // Default ASC (oldest left → newest right) — standard finance convention,
  // matches the price chart that already runs left-to-right chronological.
  return getPref('ayr_year_order', 'asc');
}

export function setYearOrder(order) {
  setPref('ayr_year_order', order === 'desc' ? 'desc' : 'asc');
}

export function isChronoAsc() {
  return getYearOrder() !== 'desc';
}
