// OpcionesTab — Credit Spreads / ROC / ROP planner + tracker.
//
// Mirrors the user's master Excel template: per-strategy tabs with a shared
// filter bar (year / month / status / underlying / account), a trade table
// with inline close action, a modal planner form (new trade with live
// Kelly/RORC/ARORC calculation), and a monthly summary view.
//
// One component handles all four sub-tabs (CS, ROC, ROP, Resumen) so state
// (filters, trade list, meta) is shared. The selected strategy drives which
// rows show in the table.
//
// Backend endpoints consumed (all deployed on the worker):
//   GET  /api/options/meta
//   GET  /api/options/trades?strategy=...&year=...&month=...&status=...
//   GET  /api/options/summary?year=...
//   POST /api/options/trades
//   PUT  /api/options/trades/:id
//   DELETE /api/options/trades/:id
//   POST /api/options/calc                 (stateless planner preview)
//
// TDZ-safe: all useState/useRef declared BEFORE any useEffect (CLAUDE.md #1
// recurring bug pattern).

import React, { useState, useEffect, useCallback, useMemo, useRef as _useRef } from 'react';
import { API_URL } from '../../constants/index.js';
import { fmtUsdCompact as fmtUsd, fmtPctFrac, fmtNumD as fmtNum, fmtDateES as fmtDate } from '../../utils/formatters';

// ─── Constants ──────────────────────────────────────────────────────
const STRATEGY_META = {
  CS:   { icon: '🎯', label: 'Credit Spreads', color: '#06b6d4', help: 'Bull Put Spreads con Kelly sizing' },
  ROC:  { icon: '📞', label: 'Return on Capital', color: '#10b981', help: 'Covered calls sobre acciones que posees' },
  ROP:  { icon: '🛡', label: 'Return on Premium', color: '#f59e0b', help: 'Cash secured puts sobre acciones que quieres poseer' },
  LEAPS:{ icon: '📅', label: 'LEAPS & Calls', color: '#a855f7', help: 'LEAPS + calls sobre SPX y otros índices' },
};

const STATUS_COLORS = {
  OPEN:     '#f59e0b',
  EXPIRED:  '#10b981',
  CLOSED:   '#06b6d4',
  ASSIGNED: '#a855f7',
  ROLLED:   '#ec4899',
  IDEA:     '#6b7280',
};

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Local alias: OpcionesTab uses 2-decimal percent from a fraction (e.g. 0.1234 → "12.34%").
const fmtPct = (v) => fmtPctFrac(v, 2);

