import { useState, useEffect, useMemo, memo } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { fDol, fSignK, _sf } from '../../utils/formatters';
import BarChart from '../ui/BarChart';

export default function AnalyticsPage() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="page">
      <div className="sub-tabs">
        {['overview', 'diversification', 'dividends', 'profits'].map(t => (
          <button key={t} className={`sub-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
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

const OverviewTab = memo(function OverviewTab() {
  const { nlv, cash, totalProfit, totalProfitPct, totalInvested,
    unrealizedPnl, totalDivNeto, totalTaxes,
    totalDivAnnual, yieldOnValue, yieldOnCost, positions, privacy } = useApp();
  const pv = v => privacy ? '***' : v;

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Value</div>
        <div className="grid-2" style={{ gap: 16 }}>
          <div><div className="metric-label">Current value</div><div className="metric-value">{pv(fDol(nlv))}</div></div>
          <div><div className="metric-label">Cash balance</div><div className={`metric-value ${cash >= 0 ? '' : 'red'}`}>{pv(fDol(cash))}</div></div>
          <div><div className="metric-label">Invested</div><div className="metric-value">{pv(fDol(totalInvested))}</div></div>
          <div><div className="metric-label">Positions</div><div className="metric-value">{positions.length}</div></div>
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Profits</div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div>
            <div className="metric-label">Total profit</div>
            <div className={`metric-value ${totalProfit >= 0 ? 'green' : 'red'}`}>
              {pv(`${fSignK(totalProfit)} ${_sf(Math.abs(totalProfitPct * 100), 2)}%`)}
            </div>
          </div>
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
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Dividends</div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div><div className="metric-label">Yield</div><div className="metric-value green">{_sf(yieldOnValue * 100, 2)}%</div></div>
          <div><div className="metric-label">Yield on cost</div><div className="metric-value">{_sf(yieldOnCost * 100, 2)}%</div></div>
          <div><div className="metric-label">Annual (projected)</div><div className="metric-value green">{pv(fDol(totalDivAnnual))}</div></div>
          <div><div className="metric-label">Monthly</div><div className="metric-value">{pv(fDol(totalDivAnnual / 12))}</div></div>
        </div>
      </div>
    </>
  );
});

const DiversificationTab = memo(function DiversificationTab() {
  const { positions, privacy } = useApp();

  const { sorted, total, sectorList } = useMemo(() => {
    const s = [...positions].sort((a, b) => (b.usd_value || 0) - (a.usd_value || 0));
    const t = s.reduce((sum, p) => sum + (p.usd_value || 0), 0);
    const sectors = {};
    s.forEach(p => { const sec = p.sector || 'Other'; sectors[sec] = (sectors[sec] || 0) + (p.usd_value || 0); });
    return { sorted: s, total: t, sectorList: Object.entries(sectors).sort((a, b) => b[1] - a[1]) };
  }, [positions]);

  const colors = ['#00d4aa', '#58a6ff', '#bc8cff', '#f0883e', '#ff4757', '#3fb950', '#d2a8ff', '#79c0ff'];

  return (
    <>
      <div className="card">
        <div className="donut-container">
          <svg viewBox="0 0 120 120" style={{ width: 180, height: 180 }}>
            {total > 0 && (() => {
              let offset = 0;
              const r = 45, cx = 60, cy = 60, circ = 2 * Math.PI * r;
              return sectorList.slice(0, 8).map(([sec, val], i) => {
                const dash = (val / total) * circ;
                const el = <circle key={sec} cx={cx} cy={cy} r={r} fill="none" stroke={colors[i % colors.length]} strokeWidth="16" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} />;
                offset += dash;
                return el;
              });
            })()}
            <text x="60" y="56" textAnchor="middle" fill="var(--text)" fontSize="10" fontWeight="600">{positions.length}</text>
            <text x="60" y="70" textAnchor="middle" fill="var(--text2)" fontSize="8">positions</text>
          </svg>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '0 8px' }}>
          {sectorList.slice(0, 8).map(([sec, val], i) => (
            <span key={sec} style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], display: 'inline-block' }} />
              {sec} {_sf((val / total) * 100, 0)}%
            </span>
          ))}
        </div>
      </div>

      <div className="section-title">By Assets</div>
      {sorted.slice(0, 20).map(p => {
        const weight = total > 0 ? (p.usd_value || 0) / total : 0;
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
});

const DividendsTab = memo(function DividendsTab() {
  const { positions, privacy } = useApp();
  const [divByTicker, setDivByTicker] = useState([]);

  useEffect(() => {
    apiFetch('/api/dividendos/por-ticker').then(data => {
      if (Array.isArray(data)) setDivByTicker(data.sort((a, b) => (b.neto || 0) - (a.neto || 0)));
    }).catch(() => {});
  }, []);

  const posWithDiv = useMemo(() =>
    positions.filter(p => p.div_yield > 0).sort((a, b) => (b.div_yield || 0) - (a.div_yield || 0)),
    [positions]
  );

  return (
    <>
      <div className="section-title">Dividend Yield by Position</div>
      <div className="card">
        <BarChart
          data={posWithDiv.slice(0, 10).map(p => ({
            label: p.ticker?.slice(0, 4),
            value: (p.div_yield || 0) * 100,
            color: 'var(--purple)',
          }))}
          height={120}
          formatValue={v => `${_sf(v, 1)}%`}
        />
      </div>

      <div className="section-title">Dividends Received</div>
      {divByTicker.slice(0, 15).map((d, i) => {
        const maxN = divByTicker[0]?.neto || 1;
        return (
          <div key={d.ticker || i} className="holding-row" style={{ gap: 8 }}>
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
});

const ProfitsTab = memo(function ProfitsTab() {
  const { divMensual, divResumen, unrealizedPnl, totalProfit, totalDivNeto, totalTaxes, privacy } = useApp();
  const [plData, setPlData] = useState([]);

  useEffect(() => {
    apiFetch('/api/pl').then(data => {
      if (Array.isArray(data)) setPlData(data);
    }).catch(() => {});
  }, []);

  const currentYear = new Date().getFullYear();
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
    const entry = divMensual.find(m => m.mes === key);
    return { month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i], neto: entry?.neto || 0 };
  }), [divMensual, currentYear]);

  // totalDivNeto already computed in context
  const sortedPL = useMemo(() => [...plData].sort((a, b) => (b.anio || '').localeCompare(a.anio || '')), [plData]);

  const pv = v => privacy ? '***' : v;

  return (
    <>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Profit Breakdown</div>
        {[
          { label: 'Total profit', value: totalProfit },
          { label: 'Capital gain', value: unrealizedPnl },
          { label: 'Dividends received', value: totalDivNeto },
          { label: 'Taxes paid', value: -totalTaxes },
        ].map(item => (
          <div key={item.label} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="metric-label" style={{ margin: 0 }}>{item.label}</span>
            <span className={`metric-value ${(item.value || 0) >= 0 ? 'green' : 'red'}`}>
              {pv(fSignK(item.value || 0))}
            </span>
          </div>
        ))}
      </div>

      <div className="section-title">Monthly Dividends ({currentYear})</div>
      <div className="card">
        <BarChart data={months.map(m => ({
          label: m.month, value: m.neto,
          color: m.neto >= 0 ? 'var(--green)' : 'var(--red)',
        }))} />
      </div>

      {sortedPL.length > 0 && (
        <>
          <div className="section-title">Annual P&L</div>
          {sortedPL.slice(0, 5).map(yr => {
            const total = (yr.bolsa || 0) + (yr.dividendos || 0) + (yr.covered_calls || 0);
            return (
              <div key={yr.anio || yr.id} className="holding-row">
                <div style={{ fontWeight: 700, fontSize: 15, width: 50 }}>{yr.anio}</div>
                <div className="holding-info">
                  <div className="grid-3" style={{ gap: 4 }}>
                    <div><div className="metric-label">Stocks</div><div style={{ fontSize: 12 }} className={yr.bolsa >= 0 ? 'green' : 'red'}>{fDol(yr.bolsa || 0)}</div></div>
                    <div><div className="metric-label">Divs</div><div style={{ fontSize: 12 }} className="green">{fDol(yr.dividendos || 0)}</div></div>
                    <div><div className="metric-label">CC</div><div style={{ fontSize: 12 }} className={(yr.covered_calls || 0) >= 0 ? 'green' : 'red'}>{fDol(yr.covered_calls || 0)}</div></div>
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
});
