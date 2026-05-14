// Sprint 23.4 — Cockpit: vista one-glance de la empresa con métricas críticas
// para decisión rápida. Entre Resumen y Cost Basis en el sistema de tabs.
//
// Filosofía: Resumen es exhaustivo (35 secciones). Cockpit es decisión en 30s.
// 4 zonas: estado actual / valoración / dividendo / acción.

import { useState, useEffect } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { _sf, n as _n, fP, fM, fX } from '../../utils/formatters';
import { API_URL } from '../../constants/index.js';
import BarChart from '../ui/BarChart.jsx';

// ── Card primitive ──
function Card({ title, children, color = 'var(--gold)', icon }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color, textTransform: 'uppercase', fontFamily: 'var(--fm)' }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{title}
      </div>
      {children}
    </div>
  );
}

// ── Metric row primitive ──
function M({ label, value, hint, color = 'var(--text-primary)', big = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, fontWeight: 700, color, fontFamily: 'var(--fm)' }}>
        {value}
        {hint && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4, fontWeight: 400 }}>{hint}</span>}
      </span>
    </div>
  );
}

function clrPnl(v) { return v == null ? 'var(--text-tertiary)' : v >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'; }
function clrYield(v) { return v == null ? 'var(--text-tertiary)' : v >= 4 ? 'var(--green)' : v >= 2 ? 'var(--gold)' : 'var(--text-secondary)'; }
function clrScore(v, max = 11) {
  if (v == null) return 'var(--text-tertiary)';
  const pct = v / max;
  if (pct >= 0.7) return 'var(--green, #22c55e)';
  if (pct >= 0.45) return 'var(--gold, #d4af37)';
  return 'var(--red, #ef4444)';
}

export default function CockpitTab() {
  const { cfg, fin, comp, fmpExtra, CHART_YEARS, chartLabels } = useAnalysis();
  const [aportaData, setAportaData] = useState(null);
  const [aportaLoading, setAportaLoading] = useState(false);

  const ticker = cfg?.ticker;
  const price = cfg?.price;

  // Fetch Aporta o Aparta verdict for this ticker
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setAportaLoading(true);
    fetch(`${API_URL}/api/dividendos/aporta-o-aparta?tickers=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const r = (d.results || [])[0] || null;
        setAportaData(r);
      })
      .catch(() => { if (!cancelled) setAportaData(null); })
      .finally(() => { if (!cancelled) setAportaLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // ── Extract key metrics ──
  const years = Object.keys(fin || {}).filter(y => /^\d{4}$/.test(y)).sort();
  const lastYear = years.length ? years[years.length - 1] : null;
  const prevYear = years.length > 1 ? years[years.length - 2] : null;
  const lastFin = lastYear ? fin[lastYear] : {};
  const lastComp = lastYear ? comp[lastYear] : {};

  // Position (from POS_STATIC injected via cfg)
  const myShares = cfg?.shares || 0;
  const myCost = cfg?.cost || 0;
  const _myAvg = myShares > 0 ? myCost / myShares : 0;
  const myValue = myShares * (price || 0);
  const myPnl = myValue - myCost;
  const myPnlPct = myCost > 0 ? (myPnl / myCost) * 100 : null;

  // Yield + payout
  const yld = (lastFin.dps && price) ? (lastFin.dps / price) * 100 : null;
  const payout = (lastFin.dps && lastFin.eps) ? (lastFin.dps / lastFin.eps) * 100 : null;

  // Valuation
  const pe = (lastFin.eps && price) ? price / lastFin.eps : null;
  const ps = lastFin.revenue && fmpExtra?.sharesOutstanding && price
    ? (price * fmpExtra.sharesOutstanding) / lastFin.revenue : null;

  // Quality
  const fcfCoverage = (lastComp.fcf && lastFin.dps && fmpExtra?.sharesOutstanding)
    ? lastComp.fcf / (lastFin.dps * fmpExtra.sharesOutstanding) : null;
  const debtEquity = lastComp.de;
  const roe = lastComp.roe;
  const roic = lastComp.roic;

  // Growth (5y CAGR)
  function cagr(field) {
    const ys = years.slice(-5);
    if (ys.length < 2) return null;
    const a = fin[ys[0]]?.[field], b = fin[ys[ys.length - 1]]?.[field];
    if (!a || !b || a <= 0 || b <= 0) return null;
    return ((Math.pow(b / a, 1 / (ys.length - 1)) - 1) * 100);
  }
  const dpsGrowth5 = cagr('dps');
  const epsGrowth5 = cagr('eps');
  const fcfYoY = (lastComp.fcf && prevYear && comp[prevYear]?.fcf)
    ? ((lastComp.fcf - comp[prevYear].fcf) / Math.abs(comp[prevYear].fcf)) * 100 : null;

  // Aporta score
  const aportaScore = aportaData?.pass_count;
  const aportaTotal = aportaData?.total || 11;
  const aportaVerdict = aportaData?.verdict;

  // Action banner color
  const actionBanner = (() => {
    if (!aportaVerdict) return { bg: 'rgba(148,163,184,.08)', fg: 'var(--text-tertiary)', label: 'Sin veredicto Aporta o Aparta' };
    if (aportaVerdict === 'APORTA') return { bg: 'rgba(34,197,94,.12)', fg: 'var(--green, #22c55e)', label: `🟢 APORTA · ${aportaScore}/${aportaTotal} criterios Lowell Miller` };
    if (aportaVerdict === 'VIGILAR') return { bg: 'rgba(212,175,55,.12)', fg: 'var(--gold, #d4af37)', label: `🟡 VIGILAR · ${aportaScore}/${aportaTotal} — algunos flancos débiles` };
    return { bg: 'rgba(239,68,68,.12)', fg: 'var(--red, #ef4444)', label: `🔴 APARTA · ${aportaScore}/${aportaTotal} — no cumple Miller` };
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header banner — veredicto general */}
      <div style={{
        background: actionBanner.bg,
        border: `1px solid ${actionBanner.fg}40`,
        borderRadius: 14,
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: 1, fontFamily: 'var(--fm)' }}>VEREDICTO COCKPIT</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: actionBanner.fg, marginTop: 2 }}>
            {aportaLoading ? '⏳ Cargando…' : actionBanner.label}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--fm)' }}>
            {price ? `$${_sf(price, 2)}` : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{ticker} precio actual</div>
        </div>
      </div>

      {/* 4 zonas grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>

        {/* Zona 1: Mi posición */}
        <Card title="Mi posición" icon="📊" color="#60a5fa">
          {myShares > 0 ? (
            <>
              <M label="Shares" value={_sf(myShares, 0)} />
              <M label="Coste medio" value={`$${_sf(_myAvg, 2)}`} />
              <M label="Valor actual" value={`$${_sf(myValue, 0)}`} />
              <M label="P&L $" value={`${myPnl >= 0 ? '+' : ''}$${_sf(myPnl, 0)}`} color={clrPnl(myPnl)} />
              <M label="P&L %" value={myPnlPct != null ? `${myPnlPct >= 0 ? '+' : ''}${_sf(myPnlPct, 1)}%` : '—'} color={clrPnl(myPnlPct)} big />
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 12, textAlign: 'center' }}>
              No tienes posición en {ticker || 'esta empresa'}
            </div>
          )}
        </Card>

        {/* Zona 2: Dividendo */}
        <Card title="Dividendo" icon="💰" color="#22c55e">
          <M label="Yield actual" value={yld != null ? `${_sf(yld, 2)}%` : '—'} color={clrYield(yld)} big />
          <M label="DPS último año" value={lastFin.dps ? `$${_sf(lastFin.dps, 2)}` : '—'} />
          <M label="Payout / Beneficio" value={payout != null ? `${_sf(payout, 0)}%` : '—'} color={payout != null && payout < 60 ? 'var(--green)' : payout != null && payout < 90 ? 'var(--gold)' : 'var(--red)'} />
          <M label="DPS crecimiento 5y" value={dpsGrowth5 != null ? `${dpsGrowth5 >= 0 ? '+' : ''}${_sf(dpsGrowth5, 1)}%/y` : '—'} color={clrPnl(dpsGrowth5)} />
          <M label="FCF cubre dividendo" value={fcfCoverage != null ? `${_sf(fcfCoverage, 1)}x` : '—'} color={fcfCoverage != null && fcfCoverage >= 1.5 ? 'var(--green)' : 'var(--gold)'} />
        </Card>

        {/* Zona 3: Valoración rápida */}
        <Card title="Valoración" icon="🔍" color="#60a5fa">
          <M label="P/E" value={pe != null ? _sf(pe, 1) : '—'} color={pe != null && pe < 20 ? 'var(--green)' : pe != null && pe < 30 ? 'var(--gold)' : 'var(--red)'} />
          <M label="P/S" value={ps != null ? _sf(ps, 1) : '—'} color={ps != null && ps < 1.5 ? 'var(--green)' : 'var(--text-primary)'} />
          <M label="EV/EBITDA" value={lastComp.eve != null ? `${_sf(lastComp.eve, 1)}x` : '—'} />
          <M label="ROE" value={roe != null ? `${_sf(roe, 1)}%` : '—'} color={roe != null && roe >= 15 ? 'var(--green)' : roe != null && roe >= 10 ? 'var(--gold)' : 'var(--text-primary)'} />
          <M label="ROIC" value={roic != null ? `${_sf(roic, 1)}%` : '—'} color={roic != null && roic >= 10 ? 'var(--green)' : 'var(--text-primary)'} />
        </Card>

        {/* Zona 4: Salud financiera */}
        <Card title="Salud" icon="🏛" color="#a78bfa">
          <M label="Debt/Equity" value={debtEquity != null ? _sf(debtEquity, 2) : '—'} color={debtEquity != null && debtEquity < 1 ? 'var(--green)' : debtEquity != null && debtEquity < 2 ? 'var(--gold)' : 'var(--red)'} />
          <M label="EPS crec. 5y" value={epsGrowth5 != null ? `${epsGrowth5 >= 0 ? '+' : ''}${_sf(epsGrowth5, 1)}%/y` : '—'} color={clrPnl(epsGrowth5)} />
          <M label="FCF YoY" value={fcfYoY != null ? `${fcfYoY >= 0 ? '+' : ''}${_sf(fcfYoY, 1)}%` : '—'} color={clrPnl(fcfYoY)} />
          <M label="FCF último" value={lastComp.fcf ? fM(lastComp.fcf) + ' M' : '—'} />
          <M label="Ventas" value={lastFin.revenue ? fM(lastFin.revenue) + ' M' : '—'} />
        </Card>

      </div>

      {/* Aporta o Aparta detalle de los 11 criterios */}
      {aportaData?.criteria && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: actionBanner.fg, marginBottom: 12, fontFamily: 'var(--fm)' }}>
            <span style={{ marginRight: 6 }}>📋</span>11 CRITERIOS LOWELL MILLER — {aportaScore}/{aportaTotal}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {aportaData.criteria.map(c => (
              <div key={c.id} style={{
                padding: 10,
                background: c.pass ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)',
                border: `1px solid ${c.pass ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                borderRadius: 8,
                fontSize: 11,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: c.pass ? 'var(--green)' : 'var(--red)' }}>
                    {c.pass ? '✓' : '✗'} #{c.id}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {c.value != null ? (
                      typeof c.value === 'number'
                        ? (c.id === 1 || c.id === 2 ? _sf(c.value, 2) + (c.id === 2 ? 'x' : '') : _sf(c.value, 1) + (c.id === 9 || c.id === 8 || c.id === 10 ? '' : '%'))
                        : c.value
                    ) : '—'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla histórica 10 años — TODO lo que se mira por año */}
      <HistoricalTable years={CHART_YEARS || []} labels={chartLabels || []} fin={fin || {}} comp={comp || {}} fmpExtra={fmpExtra || {}} />

      {/* Footer hint */}
      <div style={{
        padding: 10,
        background: 'rgba(96,165,250,.06)',
        border: '1px solid rgba(96,165,250,.2)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-secondary)',
      }}>
        🎯 <b>Cockpit</b> — vista de decisión en 30s. Para análisis exhaustivo ve a <b>Resumen</b>. Para tesis cualitativa ve a <b>Tesis</b>. Para los 11 criterios completos con explicaciones ve a la pestaña <b>🌳 Aporta o Aparta</b> en cartera.
      </div>
    </div>
  );
}

