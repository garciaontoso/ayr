// OpenOptionsTab — Unified view of ALL open option positions (IB + Tastytrade + D1).
//
// Key metric: theta diaria total = how much credit decays per day across the book.
//
// Data source: GET /api/options/open-portfolio (requires X-AYR-Auth)
//   Worker combines D1 open_trades + live IB bridge + live T3 bridge.
//   Returns { positions, kpis: { count, thetaDay, deltaNet, creditTotal, nextExpiry } }
//
// TDZ-safe: all useState/useRef/useCallback declared BEFORE any useEffect (CLAUDE.md rule).

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { _sf, fDol } from '../../utils/formatters.js';

// ── Style constants (hoisted — no per-render realloc) ───────────────────────
const cardBase = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '14px 18px',
};

const STRATEGY_COLORS = {
  BPS:  { bg: 'rgba(16,185,129,.15)',  border: 'rgba(16,185,129,.4)',  text: '#10b981' },
  BCS:  { bg: 'rgba(239,68,68,.15)',   border: 'rgba(239,68,68,.4)',   text: '#ef4444' },
  IC:   { bg: 'rgba(234,179,8,.15)',   border: 'rgba(234,179,8,.4)',   text: '#eab308' },
  CSP:  { bg: 'rgba(96,165,250,.15)',  border: 'rgba(96,165,250,.4)',  text: '#60a5fa' },
  CC:   { bg: 'rgba(168,85,247,.15)', border: 'rgba(168,85,247,.4)', text: '#a855f7' },
  SP:   { bg: 'rgba(96,165,250,.15)',  border: 'rgba(96,165,250,.4)',  text: '#60a5fa' },
  SC:   { bg: 'rgba(239,68,68,.15)',   border: 'rgba(239,68,68,.4)',   text: '#ef4444' },
  OPT:  { bg: 'rgba(107,114,128,.15)', border: 'rgba(107,114,128,.4)', text: '#6b7280' },
};

const SOURCE_LABELS = {
  d1:      'D1',
  ib_live: 'IB',
  tt_live: 'T3',
};

const DTE_BANDS = [
  { id: '0-7',   lbl: '0–7d',   min: 0,  max: 7 },
  { id: '7-21',  lbl: '7–21d',  min: 7,  max: 21 },
  { id: '21-45', lbl: '21–45d', min: 21, max: 45 },
  { id: '45+',   lbl: '45d+',   min: 45, max: Infinity },
];

function dteBandId(dte) {
  if (dte == null) return null;
  if (dte <= 7)  return '0-7';
  if (dte <= 21) return '7-21';
  if (dte <= 45) return '21-45';
  return '45+';
}

function dteColor(dte) {
  if (dte == null) return 'var(--text-tertiary)';
  if (dte <= 7)  return '#ef4444';
  if (dte <= 21) return '#f59e0b';
  return 'var(--text-primary)';
}

function fmtTheta(v) {
  if (v == null) return '—';
  // theta is negative (decay), show as positive USD income number
  return '$' + _sf(Math.abs(v), 2);
}

function fmtCredit(v) {
  if (v == null) return '—';
  return '$' + _sf(Math.abs(v), 0);
}

function fmtDelta(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + _sf(v, 3);
}

function fmtPnlPct(v) {
  if (v == null) return '—';
  const pct = v * 100;
  return (pct >= 0 ? '+' : '') + _sf(pct, 1) + '%';
}

