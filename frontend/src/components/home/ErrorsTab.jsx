// ErrorsTab — Dashboard de errores JS capturados desde el frontend.
// Consume GET /api/errors/dashboard + POST /api/errors/resolve.
// Montado como sub-tab dentro del grupo "Radar" en constants/index.js.
//
// Patrones seguidos:
//   - Throttle: auto-refresh sólo cuando la tab está activa (visibilidad)
//   - AbortController en fetch para evitar race conditions al cambiar filtros
//   - Todos los useState/useMemo declarados ANTES de useEffect (anti-TDZ)
//   - Inline styles, CSS variables, gold accent #c8a44e

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';

const GOLD = '#c8a44e';
const SEV_COLOR = { error: '#ff453a', warn: '#ffd60a', info: '#30d158' };
const SEV_BG    = { error: 'rgba(255,69,58,.10)', warn: 'rgba(255,214,10,.10)', info: 'rgba(48,209,88,.10)' };

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('es-ES', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ts; }
}

function SevBadge({ sev }) {
  const s = (sev || 'info').toLowerCase();
  const c = SEV_COLOR[s] || SEV_COLOR.info;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 9,
      fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
      background: SEV_BG[s] || SEV_BG.info, color: c,
      fontFamily: 'var(--fm)', minWidth: 36, textAlign: 'center',
    }}>
      {s}
    </span>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 100, padding: '12px 16px',
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--text-primary)', fontFamily: 'var(--fm)' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--fb)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  );
}

