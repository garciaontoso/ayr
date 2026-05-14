// Sprint 23.4 — Cockpit: vista one-glance de la empresa con métricas críticas
// para decisión rápida. Entre Resumen y Cost Basis en el sistema de tabs.
//
// Filosofía: Resumen es exhaustivo (35 secciones). Cockpit es decisión en 30s.
// 4 zonas: estado actual / valoración / dividendo / acción.

import { useState, useEffect } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { _sf, n as _n, fP, fM, fX } from '../../utils/formatters';
import { API_URL } from '../../constants/index.js';

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
  const { cfg, fin, comp, fmpExtra } = useAnalysis();
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
