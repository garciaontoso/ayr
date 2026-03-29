// Safe toFixed/toLocaleString: handles undefined, null, NaN gracefully
export const _sf = (v, d=0) => (v == null || v === undefined || isNaN(v) || typeof v !== "number") ? "0" : v.toFixed(d);
export const _sl = (v, opts) => (v == null || v === undefined || isNaN(v) || typeof v !== "number") ? "0" : v.toLocaleString(undefined, opts||{maximumFractionDigits:0});

export const n = v => (v == null || isNaN(v) || !isFinite(v)) ? null : v;
export const f0 = v => n(v) != null ? Math.round(v).toLocaleString() : "—";
export const f1 = v => n(v) != null ? _sf(v,1) : "—";
export const f2 = v => n(v) != null ? _sf(v,2) : "—";
export const fP = v => n(v) != null ? `${_sf(v*100,1)}%` : "—";
export const fX = v => n(v) != null ? `${_sf(v,1)}x` : "—";
export const fC = (v,s="$") => n(v) != null ? `${s}${_sf(v,2)}` : "—";
export const fM = v => { if(n(v)==null) return "—"; const a=Math.abs(v); const s=v<0?"-":""; return a>=1e6?`${s}${_sf(a/1e6,1)}T`:a>=1e3?`${s}${_sf(a/1e3,1)}B`:`${s}${_sf(a,0)}M`; };
// Dollar formatter for portfolio (raw dollar amounts, not millions)
export const fDol = v => { if(n(v)==null) return "—"; const a=Math.abs(v); const s=v<0?"-":""; return a>=1e9?`${s}${_sf(a/1e9,2)}B`:a>=1e6?`${s}${_sf(a/1e6,2)}M`:a>=1e3?`${s}${_sf(a/1e3,1)}K`:`${s}${_sf(a,0)}`; };
export const div = (a,b) => (n(a)!=null && n(b)!=null && b!==0) ? a/b : null;
export const clamp = (v,lo,hi) => Math.min(Math.max(v,lo),hi);
export const cagrFn = (end, start, yrs) => (n(end)!=null && n(start)!=null && start>0 && end>0 && yrs>0) ? Math.pow(end/start, 1/yrs)-1 : null;