// ─── HistoricalTable — 10y × 30+ métricas EN SECCIONES con charts ──────────
// Cada GRUPO de métricas tiene su propia sección con:
//   - Tabla compact de las filas del grupo (years × metrics)
//   - Grid de mini-charts debajo (2-3 charts visuales del grupo)
// Color semáforo según thresholds Lowell Miller.
function HistoricalTable({ years, labels, fin, comp, fmpExtra }) {
  if (!years || years.length === 0) return null;

  // Helper: get year value with fallbacks across fin/comp
  const v = (y, src, key) => {
    const o = (src === 'fin' ? fin[y] : comp[y]) || {};
    return o[key];
  };

  // YoY growth helper
  const yoy = (y, prev, src, key) => {
    const cur = v(y, src, key);
    const old = v(prev, src, key);
    if (cur == null || old == null || old === 0) return null;
    return ((cur - old) / Math.abs(old)) * 100;
  };

  // CAGR helper over N years (from first non-null to last non-null in subset)
  const cagr = (ys, src, key) => {
    const vals = ys.map(y => v(y, src, key)).filter(x => x != null && x > 0);
    if (vals.length < 2) return null;
    const a = vals[0], b = vals[vals.length - 1];
    return ((Math.pow(b / a, 1 / (vals.length - 1)) - 1) * 100);
  };

  // Computed per-year metrics (not directly in fin/comp)
  const yieldOnEOY = (y) => {
    const dps = v(y, 'fin', 'dps');
    // Sin precio EOY histórico — usar comp.divYield si existe, sino skip
    const dy = v(y, 'comp', 'divYield');
    return dy != null ? dy : null;
  };
  const payoutRatio = (y) => {
    const dps = v(y, 'fin', 'dps');
    const eps = v(y, 'fin', 'eps');
    if (!dps || !eps || eps <= 0) return null;
    return (dps / eps) * 100;
  };
  const fcfCoverage = (y) => {
    const fcf = v(y, 'comp', 'fcf');
    const dps = v(y, 'fin', 'dps');
    const shares = fmpExtra?.sharesOutstanding;
    if (!fcf || !dps || !shares) return null;
    const divPaid = dps * shares;
    return divPaid > 0 ? fcf / divPaid : null;
  };
  const capex = (y) => {
    const ocf = v(y, 'fin', 'ocf');
    const fcf = v(y, 'comp', 'fcf');
    if (ocf == null || fcf == null) return null;
    return ocf - fcf;  // capex = OCF - FCF
  };

  // ── Format helpers ──
  const fmtMoney = (val) => val == null ? '—' : (Math.abs(val) >= 1e9 ? `$${(val/1e9).toFixed(1)}B` : Math.abs(val) >= 1e6 ? `$${(val/1e6).toFixed(0)}M` : `$${val.toFixed(0)}`);
  const fmtPct = (val) => val == null ? '—' : `${val.toFixed(1)}%`;
  const fmtX = (val) => val == null ? '—' : `${val.toFixed(2)}x`;
  const fmtUsd = (val) => val == null ? '—' : `$${val.toFixed(2)}`;
  const fmtRatio = (val) => val == null ? '—' : val.toFixed(2);

  // Color helpers (semáforo por threshold)
  const clr = {
    yld: v => v == null ? 'var(--text-tertiary)' : v >= 4 ? 'var(--green)' : v >= 2 ? 'var(--gold)' : 'var(--text-secondary)',
    payout: v => v == null ? 'var(--text-tertiary)' : v < 60 ? 'var(--green)' : v < 90 ? 'var(--gold)' : 'var(--red)',
    de: v => v == null ? 'var(--text-tertiary)' : v < 1 ? 'var(--green)' : v < 2 ? 'var(--gold)' : 'var(--red)',
    fcfCov: v => v == null ? 'var(--text-tertiary)' : v >= 1.5 ? 'var(--green)' : v >= 1 ? 'var(--gold)' : 'var(--red)',
    roe: v => v == null ? 'var(--text-tertiary)' : v >= 15 ? 'var(--green)' : v >= 10 ? 'var(--gold)' : 'var(--text-secondary)',
    roic: v => v == null ? 'var(--text-tertiary)' : v >= 10 ? 'var(--green)' : v >= 5 ? 'var(--gold)' : 'var(--text-secondary)',
    pe: v => v == null ? 'var(--text-tertiary)' : v < 20 ? 'var(--green)' : v < 30 ? 'var(--gold)' : 'var(--red)',
    pos: v => v == null ? 'var(--text-tertiary)' : v >= 0 ? 'var(--green)' : 'var(--red)',
    none: () => 'var(--text-primary)',
  };

  // ── Group definitions: each group has rows + charts ──
  const GROUPS = [
    {
      title: '📈 CRECIMIENTO',
      color: '#fb923c',
      rows: [
        { label: 'Ventas (Revenue)', get: y => v(y, 'fin', 'revenue'), fmt: fmtMoney, color: clr.none, cagr: true },
        { label: 'Ventas YoY %', get: (y, i) => i > 0 ? yoy(y, years[i-1], 'fin', 'revenue') : null, fmt: fmtPct, color: clr.pos },
        { label: 'EPS', get: y => v(y, 'fin', 'eps'), fmt: fmtUsd, color: clr.none, cagr: true },
        { label: 'EPS YoY %', get: (y, i) => i > 0 ? yoy(y, years[i-1], 'fin', 'eps') : null, fmt: fmtPct, color: clr.pos },
        { label: 'Net Income', get: y => v(y, 'fin', 'netIncome'), fmt: fmtMoney, color: clr.none, cagr: true },
      ],
      charts: [
        { label: 'Ventas (Revenue)', get: y => v(y, 'fin', 'revenue'), color: '#64d2ff', fmt: v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M` },
        { label: 'EPS', get: y => v(y, 'fin', 'eps'), color: '#bf5af2', fmt: v => `$${v.toFixed(2)}` },
        { label: 'Net Income', get: y => v(y, 'fin', 'netIncome'), color: '#34d399', fmt: v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M` },
      ],
    },
    {
      title: '💵 CASH FLOW',
      color: '#34d399',
      rows: [
        { label: 'OCF (Operating CF)', get: y => v(y, 'fin', 'ocf'), fmt: fmtMoney, color: clr.none, cagr: true },
        { label: 'Capex (= OCF − FCF)', get: capex, fmt: fmtMoney, color: clr.none },
        { label: 'FCF (Free Cash Flow)', get: y => v(y, 'comp', 'fcf'), fmt: fmtMoney, color: clr.none, cagr: true },
        { label: 'FCF YoY %', get: (y, i) => i > 0 ? yoy(y, years[i-1], 'comp', 'fcf') : null, fmt: fmtPct, color: clr.pos },
        { label: 'FCF/Ventas %', get: y => { const f = v(y,'comp','fcf'); const r = v(y,'fin','revenue'); return f && r ? (f/r)*100 : null; }, fmt: fmtPct, color: clr.none },
      ],
      charts: [
        { label: 'OCF', get: y => v(y, 'fin', 'ocf'), color: '#34d399', fmt: v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M` },
        { label: 'FCF', get: y => v(y, 'comp', 'fcf'), color: '#22c55e', fmt: v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M` },
        { label: 'Capex', get: capex, color: '#d4af37', fmt: v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M` },
      ],
    },
    {
      title: '📊 MÁRGENES',
      color: '#34d399',
      rows: [
        { label: 'Margen Bruto %', get: y => v(y, 'comp', 'gm'), fmt: fmtPct, color: clr.none },
        { label: 'Margen Operativo %', get: y => v(y, 'comp', 'om'), fmt: fmtPct, color: clr.none },
      ],
      charts: [
        { label: 'Margen Bruto %', get: y => v(y, 'comp', 'gm'), color: '#34d399', fmt: v => `${v.toFixed(1)}%` },
        { label: 'Margen Operativo %', get: y => v(y, 'comp', 'om'), color: '#22c55e', fmt: v => `${v.toFixed(1)}%` },
      ],
    },
    {
      title: '🎯 RETURNS',
      color: '#c8a44e',
      rows: [
        { label: 'ROE %', get: y => v(y, 'comp', 'roe'), fmt: fmtPct, color: clr.roe },
        { label: 'ROIC %', get: y => v(y, 'comp', 'roic'), fmt: fmtPct, color: clr.roic },
      ],
      charts: [
        { label: 'ROE %', get: y => v(y, 'comp', 'roe'), color: '#c8a44e', fmt: v => `${v.toFixed(1)}%` },
        { label: 'ROIC %', get: y => v(y, 'comp', 'roic'), color: '#d4af37', fmt: v => `${v.toFixed(1)}%` },
      ],
    },
    {
      title: '🏛 BALANCE',
      color: '#a78bfa',
      rows: [
        { label: 'D/Equity', get: y => v(y, 'comp', 'de'), fmt: fmtRatio, color: clr.de },
        { label: 'Deuda/FCF', get: y => v(y, 'comp', 'd2fcf'), fmt: fmtX, color: clr.de },
        { label: 'EV/EBITDA', get: y => v(y, 'comp', 'eve'), fmt: fmtX, color: clr.none },
      ],
      charts: [
        { label: 'D/Equity', get: y => v(y, 'comp', 'de'), color: '#a78bfa', fmt: v => v.toFixed(2) },
        { label: 'Deuda/FCF', get: y => v(y, 'comp', 'd2fcf'), color: '#8b5cf6', fmt: v => `${v.toFixed(1)}x` },
        { label: 'EV/EBITDA', get: y => v(y, 'comp', 'eve'), color: '#5b9bd5', fmt: v => `${v.toFixed(1)}x` },
      ],
    },
    {
      title: '💰 DIVIDENDO',
      color: '#22c55e',
      rows: [
        { label: 'DPS (Div/Acción)', get: y => v(y, 'fin', 'dps'), fmt: fmtUsd, color: clr.none, cagr: true },
        { label: 'DPS YoY %', get: (y, i) => i > 0 ? yoy(y, years[i-1], 'fin', 'dps') : null, fmt: fmtPct, color: clr.pos },
        { label: 'Yield %', get: yieldOnEOY, fmt: fmtPct, color: clr.yld },
        { label: 'Payout (DPS/EPS) %', get: payoutRatio, fmt: fmtPct, color: clr.payout },
        { label: 'FCF cubre Div', get: fcfCoverage, fmt: fmtX, color: clr.fcfCov },
      ],
      charts: [
        { label: 'DPS', get: y => v(y, 'fin', 'dps'), color: '#ff9f0a', fmt: v => `$${v.toFixed(2)}` },
        { label: 'Yield %', get: yieldOnEOY, color: '#22c55e', fmt: v => `${v.toFixed(2)}%` },
        { label: 'Payout %', get: payoutRatio, color: '#d4af37', fmt: v => `${v.toFixed(0)}%` },
        { label: 'FCF/Div coverage', get: fcfCoverage, color: '#34d399', fmt: v => `${v.toFixed(1)}x` },
      ],
    },
    {
      title: '🪙 ACCIONES',
      color: '#64d2ff',
      rows: [
        { label: 'Shares Out (M)', get: y => { const s = v(y, 'fin', 'sharesOutstanding'); return s ? s / 1e6 : null; }, fmt: v => v == null ? '—' : v.toFixed(0)+' M', color: clr.none },
      ],
      charts: [
        { label: 'Shares Outstanding (M)', get: y => { const s = v(y, 'fin', 'sharesOutstanding'); return s ? s / 1e6 : null; }, color: '#64d2ff', fmt: v => `${v.toFixed(0)} M` },
      ],
    },
  ];

  // ── Render — header + per-group sections (table + charts grid) ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
          📅 HISTÓRICO {years.length} AÑOS — TODO LO QUE GORKA MIRA
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
          {labels[0]} → {labels[labels.length-1]} · Tabla con color semáforo Lowell Miller + gráficas visuales por grupo
        </div>
      </div>

      {GROUPS.map((g, gi) => (
        <div key={gi} style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {/* Group header */}
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: g.color, fontFamily: 'var(--fm)' }}>
            {g.title}
          </div>

          {/* Table for this group only */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 170, position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>Métrica</th>
                  {years.map((y, i) => (
                    <th key={y} style={{ ...thStyle, textAlign: 'right', minWidth: 60, color: i === years.length - 1 ? 'var(--gold)' : 'var(--text-tertiary)' }}>
                      {labels[i] || y}
                    </th>
                  ))}
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 55, color: 'var(--green)', borderLeft: '1px dashed var(--border)' }}>CAGR 5y</th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 55, color: 'var(--green)' }}>CAGR 10y</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td style={{ ...tdStyle, position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left' }}>
                      {row.label}
                    </td>
                    {years.map((y, i) => {
                      const val = row.get(y, i);
                      return (
                        <td key={y} style={{ ...tdStyle, textAlign: 'right', color: row.color ? row.color(val) : 'var(--text-primary)' }}>
                          {row.fmt(val)}
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: 'right', borderLeft: '1px dashed var(--border)', color: 'var(--text-secondary)' }}>
                      {row.cagr ? (() => {
                        const last5 = years.slice(-5);
                        const vals = last5.map(y => row.get(y)).filter(x => x != null && x > 0);
                        if (vals.length < 2) return '—';
                        const c = ((Math.pow(vals[vals.length-1] / vals[0], 1 / (vals.length - 1)) - 1) * 100);
                        return <span style={{ color: clr.pos(c) }}>{fmtPct(c)}</span>;
                      })() : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {row.cagr ? (() => {
                        const vals = years.map(y => row.get(y)).filter(x => x != null && x > 0);
                        if (vals.length < 2) return '—';
                        const c = ((Math.pow(vals[vals.length-1] / vals[0], 1 / (vals.length - 1)) - 1) * 100);
                        return <span style={{ color: clr.pos(c) }}>{fmtPct(c)}</span>;
                      })() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charts grid for this group */}
          {g.charts && g.charts.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(g.charts.length, 3)}, minmax(0, 1fr))`, gap: 10 }}>
              {g.charts.map((chart, ci) => {
                const data = years.map(y => chart.get(y));
                return (
                  <div key={ci} style={{
                    background: 'var(--bg-primary, rgba(0,0,0,.15))',
                    border: '1px solid var(--row-border, rgba(255,255,255,.05))',
                    borderRadius: 8,
                    padding: 10,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: chart.color, marginBottom: 6, letterSpacing: 0.5, textAlign: 'center' }}>
                      {chart.label}
                    </div>
                    <BarChart
                      data={data}
                      labels={labels}
                      color={chart.color}
                      height={120}
                      showValues={true}
                      formatFn={chart.fmt}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div style={{ padding: 10, fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        Color semáforo: 🟢 cumple threshold Lowell Miller / 🟡 marginal / 🔴 fuera de rango. CAGR calculado del primer al último año con dato no-nulo.
      </div>
    </div>
  );
}

const thStyle = {
  padding: '8px 6px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)',
};

const tdStyle = {
  padding: '5px 6px',
  fontSize: 11,
  borderBottom: '1px solid var(--row-border, rgba(255,255,255,.04))',
  whiteSpace: 'nowrap',
};
