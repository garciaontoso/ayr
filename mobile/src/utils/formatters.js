export const _sf = (v, d = 0) => (v == null || isNaN(v) || typeof v !== "number") ? "0" : v.toFixed(d);
export const n = v => (v == null || isNaN(v) || !isFinite(v)) ? null : v;
export const f0 = v => n(v) != null ? Math.round(v).toLocaleString() : "\u2014";
export const f2 = v => n(v) != null ? _sf(v, 2) : "\u2014";
export const fP = v => n(v) != null ? `${_sf(v * 100, 1)}%` : "\u2014";
export const fC = (v, s = "$") => n(v) != null ? `${s}${_sf(v, 2)}` : "\u2014";
export const fDol = v => {
  if (n(v) == null) return "\u2014";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  return a >= 1e9 ? `${s}$${_sf(a / 1e9, 2)}B` : a >= 1e6 ? `${s}$${_sf(a / 1e6, 2)}M` : a >= 1e3 ? `${s}$${_sf(a / 1e3, 1)}K` : `${s}$${_sf(a, 0)}`;
};
export const fSign = (v, prefix = "$") => {
  if (n(v) == null) return "\u2014";
  const s = v >= 0 ? "+" : "";
  return `${s}${prefix}${_sf(Math.abs(v), 2)}`;
};
export const fSignK = v => {
  if (n(v) == null) return "\u2014";
  const s = v >= 0 ? "+" : "-";
  const a = Math.abs(v);
  return a >= 1e6 ? `${s}$${_sf(a / 1e6, 2)}M` : a >= 1e3 ? `${s}$${_sf(a / 1e3, 1)}K` : `${s}$${_sf(a, 0)}`;
};