export default function ErrorsTab() {
  // ── State — all declared before any useEffect ────────────────────────────
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [sevFilter, setSevFilter] = useState('all');
  const [onlyOpen, setOnlyOpen]   = useState(true);
  const [resolving, setResolving] = useState({});
  const [clearing, setClearing]   = useState(false);

  const intervalRef = useRef(null);
  const abortRef    = useRef(null);

  // ── Derived stats ────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const all = data?.rows || [];
    let r = onlyOpen ? all.filter(e => !e.resolved) : all;
    if (sevFilter !== 'all') r = r.filter(e => (e.severity || '').toLowerCase() === sevFilter);
    return r;
  }, [data, sevFilter, onlyOpen]);

  const stats24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600_000;
    return (data?.rows || []).filter(e => new Date(e.created_at).getTime() > cutoff).length;
  }, [data]);

  const stats7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    return (data?.rows || []).filter(e => new Date(e.created_at).getTime() > cutoff).length;
  }, [data]);

  const stats30d = useMemo(() => (data?.total || 0), [data]);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', resolved: onlyOpen ? 'false' : 'all' });
      if (sevFilter !== 'all') params.set('severity', sevFilter);
      const r = await fetch(`${API_URL}/api/errors/dashboard?${params}`, { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      if (e.name !== 'AbortError') console.error('[ErrorsTab] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [sevFilter, onlyOpen]);

  // ── Effects — all AFTER state/callback declarations ──────────────────────
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    load(ctrl.signal);

    // Auto-refresh every 60s while tab is active
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const c2 = new AbortController();
      abortRef.current = c2;
      load(c2.signal);
    }, 60_000);

    return () => {
      ctrl.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const resolveRow = async (row) => {
    setResolving(p => ({ ...p, [row.id]: true }));
    try {
      await fetch(`${API_URL}/api/errors/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map(e => e.id === row.id ? { ...e, resolved: 1 } : e),
        };
      });
    } catch (e) {
      console.error('[ErrorsTab] resolve failed', e);
    } finally {
      setResolving(p => ({ ...p, [row.id]: false }));
    }
  };

  const clearResolved = async () => {
    if (!window.confirm('Borrar todos los errores resueltos con más de 30 días?')) return;
    setClearing(true);
    try {
      await fetch(`${API_URL}/api/errors/clear?older_than_days=30`, { method: 'DELETE' });
      load(new AbortController().signal);
    } catch (e) {
      console.error('[ErrorsTab] clear failed', e);
    } finally {
      setClearing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const topMessages = useMemo(() => {
    const byMsg = data?.byMessage || {};
    return Object.entries(byMsg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
            Errors · JS Error Log
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Errores capturados desde ErrorBoundary + window handlers. Auto-refresh 60s.
          </div>
        </div>
        <button
          onClick={() => load(new AbortController().signal)}
          disabled={loading}
          style={btnStyle('var(--text-secondary)')}
        >
          {loading ? '...' : '↻ Refrescar'}
        </button>
        <button
          onClick={clearResolved}
          disabled={clearing}
          style={btnStyle(SEV_COLOR.error)}
        >
          {clearing ? 'Limpiando...' : 'Limpiar resueltos 30d+'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Últimas 24h" value={stats24h} color={stats24h > 0 ? SEV_COLOR.error : SEV_COLOR.info} />
        <StatCard label="Últimos 7d"  value={stats7d}  color={stats7d  > 5 ? SEV_COLOR.warn  : 'var(--text-primary)'} />
        <StatCard label="Total 30d"   value={stats30d} color="var(--text-primary)" />
      </div>

      {/* Top recurring errors */}
      {topMessages.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)', marginBottom: 8 }}>
            Top errores recurrentes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topMessages.map(([msg, count], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: 'var(--fm)' }}>
                <span style={{ minWidth: 28, fontWeight: 800, color: count >= 5 ? SEV_COLOR.error : SEV_COLOR.warn, textAlign: 'right' }}>
                  {count}x
                </span>
                <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {msg}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {['all', 'error', 'warn', 'info'].map(s => {
          const active = sevFilter === s;
          const c = s === 'all' ? 'var(--text-secondary)' : (SEV_COLOR[s] || 'var(--text-secondary)');
          return (
            <button key={s} onClick={() => setSevFilter(s)}
              style={{
                padding: '5px 12px', borderRadius: 7,
                border: `1px solid ${active ? c : 'var(--border)'}`,
                background: active ? `${c}1A` : 'transparent',
                color: active ? c : 'var(--text-tertiary)',
                fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
                fontFamily: 'var(--fm)',
              }}>
              {s === 'all' ? 'Todos' : s}
            </button>
          );
        })}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--fb)' }}>
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={e => setOnlyOpen(e.target.checked)}
            style={{ accentColor: GOLD, width: 13, height: 13 }}
          />
          Sólo no resueltos
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          {rows.length} error{rows.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Table */}
      {loading && !data ? (
        <div style={{ padding: 30, color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--fb)' }}>
          Cargando errores...
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 30, color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--fb)' }}>
          {onlyOpen ? 'Sin errores pendientes.' : 'Sin errores en el período.'}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '120px 60px 1fr 80px 80px 70px',
            gap: 8, padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--fm)',
          }}>
            <span>Fecha</span>
            <span>Sev</span>
            <span>Mensaje</span>
            <span>Ticker</span>
            <span>Tab</span>
            <span style={{ textAlign: 'right' }}>Acción</span>
          </div>
          {rows.slice(0, 50).map((e, i) => {
            const isOdd = i % 2 === 1;
            return (
              <div key={e.id ?? i} style={{
                display: 'grid',
                gridTemplateColumns: '120px 60px 1fr 80px 80px 70px',
                gap: 8, padding: '9px 14px', alignItems: 'center',
                background: isOdd ? 'var(--row-alt)' : 'transparent',
                borderBottom: i < rows.length - 1 ? '1px solid var(--subtle-bg)' : 'none',
                opacity: e.resolved ? 0.45 : 1,
              }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                  {fmtTs(e.created_at)}
                </span>
                <span><SevBadge sev={e.severity} /></span>
                <span style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--fm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={e.message}>
                  {e.message || '—'}
                </span>
                <span style={{ fontSize: 10, color: GOLD, fontFamily: 'var(--fm)', fontWeight: 700 }}>
                  {e.ticker || '—'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                  {e.tab || '—'}
                </span>
                <span style={{ textAlign: 'right' }}>
                  {!e.resolved && (
                    <button
                      onClick={() => resolveRow(e)}
                      disabled={resolving[e.id]}
                      style={{
                        padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 700,
                        border: `1px solid ${SEV_COLOR.info}44`,
                        background: `${SEV_COLOR.info}11`, color: SEV_COLOR.info,
                        cursor: 'pointer', fontFamily: 'var(--fm)',
                      }}>
                      {resolving[e.id] ? '...' : '✓'}
                    </button>
                  )}
                  {e.resolved && (
                    <span style={{ fontSize: 9, color: SEV_COLOR.info, fontFamily: 'var(--fm)' }}>Resuelto</span>
                  )}
                </span>
              </div>
            );
          })}
          {rows.length > 50 && (
            <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', fontFamily: 'var(--fb)' }}>
              ... y {rows.length - 50} más. Usa filtros para acotar.
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', textAlign: 'center', fontFamily: 'var(--fb)' }}>
        Captura: ErrorBoundary (React) + window.onerror + unhandledrejection. Solo en producción (o ayr_force_error_log=1).
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    padding: '6px 14px', borderRadius: 7,
    border: `1px solid ${color}`,
    background: 'transparent', color,
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--fm)',
  };
}
