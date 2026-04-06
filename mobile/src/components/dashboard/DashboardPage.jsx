import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { fDol, fSign, fSignK, fP, _sf, f0 } from '../../utils/formatters';

export default function DashboardPage() {
  const {
    positions, nlv, totalPnl, totalPnlPct, totalValue, totalCost,
    cachedPnl, stats, forwardDiv, divMensual, divResumen,
    loading, privacy, loadAll
  } = useApp();

  const [nlvHistory, setNlvHistory] = useState([]);
  const [fxRates, setFxRates] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll(true);
    setRefreshing(false);
  }, [loadAll]);

  // Top movers
  const sorted = [...positions].filter(p => p.last_price && p.shares);
  const gainers = sorted
    .map(p => ({ ...p, dayChg: (p.last_price - (p.avg_price || p.last_price)) }))
    .sort((a, b) => (b.pnl_pct || 0) - (a.pnl_pct || 0));
  const topGainers = gainers.slice(0, 5);
  const topLosers = gainers.slice(-5).reverse();

  // Monthly dividends for bar chart
  const currentYear = new Date().getFullYear();
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
    const entry = divMensual.find(m => m.mes === key);
    return { month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i], neto: entry?.neto || 0 };
  });
  const maxDiv = Math.max(...monthlyData.map(m => m.neto), 1);

  // Dividends received total
  const divReceived = stats?.div_ytd || divResumen.find(r => String(r.anio) === String(currentYear))?.neto || 0;
  const divLastYear = stats?.div_last_year || 0;

  // Annual projected
  const annualProjected = forwardDiv?.annual_projected || 0;
  const monthlyProjected = annualProjected / 12;

  const pv = v => privacy ? '***' : v;

  return (
    <div className="page">
      {refreshing && <div className="ptr-indicator">Actualizando...</div>}

      {/* Portfolio Summary Card */}
      <div className="card">
        <div className="row-between">
          <div className="metric-label">Portfolio Value</div>
          <button onClick={handleRefresh} style={{ fontSize: 12, color: 'var(--blue)' }}>
            Refresh
          </button>
        </div>
        <div className="metric-big">{pv(fDol(nlv))}</div>
        <div style={{ marginTop: 4 }}>
          <span className={totalPnl >= 0 ? 'green' : 'red'} style={{ fontSize: 15, fontWeight: 600 }}>
            {pv(fSignK(totalPnl))} {totalPnlPct != null && `(${_sf(Math.abs(totalPnlPct < 1 ? totalPnlPct * 100 : totalPnlPct), 2)}%)`}
          </span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>Total P&L</span>
        </div>

        <div className="grid-2" style={{ marginTop: 16, gap: 12 }}>
          <div>
            <div className="metric-label">Invested</div>
            <div className="metric-value">{pv(fDol(totalCost))}</div>
          </div>
          <div>
            <div className="metric-label">Daily P&L</div>
            <div className="metric-value">{pv(cachedPnl ? fSignK(cachedPnl.pnl * 0.01) : '\u2014')}</div>
          </div>
          <div>
            <div className="metric-label">Yield</div>
            <div className="metric-value green">{totalValue > 0 ? _sf((annualProjected / totalValue) * 100, 2) + '%' : '\u2014'}</div>
          </div>
          <div>
            <div className="metric-label">Positions</div>
            <div className="metric-value">{positions.length}</div>
          </div>
        </div>
      </div>

      {/* Dividend Income Card */}
      <div className="card">
        <div className="row-between">
          <div className="metric-label">Dividend Income</div>
          <span className="pill pill-green">{currentYear}</span>
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <div>
            <div className="metric-label">Annual</div>
            <div className="metric-value green">{pv(fDol(annualProjected))}</div>
          </div>
          <div>
            <div className="metric-label">Monthly</div>
            <div className="metric-value">{pv(`$${f0(monthlyProjected)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Daily</div>
            <div className="metric-value">{pv(`$${_sf(annualProjected / 365, 0)}`)}</div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="metric-label">YTD Received</div>
          <div className="metric-value green">{pv(fDol(divReceived))}</div>
        </div>
      </div>

      {/* FX Quotes */}
      {fxRates.length > 0 && (
        <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {fxRates.map(fx => (
            <div key={fx.pair} className="card-compact" style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '8px 14px', minWidth: 110, margin: 0
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{fx.pair}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>${fx.rate ? _sf(fx.rate, fx.pair === 'AUDUSD' || fx.pair === 'CADUSD' ? 2 : 2) : '\u2014'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly Dividends Bar Chart */}
      <div className="section-title">Dividends Received</div>
      <div className="card">
        <div className="bar-chart">
          {monthlyData.map((m, i) => (
            <div className="bar-col" key={i}>
              <div className="bar-value">{m.neto > 100 ? `${_sf(m.neto / 1000, 1)}K` : ''}</div>
              <div className="bar-fill" style={{
                height: `${Math.max((m.neto / maxDiv) * 100, 2)}%`,
                background: i < new Date().getMonth() ? 'var(--green)' : 'var(--blue)',
                opacity: m.neto > 0 ? 1 : 0.3,
              }} />
              <div className="bar-label">{m.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Day Gainers */}
      <div className="section-title">Top Gainers</div>
      {topGainers.slice(0, 5).map(p => (
        <HoldingMiniRow key={p.ticker} p={p} privacy={privacy} />
      ))}

      {/* Top Day Losers */}
      <div className="section-title" style={{ marginTop: 4 }}>Top Losers</div>
      {topLosers.slice(0, 5).map(p => (
        <HoldingMiniRow key={p.ticker} p={p} privacy={privacy} />
      ))}

      {/* NLV Performance Chart */}
      {nlvHistory.length > 5 && (
        <>
          <div className="section-title">Performance (90d)</div>
          <div className="card">
            <NlvChart data={nlvHistory} />
          </div>
        </>
      )}
    </div>
  );
}

function HoldingMiniRow({ p, privacy }) {
  const val = p.usd_value || p.market_value || 0;
  const pnl = p.pnl_pct || 0;
  return (
    <div className="holding-row">
      <div className="holding-logo">{p.ticker?.slice(0, 3)}</div>
      <div className="holding-info">
        <div className="holding-name">{p.name || p.ticker}</div>
        <div className="holding-ticker">{p.ticker} {p.shares && `\u00b7 ${f0(p.shares)} shares`}</div>
      </div>
      <div className="holding-values">
        <div className="holding-price">{privacy ? '***' : fDol(val)}</div>
        <div className={`holding-change ${pnl >= 0 ? 'green' : 'red'}`}>
          {privacy ? '***' : `${fSignK(p.pnl_abs || 0)} ${pnl >= 0 ? '\u25b2' : '\u25bc'} ${_sf(Math.abs(pnl), 2)}%`}
        </div>
      </div>
    </div>
  );
}

function NlvChart({ data }) {
  if (!data.length) return null;
  const values = data.map(d => d.nlv || d.total_usd || 0).filter(v => v > 0);
  if (values.length < 2) return null;
  const min = Math.min(...values) * 0.998;
  const max = Math.max(...values) * 1.002;
  const range = max - min || 1;
  const w = 300, h = 100;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100 }}>
      <defs>
        <linearGradient id="nlvGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill="url(#nlvGrad)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--blue)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
