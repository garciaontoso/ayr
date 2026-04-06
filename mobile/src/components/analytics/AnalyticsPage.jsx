import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { fDol, fSignK, fP, _sf, f0 } from '../../utils/formatters';

export default function AnalyticsPage() {
  const [tab, setTab] = useState('overview');
  const subTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'diversification', label: 'Diversification' },
    { id: 'dividends', label: 'Dividends' },
    { id: 'profits', label: 'Profits' },
  ];

  return (
    <div className="page">
      <div className="sub-tabs">
        {subTabs.map(t => (
          <button key={t.id} className={`sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'diversification' && <DiversificationTab />}
      {tab === 'dividends' && <DividendsTab />}
      {tab === 'profits' && <ProfitsTab />}
    </div>
  );
}

function OverviewTab() {
  const { nlv, totalPnl, totalPnlPct, totalCost, totalDivAnnual, portfolioYield, positions, privacy } = useApp();
  const pv = v => privacy ? '***' : v;

  return (
    <>
      <div className="card">
        <div className="section-title" style={{ padding: 0, marginBottom: 12 }}>Value</div>
        <div className="grid-2" style={{ gap: 16 }}>
          <div><div className="metric-label">Current value</div><div className="metric-value">{pv(fDol(nlv))}</div></div>
          <div><div className="metric-label">Invested</div><div className="metric-value">{pv(fDol(totalCost))}</div></div>
        </div>
      </div>
      <div className="card">
        <div className="section-title" style={{ padding: 0, marginBottom: 12 }}>Profits</div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div>
            <div className="metric-label">Total profit</div>
            <div className={`metric-value ${totalPnl >= 0 ? 'green' : 'red'}`}>
              {pv(`${fSignK(totalPnl)} ${_sf(Math.abs((totalPnlPct || 0) < 1 ? (totalPnlPct || 0) * 100 : (totalPnlPct || 0)), 2)}%`)}
            </div>
          </div>
          <div><div className="metric-label">Annual dividends</div><div className="metric-value green">{pv(fDol(totalDivAnnual))}</div></div>
        </div>
      </div>
      <div className="card">
        <div className="section-title" style={{ padding: 0, marginBottom: 12 }}>Dividends</div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div><div className="metric-label">Yield</div><div className="metric-value green">{_sf((portfolioYield || 0) * 100, 2)}%</div></div>
          <div><div className="metric-label">Monthly</div><div className="metric-value">{pv(fDol(totalDivAnnual / 12))}</div></div>
          <div><div className="metric-label">Daily</div><div className="metric-value">{pv(`$${_sf(totalDivAnnual / 365, 2)}`)}</div></div>
          <div><div className="metric-label">Positions</div><div className="metric-value">{positions.length}</div></div>
        </div>
      </div>
    </>
  );
}

function DiversificationTab() {
  const { positions, privacy } = useApp();
  const sorted = [...positions].sort((a, b) => (b.usd_value || 0) - (a.usd_value || 0));
  const total = sorted.reduce((s, p) => s + (p.usd_value || 0), 0);

  // Sector breakdown
  const sectors = {};
  sorted.forEach(p => {
    const sec = p.sector || 'Other';
    sectors[sec] = (sectors[sec] || 0) + (p.usd_value || 0);
  });
  const sectorList = Object.entries(sectors).sort((a, b) => b[1] - a[1]);

  const colors = ['#00d4aa', '#58a6ff', '#bc8cff', '#f0883e', '#ff4757', '#3fb950', '#d2a8ff', '#79c0ff', '#ffa657', '#ff7b72'];

  return (
    <>
      {/* Donut chart */}
      <div className="card">
        <div className="donut-container">
          <svg viewBox="0 0 120 120" style={{ width: 180, height: 180 }}>
            {(() => {
              let offset = 0;
              const radius = 45, cx = 60, cy = 60, circ = 2 * Math.PI * radius;
              return sectorList.slice(0, 8).map(([sec, val], i) => {
                const pct = val / total;
                const dash = pct * circ;
                const el = (
                  <circle key={sec} cx={cx} cy={cy} r={radius} fill="none"
                    stroke={colors[i % colors.length]} strokeWidth="16"
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`}
                  />
                );
                offset += dash;
                return el;
              });
            })()}
            <text x="60" y="56" textAnchor="middle" fill="var(--text)" fontSize="10" fontWeight="600">
              {positions.length}
            </text>
            <text x="60" y="70" textAnchor="middle" fill="var(--text2)" fontSize="8">
              positions
            </text>
          </svg>
        </div>
      </div>

      {/* Holdings list */}
      <div className="section-title">By Assets</div>
      {sorted.slice(0, 20).map(p => {
        const weight = total > 0 ? ((p.usd_value || 0) / total) : 0;
        return (
          <div key={p.ticker} className="holding-row">
            <div className="holding-logo">{p.ticker?.slice(0, 4)}</div>
            <div className="holding-info">
              <div className="holding-name">{p.name || p.ticker}</div>
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${weight * 100}%`, background: 'var(--blue)', borderRadius: 2 }} />
              </div>
            </div>
            <div className="holding-values">
              <div className="holding-price">{privacy ? '***' : fDol(p.usd_value || 0)}</div>
              <div className="holding-change muted">{_sf(weight * 100, 2)}%</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function DividendsTab() {
  const { positions, privacy } = useApp();
  const [divByTicker, setDivByTicker] = useState([]);

  useEffect(() => {
    apiFetch('/api/dividendos/por-ticker').then(data => {
      if (Array.isArray(data)) setDivByTicker(data.sort((a, b) => (b.neto || 0) - (a.neto || 0)));
    }).catch(() => {});
  }, []);

  // Dividend growth by ticker
  const posWithDiv = positions.filter(p => p.div_yield && p.div_yield > 0)
    .sort((a, b) => (b.div_yield || 0) - (a.div_yield || 0));
  const maxYield = Math.max(...posWithDiv.map(p => p.div_yield || 0), 0.01);

  return (
    <>
      {/* Dividend yield by ticker */}
      <div className="section-title">Dividend Yield by Position</div>
      <div className="card">
        <div className="bar-chart" style={{ height: 120 }}>
          {posWithDiv.slice(0, 10).map((p, i) => (
            <div className="bar-col" key={p.ticker}>
              <div className="bar-value">{_sf((p.div_yield || 0) * 100, 1)}%</div>
              <div className="bar-fill" style={{
                height: `${((p.div_yield || 0) / maxYield) * 100}%`,
                background: 'var(--purple)',
              }} />
              <div className="bar-label">{p.ticker?.slice(0, 4)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Dividends received by ticker */}
      <div className="section-title">Dividends Received</div>
      {divByTicker.slice(0, 15).map(d => {
        const maxN = divByTicker[0]?.neto || 1;
        return (
          <div key={d.ticker} className="holding-row" style={{ gap: 8 }}>
            <div className="holding-logo">{d.ticker?.slice(0, 4)}</div>
            <div className="holding-info">
              <div className="holding-name">{d.ticker}</div>
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${((d.neto || 0) / maxN) * 100}%`, background: 'var(--blue)', borderRadius: 2 }} />
              </div>
            </div>
            <div className="holding-values">
              <div className="holding-price green">{privacy ? '***' : fDol(d.neto || 0)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ProfitsTab() {
  const { divMensual, cachedPnl, totalPnl, privacy } = useApp();
  const [plData, setPlData] = useState([]);

  useEffect(() => {
    apiFetch('/api/pl').then(data => {
      if (Array.isArray(data)) setPlData(data);
    }).catch(() => {});
  }, []);

  // Monthly P&L from dividends
  const currentYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
    const entry = divMensual.find(m => m.mes === key);
    return {
      month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
      neto: entry?.neto || 0,
    };
  });
  const maxM = Math.max(...months.map(m => Math.abs(m.neto)), 1);

  const pv = v => privacy ? '***' : v;

  return (
    <>
      {/* P&L Breakdown */}
      <div className="card">
        <div className="section-title" style={{ padding: 0, marginBottom: 12 }}>Profit Breakdown</div>
        {[
          { label: 'Total profit', value: totalPnl, pct: cachedPnl?.pnlPct },
          { label: 'Capital gain', value: cachedPnl?.pnl },
          { label: 'Dividends received', value: plData.reduce?.((s, y) => s + (y.div || 0), 0) },
        ].map(item => (
          <div key={item.label} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="metric-label" style={{ margin: 0 }}>{item.label}</span>
            <span className={`metric-value ${(item.value || 0) >= 0 ? 'green' : 'red'}`}>
              {pv(fSignK(item.value || 0))}
            </span>
          </div>
        ))}
      </div>

      {/* Monthly dividend chart */}
      <div className="section-title">Monthly Dividends ({currentYear})</div>
      <div className="card">
        <div className="bar-chart">
          {months.map((m, i) => (
            <div className="bar-col" key={i}>
              <div className="bar-value">{m.neto > 100 ? `${_sf(m.neto / 1000, 1)}K` : ''}</div>
              <div className="bar-fill" style={{
                height: `${(m.neto / maxM) * 100}%`,
                background: m.neto >= 0 ? 'var(--green)' : 'var(--red)',
                opacity: m.neto > 0 ? 1 : 0.3,
              }} />
              <div className="bar-label">{m.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Annual P&L */}
      {plData.length > 0 && (
        <>
          <div className="section-title">Annual P&L</div>
          {plData.sort((a, b) => (b.y || 0) - (a.y || 0)).slice(0, 5).map(yr => {
            const total = (yr.bolsa || 0) + (yr.div || 0) + (yr.cs || 0);
            return (
              <div key={yr.y} className="holding-row">
                <div style={{ fontWeight: 700, fontSize: 15, width: 50 }}>{yr.y}</div>
                <div className="holding-info">
                  <div className="grid-3" style={{ gap: 4 }}>
                    <div><div className="metric-label">Stocks</div><div style={{ fontSize: 12 }} className={yr.bolsa >= 0 ? 'green' : 'red'}>{fDol(yr.bolsa || 0)}</div></div>
                    <div><div className="metric-label">Divs</div><div style={{ fontSize: 12 }} className="green">{fDol(yr.div || 0)}</div></div>
                    <div><div className="metric-label">CC</div><div style={{ fontSize: 12 }}>{fDol(yr.cs || 0)}</div></div>
                  </div>
                </div>
                <div className="holding-values">
                  <div className={`holding-price ${total >= 0 ? 'green' : 'red'}`}>{pv(fDol(total))}</div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
