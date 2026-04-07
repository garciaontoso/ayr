import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { fDol, fSignK, _sf, f0 } from '../../utils/formatters';
import BarChart from '../ui/BarChart';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DashboardPage() {
  const {
    positions, nlv, cash, totalProfit, totalProfitPct,
    unrealizedPnl, totalInvested, totalDivNeto, totalTaxes, divYTD,
    totalDivAnnual, yieldOnValue, yieldOnCost,
    stats, forwardDiv, divMensual, divResumen,
    loading, refreshing, privacy, loadAll
  } = useApp();

  const [nlvHistory, setNlvHistory] = useState([]);
  const [fxRates, setFxRates] = useState([]);

  useEffect(() => {
    apiFetch('/api/ib-nlv-history?limit=90').then(d => {
      if (Array.isArray(d)) setNlvHistory(d);
    }).catch(() => {});
    apiFetch('/api/fx?from=EUR&to=USD').then(d => {
      if (d && typeof d === 'object') {
        const rates = [];
        if (d.EUR) rates.push({ pair: 'EURUSD', rate: 1 / d.EUR });
        if (d.GBP) rates.push({ pair: 'GBPUSD', rate: 1 / d.GBP });
        if (d.AUD) rates.push({ pair: 'AUDUSD', rate: 1 / d.AUD });
        if (d.CAD) rates.push({ pair: 'CADUSD', rate: 1 / d.CAD });
        setFxRates(rates);
      }
    }).catch(() => {});
  }, []);

  const handleRefresh = useCallback(() => loadAll(true), [loadAll]);

  const { topGainers, topLosers } = useMemo(() => {
    const withPnl = positions.filter(p => p.last_price && p.shares && p.pnl_pct != null);
    const sorted = [...withPnl].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0));
    return {
      topGainers: sorted.filter(p => p.pnl_pct > 0).slice(0, 5),
      topLosers: sorted.filter(p => p.pnl_pct < 0).slice(-5).reverse(),
    };
  }, [positions]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const monthlyChartData = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      const entry = divMensual.find(m => m.mes === key);
      return { label: MONTHS[i], value: entry?.neto || 0, color: i <= currentMonth ? 'var(--green)' : 'var(--blue)' };
    }), [divMensual, currentYear, currentMonth]);

  const pv = v => privacy ? '***' : v;

  return (
    <div className="page">
      {/* Value card */}
      <div className="card">
        <div className="row-between">
          <div className="metric-label">Portfolio Value</div>
          <button onClick={handleRefresh} style={{ fontSize: 12, color: 'var(--blue)' }}>
            {refreshing ? 'Updating...' : 'Refresh'}
          </button>
        </div>
        <div className="metric-big">{pv(fDol(nlv))}</div>
        <div style={{ marginTop: 4 }}>
          <span className={totalProfit >= 0 ? 'green' : 'red'} style={{ fontSize: 15, fontWeight: 600 }}>
            {pv(fSignK(totalProfit))} ({_sf(Math.abs(totalProfitPct * 100), 2)}%)
          </span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>Total Profit</span>
        </div>
      </div>

      {/* Profits breakdown */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Profits</div>
        <div className="grid-2" style={{ gap: 10 }}>
          <div>
            <div className="metric-label">Capital gain</div>
            <div className={`metric-value ${unrealizedPnl >= 0 ? 'green' : 'red'}`}>{pv(fSignK(unrealizedPnl))}</div>
          </div>
          <div>
            <div className="metric-label">Dividends received</div>
            <div className="metric-value green">{pv(fSignK(totalDivNeto))}</div>
          </div>
          <div>
            <div className="metric-label">Taxes</div>
            <div className="metric-value red">{pv(`-${fDol(totalTaxes)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Cash balance</div>
            <div className={`metric-value ${cash >= 0 ? 'green' : 'red'}`}>{pv(fDol(cash))}</div>
          </div>
        </div>
      </div>

      {/* Dividends card */}
      <div className="card">
        <div className="row-between">
          <div style={{ fontWeight: 700, fontSize: 13 }}>Dividends</div>
          <span className="pill pill-green">{currentYear}</span>
        </div>
        <div className="grid-2" style={{ marginTop: 8, gap: 10 }}>
          <div>
            <div className="metric-label">Annual (projected)</div>
            <div className="metric-value green">{pv(fDol(totalDivAnnual))}</div>
          </div>
          <div>
            <div className="metric-label">Monthly</div>
            <div className="metric-value">{pv(`$${f0(totalDivAnnual / 12)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Yield</div>
            <div className="metric-value green">{_sf(yieldOnValue * 100, 2)}%</div>
          </div>
          <div>
            <div className="metric-label">Yield on cost</div>
            <div className="metric-value">{_sf(yieldOnCost * 100, 2)}%</div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="metric-label">YTD Received</div>
          <div className="metric-value green">{pv(fDol(divYTD))}</div>
        </div>
      </div>

      {/* FX Quotes */}
      {fxRates.length > 0 && (
        <div style={{ padding: '4px 12px 10px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {fxRates.map(fx => (
            <div key={fx.pair} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '6px 12px', minWidth: 95,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{fx.pair}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>${_sf(fx.rate, 2)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Dividends bar chart */}
      <div className="section-title">Dividends Received</div>
      <div className="card">
        <BarChart data={monthlyChartData} />
      </div>

      {/* Top Gainers */}
      {topGainers.length > 0 && (
        <>
          <div className="section-title">Top Gainers</div>
          {topGainers.map(p => <HoldingMiniRow key={p.ticker} p={p} privacy={privacy} />)}
        </>
      )}

      {/* Top Losers */}
      {topLosers.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 4 }}>Top Losers</div>
          {topLosers.map(p => <HoldingMiniRow key={p.ticker} p={p} privacy={privacy} />)}
        </>
      )}

      {/* NLV Performance Chart */}
      {nlvHistory.length > 5 && (
        <>
          <div className="section-title">Performance (90d)</div>
          <div className="card"><NlvChart data={nlvHistory} /></div>
        </>
      )}
    </div>
  );
}

const HoldingMiniRow = memo(function HoldingMiniRow({ p, privacy }) {
  const val = p.usd_value || p.market_value || 0;
  const pnlPct = p.pnl_pct || 0;
  const pnlAbs = p.pnl_abs || 0;
  const isPos = pnlPct >= 0;
  const signedAbs = isPos ? Math.abs(pnlAbs) : -Math.abs(pnlAbs);
  return (
    <div className="holding-row">
      <div className="holding-logo">{p.ticker?.slice(0, 3)}</div>
      <div className="holding-info">
        <div className="holding-name">{p.name || p.ticker}</div>
        <div className="holding-ticker">{p.ticker} {p.shares && `\u00b7 ${f0(p.shares)} shares`}</div>
      </div>
      <div className="holding-values">
        <div className="holding-price">{privacy ? '***' : fDol(val)}</div>
        <div className={`holding-change ${isPos ? 'green' : 'red'}`}>
          {privacy ? '***' : `${fSignK(signedAbs)} ${isPos ? '\u25b2' : '\u25bc'} ${_sf(Math.abs(pnlPct * 100), 2)}%`}
        </div>
      </div>
    </div>
  );
});

function NlvChart({ data }) {
  const values = useMemo(() => data.map(d => d.nlv || d.total_usd || 0).filter(v => v > 0), [data]);
  if (values.length < 2) return null;
  const min = Math.min(...values) * 0.998;
  const max = Math.max(...values) * 1.002;
  const range = max - min || 1;
  const w = 300, h = 100;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100 }}>
      <defs>
        <linearGradient id="nlvG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#nlvG)" />
      <polyline points={points} fill="none" stroke="var(--blue)" strokeWidth="1.5" />
    </svg>
  );
}
