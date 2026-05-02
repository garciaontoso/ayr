// PnLTab — True monthly income & realized P&L breakdown.
//
// Replaces the broken /api/tax-report logic that audit D 2026-05-02 flagged:
//   - Equity realized P&L: Σsells − Σbuys per year (5/7 years had INVERTED sign).
//   - Options income: SUM(ABS(coste)) on credits only — 25× inflated.
//
// Data source: GET /api/pnl/monthly?year=YYYY (requires X-AYR-Auth, supplied by monkey patch).
// Shape: { year, monthly:[{month, dividends_gross, dividends_net, wht,
//          options_closed_pnl, stocks_realized_pnl, total_income,
//          tickers_div:[{ticker,amount}], options_closed:[{ticker,opt_tipo,strike,expiry,pnl}] }],
//          annual:{...}, lifetime:{...}, availableYears:[2025,2024,...], byYear:[...] }
//
// TDZ-safe: useState/useCallback declared BEFORE useEffect (CLAUDE.md rule).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { _sf, fDol } from '../../utils/formatters.js';

// ── Style constants (hoisted) ───────────────────────────────────────────────
const cardBase = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '14px 18px',
};
const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const COLOR_DIV = '#10b981';        // dividendos = green
const COLOR_OPT = '#a855f7';        // opciones cerradas = purple
const COLOR_STK = '#60a5fa';        // capital gains = blue
const COLOR_NEG = '#ef4444';

