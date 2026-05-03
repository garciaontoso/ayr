// Safe toFixed/toLocaleString: handles undefined, null, NaN gracefully
export const _sf = (v: unknown, d: number = 0): string =>
  (v == null || v === undefined || isNaN(v as number) || typeof v !== 'number')
    ? '0'
    : v.toFixed(d);

export const _sl = (v: unknown, opts?: Intl.NumberFormatOptions): string =>
  (v == null || v === undefined || isNaN(v as number) || typeof v !== 'number')
    ? '0'
    : v.toLocaleString(undefined, opts || { maximumFractionDigits: 0 });

export const n = (v: unknown): number | null =>
  (v == null || isNaN(v as number) || !isFinite(v as number)) ? null : (v as number);

export const f0 = (v: unknown): string =>
  n(v) != null ? Math.round(v as number).toLocaleString() : '—';
export const f1 = (v: unknown): string => n(v) != null ? _sf(v, 1) : '—';
export const f2 = (v: unknown): string => n(v) != null ? _sf(v, 2) : '—';
export const fP = (v: unknown): string => n(v) != null ? `${_sf((v as number) * 100, 1)}%` : '—';
export const fX = (v: unknown): string => n(v) != null ? `${_sf(v, 1)}x` : '—';
export const fC = (v: unknown, s: string = '$'): string =>
  n(v) != null ? `${s}${_sf(v, 2)}` : '—';
export const fM = (v: unknown): string => {
  if (n(v) == null) return '—';
  const num = v as number;
  const a = Math.abs(num);
  const s = num < 0 ? '-' : '';
  return a >= 1e6
    ? `${s}${_sf(a / 1e6, 1)}T`
    : a >= 1e3
      ? `${s}${_sf(a / 1e3, 1)}B`
      : `${s}${_sf(a, 0)}M`;
};
// Dollar formatter for portfolio (raw dollar amounts, not millions)
export const fDol = (v: unknown): string => {
  if (n(v) == null) return '—';
  const num = v as number;
  const a = Math.abs(num);
  const s = num < 0 ? '-' : '';
  return a >= 1e9
    ? `${s}${_sf(a / 1e9, 2)}B`
    : a >= 1e6
      ? `${s}${_sf(a / 1e6, 2)}M`
      : a >= 1e3
        ? `${s}${_sf(a / 1e3, 1)}K`
        : `${s}${_sf(a, 0)}`;
};
// ── User-facing formatters (previously duplicated in CurrencyTab + EarningsTab) ──
// fmtUSD: rounded dollar with thousand separators, em-dash on invalid
// fmtPct: 1-decimal percent (value already in %, not fraction)
// fmtDate: short date en-US (e.g. "Apr 8")
export const fmtUSD = (v: unknown): string =>
  (v == null || isNaN(v as number)) ? '—' : '$' + Math.round(v as number).toLocaleString('en-US');
export const fmtPct = (v: unknown): string =>
  (v == null || isNaN(v as number)) ? '—' : (v as number).toFixed(1) + '%';
export const fmtDate = (d: unknown): string => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d as string | number);
  if (isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const div = (a: unknown, b: unknown): number | null =>
  (n(a) != null && n(b) != null && b !== 0) ? (a as number) / (b as number) : null;
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);
export const cagrFn = (end: unknown, start: unknown, yrs: unknown): number | null =>
  (n(end) != null && n(start) != null && (start as number) > 0 && (end as number) > 0 && (yrs as number) > 0)
    ? Math.pow((end as number) / (start as number), 1 / (yrs as number)) - 1
    : null;

// ── Shared additions (migrated from tab-local definitions, 2026-04-09) ──
// Canonical fallback for all new helpers.
export const DASH: string = '—';
const _isBad = (v: unknown): boolean =>
  v == null || v === undefined || Number.isNaN(Number(v));

// Compact USD with M / k suffix. Used by OpcionesTab trade P&L rows.
// Example: 1_500_000 → "$1.50M", -2_500 → "-$2.5k", 12.34 → "$12.34"
export function fmtUsdCompact(v: unknown): string {
  if (_isBad(v)) return DASH;
  const num = Number(v);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// Big-dollar USD for score modals / market caps raw. Example: 1.2e9 → "$1.2B"
export function fmtBnUsd(v: unknown): string {
  if (_isBad(v)) return DASH;
  const num = Number(v);
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(0) + 'M';
  return '$' + num.toFixed(0);
}

// Percent from a FRACTION input (0.15 → "15.0%"). 1 decimal default.
export function fmtPctFrac(v: unknown, decimals: number = 1): string {
  if (_isBad(v)) return DASH;
  return (Number(v) * 100).toFixed(decimals) + '%';
}

// Signed percent from a FRACTION input (-0.025 → "-2.50%"). 2 decimals default.
export function fmtPctFracSigned(v: unknown, decimals: number = 2): string {
  if (_isBad(v)) return DASH;
  const num = Number(v);
  const sign = num >= 0 ? '+' : '';
  return sign + (num * 100).toFixed(decimals) + '%';
}

// Signed percent from an already-percent value (5.3 → "+5.3%").
export function fmtPctSigned(v: unknown, decimals: number = 1): string {
  if (_isBad(v)) return DASH;
  const num = Number(v);
  const sign = num >= 0 ? '+' : '';
  return sign + num.toFixed(decimals) + '%';
}

// Plain toFixed with em-dash fallback.
export function fmtNumD(v: unknown, decimals: number = 2): string {
  if (_isBad(v)) return DASH;
  return Number(v).toFixed(decimals);
}

// Multiplier x-suffixed (2.5 → "2.50x").
export function fmtMul(v: unknown, decimals: number = 2): string {
  if (_isBad(v)) return DASH;
  return Number(v).toFixed(decimals) + 'x';
}

// Byte size (B / KB / MB). From ArchiveTab.
export function fmtBytes(v: number | null | undefined): string {
  if (v == null) return DASH;
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1048576).toFixed(1)} MB`;
}

// Market cap in BILLIONS input: 1500 → "$1.5T", 85 → "$85B". From PortfolioTab.
export function fmtMC(mc: number | null | undefined): string {
  if (!mc || mc <= 0) return DASH;
  return mc >= 1000 ? '$' + _sf(mc / 1000, 1) + 'T' : '$' + _sf(mc, 0) + 'B';
}

// Spanish short date "08 abr. 26" — OpcionesTab style.
export function fmtDateES(d: unknown): string {
  if (!d) return DASH;
  try {
    return new Date(d as string | number).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  } catch {
    return String(d);
  }
}

// Spanish weekday+day+month "lun. 08 abr." — EarningsTab style (ISO yyyy-mm-dd input).
export function fmtDateESLong(iso: string | null | undefined): string {
  if (!iso) return DASH;
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}