// ─── Main component ─────────────────────────────────────────────────
export default function OpcionesTab({ strategy: strategyProp, view = 'list' }) {
  // Strategy can be 'CS', 'ROC', 'ROP'; view can be 'list', 'summary' or 'orphans'
  const strategy = strategyProp || 'CS';
  const isSummary = view === 'summary';
  const isOrphans = view === 'orphans';

  // Persisted filter state (shared across sub-tabs via module-level ref)
  const [year, setYear] = useState(() => {
    const saved = localStorage.getItem('opciones_filter_year');
    return saved ? saved : '';
  });
  const [month, setMonth] = useState(() => localStorage.getItem('opciones_filter_month') || '');
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('opciones_filter_status') || '');
  const [underlying, setUnderlying] = useState('');
  const [account, setAccount] = useState('');
  const [search, setSearch] = useState('');

  const [meta, setMeta] = useState({ years: [], underlyings: [], statuses: [], accounts: [] });
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [summary, setSummary] = useState({ by_month: [], totals: [] });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Planner modal
  const [showPlanner, setShowPlanner] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);

  // Close modal
  const [closingTrade, setClosingTrade] = useState(null);

  // Orphans (IB cost_basis trades not in Excel)
  const [orphans, setOrphans] = useState([]);
  const [orphansStats, setOrphansStats] = useState({ by_ticker: [], by_year: [], by_status: [], total_credit: 0 });
  const [orphansLoading, setOrphansLoading] = useState(false);
  const [orphansYear, setOrphansYear] = useState('');
  const [orphansTicker, setOrphansTicker] = useState('');

  // Persistence hooks for filters
  useEffect(() => { localStorage.setItem('opciones_filter_year', year); }, [year]);
  useEffect(() => { localStorage.setItem('opciones_filter_month', month); }, [month]);
  useEffect(() => { localStorage.setItem('opciones_filter_status', statusFilter); }, [statusFilter]);

  // Load meta once
  const loadMeta = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/options/meta`);
      const d = await r.json();
      if (d.ok) setMeta({
        years: d.years || [],
        underlyings: d.underlyings || [],
        statuses: d.statuses || [],
        accounts: d.accounts || [],
      });
    } catch (e) { /* non-fatal */ }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // Default year to max available year
  useEffect(() => {
    if (!year && meta.years.length > 0) {
      setYear(String(Math.max(...meta.years)));
    }
  }, [meta.years, year]);

  // Load orphans (IB trades not logged in Excel)
  useEffect(() => {
    if (!isOrphans) return;
    const ac = new AbortController();
    (async () => {
      setOrphansLoading(true);
      try {
        const params = new URLSearchParams();
        if (orphansYear) params.set('year', orphansYear);
        if (orphansTicker) params.set('ticker', orphansTicker);
        params.set('limit', '500');
        const r = await fetch(`${API_URL}/api/options/reconcile/orphans?${params.toString()}`, { signal: ac.signal });
        const d = await r.json();
        if (ac.signal.aborted) return;
        if (d.ok) {
          setOrphans(d.orphans || []);
          setOrphansStats(d.stats || { by_ticker: [], by_year: [], by_status: [], total_credit: 0 });
        }
      } catch (e) {
        if (e.name !== 'AbortError') { /* non-fatal */ }
      } finally {
        if (!ac.signal.aborted) setOrphansLoading(false);
      }
    })();
    return () => ac.abort();
  }, [isOrphans, orphansYear, orphansTicker]);

  // Load trades when filters change (list view only)
  useEffect(() => {
    if (isSummary || isOrphans) return;
    const ac = new AbortController();
    (async () => {
      setLoading(true); setError('');
      const params = new URLSearchParams();
      params.set('strategy', strategy);
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      if (statusFilter) params.set('status', statusFilter);
      if (underlying) params.set('underlying', underlying);
      if (account) params.set('account', account);
      if (search) params.set('q', search);
      try {
        const r = await fetch(`${API_URL}/api/options/trades?${params.toString()}`, { signal: ac.signal });
        const d = await r.json();
        if (ac.signal.aborted) return;
        if (d.ok) setTrades(d.trades || []);
        else setError(d.error || 'Error cargando trades');
      } catch (e) {
        if (e.name !== 'AbortError') setError(String(e));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [strategy, year, month, statusFilter, underlying, account, search, isSummary, isOrphans]);

  // Load summary when in summary view
  useEffect(() => {
    if (!isSummary || isOrphans) return;
    const ac = new AbortController();
    (async () => {
      setSummaryLoading(true);
      try {
        const params = new URLSearchParams();
        if (year) params.set('year', year);
        const r = await fetch(`${API_URL}/api/options/summary?${params.toString()}`, { signal: ac.signal });
        const d = await r.json();
        if (ac.signal.aborted) return;
        if (d.ok) setSummary({ by_month: d.by_month || [], totals: d.totals || [] });
      } catch {}
      finally { if (!ac.signal.aborted) setSummaryLoading(false); }
    })();
    return () => ac.abort();
  }, [isSummary, year, isOrphans]);

  // KPI aggregation over currently-visible trades
  const kpis = useMemo(() => {
    const k = {
      total: trades.length,
      open: 0, expired: 0, closed: 0, rolled: 0, assigned: 0,
      realized_pnl: 0,
      open_credit: 0,
      realized_count: 0,
      wins: 0, losses: 0,
      avg_rorc: 0, avg_dte: 0,
    };
    let rorcSum = 0, rorcN = 0, dteSum = 0, dteN = 0;
    for (const t of trades) {
      const s = (t.status || '').toUpperCase();
      if (s === 'OPEN') k.open++;
      else if (s === 'EXPIRED') k.expired++;
      else if (s === 'CLOSED') k.closed++;
      else if (s === 'ROLLED') k.rolled++;
      else if (s === 'ASSIGNED') k.assigned++;

      const realized = ['EXPIRED','CLOSED','ASSIGNED','ROLLED'].includes(s);
      if (realized) {
        k.realized_count++;
        const pnl = Number(t.final_net_credit ?? t.net_credit_total ?? 0);
        k.realized_pnl += pnl;
        if (pnl > 0) k.wins++; else if (pnl < 0) k.losses++;
        if (t.final_rorc != null) { rorcSum += Number(t.final_rorc); rorcN++; }
      } else if (s === 'OPEN') {
        k.open_credit += Number(t.net_credit_total || 0);
      }
      if (t.dte != null) { dteSum += Number(t.dte); dteN++; }
    }
    if (rorcN) k.avg_rorc = rorcSum / rorcN;
    if (dteN) k.avg_dte = dteSum / dteN;
    k.win_rate = k.realized_count > 0 ? k.wins / k.realized_count : 0;
    return k;
  }, [trades]);

  // ─── Actions ──────────────────────────────────────────────────────
  const handleClose = useCallback(async (trade, result) => {
    try {
      await fetch(`${API_URL}/api/options/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      setClosingTrade(null);
      // Reload trades
      const params = new URLSearchParams();
      params.set('strategy', strategy);
      if (year) params.set('year', year);
      if (month) params.set('month', month);
      if (statusFilter) params.set('status', statusFilter);
      const r = await fetch(`${API_URL}/api/options/trades?${params.toString()}`);
      const d = await r.json();
      if (d.ok) setTrades(d.trades || []);
      loadMeta();
    } catch (e) { setError(String(e)); }
  }, [strategy, year, month, statusFilter, loadMeta]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('¿Eliminar este trade?')) return;
    await fetch(`${API_URL}/api/options/trades/${id}`, { method: 'DELETE' });
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearFilters = () => {
    setMonth(''); setStatusFilter(''); setUnderlying(''); setAccount(''); setSearch('');
  };

  // Pre-fill the Planner modal from an orphan IB trade so the user can save it to Excel
  const handleCreateFromOrphan = useCallback((o) => {
    const optTipo = (o.opt_tipo || '').toUpperCase();
    const inferredStrategy = optTipo === 'C' ? 'ROC' : 'ROP';
    const credit = Math.abs(Number(o.opt_credit_total || 0));
    const contracts = Number(o.opt_contracts || 1) || 1;
    const perContract = contracts > 0 ? credit / contracts / 100 : 0;
    const tradeDate = (o.fecha || '').slice(0, 10);
    setEditingTrade({
      strategy: inferredStrategy,
      underlying: o.ticker,
      short_strike: o.opt_strike,
      long_strike: null,
      expiration_date: o.opt_expiry,
      trade_date: tradeDate,
      actual_contracts: contracts,
      contracts: contracts,
      net_credit: perContract,
      net_credit_total: credit,
      status: o.opt_status || 'OPEN',
      account: '',
      notes: `Importado desde IB Flex (cost_basis id ${o.id})`,
      _from_orphan_id: o.id,
    });
    setShowPlanner(true);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────
  const sMeta = STRATEGY_META[strategy];
  const titleIcon = isOrphans ? '⚠️' : (isSummary ? '📊' : sMeta.icon);
  const titleText = isOrphans
    ? 'Trades sin loguear (IB → Excel)'
    : (isSummary ? 'Resumen Mensual de Opciones' : sMeta.label);
  const headerHelp = isOrphans
    ? 'Trades ejecutados en IB pero que no están en tu Excel — pulsa "Crear en Excel" para añadirlos'
    : (isSummary ? 'Ingresos realizados por mes · agrupados por estrategia' : sMeta.help);

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: isOrphans ? 'rgba(217, 119, 6, 0.08)' : 'var(--card)',
        border: `1px solid ${isOrphans ? 'rgba(217, 119, 6, 0.5)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--fd)', fontSize: 22, color: isOrphans ? '#f59e0b' : 'var(--gold)', letterSpacing: '.3px',
          }}>
            {titleIcon} {titleText}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {headerHelp}
          </div>
        </div>
        {!isSummary && !isOrphans && (
          <button
            onClick={() => { setEditingTrade(null); setShowPlanner(true); }}
            style={{
              background: sMeta.color, color: '#000', border: 'none',
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '.3px',
            }}
          >
            + Nuevo trade
          </button>
        )}
      </div>

      {/* Filters bar */}
      {!isOrphans && (
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '10px 14px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-tertiary)' }}>Filtros:</span>
        <Select label="Año" value={year} onChange={setYear} options={[
          { v: '', l: 'Todos' },
          ...meta.years.map(y => ({ v: String(y), l: String(y) })),
        ]}/>
        {!isSummary && (
          <>
            <Select label="Mes" value={month} onChange={setMonth} options={[
              { v: '', l: 'Todos' },
              ...MONTHS.map((m, i) => ({ v: String(i + 1).padStart(2, '0'), l: m })),
            ]}/>
            <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              { v: '', l: 'Todos' },
              ...meta.statuses.map(s => ({ v: s, l: s })),
            ]}/>
            <Select label="Underlying" value={underlying} onChange={setUnderlying} options={[
              { v: '', l: 'Todos' },
              ...meta.underlyings.map(u => ({ v: u, l: u })),
            ]}/>
            <Select label="Cuenta" value={account} onChange={setAccount} options={[
              { v: '', l: 'Todas' },
              ...meta.accounts.map(a => ({ v: a, l: a })),
            ]}/>
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: 'var(--subtle-bg)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px',
                fontSize: 11, width: 120,
              }}
            />
          </>
        )}
        <button
          onClick={clearFilters}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 6,
            fontSize: 10, cursor: 'pointer',
          }}
        >
          Limpiar
        </button>
      </div>
      )}

      {isOrphans ? (
        <OrphansView
          orphans={orphans}
          stats={orphansStats}
          loading={orphansLoading}
          year={orphansYear}
          ticker={orphansTicker}
          onYearChange={setOrphansYear}
          onTickerChange={setOrphansTicker}
          onCreate={handleCreateFromOrphan}
        />
      ) : isSummary ? (
        <SummaryView summary={summary} loading={summaryLoading} year={year}/>
      ) : (
        <>
          <KpiStrip kpis={kpis} strategy={strategy} color={sMeta.color}/>
          {error && (
            <div style={{ color: 'var(--red)', padding: 8, marginBottom: 10, fontSize: 12 }}>
              {error}
            </div>
          )}
          <TradesTable
            trades={trades}
            strategy={strategy}
            loading={loading}
            onClose={(t) => setClosingTrade(t)}
            onEdit={(t) => { setEditingTrade(t); setShowPlanner(true); }}
            onDelete={handleDelete}
          />
        </>
      )}

      {showPlanner && (
        <PlannerModal
          strategy={strategy}
          editing={editingTrade}
          onClose={() => { setShowPlanner(false); setEditingTrade(null); }}
          onSaved={() => {
            setShowPlanner(false); setEditingTrade(null);
            // Reload trades
            const params = new URLSearchParams();
            params.set('strategy', strategy);
            if (year) params.set('year', year);
            fetch(`${API_URL}/api/options/trades?${params.toString()}`)
              .then(r => r.json())
              .then(d => { if (d.ok) setTrades(d.trades || []); loadMeta(); });
          }}
        />
      )}

      {closingTrade && (
        <CloseModal
          trade={closingTrade}
          onClose={() => setClosingTrade(null)}
          onSave={handleClose}
        />
      )}
    </div>
  );
}

// ─── Select helper ──────────────────────────────────────────────────
function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '.3px' }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--subtle-bg)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px',
          fontSize: 11, cursor: 'pointer',
        }}
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

// ─── KPI strip ──────────────────────────────────────────────────────
function KpiStrip({ kpis, _strategy, color }) {
  const cards = [
    { lbl: 'Trades visibles', val: kpis.total, fmt: 'int' },
    { lbl: 'Abiertos', val: kpis.open, fmt: 'int' },
    { lbl: 'Realizados', val: kpis.realized_count, fmt: 'int' },
    { lbl: 'P&L realizado', val: kpis.realized_pnl, fmt: 'usd', glow: true },
    { lbl: 'Credit abierto', val: kpis.open_credit, fmt: 'usd' },
    { lbl: 'Win rate', val: kpis.win_rate, fmt: 'pct' },
    { lbl: 'Avg RORC', val: kpis.avg_rorc, fmt: 'pct' },
    { lbl: 'Avg DTE', val: kpis.avg_dte, fmt: 'dte' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 8, marginBottom: 14,
    }}>
      {cards.map(c => (
        <div key={c.lbl} style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 12px',
          ...(c.glow ? { borderLeft: `3px solid ${color}` } : {}),
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{c.lbl}</div>
          <div style={{
            fontFamily: 'var(--fm)', fontSize: 18, fontWeight: 700,
            color: c.glow && c.val > 0 ? 'var(--green)' : c.glow && c.val < 0 ? 'var(--red)' : 'var(--text-primary)',
            marginTop: 2,
          }}>
            {c.fmt === 'int' && (c.val || 0).toLocaleString()}
            {c.fmt === 'usd' && fmtUsd(c.val)}
            {c.fmt === 'pct' && fmtPct(c.val)}
            {c.fmt === 'dte' && (c.val ? `${Math.round(c.val)}d` : '—')}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Trades table ───────────────────────────────────────────────────
function TradesTable({ trades, strategy, loading, onClose, onEdit, onDelete }) {
  if (loading) {
    return <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 12 }}>Cargando trades...</div>;
  }
  if (trades.length === 0) {
    return (
      <div style={{
        background: 'var(--card)', border: '1px dashed var(--border)',
        borderRadius: 12, padding: 28, textAlign: 'center',
        color: 'var(--text-tertiary)', fontSize: 12,
      }}>
        No hay trades con los filtros actuales. Cambia los filtros o crea uno nuevo.
      </div>
    );
  }

  const cols = strategy === 'CS'
    ? ['Fecha','Ticker','S/L','Spread','Credit','NetCr','DTE','RORC','ARORC','Kelly','Contr','NetTotal','Status','Acciones']
    : strategy === 'LEAPS'
      ? ['Fecha','Ticker','Strike','Credit','NetCr','DTE','RORC','ARORC','Kelly','Contr','NetTotal','Status','Acciones']
      : strategy === 'ROC'
        ? ['Fecha','Ticker','Strike','Credit','NetCr','DTE','RORC','ARORC','Contr','NetTotal','Status','Acciones']
        : ['Fecha','Ticker','Strike','Credit','NetCr','DTE','RORC','ARORC','Contr','NetTotal','Status','Acciones'];

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'auto', maxWidth: '100%',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
        <thead>
          <tr style={{ background: 'var(--subtle-bg)', position: 'sticky', top: 0 }}>
            {cols.map(c => (
              <th key={c} style={{
                padding: '8px 6px', textAlign: 'left', color: 'var(--gold)',
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px',
                borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const s = (t.status || '').toUpperCase();
            const pnl = t.final_net_credit ?? t.net_credit_total ?? 0;
            return (
              <tr key={t.id} style={{
                borderBottom: '1px solid var(--border)',
                background: i % 2 === 0 ? 'transparent' : 'var(--row-alt)',
              }}>
                <td style={{ padding: '6px' }}>{fmtDate(t.trade_date)}</td>
                <td style={{ padding: '6px', color: 'var(--gold)', fontWeight: 600 }}>{t.underlying}</td>
                {strategy === 'CS' ? (
                  <>
                    <td style={{ padding: '6px' }}>{fmtNum(t.short_strike, 0)}/{fmtNum(t.long_strike, 0)}</td>
                    <td style={{ padding: '6px' }}>{fmtNum(t.spread, 0)}</td>
                  </>
                ) : strategy === 'LEAPS' ? (
                  // LEAPS rows may be long calls (stored as long_strike) or
                  // short-call credit spreads (stored as short_strike/long_strike).
                  // Prefer long_strike → short_strike → combined display.
                  <td style={{ padding: '6px' }}>
                    {t.short_strike != null && t.long_strike != null
                      ? `${fmtNum(t.short_strike, 0)}/${fmtNum(t.long_strike, 0)}`
                      : fmtNum(t.long_strike ?? t.short_strike, 0)}
                  </td>
                ) : (
                  <td style={{ padding: '6px' }}>{fmtNum(t.short_strike, 2)}</td>
                )}
                <td style={{ padding: '6px' }}>{fmtNum(t.credit, 2)}</td>
                <td style={{ padding: '6px' }}>{fmtNum(t.net_credit, 2)}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{t.dte ?? '—'}</td>
                <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>{fmtPct(t.rorc)}</td>
                <td style={{ padding: '6px', color: t.arorc > 0.4 ? 'var(--green)' : 'var(--text-secondary)' }}>{fmtPct(t.arorc)}</td>
                {(strategy === 'CS' || strategy === 'LEAPS') && <td style={{ padding: '6px' }}>{fmtPct(t.kelly_pct)}</td>}
                <td style={{ padding: '6px', textAlign: 'right' }}>{t.actual_contracts || '—'}</td>
                <td style={{
                  padding: '6px', fontWeight: 700,
                  color: s === 'OPEN' ? 'var(--text-secondary)' : (pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--text-secondary)'),
                }}>{fmtUsd(pnl)}</td>
                <td style={{ padding: '6px' }}>
                  <span style={{
                    background: STATUS_COLORS[s] || 'var(--text-tertiary)',
                    color: '#000', padding: '2px 6px', borderRadius: 4,
                    fontSize: 9, fontWeight: 700,
                  }}>{s}</span>
                </td>
                <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                  {s === 'OPEN' && (
                    <button onClick={() => onClose(t)} style={actionBtnStyle}>Cerrar</button>
                  )}
                  <button onClick={() => onEdit(t)} style={actionBtnStyle}>✎</button>
                  <button onClick={() => onDelete(t.id)} style={{ ...actionBtnStyle, color: 'var(--red)' }}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const actionBtnStyle = {
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', padding: '2px 6px',
  borderRadius: 4, fontSize: 10, cursor: 'pointer', marginLeft: 4,
};

// ─── Summary view ───────────────────────────────────────────────────
function SummaryView({ summary, loading, year }) {
  if (loading) return <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Cargando resumen...</div>;

  // Build pivot: rows = months (1-12), cols = CS/ROC/ROP/LEAPS/Total
  const pivot = {};
  for (let m = 1; m <= 12; m++) {
    pivot[m] = { CS: 0, ROC: 0, ROP: 0, LEAPS: 0, total: 0, n: 0 };
  }
  for (const row of summary.by_month) {
    const mo = parseInt(row.mo, 10);
    if (!pivot[mo]) continue;
    pivot[mo][row.strategy] = (pivot[mo][row.strategy] || 0) + Number(row.realized_pnl || 0);
    pivot[mo].total += Number(row.realized_pnl || 0);
    pivot[mo].n += Number(row.n_realized || 0);
  }
  const grandTotal = { CS: 0, ROC: 0, ROP: 0, LEAPS: 0, total: 0 };
  for (const m of Object.keys(pivot)) {
    grandTotal.CS += pivot[m].CS;
    grandTotal.ROC += pivot[m].ROC;
    grandTotal.ROP += pivot[m].ROP;
    grandTotal.LEAPS += pivot[m].LEAPS;
    grandTotal.total += pivot[m].total;
  }
  const maxAbs = Math.max(1, ...Object.values(pivot).map(p => Math.abs(p.total)));

  return (
    <div>
      {/* Totals bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10, marginBottom: 14,
      }}>
        {['CS','ROC','ROP','LEAPS'].map(s => (
          <div key={s} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 14px',
            borderLeft: `3px solid ${STRATEGY_META[s].color}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {STRATEGY_META[s].icon} {STRATEGY_META[s].label}
            </div>
            <div style={{
              fontFamily: 'var(--fm)', fontSize: 22, fontWeight: 700,
              color: grandTotal[s] > 0 ? 'var(--green)' : grandTotal[s] < 0 ? 'var(--red)' : 'var(--text-primary)',
              marginTop: 4,
            }}>
              {fmtUsd(grandTotal[s])}
            </div>
          </div>
        ))}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--gold)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            TOTAL {year || 'TODOS'}
          </div>
          <div style={{
            fontFamily: 'var(--fm)', fontSize: 24, fontWeight: 800,
            color: grandTotal.total > 0 ? 'var(--green)' : grandTotal.total < 0 ? 'var(--red)' : 'var(--text-primary)',
            marginTop: 4,
          }}>
            {fmtUsd(grandTotal.total)}
          </div>
        </div>
      </div>

      {/* Monthly pivot table */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 14, marginBottom: 14,
      }}>
        <div style={{
          fontFamily: 'var(--fd)', fontSize: 14, color: 'var(--gold)',
          marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px',
        }}>
          Ingresos realizados por mes
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
          <thead>
            <tr style={{ background: 'var(--subtle-bg)' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-tertiary)' }}>Mes</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: STRATEGY_META.CS.color }}>🎯 CS</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: STRATEGY_META.ROC.color }}>📞 ROC</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: STRATEGY_META.ROP.color }}>🛡 ROP</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: STRATEGY_META.LEAPS.color }}>📅 LEAPS</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--gold)' }}>Total</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-tertiary)' }}>Trades</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-tertiary)', width: 160 }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(pivot).map(m => {
              const p = pivot[m];
              const pct = Math.abs(p.total) / maxAbs * 100;
              return (
                <tr key={m} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{MONTHS[parseInt(m) - 1]}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{p.CS !== 0 ? fmtUsd(p.CS) : '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{p.ROC !== 0 ? fmtUsd(p.ROC) : '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{p.ROP !== 0 ? fmtUsd(p.ROP) : '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{p.LEAPS !== 0 ? fmtUsd(p.LEAPS) : '—'}</td>
                  <td style={{
                    padding: '6px 10px', textAlign: 'right', fontWeight: 700,
                    color: p.total > 0 ? 'var(--green)' : p.total < 0 ? 'var(--red)' : 'var(--text-primary)',
                  }}>{p.total !== 0 ? fmtUsd(p.total) : '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-tertiary)' }}>{p.n || '—'}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{
                      height: 8, background: 'var(--subtle-bg)', borderRadius: 4, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: p.total >= 0 ? 'var(--green)' : 'var(--red)',
                      }}/>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Planner modal ──────────────────────────────────────────────────
function PlannerModal({ strategy, editing, onClose, onSaved }) {
  const [form, setForm] = useState(() => editing || {
    strategy,
    account: 'IB',
    trade_date: new Date().toISOString().slice(0, 10),
    expiration_date: '',
    underlying: '',
    price: '',
    delta: '',
    short_strike: '',
    long_strike: '',
    credit: '',
    commission: strategy === 'CS' ? 0.02611 : strategy === 'ROC' ? 0.00416 : 0.0102,
    rc_at_risk_pct: 0.3,
    bankroll: '',
    actual_contracts: '',
    floor_ceiling: '',
    status: 'OPEN',
  });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Live preview via /api/options/calc
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`${API_URL}/api/options/calc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const d = await r.json();
        if (d.ok) setPreview(d.trade);
      } catch {}
    }, 250);
    return () => clearTimeout(id);
  }, [form]);

  const upd = (k, v) => setForm(prev => ({ ...prev, [k]: v === '' ? null : v }));

  const save = async () => {
    setSaving(true); setSaveError('');
    try {
      const url = editing
        ? `${API_URL}/api/options/trades/${editing.id}`
        : `${API_URL}/api/options/trades`;
      const r = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--fd)', fontSize: 18, color: 'var(--gold)' }}>
            {editing ? 'Editar trade' : 'Nuevo trade'} — {STRATEGY_META[strategy].label}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-secondary)',
            fontSize: 20, cursor: 'pointer',
          }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Inputs */}
          <div>
            <div style={sectionTitle}>Trade setup</div>
            <FormField label="Underlying" val={form.underlying} on={(v) => upd('underlying', v.toUpperCase())} />
            <FormField label="Trade date" type="date" val={form.trade_date} on={(v) => upd('trade_date', v)} />
            <FormField label="Expiration" type="date" val={form.expiration_date} on={(v) => upd('expiration_date', v)} />
            <FormField label="Price" type="number" val={form.price} on={(v) => upd('price', parseFloat(v) || '')} />
            <FormField label="Delta" type="number" step="0.01" val={form.delta} on={(v) => upd('delta', parseFloat(v) || '')} />
            <FormField label="Short strike" type="number" val={form.short_strike} on={(v) => upd('short_strike', parseFloat(v) || '')} />
            {strategy === 'CS' && (
              <FormField label="Long strike" type="number" val={form.long_strike} on={(v) => upd('long_strike', parseFloat(v) || '')} />
            )}
            <FormField label="Credit/share" type="number" step="0.01" val={form.credit} on={(v) => upd('credit', parseFloat(v) || '')} />
            <FormField label="Commission/sh" type="number" step="0.001" val={form.commission} on={(v) => upd('commission', parseFloat(v) || '')} />
            <FormField label="Floor/Ceiling" type="number" val={form.floor_ceiling} on={(v) => upd('floor_ceiling', parseFloat(v) || '')} />
            {strategy === 'CS' && (
              <>
                <div style={sectionTitle}>Kelly sizing</div>
                <FormField label="% RC at risk" type="number" step="0.01" val={form.rc_at_risk_pct} on={(v) => upd('rc_at_risk_pct', parseFloat(v) || '')} />
                <FormField label="Bankroll" type="number" val={form.bankroll} on={(v) => upd('bankroll', parseFloat(v) || '')} />
              </>
            )}
            <FormField label="Actual contracts" type="number" val={form.actual_contracts} on={(v) => upd('actual_contracts', parseInt(v) || '')} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <select value={form.account} onChange={(e) => upd('account', e.target.value)} style={selectStyle}>
                <option value="IB">IB</option>
                <option value="TASTY">TASTY</option>
              </select>
              <select value={form.status} onChange={(e) => upd('status', e.target.value)} style={selectStyle}>
                {['OPEN','EXPIRED','CLOSED','ROLLED','ASSIGNED','IDEA'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Preview */}
          <div>
            <div style={sectionTitle}>Preview calculado</div>
            {preview ? (
              <div style={{ fontFamily: 'var(--fm)', fontSize: 11 }}>
                <PreviewRow lbl="DTE" val={preview.dte ? `${preview.dte}d` : '—'} />
                <PreviewRow lbl="Prob OTM" val={fmtPct(preview.prob_otm)} />
                {strategy === 'CS' && <PreviewRow lbl="Spread" val={fmtNum(preview.spread, 0)} />}
                <PreviewRow lbl="Net credit" val={fmtNum(preview.net_credit, 4)} />
                <PreviewRow lbl="Risk capital" val={fmtNum(preview.risk_capital, 2)} />
                <PreviewRow lbl="RORC" val={fmtPct(preview.rorc)} />
                <PreviewRow lbl="ARORC" val={fmtPct(preview.arorc)} big />
                {strategy === 'CS' && (
                  <>
                    <PreviewRow lbl="Kelly %" val={fmtPct(preview.kelly_pct)} />
                    <PreviewRow lbl="Max contracts" val={preview.max_contracts ?? '—'} />
                    <PreviewRow lbl="Rule 1 margin" val={fmtUsd(preview.rule1_max_margin)} />
                    <PreviewRow lbl="Target credit @ 48%" val={fmtNum(preview.target_credit, 2)} />
                  </>
                )}
                <PreviewRow lbl="Shares" val={preview.shares ?? '—'} />
                <PreviewRow lbl="Net credit total" val={fmtUsd(preview.net_credit_total)} big />
                <PreviewRow lbl="Risk total" val={fmtUsd(preview.risk_capital_total)} />
              </div>
            ) : (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                Rellena los campos para ver la preview en tiempo real.
              </div>
            )}
          </div>
        </div>

        {saveError && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 10 }}>{saveError}</div>}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{
            ...btnPrimary,
            background: STRATEGY_META[strategy].color,
            opacity: saving ? 0.5 : 1,
          }}>
            {saving ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear trade')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, val, on, type = 'text', step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
      <label style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 110, textTransform: 'uppercase', letterSpacing: '.3px' }}>
        {label}
      </label>
      <input
        type={type}
        step={step}
        value={val || ''}
        onChange={(e) => on(e.target.value)}
        style={{
          flex: 1, background: 'var(--subtle-bg)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px',
          fontSize: 11, fontFamily: 'var(--fm)',
        }}
      />
    </div>
  );
}

function PreviewRow({ lbl, val, big }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', borderBottom: '1px solid var(--border)',
      ...(big ? { fontSize: 13, fontWeight: 700, color: 'var(--gold)' } : {}),
    }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{lbl}</span>
      <span style={{ color: big ? 'var(--gold)' : 'var(--text-primary)' }}>{val}</span>
    </div>
  );
}

// ─── Close modal ────────────────────────────────────────────────────
function CloseModal({ trade, onClose, onSave }) {
  const [status, setStatus] = useState('EXPIRED');
  const [result_date, setResultDate] = useState(new Date().toISOString().slice(0, 10));
  const [closing_debit, setClosingDebit] = useState(0);

  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 18, color: 'var(--gold)', marginBottom: 14 }}>
          Cerrar trade — {trade.underlying}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Entry: {fmtDate(trade.trade_date)} · Net credit: {fmtUsd(trade.net_credit_total)}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ fontSize: 11 }}>Status:
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selectStyle, marginLeft: 6 }}>
              <option>EXPIRED</option>
              <option>CLOSED</option>
              <option>ASSIGNED</option>
              <option>ROLLED</option>
            </select>
          </label>
          <label style={{ fontSize: 11 }}>Result date:
            <input type="date" value={result_date} onChange={(e) => setResultDate(e.target.value)} style={{ ...selectStyle, marginLeft: 6 }} />
          </label>
          {status !== 'EXPIRED' && (
            <label style={{ fontSize: 11 }}>Closing debit (per share, negative to buy back):
              <input type="number" step="0.01" value={closing_debit} onChange={(e) => setClosingDebit(parseFloat(e.target.value) || 0)} style={{ ...selectStyle, marginLeft: 6, width: 100 }} />
            </label>
          )}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button
            onClick={() => onSave(trade, { status, result_date, closing_debit })}
            style={btnPrimary}
          >Guardar cierre</button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────
const modalBackdrop = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: 'var(--card)', border: '1px solid var(--gold)',
  borderRadius: 12, padding: 20, maxWidth: 800, width: '100%',
  maxHeight: '90vh', overflow: 'auto',
};

const sectionTitle = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px',
  color: 'var(--gold)', marginBottom: 8, marginTop: 10,
  paddingBottom: 4, borderBottom: '1px solid var(--border)',
};

const selectStyle = {
  background: 'var(--subtle-bg)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px',
  fontSize: 11, fontFamily: 'var(--fm)',
};

const btnPrimary = {
  background: 'var(--gold)', color: '#000', border: 'none',
  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
  cursor: 'pointer',
};

const btnSecondary = {
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8,
  fontSize: 12, cursor: 'pointer',
};

// ─── Orphans view (IB trades not logged in Excel) ───────────────────
function OrphansView({ orphans, stats, loading, year, ticker, onYearChange, onTickerChange, onCreate }) {
  const amber = '#f59e0b';
  const amberBg = 'rgba(217, 119, 6, 0.06)';
  const amberBorder = 'rgba(217, 119, 6, 0.35)';

  const yearOptions = [
    { v: '', l: 'Todos' },
    ...((stats.by_year || []).map(y => ({ v: String(y.year), l: `${y.year} (${y.count})` }))),
  ];

  const statusColor = (s) => {
    const u = (s || '').toUpperCase();
    if (u === 'OPEN') return '#3b82f6';
    if (u === 'EXPIRED') return 'var(--green)';
    if (u === 'CLOSED') return 'var(--gold)';
    if (u === 'ASSIGNED') return amber;
    if (u === 'ROLLED') return '#a855f7';
    return 'var(--text-tertiary)';
  };

  return (
    <div>
      {/* Filter strip */}
      <div style={{
        background: amberBg, border: `1px solid ${amberBorder}`,
        borderRadius: 12, padding: '10px 14px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-tertiary)' }}>
          Filtros:
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Año:</span>
          <select
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            style={selectStyle}
          >
            {yearOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Ticker:</span>
          <input
            type="text"
            placeholder="ej. KHC"
            value={ticker}
            onChange={(e) => onTickerChange(e.target.value.toUpperCase().trim())}
            style={{ ...selectStyle, width: 110, textTransform: 'uppercase' }}
          />
        </div>
        {(year || ticker) && (
          <button
            onClick={() => { onYearChange(''); onTickerChange(''); }}
            style={btnSecondary}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 8, marginBottom: 14,
      }}>
        <div style={{
          background: 'var(--card)', border: `1px solid ${amberBorder}`,
          borderLeft: `3px solid ${amber}`,
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Total sin loguear
          </div>
          <div style={{ fontFamily: 'var(--fm)', fontSize: 18, fontWeight: 700, color: amber, marginTop: 2 }}>
            {orphans.length}
          </div>
        </div>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Credit total IB
          </div>
          <div style={{ fontFamily: 'var(--fm)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
            {fmtUsd(stats.total_credit)}
          </div>
        </div>
        {(stats.by_status || []).slice(0, 4).map(s => (
          <div key={s.status} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${statusColor(s.status)}`,
            borderRadius: 10, padding: '10px 12px',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {s.status || '—'}
            </div>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              {s.count}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
            Cargando trades huérfanos...
          </div>
        ) : orphans.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
            No hay trades sin loguear. Excel está al día.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
            <thead>
              <tr style={{ background: 'var(--subtle-bg)', borderBottom: `1px solid ${amberBorder}` }}>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Ticker</th>
                <th style={thStyle}>Tipo</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Strike</th>
                <th style={thStyle}>Expiry</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Contracts</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Credit</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{fmtDate(o.fecha)}</td>
                  <td style={{ ...tdStyle, color: 'var(--gold)', fontWeight: 600 }}>{o.ticker}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 10,
                      background: o.opt_tipo === 'P' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: o.opt_tipo === 'P' ? '#ef4444' : '#22c55e',
                    }}>
                      {o.opt_tipo}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(o.opt_strike, 2)}</td>
                  <td style={tdStyle}>{fmtDate(o.opt_expiry)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{o.opt_contracts}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: Number(o.opt_credit_total) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmtUsd(o.opt_credit_total)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 10,
                      background: 'var(--subtle-bg)',
                      color: statusColor(o.opt_status),
                      border: `1px solid ${statusColor(o.opt_status)}40`,
                    }}>
                      {o.opt_status || '—'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      onClick={() => onCreate(o)}
                      style={{
                        background: amber, color: '#000', border: 'none',
                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ➕ Crear en Excel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* By-ticker breakdown */}
      {!loading && (stats.by_ticker || []).length > 0 && (
        <div style={{
          marginTop: 14, background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Por ticker
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(stats.by_ticker || []).slice(0, 30).map(t => (
              <button
                key={t.ticker}
                onClick={() => onTickerChange(t.ticker)}
                style={{
                  background: 'var(--subtle-bg)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '4px 8px', fontSize: 10,
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  fontFamily: 'var(--fm)',
                }}
              >
                <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{t.ticker}</span>
                <span style={{ marginLeft: 4, color: amber }}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '8px 12px', textAlign: 'left',
  fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px',
  color: 'var(--text-tertiary)', fontWeight: 600,
};

const tdStyle = {
  padding: '8px 12px', color: 'var(--text-primary)',
};