// Format compact USD with sign
function fmtSigned(v) {
  if (v == null || isNaN(v)) return '—';
  const s = v < 0 ? '-$' : '$';
  return s + Math.abs(Math.round(v)).toLocaleString();
}
function fmtSignedCompact(v) {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e6) return sign + '$' + _sf(a/1e6, 2) + 'M';
  if (a >= 1e3) return sign + '$' + _sf(a/1e3, 1) + 'K';
  return sign + '$' + Math.round(a).toLocaleString();
}

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, highlight }) {
  return (
    <div style={{
      ...cardBase,
      flex: '1 1 200px',
      minWidth: 180,
      borderColor: highlight ? 'var(--gold)' : 'var(--border)',
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontFamily: 'var(--fm)', fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--fb)' }}>{sub}</div>}
    </div>
  );
}

// ── Stacked bar chart of monthly income ─────────────────────────────────────
function MonthlyStackedBars({ monthly, onMonthClick, selectedMonth }) {
  // Compute per-month per-strategy options breakdown from options_closed array.
  // Each m.options_closed entry has shape { strategy, pnl, ... }. Group by strategy.
  const monthlyWithStrategy = useMemo(() => {
    return monthly.map(m => {
      const byStrat = {};
      for (const o of (m.options_closed || [])) {
        const s = o.strategy || 'Other';
        byStrat[s] = (byStrat[s] || 0) + (o.pnl || 0);
      }
      return { ...m, options_by_strategy: byStrat };
    });
  }, [monthly]);

  // Collect all strategies that appear (for legend), sorted by total magnitude
  const strategies = useMemo(() => {
    const totals = {};
    for (const m of monthlyWithStrategy) {
      for (const [s, v] of Object.entries(m.options_by_strategy)) {
        totals[s] = (totals[s] || 0) + Math.abs(v);
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [monthlyWithStrategy]);

  // Compute peak total magnitude across all months (consider negative bars too)
  const peak = useMemo(() => {
    let max = 0;
    for (const m of monthlyWithStrategy) {
      let pos = (m.dividends_net > 0 ? m.dividends_net : 0)
              + (m.stocks_realized_pnl > 0 ? m.stocks_realized_pnl : 0);
      let neg = (m.dividends_net < 0 ? -m.dividends_net : 0)
              + (m.stocks_realized_pnl < 0 ? -m.stocks_realized_pnl : 0);
      for (const v of Object.values(m.options_by_strategy)) {
        if (v > 0) pos += v; else neg += -v;
      }
      max = Math.max(max, pos, neg);
    }
    return max || 1;
  }, [monthlyWithStrategy]);

  const H = 220;          // total chart height
  const halfH = H / 2;    // baseline at middle to allow negative bars
  const BARW = 38;
  const GAP = 12;

  return (
    <div style={{ ...cardBase, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
          Income mensual · stacked por estrategia
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, fontFamily: 'var(--fb)', flexWrap: 'wrap' }}>
          <Legend color={COLOR_DIV} label="Dividendos" />
          {strategies.map(s => (
            <Legend key={s} color={STRATEGY_COLORS[s] || STRATEGY_COLORS.Other} label={s} />
          ))}
          <Legend color={COLOR_STK} label="Capital gains" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: GAP, height: H + 30, position: 'relative' }}>
        {monthlyWithStrategy.map((m, idx) => {
          // Build segments: dividends (single) + per-strategy options (multiple) + capital gains (single)
          const segs = [
            { key: 'div', value: m.dividends_net, color: COLOR_DIV, label: 'Dividendos' },
          ];
          // Options: one segment per strategy present this month, sorted by magnitude
          const stratEntries = Object.entries(m.options_by_strategy).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
          for (const [s, v] of stratEntries) {
            if (v !== 0) segs.push({ key: 'opt:' + s, value: v, color: STRATEGY_COLORS[s] || STRATEGY_COLORS.Other, label: s });
          }
          segs.push({ key: 'stk', value: m.stocks_realized_pnl, color: COLOR_STK, label: 'Stocks' });
          const totalPos = segs.filter(s => s.value > 0).reduce((s, x) => s + x.value, 0);
          const totalNeg = segs.filter(s => s.value < 0).reduce((s, x) => s - x.value, 0);
          const isSelected = selectedMonth === m.month;
          let topOffset = halfH;
          let bottomOffset = halfH;
          const positiveSegs = segs.filter(s => s.value > 0);
          return (
            <div key={m.month}
              onClick={() => onMonthClick(isSelected ? null : m.month)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'pointer',
                opacity: selectedMonth && !isSelected ? 0.4 : 1,
                transition: 'opacity .15s',
                width: BARW,
                position: 'relative',
              }}>
              <div style={{
                position: 'relative', width: BARW, height: H,
                background: isSelected ? 'rgba(200,164,78,.06)' : 'transparent',
                borderRadius: 4,
              }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: halfH, height: 1, background: 'var(--border)', opacity: .5 }}/>
                {positiveSegs.map((s, i) => {
                  const h = (s.value / peak) * (halfH - 4);
                  const top = topOffset - h;
                  topOffset = top;
                  return (
                    <div key={s.key} title={`${s.label}: ${fmtSignedCompact(s.value)}`}
                      style={{
                        position: 'absolute', left: 4, right: 4,
                        top, height: Math.max(h, 0),
                        background: s.color, opacity: .9,
                        borderRadius: i === positiveSegs.length-1 ? '3px 3px 0 0' : 0,
                      }}/>
                  );
                })}
                {segs.filter(s => s.value < 0).map((s) => {
                  const h = (-s.value / peak) * (halfH - 4);
                  const top = bottomOffset;
                  bottomOffset = top + h;
                  return (
                    <div key={s.key} title={`${s.label}: ${fmtSignedCompact(s.value)}`}
                      style={{
                        position: 'absolute', left: 4, right: 4,
                        top, height: Math.max(h, 0),
                        background: s.color, opacity: .6,
                        borderRadius: '0 0 3px 3px',
                      }}/>
                  );
                })}
              </div>
              {(totalPos !== 0 || totalNeg !== 0) && (
                <div style={{
                  position: 'absolute', top: -2 + halfH - (totalPos / peak) * (halfH - 4) - 16,
                  fontSize: 9, color: 'var(--text-secondary)',
                  fontFamily: 'var(--fm)', whiteSpace: 'nowrap',
                }}>
                  {fmtSignedCompact(m.total_income)}
                </div>
              )}
              <div style={{
                fontSize: 10, fontFamily: 'var(--fm)',
                color: isSelected ? 'var(--gold)' : 'var(--text-tertiary)',
                marginTop: 6, fontWeight: isSelected ? 700 : 400,
              }}>
                {MONTH_LABELS[idx]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
      <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }}/>
      {label}
    </div>
  );
}

// ── Monthly summary table ────────────────────────────────────────────────────
function MonthlyTable({ monthly, selectedMonth, setSelectedMonth }) {
  const totals = useMemo(() => monthly.reduce((acc, m) => ({
    dividends_gross: acc.dividends_gross + m.dividends_gross,
    dividends_net: acc.dividends_net + m.dividends_net,
    wht: acc.wht + m.wht,
    options_closed_pnl: acc.options_closed_pnl + m.options_closed_pnl,
    stocks_realized_pnl: acc.stocks_realized_pnl + m.stocks_realized_pnl,
    total_income: acc.total_income + m.total_income,
  }), { dividends_gross:0, dividends_net:0, wht:0, options_closed_pnl:0, stocks_realized_pnl:0, total_income:0 }), [monthly]);

  return (
    <div style={cardBase}>
      <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12 }}>
        Detalle mensual · click para drill down
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--fm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th align="left">Mes</Th>
              <Th>Div bruto</Th>
              <Th>Div neto</Th>
              <Th>WHT</Th>
              <Th>Opciones</Th>
              <Th>Stocks</Th>
              <Th>Total</Th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m, i) => {
              const sel = selectedMonth === m.month;
              return (
                <tr key={m.month}
                  onClick={() => setSelectedMonth(sel ? null : m.month)}
                  style={{
                    cursor: 'pointer',
                    background: sel ? 'rgba(200,164,78,.08)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}>
                  <td style={{ padding: '6px 10px', color: sel ? 'var(--gold)' : 'var(--text-secondary)', fontWeight: sel ? 700 : 400 }}>
                    {MONTH_LABELS[i]}
                  </td>
                  <Td v={m.dividends_gross} />
                  <Td v={m.dividends_net} color={COLOR_DIV} bold />
                  <Td v={-m.wht} />
                  <Td v={m.options_closed_pnl} color={COLOR_OPT} bold />
                  <Td v={m.stocks_realized_pnl} color={COLOR_STK} bold />
                  <Td v={m.total_income} bold highlight />
                </tr>
              );
            })}
            <tr style={{ borderTop: '2px solid var(--gold)', fontWeight: 700 }}>
              <td style={{ padding: '8px 10px', color: 'var(--gold)' }}>TOTAL</td>
              <Td v={totals.dividends_gross} bold />
              <Td v={totals.dividends_net} color={COLOR_DIV} bold />
              <Td v={-totals.wht} />
              <Td v={totals.options_closed_pnl} color={COLOR_OPT} bold />
              <Td v={totals.stocks_realized_pnl} color={COLOR_STK} bold />
              <Td v={totals.total_income} bold highlight />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = 'right' }) {
  return (
    <th style={{
      padding: '6px 10px', fontSize: 9, fontFamily: 'var(--fm)',
      color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px',
      textAlign: align, fontWeight: 600,
    }}>
      {children}
    </th>
  );
}

function Td({ v, color, bold, highlight }) {
  if (v == null || v === undefined) v = 0;
  const isNeg = v < 0;
  const display = v === 0 ? '—' : fmtSignedCompact(v);
  return (
    <td style={{
      padding: '6px 10px', textAlign: 'right',
      color: color || (isNeg && v !== 0 ? COLOR_NEG : 'var(--text-primary)'),
      fontWeight: bold ? 700 : 400,
      background: highlight ? 'rgba(200,164,78,.04)' : 'transparent',
    }}>
      {display}
    </td>
  );
}