// ── Strategy badge ──────────────────────────────────────────────────────────
function StrategyBadge({ strategy }) {
  const s = STRATEGY_COLORS[strategy] || STRATEGY_COLORS.OPT;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 5,
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.text,
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'var(--fm)',
      letterSpacing: '.3px',
    }}>
      {strategy || '—'}
    </span>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, highlight }) {
  return (
    <div style={{
      ...cardBase,
      flex: '1 1 160px',
      minWidth: 140,
      borderColor: highlight ? 'var(--gold)' : 'var(--border)',
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontFamily: 'var(--fm)', fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--fb)' }}>{sub}</div>}
    </div>
  );
}

// ── Sortable table header ────────────────────────────────────────────────────
function TH({ col, id, sortKey, setSortKey, sortDir, setSortDir, align = 'right', w }) {
  const active = sortKey === id;
  return (
    <th
      onClick={() => {
        if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(id); setSortDir('desc'); }
      }}
      style={{
        padding: '6px 8px',
        fontSize: 9,
        fontFamily: 'var(--fm)',
        color: active ? 'var(--gold)' : 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '.5px',
        textAlign: align,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        width: w,
        userSelect: 'none',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {col} {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );
}

// ── Calendar view (grouped by expiry week) ──────────────────────────────────
function CalendarView({ positions }) {
  const byExpiry = useMemo(() => {
    const map = new Map();
    for (const p of positions) {
      const key = p.expiry || 'Sin fecha';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [positions]);

  if (!byExpiry.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Sin posiciones</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {byExpiry.map(([expiry, rows]) => {
        const thetaTot = rows.reduce((s, r) => s + (r.thetaTotal || 0), 0);
        const creditTot = rows.reduce((s, r) => s + (r.creditTotal || 0), 0);
        const dteVal = rows[0]?.dte;
        return (
          <div key={expiry} style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--fm)', color: dteColor(dteVal) }}>
                {expiry}
              </span>
              {dteVal != null && (
                <span style={{ fontSize: 11, color: dteColor(dteVal), fontFamily: 'var(--fm)' }}>
                  {dteVal}d
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                {rows.length} pos · Theta/día: <b style={{ color: '#30d158' }}>{fmtTheta(thetaTot)}</b> · Credit: {fmtCredit(creditTot)}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rows.map(r => (
                <div key={r.id} style={{
                  background: 'var(--subtle-bg)',
                  borderRadius: 7,
                  padding: '8px 12px',
                  fontSize: 11,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  minWidth: 160,
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StrategyBadge strategy={r.strategy} />
                    <span style={{ fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>{r.symbol}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--fm)', fontSize: 10 }}>{r.strikes}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    ×{r.contracts} · {fmtCredit(r.creditTotal)}
                    {r.thetaTotal != null && <span style={{ color: '#30d158' }}> · Θ {fmtTheta(r.thetaTotal)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OpenOptionsTab() {
  // ── State (all declared before any useEffect — TDZ rule) ──────────────────
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState(null);

  // Filters
  const [filterStrategy, setFilterStrategy] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterDte, setFilterDte] = useState('');
  const [filterSymbol, setFilterSymbol] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState('dte');
  const [sortDir, setSortDir] = useState('asc');

  // View mode
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'calendar'

  const abortRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API_URL + '/api/options/open-portfolio', {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchData]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const positions = useMemo(() => data?.positions || [], [data]);
  const kpis = useMemo(() => data?.kpis || {}, [data]);

  const accounts = useMemo(() => {
    const set = new Set(positions.map(p => p.account).filter(Boolean));
    return Array.from(set).sort();
  }, [positions]);

  const strategies = useMemo(() => {
    const set = new Set(positions.map(p => p.strategy).filter(Boolean));
    return Array.from(set).sort();
  }, [positions]);

  const filtered = useMemo(() => {
    let rows = positions;
    if (filterStrategy) rows = rows.filter(r => r.strategy === filterStrategy);
    if (filterAccount)  rows = rows.filter(r => r.account === filterAccount);
    if (filterDte) {
      const band = DTE_BANDS.find(b => b.id === filterDte);
      if (band) rows = rows.filter(r => r.dte != null && r.dte >= band.min && r.dte < band.max);
    }
    if (filterSymbol) {
      const q = filterSymbol.toLowerCase();
      rows = rows.filter(r => (r.symbol || '').toLowerCase().includes(q));
    }
    return rows;
  }, [positions, filterStrategy, filterAccount, filterDte, filterSymbol]);

  const sorted = useMemo(() => {
    const getV = (r) => {
      switch (sortKey) {
        case 'dte':       return r.dte ?? 9999;
        case 'theta':     return Math.abs(r.thetaTotal || 0);
        case 'credit':    return r.creditTotal || 0;
        case 'pnl':       return r.pnl || 0;
        case 'pnlPct':    return r.pnlPct || 0;
        case 'delta':     return r.delta || 0;
        case 'contracts': return r.contracts || 0;
        case 'ivr':       return r.ivr || 0;
        default:          return 0;
      }
    };
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = getV(a), bv = getV(b);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  // ── Filter summaries for visible rows ─────────────────────────────────────
  const visibleKpis = useMemo(() => ({
    count: sorted.length,
    thetaDay: sorted.reduce((s, r) => s + (r.thetaTotal || 0), 0),
    creditTotal: sorted.reduce((s, r) => s + (r.creditTotal || 0), 0),
    deltaNet: sorted.reduce((s, r) => {
      if (r.delta == null) return s;
      return s + r.delta * (r.contracts || 1) * 100;
    }, 0),
  }), [sorted]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 14, fontFamily: 'var(--fb)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontFamily: 'var(--fd)', color: 'var(--text-primary)' }}>
            Opciones Abiertas
          </h2>
          {lastFetch && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
              {lastFetch.toLocaleTimeString('es-ES')}
            </span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)', fontSize: 11,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? .5 : 1,
              fontFamily: 'var(--fb)',
            }}>
            {loading ? 'Cargando...' : 'Refrescar'}
          </button>
          {/* View toggle */}
          {['table', 'calendar'].map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{
                padding: '6px 12px', borderRadius: 7, fontSize: 11,
                border: `1px solid ${viewMode === v ? 'var(--gold)' : 'var(--border)'}`,
                background: viewMode === v ? 'var(--gold-dim)' : 'transparent',
                color: viewMode === v ? 'var(--gold)' : 'var(--text-tertiary)',
                cursor: 'pointer', fontFamily: 'var(--fb)',
              }}>
              {v === 'table' ? 'Tabla' : 'Calendario'}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#f87171', fontSize: 12 }}>
          Error: {error}
        </div>
      )}
      {data?.errors?.length > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.25)', color: '#fbbf24', fontSize: 11 }}>
          Avisos: {data.errors.join(' · ')}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard
          label="Posiciones abiertas"
          value={kpis.count ?? '—'}
          sub={filtered.length !== (kpis.count || 0) ? `${filtered.length} filtradas` : undefined}
        />
        <KpiCard
          label="Theta total / dia"
          value={kpis.thetaDay != null ? fmtTheta(kpis.thetaDay) : '—'}
          sub="ingreso por decay diario"
          color="#30d158"
          highlight
        />
        <KpiCard
          label="Credit total recibido"
          value={kpis.creditTotal != null ? fmtCredit(kpis.creditTotal) : '—'}
          sub="suma todas las posiciones"
          color="var(--gold)"
        />
        <KpiCard
          label="Delta neta"
          value={kpis.deltaNet != null ? (kpis.deltaNet >= 0 ? '+' : '') + _sf(kpis.deltaNet, 1) : '—'}
          sub="exposicion direccional"
          color={Math.abs(kpis.deltaNet || 0) > 200 ? '#f59e0b' : 'var(--text-primary)'}
        />
        {kpis.nextExpiry && (
          <KpiCard
            label="Proximo vencimiento"
            value={kpis.nextExpiry.dte + 'd'}
            sub={`${kpis.nextExpiry.symbol} · ${kpis.nextExpiry.expiry}`}
            color={dteColor(kpis.nextExpiry.dte)}
          />
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Symbol search */}
        <input
          value={filterSymbol}
          onChange={e => setFilterSymbol(e.target.value)}
          placeholder="Buscar ticker..."
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--text-primary)', fontSize: 12,
            fontFamily: 'var(--fm)', width: 130, outline: 'none',
          }}
        />

        {/* Strategy filter */}
        <select value={filterStrategy} onChange={e => setFilterStrategy(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', cursor: 'pointer' }}>
          <option value="">Todas estrategias</option>
          {strategies.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Account filter */}
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', cursor: 'pointer' }}>
          <option value="">Todas cuentas</option>
          {accounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* DTE filter */}
        <select value={filterDte} onChange={e => setFilterDte(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', cursor: 'pointer' }}>
          <option value="">Todo DTE</option>
          {DTE_BANDS.map(b => <option key={b.id} value={b.id}>{b.lbl}</option>)}
        </select>

        {(filterStrategy || filterAccount || filterDte || filterSymbol) && (
          <button onClick={() => { setFilterStrategy(''); setFilterAccount(''); setFilterDte(''); setFilterSymbol(''); }}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--fb)' }}>
            Limpiar
          </button>
        )}

        {/* Visible rows summary */}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          {sorted.length} pos · Θ/dia {fmtTheta(visibleKpis.thetaDay)} · Credit {fmtCredit(visibleKpis.creditTotal)}
        </span>
      </div>

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 44, background: 'var(--card)', borderRadius: 8, opacity: .6, animation: 'pulse 1.5s infinite', animationDelay: `${i * .15}s` }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sorted.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>◎</div>
          Sin posiciones de opciones abiertas
          {(filterStrategy || filterAccount || filterDte || filterSymbol) && (
            <div style={{ marginTop: 6, fontSize: 11 }}>Prueba quitando los filtros</div>
          )}
        </div>
      )}

      {/* Main content */}
      {!loading && sorted.length > 0 && (
        viewMode === 'calendar'
          ? <CalendarView positions={sorted} />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--fm)' }}>
                <thead>
                  <tr style={{ background: 'var(--subtle-bg)' }}>
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Estrategia</th>
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Ticker</th>
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Strikes</th>
                    <TH col="DTE"       id="dte"       sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={44} />
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Expiry</th>
                    <TH col="Contratos" id="contracts"  sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={60} />
                    <TH col="Credit"    id="credit"     sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={74} />
                    <TH col="Theta/dia" id="theta"      sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={80} />
                    <TH col="Delta"     id="delta"      sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={60} />
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>IVR</th>
                    <TH col="P&L"       id="pnl"        sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={74} />
                    <TH col="% Max"     id="pnlPct"     sortKey={sortKey} setSortKey={setSortKey} sortDir={sortDir} setSortDir={setSortDir} w={60} />
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Cuenta</th>
                    <th style={{ padding: '6px 8px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.id}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : 'var(--row-alt)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                      <td style={{ padding: '8px 8px' }}><StrategyBadge strategy={r.strategy} /></td>
                      <td style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'left' }}>{r.symbol}</td>
                      <td style={{ padding: '8px 8px', color: 'var(--text-secondary)', textAlign: 'left', fontSize: 11 }}>{r.strikes}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: dteColor(r.dte), fontWeight: 600 }}>
                        {r.dte != null ? r.dte : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 10 }}>
                        {r.expiry || '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        ×{r.contracts}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--gold)' }}>
                        {fmtCredit(r.creditTotal)}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        <span style={{ color: '#30d158', fontWeight: 600 }}>{fmtTheta(r.thetaTotal)}</span>
                        {r.thetaSource === 'bs_estimate' && (
                          <span title="Estimacion Black-Scholes (sin greeks en vivo)" style={{ marginLeft: 3, color: 'var(--text-tertiary)', fontSize: 9 }}>~</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {fmtDelta(r.delta)}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {r.ivr != null ? _sf(r.ivr, 0) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: r.pnl == null ? 'var(--text-tertiary)' : r.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {r.pnl != null ? (r.pnl >= 0 ? '+' : '') + fmtCredit(Math.abs(r.pnl)) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: r.pnlPct == null ? 'var(--text-tertiary)' : r.pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {fmtPnlPct(r.pnlPct)}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 10 }}>
                        {r.account}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 600, fontFamily: 'var(--fm)',
                          padding: '2px 5px', borderRadius: 4,
                          background: r.source === 'ib_live' ? 'rgba(96,165,250,.15)' : r.source === 'tt_live' ? 'rgba(168,85,247,.15)' : 'rgba(107,114,128,.15)',
                          color: r.source === 'ib_live' ? '#60a5fa' : r.source === 'tt_live' ? '#a855f7' : 'var(--text-tertiary)',
                        }}>
                          {SOURCE_LABELS[r.source] || r.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--subtle-bg)' }}>
                    <td colSpan={6} style={{ padding: '8px 8px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Total ({sorted.length})
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--gold)', fontWeight: 700 }}>
                      {fmtCredit(visibleKpis.creditTotal)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#30d158', fontWeight: 700 }}>
                      {fmtTheta(visibleKpis.thetaDay)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {visibleKpis.deltaNet != null ? (visibleKpis.deltaNet >= 0 ? '+' : '') + _sf(visibleKpis.deltaNet, 1) : '—'}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              </table>

              {/* Theta source legend */}
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)' }}>
                ~ = theta estimado via credit/DTE (Black-Scholes aprox). Greeks en vivo disponibles cuando IB/T3 bridge conectado.
              </div>
            </div>
          )
      )}
    </div>
  );
}