// ── Detail panel for a selected month ───────────────────────────────────────
function MonthDetail({ month, divs, options }) {
  return (
    <div style={cardBase}>
      <div style={{ fontSize: 13, fontFamily: 'var(--fm)', color: 'var(--gold)', fontWeight: 700, marginBottom: 12 }}>
        Detalle: {MONTH_LABELS[month - 1]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, fontFamily: 'var(--fm)' }}>
            Dividendos cobrados ({divs.length})
          </div>
          {divs.length === 0
            ? <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Sin pagos</div>
            : divs.map(d => (
                <div key={d.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{d.ticker}</span>
                  <span style={{ color: COLOR_DIV, fontFamily: 'var(--fm)', fontWeight: 600 }}>{fmtSigned(d.amount)}</span>
                </div>
              ))
          }
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, fontFamily: 'var(--fm)' }}>
            Opciones cerradas ({options.length})
          </div>
          {options.length === 0
            ? <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Sin cierres</div>
            : options.map((o, i) => (
                <div key={`${o.ticker}-${o.strike}-${o.expiry}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed var(--border)', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--fm)', fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.ticker} {o.opt_tipo} {o.strike} · {o.expiry}
                  </span>
                  <span style={{ color: o.pnl >= 0 ? COLOR_OPT : COLOR_NEG, fontFamily: 'var(--fm)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {fmtSignedCompact(o.pnl)}
                  </span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ── Multi-year comparison strip ─────────────────────────────────────────────
function ByYearStrip({ byYear, currentYear, onYearClick }) {
  if (!byYear || byYear.length === 0) return null;
  const peak = Math.max(...byYear.map(y => Math.abs(y.total_income))) || 1;
  return (
    <div style={cardBase}>
      <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12 }}>
        Comparativa anual · click para ver año
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {byYear.slice().reverse().map(y => {
          const isCurrent = y.year === currentYear;
          const h = Math.max(2, (Math.abs(y.total_income) / peak) * 80);
          const isNeg = y.total_income < 0;
          return (
            <div key={y.year}
              onClick={() => onYearClick(y.year)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'pointer', minWidth: 70,
                padding: '6px 8px', borderRadius: 6,
                background: isCurrent ? 'rgba(200,164,78,.10)' : 'transparent',
                border: `1px solid ${isCurrent ? 'var(--gold)' : 'var(--border)'}`,
              }}>
              <div style={{
                fontSize: 11, fontFamily: 'var(--fm)', fontWeight: 700,
                color: isNeg ? COLOR_NEG : 'var(--text-primary)', marginBottom: 4,
              }}>
                {fmtSignedCompact(y.total_income)}
              </div>
              <div style={{ width: 36, height: 80, background: 'var(--subtle-bg)', borderRadius: 3, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  height: h, background: isNeg ? COLOR_NEG : 'var(--gold)',
                  opacity: isCurrent ? 1 : 0.55, borderRadius: 3,
                }}/>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: isCurrent ? 'var(--gold)' : 'var(--text-tertiary)', marginTop: 6, fontWeight: isCurrent ? 700 : 400 }}>
                {y.year}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Strategy color palette — keeps Opciones bucket visually consistent
const STRATEGY_COLORS = {
  CSP: '#10b981', CC: '#a855f7', BPS: '#34d399', BCS: '#f87171',
  IC: '#eab308', LP: '#60a5fa', LC: '#5b9bd5', SP: '#10b981', SC: '#a855f7',
  SCALP: '#ff9f0a', // index intraday/weekly — SPX/SPXW/NDX/RUTW ≤7 días
  Other: '#94a3b8',
};
const STRATEGY_DESC = {
  CSP: 'Cash-Secured Puts', CC: 'Covered Calls', BPS: 'Bull Put Spread',
  BCS: 'Bear Call Spread', IC: 'Iron Condor', LP: 'Long Puts (compradas)',
  LC: 'Long Calls (compradas)', SP: 'Short Put', SC: 'Short Call',
  SCALP: 'Scalp/0DTE índices (SPX/SPXW/NDX/RUTW ≤7d)',
  Other: 'Otros / sin categorizar',
};

function StrategyBadge({ strategy }) {
  const c = STRATEGY_COLORS[strategy] || STRATEGY_COLORS.Other;
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 5, background: `${c}20`, border: `1px solid ${c}55`, color: c, fontSize: 10, fontWeight: 700, fontFamily: 'var(--fm)' }}>{strategy}</span>;
}

function BreakdownTable({ title, rows, valueKey, colorKey, extraKey, extraLabel, formatValue, onClick }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={cardBase}>
      <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>{title}</div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--subtle-border)', cursor: onClick ? 'pointer' : 'default' }}
                  onClick={onClick ? () => onClick(r) : undefined}>
                <td style={{ padding: '6px 4px' }}>{colorKey ? <StrategyBadge strategy={r[colorKey]} /> : <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r[Object.keys(r)[0]]}</span>}</td>
                {extraKey && <td style={{ padding: '6px 4px', color: 'var(--text-tertiary)', fontSize: 10 }}>{r[extraKey]} {extraLabel}</td>}
                <td style={{ padding: '6px 4px', textAlign: 'right', color: r[valueKey] >= 0 ? 'var(--gold)' : COLOR_NEG, fontWeight: 700 }}>
                  {formatValue(r[valueKey])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpenPremiumCard({ open_premium }) {
  if (!open_premium) return null;
  const tot = open_premium.total || 0;
  return (
    <div style={{ ...cardBase, borderColor: 'rgba(96,165,250,.3)', background: 'rgba(96,165,250,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Premium en posiciones abiertas</div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.5 }}>NO realizado · suma de credit/debit en grupos donde net_shares ≠ 0. Solo cuenta como income real cuando cierres.</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: tot >= 0 ? '#60a5fa' : COLOR_NEG, fontFamily: 'var(--fm)' }}>{fmtSignedCompact(tot)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4 }}>Por estrategia</div>
          {(open_premium.by_strategy || []).slice(0, 6).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 0' }}>
              <StrategyBadge strategy={s.strategy} />
              <span style={{ color: s.premium >= 0 ? 'var(--text-secondary)' : COLOR_NEG, fontFamily: 'var(--fm)', fontWeight: 600 }}>{fmtSignedCompact(s.premium)}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4 }}>Top tickers</div>
          {(open_premium.by_ticker || []).slice(0, 6).map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 0' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t.ticker}</span>
              <span style={{ color: t.premium >= 0 ? 'var(--text-secondary)' : COLOR_NEG, fontFamily: 'var(--fm)', fontWeight: 600 }}>{fmtSignedCompact(t.premium)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Drill-down table: every closed options trade across the year, filterable by
// strategy. Click any row → highlights ticker. Sortable by close date / P&L.
// Helps user answer "de dónde viene esa pérdida/ganancia" — exactly what they
// need to understand SCALP -$X or CSP +$Y.
function OptionsTradesList({ monthly, selectedStrategy, scopedTitle }) {
  const [sortKey, setSortKey] = useState('closeFecha');
  const [sortDir, setSortDir] = useState('desc');
  const [tickerFilter, setTickerFilter] = useState('');

  const allTrades = useMemo(() => {
    const out = [];
    for (const m of monthly) {
      for (const o of (m.options_closed || [])) {
        if (selectedStrategy && o.strategy !== selectedStrategy) continue;
        out.push({ ...o, month: m.month });
      }
    }
    return out;
  }, [monthly, selectedStrategy]);

  const filtered = useMemo(() => {
    if (!tickerFilter) return allTrades;
    const q = tickerFilter.toLowerCase();
    return allTrades.filter(t => (t.ticker || '').toLowerCase().includes(q));
  }, [allTrades, tickerFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPnl = filtered.reduce((s, t) => s + (t.pnl || 0), 0);
  const winners = filtered.filter(t => (t.pnl || 0) > 0).length;
  const losers = filtered.filter(t => (t.pnl || 0) < 0).length;

  const TH = ({ id, label, align = 'right' }) => (
    <th onClick={() => { if (sortKey === id) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(id); setSortDir(id === 'closeFecha' || id === 'pnl' ? 'desc' : 'asc'); } }}
      style={{ padding: '6px 8px', fontSize: 9, color: sortKey === id ? 'var(--gold)' : 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontWeight: 600 }}>
      {label} {sortKey === id ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );

  if (allTrades.length === 0) return null;

  return (
    <div style={cardBase}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontFamily: 'var(--fm)', color: 'var(--text-primary)', fontWeight: 700 }}>
            {scopedTitle || 'Trades cerrados'} · {filtered.length}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            ↑ {winners} winners · ↓ {losers} losers · Net <b style={{ color: totalPnl >= 0 ? '#30d158' : '#ef4444' }}>{fmtSignedCompact(totalPnl)}</b>
          </div>
        </div>
        <input value={tickerFilter} onChange={e => setTickerFilter(e.target.value)}
          placeholder="Filtrar ticker..."
          style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--fm)', width: 130, outline: 'none' }} />
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--fm)' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <TH id="closeFecha" label="Cierre" align="left" />
              <TH id="ticker" label="Ticker" align="left" />
              <TH id="strategy" label="Strat" align="left" />
              <TH id="opt_tipo" label="Type" align="left" />
              <TH id="strike" label="Strike" />
              <TH id="expiry" label="Expiry" align="left" />
              <TH id="openFecha" label="Apertura" align="left" />
              <TH id="daysHeld" label="Días" />
              <TH id="contracts" label="Cont" />
              <TH id="pnl" label="P&L" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--subtle-border)', background: i % 2 ? 'var(--row-alt)' : 'transparent' }}>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontSize: 10 }}>{t.closeFecha?.slice(5) || '—'}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.ticker}</td>
                <td style={{ padding: '5px 8px' }}><StrategyBadge strategy={t.strategy} /></td>
                <td style={{ padding: '5px 8px', color: t.opt_tipo === 'P' ? '#60a5fa' : t.opt_tipo === 'C' ? '#a855f7' : 'var(--text-tertiary)', fontSize: 10, fontWeight: 700 }}>{t.opt_tipo || '—'}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{t.strike}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-tertiary)', fontSize: 10 }}>{t.expiry?.slice(5) || '—'}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-tertiary)', fontSize: 10 }}>{t.openFecha?.slice(5) || '—'}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 10 }}>{t.daysHeld != null ? t.daysHeld + 'd' : '—'}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 10 }}>{t.contracts || '—'}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: t.pnl >= 0 ? '#30d158' : '#ef4444' }}>
                  {(t.pnl >= 0 ? '+' : '') + fmtSignedCompact(t.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StuckPositionsPanel({ stuck, onCleanup }) {
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null); // dry-run result
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  if (!stuck || stuck.length === 0) return null;

  const runAnalysis = async (dryRun = true) => {
    if (dryRun) setAnalyzing(true); else setApplying(true);
    try {
      const r = await fetch(API_URL + '/api/options/orphans/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const d = await r.json();
      if (dryRun) setAnalysis(d); else { setApplyResult(d); setAnalysis(null); if (onCleanup) onCleanup(); }
    } catch (e) {
      if (dryRun) setAnalysis({ error: e.message }); else setApplyResult({ error: e.message });
    } finally {
      setAnalyzing(false); setApplying(false);
    }
  };

  return (
    <div style={{ ...cardBase, borderColor: 'rgba(255,159,10,.3)', background: 'rgba(255,159,10,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: '#ff9f0a', textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 700 }}>{expanded ? '▾' : '▸'} ⚠ {stuck.length} posiciones huérfanas</div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>Grupos con expiry &gt; 14d en el pasado y net_shares ≠ 0. Probablemente expiraron worthless sin row de cierre, o assignment no registrado.</div>
        </div>
        {!analysis && !applyResult && (
          <button onClick={() => runAnalysis(true)} disabled={analyzing}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ff9f0a', background: 'transparent', color: '#ff9f0a', fontSize: 10, fontWeight: 700, cursor: analyzing ? 'wait' : 'pointer', fontFamily: 'var(--fm)' }}>
            {analyzing ? 'Analizando…' : '🔍 Analizar con FMP price'}
          </button>
        )}
      </div>

      {/* Dry-run analysis result */}
      {analysis && !analysis.error && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--row-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'var(--fm)' }}>Análisis con precio histórico FMP</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div><div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>OTM Worthless</div><div style={{ fontSize: 18, fontWeight: 700, color: '#30d158', fontFamily: 'var(--fm)' }}>{analysis.would_close}</div><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Auto-cerrables a $0</div></div>
            <div><div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>ITM (probable assign)</div><div style={{ fontSize: 18, fontWeight: 700, color: '#ff9f0a', fontFamily: 'var(--fm)' }}>{analysis.itm_skipped?.length || 0}</div><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Manual review (NO se tocan)</div></div>
            <div><div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Sin precio</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{analysis.no_price?.length || 0}</div><div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>SPX/RUT/legacy tickers</div></div>
          </div>
          {analysis.itm_skipped?.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 10, color: '#ff9f0a', fontFamily: 'var(--fm)' }}>Ver {analysis.itm_skipped.length} ITM (probables asignaciones)</summary>
              <table style={{ width: '100%', fontSize: 10, fontFamily: 'var(--fm)', marginTop: 6 }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ticker','Tipo','Strike/Exp','Precio expiry','Intrinsic','NetSh','Hint'].map(h => <th key={h} style={{ padding: '3px 6px', fontSize: 9, color: 'var(--text-tertiary)', textAlign: h === 'Ticker' || h === 'Hint' ? 'left' : 'right' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {analysis.itm_skipped.slice(0, 30).map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--subtle-border)' }}>
                      <td style={{ padding: '3px 6px', color: 'var(--text-primary)', fontWeight: 600 }}>{it.ticker}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: it.tipo === 'P' ? '#60a5fa' : '#a855f7' }}>{it.tipo}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>{it.strike} · {it.expiry?.slice(5)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>${it.price_at_expiry?.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: '#ff9f0a' }}>${it.intrinsic?.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-tertiary)' }}>{it.netShares}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-tertiary)', fontSize: 9 }}>{it.hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {analysis.no_price?.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Ver {analysis.no_price.length} sin precio (ignorables)</summary>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--fm)' }}>
                {analysis.no_price.slice(0, 30).map((n, i) => (
                  <span key={i} style={{ marginRight: 8 }}>{n.ticker} {n.expiry?.slice(5)} K={n.strike}</span>
                ))}
              </div>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => runAnalysis(false)} disabled={applying || analysis.would_close === 0}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #30d158', background: 'rgba(48,209,88,.1)', color: '#30d158', fontSize: 11, fontWeight: 700, cursor: applying ? 'wait' : 'pointer', fontFamily: 'var(--fm)' }}>
              {applying ? 'Aplicando…' : `✓ Aplicar ${analysis.would_close} cierres OTM`}
            </button>
            <button onClick={() => setAnalysis(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--fb)' }}>Cancelar</button>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Solo cierra OTM con buffer 0.5%. ITM y sin-precio quedan para review manual.</span>
          </div>
        </div>
      )}
      {analysis?.error && (
        <div style={{ marginTop: 12, padding: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: '#ef4444', fontSize: 11 }}>Error: {analysis.error}</div>
      )}
      {applyResult && (
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(48,209,88,.06)', border: '1px solid rgba(48,209,88,.3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#30d158', fontFamily: 'var(--fm)' }}>✓ Cleanup aplicado</div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
            {applyResult.worthless_closed} cierres insertados · {applyResult.itm_skipped?.length || 0} ITM pendientes · {applyResult.errors?.length || 0} errores
          </div>
          {applyResult.errors?.length > 0 && (
            <pre style={{ fontSize: 9, color: '#ef4444', marginTop: 8, maxHeight: 100, overflow: 'auto' }}>{JSON.stringify(applyResult.errors, null, 2)}</pre>
          )}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', fontSize: 10.5, fontFamily: 'var(--fm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '5px 4px', color: 'var(--text-tertiary)', fontSize: 9 }}>TICKER</th>
              <th style={{ textAlign: 'left', padding: '5px 4px', color: 'var(--text-tertiary)', fontSize: 9 }}>STRAT</th>
              <th style={{ textAlign: 'left', padding: '5px 4px', color: 'var(--text-tertiary)', fontSize: 9 }}>STRIKE/EXP</th>
              <th style={{ textAlign: 'right', padding: '5px 4px', color: 'var(--text-tertiary)', fontSize: 9 }}>PREMIUM</th>
            </tr></thead>
            <tbody>
              {stuck.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--subtle-border)' }}>
                  <td style={{ padding: '4px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.ticker}</td>
                  <td style={{ padding: '4px' }}><StrategyBadge strategy={s.strategy} /></td>
                  <td style={{ padding: '4px', color: 'var(--text-secondary)' }}>{s.opt_tipo} {s.strike} · {s.expiry}</td>
                  <td style={{ padding: '4px', textAlign: 'right', color: s.open_premium >= 0 ? 'var(--gold)' : COLOR_NEG, fontWeight: 600 }}>{fmtSignedCompact(s.open_premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Hero header — gold gradient card with primary year KPIs ────────────
function HeroHeader({ year, annual, lifetime, prevYearTotal }) {
  const total = annual.total_income || 0;
  const yoyPct = prevYearTotal > 0 ? ((total - prevYearTotal) / prevYearTotal) * 100 : null;
  const yoyColor = yoyPct == null ? 'var(--text-tertiary)' : yoyPct >= 0 ? '#30d158' : '#ef4444';
  return (
    <div style={{ background: 'var(--card)', border: '1px solid rgba(200,164,78,.2)', borderRadius: 14, padding: '18px 22px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 1, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)', opacity: .3 }}/>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        {/* Total INCOME */}
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>
            INCOME REALIZADO {year}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 38, fontWeight: 800, fontFamily: 'var(--fm)', color: total >= 0 ? 'var(--gold)' : '#ef4444', lineHeight: 1 }}>
              {fmtSignedCompact(total)}
            </div>
            {yoyPct != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: yoyColor, padding: '3px 10px', borderRadius: 6, background: `${yoyColor}15`, fontFamily: 'var(--fm)' }}>
                {yoyPct >= 0 ? '+' : ''}{yoyPct.toFixed(0)}% vs {year - 1}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--fm)' }}>
            Lifetime: <b style={{ color: 'var(--gold)' }}>{fmtSignedCompact(lifetime.total_income)}</b>
            {' · '}
            <span>Realized only — no paper gains</span>
          </div>
        </div>
        {/* 3 source mini-cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(110px, 1fr))', gap: 8, flex: '1 1 360px' }}>
          {[
            { l: 'DIVIDENDOS', v: annual.dividends_net || 0, c: COLOR_DIV, sub: `WHT -${fmtSignedCompact(annual.wht_total)}` },
            { l: 'OPCIONES', v: annual.options_closed_pnl || 0, c: COLOR_OPT, sub: 'cerradas' },
            { l: 'STOCKS', v: annual.stocks_realized_pnl || 0, c: COLOR_STK, sub: 'FIFO realized' },
          ].map((m, i) => (
            <div key={i} style={{ padding: '10px 12px', background: `${m.c}11`, borderRadius: 10, border: `1px solid ${m.c}22` }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{m.l}</div>
              <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--fm)', color: m.v >= 0 ? m.c : '#ef4444', marginTop: 2 }}>{fmtSignedCompact(m.v)}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fb)', marginTop: 1 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Calendar heatmap — 12 months grid with color intensity by income ──
function CalendarHeatmap({ monthly, onMonthClick, selectedMonth }) {
  const peak = Math.max(...monthly.map(m => Math.abs(m.total_income || 0)), 1);
  return (
    <div style={cardBase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Calendario · click un mes para drill down</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--text-tertiary)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#30d158', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}/>Positivo</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}/>Negativo</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {monthly.map((m, i) => {
          const v = m.total_income || 0;
          const intensity = Math.min(Math.abs(v) / peak, 1);
          const isSelected = selectedMonth === m.month;
          const baseColor = v >= 0 ? '48,209,88' : '239,68,68';
          const bg = `rgba(${baseColor}, ${0.05 + intensity * 0.45})`;
          const border = `rgba(${baseColor}, ${0.2 + intensity * 0.4})`;
          return (
            <div key={m.month}
              onClick={() => onMonthClick(isSelected ? null : m.month)}
              style={{
                padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
                background: bg, border: `1px solid ${border}`,
                outline: isSelected ? '2px solid var(--gold)' : 'none',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: isSelected ? 'var(--gold)' : 'var(--text-tertiary)', fontWeight: isSelected ? 700 : 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{MONTH_LABELS[i]}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--fm)', color: v >= 0 ? '#30d158' : '#ef4444', marginTop: 4 }}>
                {v === 0 ? '—' : fmtSignedCompact(v)}
              </div>
              {v !== 0 && (
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--fb)', display: 'flex', gap: 6 }}>
                  {m.dividends_net !== 0 && <span title="Dividendos" style={{ color: COLOR_DIV }}>D {fmtSignedCompact(m.dividends_net)}</span>}
                  {m.options_closed_pnl !== 0 && <span title="Opciones" style={{ color: COLOR_OPT }}>O {fmtSignedCompact(m.options_closed_pnl)}</span>}
                  {m.stocks_realized_pnl !== 0 && <span title="Stocks" style={{ color: COLOR_STK }}>S {fmtSignedCompact(m.stocks_realized_pnl)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Ranking — best/worst trades + top tickers ───────────────────────────
function RankingView({ monthly, options_by_ticker, dividends_by_ticker, year }) {
  // Flatten all trades to find best/worst
  const allTrades = useMemo(() => {
    const out = [];
    for (const m of monthly) {
      for (const o of (m.options_closed || [])) {
        out.push({ ...o, month: m.month });
      }
    }
    return out;
  }, [monthly]);
  const top10 = [...allTrades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0)).slice(0, 10);
  const worst10 = [...allTrades].sort((a, b) => (a.pnl || 0) - (b.pnl || 0)).slice(0, 10);
  const totalDivByTicker = dividends_by_ticker.slice(0, 15);
  const totalOptByTicker = options_by_ticker.slice(0, 15);

  const TradeRow = ({ t }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 80px', gap: 8, padding: '6px 0', fontSize: 11, fontFamily: 'var(--fm)', alignItems: 'center', borderBottom: '1px solid var(--subtle-border)' }}>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.ticker}</span>
      <span><StrategyBadge strategy={t.strategy} /></span>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{t.opt_tipo} {t.strike}</span>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{t.expiry?.slice(5)}</span>
      <span style={{ textAlign: 'right', fontWeight: 800, color: (t.pnl || 0) >= 0 ? '#30d158' : '#ef4444' }}>
        {(t.pnl >= 0 ? '+' : '') + fmtSignedCompact(t.pnl)}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Best/Worst trades */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
        <div style={{ ...cardBase, borderColor: 'rgba(48,209,88,.25)', background: 'rgba(48,209,88,.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#30d158', fontFamily: 'var(--fm)', marginBottom: 10 }}>🏆 TOP 10 GANADORES · {year}</div>
          {top10.length === 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Sin trades cerrados</div> :
            top10.map((t, i) => <TradeRow key={i} t={t} />)}
        </div>
        <div style={{ ...cardBase, borderColor: 'rgba(239,68,68,.25)', background: 'rgba(239,68,68,.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--fm)', marginBottom: 10 }}>💀 TOP 10 PERDEDORES · {year}</div>
          {worst10.length === 0 || worst10[0].pnl >= 0 ? <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Sin pérdidas</div> :
            worst10.filter(t => (t.pnl || 0) < 0).map((t, i) => <TradeRow key={i} t={t} />)}
        </div>
      </div>
      {/* Top tickers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {totalDivByTicker.length > 0 && (
          <div style={cardBase}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_DIV, fontFamily: 'var(--fm)', marginBottom: 10 }}>💰 TOP TICKERS DIVIDENDOS · {year}</div>
            {totalDivByTicker.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--subtle-border)' }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>#{i + 1}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.ticker}</span>
                </span>
                <span style={{ color: COLOR_DIV, fontWeight: 700 }}>{fmtSignedCompact(t.gross)}</span>
              </div>
            ))}
          </div>
        )}
        {totalOptByTicker.length > 0 && (
          <div style={cardBase}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLOR_OPT, fontFamily: 'var(--fm)', marginBottom: 10 }}>🎯 TOP TICKERS OPCIONES · {year}</div>
            {totalOptByTicker.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--subtle-border)' }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>#{i + 1}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.ticker}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>{t.count_closed}</span>
                </span>
                <span style={{ color: t.pnl >= 0 ? '#30d158' : '#ef4444', fontWeight: 700 }}>
                  {(t.pnl >= 0 ? '+' : '') + fmtSignedCompact(t.pnl)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main tab ────────────────────────────────────────────────────────────────
export default function PnLTab() {
  // STATE BEFORE EFFECTS — TDZ-safe
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  // Sub-tab: 'dashboard' | 'calendar' | 'estrategias' | 'ranking' | 'pendiente'
  const [section, setSection] = useState(() => localStorage.getItem('pnl_section') || 'dashboard');
  // 'all' | 'div' | 'opt' | 'stk' — filters the high-level view (within Estrategias section)
  const [filter, setFilter] = useState('all');
  // Strategy sub-filter (when filter === 'opt')
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  const load = useCallback(async (y) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/pnl/monthly?year=${y}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setData(j);
      // If our hardcoded year not in availableYears, fall back to the first
      if (j.availableYears && j.availableYears.length && !j.availableYears.includes(y)) {
        setYear(j.availableYears[0]);
      }
    } catch (e) {
      setError(e.message || 'Error cargando P&L');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(year);
    setSelectedMonth(null);
  }, [year, load]);

  // ── ALL useMemo declared BEFORE any early return (Rules of Hooks) ──────
  const monthly = data?.monthly || [];
  const options_by_strategy = data?.options_by_strategy || [];
  const byYearForMemo = data?.byYear || [];
  const prevYearTotal = useMemo(() => {
    const prev = byYearForMemo.find(y => y.year === year - 1);
    return prev?.total_income || 0;
  }, [byYearForMemo, year]);
  const filteredMonthly = useMemo(() => {
    if (filter !== 'opt' || !selectedStrategy) return monthly;
    return monthly.map(m => {
      const filteredLegs = (m.options_closed || []).filter(o => o.strategy === selectedStrategy);
      const subPnl = filteredLegs.reduce((s, o) => s + (o.pnl || 0), 0);
      return {
        ...m, dividends_net: 0, stocks_realized_pnl: 0,
        options_closed_pnl: subPnl, options_closed: filteredLegs, total_income: subPnl,
      };
    });
  }, [monthly, filter, selectedStrategy]);
  const viewMonthly = useMemo(() => {
    if (filter === 'all') return monthly;
    if (filter === 'opt') return filteredMonthly.map(m => ({ ...m, dividends_net: 0, stocks_realized_pnl: 0, total_income: m.options_closed_pnl }));
    if (filter === 'div') return monthly.map(m => ({ ...m, options_closed_pnl: 0, stocks_realized_pnl: 0, options_closed: [], total_income: m.dividends_net }));
    if (filter === 'stk') return monthly.map(m => ({ ...m, options_closed_pnl: 0, dividends_net: 0, options_closed: [], total_income: m.stocks_realized_pnl }));
    return monthly;
  }, [monthly, filter, filteredMonthly]);
  const filteredOptionsByStrategy = useMemo(() => {
    if (selectedStrategy) return options_by_strategy.filter(s => s.strategy === selectedStrategy);
    return options_by_strategy;
  }, [options_by_strategy, selectedStrategy]);

  if (loading && !data) {
    return (
      <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
        Cargando P&L mensual ...
      </div>
    );
  }
  if (error && !data) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...cardBase, borderColor: COLOR_NEG, color: COLOR_NEG, fontSize: 13 }}>
          Error: {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { annual = {}, lifetime = {}, availableYears = [], byYear = [],
          options_by_ticker = [], dividends_by_ticker = [],
          open_premium = null, stuck_positions = [] } = data;
  const selectedDetail = selectedMonth != null ? monthly.find(m => m.month === selectedMonth) : null;

  const setSectionPersist = (s) => { setSection(s); try { localStorage.setItem('pnl_section', s); } catch {} };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Year selector + lifetime */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Año:</span>
        {(availableYears.length ? availableYears : [year]).map(y => (
          <button key={y}
            onClick={() => setYear(y)}
            style={{
              padding: '5px 12px', borderRadius: 7,
              border: `1px solid ${y === year ? 'var(--gold)' : 'var(--border)'}`,
              background: y === year ? 'var(--gold-dim)' : 'transparent',
              color: y === year ? 'var(--gold)' : 'var(--text-secondary)',
              fontSize: 11, fontWeight: y === year ? 700 : 500, cursor: 'pointer',
              fontFamily: 'var(--fm)', transition: 'all .15s',
            }}>
            {y}
          </button>
        ))}
        {loading && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>actualizando...</span>}
      </div>

      {/* HERO HEADER */}
      <HeroHeader year={year} annual={annual} lifetime={lifetime} prevYearTotal={prevYearTotal} />

      {/* SUB-TAB STRIP */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { id: 'dashboard', lbl: '📊 Dashboard' },
          { id: 'calendar',  lbl: '📅 Calendario' },
          { id: 'estrategias', lbl: '🎯 Estrategias' },
          { id: 'ranking',   lbl: '🏆 Ranking' },
          { id: 'pendiente', lbl: '⚠️ Pendiente' },
        ].map(t => (
          <button key={t.id} onClick={() => setSectionPersist(t.id)}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: `1px solid ${section === t.id ? 'var(--gold)' : 'transparent'}`,
              background: section === t.id ? 'var(--gold-dim)' : 'transparent',
              color: section === t.id ? 'var(--gold)' : 'var(--text-tertiary)',
              fontSize: 11, fontWeight: section === t.id ? 700 : 500, cursor: 'pointer',
              fontFamily: 'var(--fb)', transition: 'all .15s',
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD section ── */}
      {section === 'dashboard' && (<>
        <MonthlyStackedBars
          monthly={viewMonthly}
          onMonthClick={setSelectedMonth}
          selectedMonth={selectedMonth}
        />
        {selectedDetail && (
          <MonthDetail
            month={selectedDetail.month}
            divs={selectedDetail.tickers_div || []}
            options={selectedDetail.options_closed || []}
          />
        )}
        <MonthlyTable
          monthly={monthly}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
        />
        <ByYearStrip
          byYear={byYear}
          currentYear={year}
          onYearClick={setYear}
        />
      </>)}

      {/* ── CALENDARIO section ── */}
      {section === 'calendar' && (<>
        <CalendarHeatmap monthly={monthly} onMonthClick={setSelectedMonth} selectedMonth={selectedMonth} />
        {selectedDetail && (
          <MonthDetail
            month={selectedDetail.month}
            divs={selectedDetail.tickers_div || []}
            options={selectedDetail.options_closed || []}
          />
        )}
      </>)}

      {/* ── ESTRATEGIAS section (filter pills + breakdowns + drill-down) ── */}
      {section === 'estrategias' && (<>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          {[
            { id: 'all', label: 'Todo',         color: 'var(--gold)' },
            { id: 'div', label: 'Dividendos',   color: COLOR_DIV },
            { id: 'opt', label: 'Opciones',     color: COLOR_OPT },
            { id: 'stk', label: 'Capital gains',color: COLOR_STK },
          ].map(f => {
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => { setFilter(f.id); setSelectedStrategy(null); setSelectedMonth(null); }}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  fontFamily: 'var(--fm)', cursor: 'pointer',
                  border: `1px solid ${active ? f.color : 'var(--border)'}`,
                  background: active ? `${f.color}20` : 'transparent',
                  color: active ? f.color : 'var(--text-tertiary)',
                  transition: 'all .15s',
                }}>{f.label}</button>
            );
          })}
          {filter === 'opt' && options_by_strategy.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 12, paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
              <button onClick={() => setSelectedStrategy(null)}
                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: 'var(--fm)', cursor: 'pointer', border: `1px solid ${!selectedStrategy ? 'var(--gold)' : 'var(--border)'}`, background: !selectedStrategy ? 'var(--gold-dim)' : 'transparent', color: !selectedStrategy ? 'var(--gold)' : 'var(--text-tertiary)' }}>Todas</button>
              {options_by_strategy.map(s => {
                const active = selectedStrategy === s.strategy;
                const c = STRATEGY_COLORS[s.strategy] || STRATEGY_COLORS.Other;
                return (
                  <button key={s.strategy} onClick={() => setSelectedStrategy(active ? null : s.strategy)}
                    title={STRATEGY_DESC[s.strategy] || s.strategy}
                    style={{ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: 'var(--fm)', cursor: 'pointer', border: `1px solid ${active ? c : 'var(--border)'}`, background: active ? `${c}20` : 'transparent', color: active ? c : 'var(--text-tertiary)' }}>
                    {s.strategy} <span style={{ opacity: .6 }}>{s.count_closed}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </>)}

      {/* ── ESTRATEGIAS section continued: breakdowns + drill-down ── */}
      {section === 'estrategias' && (<>
        {(filter === 'all' || filter === 'opt') && options_by_strategy.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <BreakdownTable
              title={`Opciones por estrategia · ${year}`}
              rows={filteredOptionsByStrategy}
              valueKey="pnl"
              colorKey="strategy"
              extraKey="count_closed"
              extraLabel="cerradas"
              formatValue={fmtSignedCompact}
              onClick={r => setSelectedStrategy(selectedStrategy === r.strategy ? null : r.strategy)}
            />
            {options_by_ticker.length > 0 && (
              <BreakdownTable
                title={`Opciones por ticker · ${year}`}
                rows={options_by_ticker}
                valueKey="pnl"
                extraKey="count_closed"
                extraLabel="cerradas"
                formatValue={fmtSignedCompact}
              />
            )}
          </div>
        )}
        {(filter === 'all' || filter === 'div') && dividends_by_ticker.length > 0 && (
          <BreakdownTable
            title={`Dividendos por ticker · ${year}`}
            rows={dividends_by_ticker}
            valueKey="gross"
            formatValue={fmtSignedCompact}
          />
        )}
        {(filter === 'all' || filter === 'opt') && (
          <OptionsTradesList
            monthly={monthly}
            selectedStrategy={filter === 'opt' ? selectedStrategy : null}
            scopedTitle={selectedStrategy ? `Trades ${selectedStrategy} · ${year}` : `Todos los trades de opciones · ${year}`}
          />
        )}
      </>)}

      {/* ── RANKING section ── */}
      {section === 'ranking' && (
        <RankingView
          monthly={monthly}
          options_by_ticker={options_by_ticker}
          dividends_by_ticker={dividends_by_ticker}
          year={year}
        />
      )}

      {/* ── PENDIENTE section ── */}
      {section === 'pendiente' && (<>
        <OpenPremiumCard open_premium={open_premium} />
        <StuckPositionsPanel stuck={stuck_positions} onCleanup={() => load(year)} />
      </>)}

      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--fb)', padding: '8px 0' }}>
        Realized only · cost_basis FIFO equity + closed-options groups + dividendos
      </div>
    </div>
  );
}

function LifetimeStat({ label, value, color }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 3 }}>
        {fmtSignedCompact(value)}
      </div>
    </div>
  );
}
