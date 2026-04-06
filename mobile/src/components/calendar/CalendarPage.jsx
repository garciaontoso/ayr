import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { fDol, _sf, f0 } from '../../utils/formatters';

export default function CalendarPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState('1y');
  const { forwardDiv, divMensual, privacy, totalValue } = useApp();
  const [dividends, setDividends] = useState([]);
  const [calendar, setCalendar] = useState([]);

  const years = [
    { id: String(currentYear - 2), label: String(currentYear - 2) },
    { id: String(currentYear - 1), label: String(currentYear - 1) },
    { id: String(currentYear), label: String(currentYear) },
    { id: '1y', label: 'One year ahead' },
    { id: String(currentYear + 1), label: String(currentYear + 1) },
  ];

  useEffect(() => {
    if (year === '1y') {
      // For "one year ahead", show current year dividends
      apiFetch(`/api/dividendos?year=${currentYear}`).then(d => {
        if (Array.isArray(d)) setDividends(d);
      }).catch(() => {});
    } else {
      apiFetch(`/api/dividendos?year=${year}`).then(d => {
        if (Array.isArray(d)) setDividends(d);
      }).catch(() => {});
    }
  }, [year, currentYear]);

  // Income projection
  const annualProjected = forwardDiv?.annual_projected || 0;
  const monthlyProjected = annualProjected / 12;
  const dailyProjected = annualProjected / 365;

  // Monthly bars
  const selectedYear = year === '1y' ? currentYear : parseInt(year);
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
      const entry = divMensual.find(m => m.mes === key);
      const received = entry?.neto || 0;

      // From dividends loaded
      const monthDivs = dividends.filter(d => {
        const dt = new Date(d.fecha);
        return dt.getMonth() === i;
      });
      const totalMonth = monthDivs.reduce((s, d) => s + (d.neto_usd || d.neto || 0), 0);

      return {
        month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
        received: received || totalMonth,
        estimated: forwardDiv?.monthly?.[i]?.amount || 0,
      };
    });
  }, [selectedYear, divMensual, dividends, forwardDiv]);

  const maxBar = Math.max(...monthlyData.map(m => Math.max(m.received, m.estimated)), 1);

  // Group dividends by date
  const grouped = useMemo(() => {
    const groups = {};
    dividends.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).forEach(d => {
      const date = d.fecha;
      if (!groups[date]) groups[date] = [];
      groups[date].push(d);
    });
    return Object.entries(groups);
  }, [dividends]);

  const pv = v => privacy ? '***' : v;

  return (
    <div className="page">
      {/* Year selector */}
      <div className="year-selector">
        {years.map(y => (
          <button key={y.id} className={`year-pill ${year === y.id ? 'active' : ''}`} onClick={() => setYear(y.id)}>
            {y.label}
          </button>
        ))}
      </div>

      {/* Income projection card */}
      <div className="card">
        <div className="metric-label">Annual income</div>
        <div className="metric-big">{pv(fDol(annualProjected))}</div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div>
            <div className="metric-label">Monthly</div>
            <div className="metric-value">{pv(`$${f0(monthlyProjected)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Daily</div>
            <div className="metric-value">{pv(`$${_sf(dailyProjected, 2)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Yield</div>
            <div className="metric-value green">{totalValue > 0 ? _sf((annualProjected / totalValue) * 100, 2) + '%' : '\u2014'}</div>
          </div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="card">
        <div className="bar-chart">
          {monthlyData.map((m, i) => (
            <div className="bar-col" key={i}>
              <div className="bar-value">
                {m.received > 100 ? `${_sf(m.received / 1000, 1)}K` : m.estimated > 100 ? `${_sf(m.estimated / 1000, 1)}K` : ''}
              </div>
              <div className="bar-fill" style={{
                height: `${(Math.max(m.received, m.estimated) / maxBar) * 100}%`,
                background: m.received > 0 ? 'var(--green)' : m.estimated > 0 ? 'var(--blue)' : 'var(--border)',
                opacity: (m.received || m.estimated) > 0 ? 1 : 0.3,
              }} />
              <div className="bar-label">{m.month}</div>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 12, fontSize: 11 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--green)', marginRight: 4 }} />Received</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--blue)', marginRight: 4 }} />Declared</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--purple)', marginRight: 4 }} />Estimated</span>
        </div>
      </div>

      {/* Dividend entries by date */}
      {grouped.map(([date, entries]) => {
        const dt = new Date(date + 'T12:00:00');
        const dayStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
        const totalDay = entries.reduce((s, e) => s + (e.neto_usd || e.neto || 0), 0);

        return (
          <div key={date}>
            <div className="div-date row-between">
              <span>{dayStr}, {weekday}</span>
              <span className="pill pill-green">{pv(fDol(totalDay))}</span>
            </div>
            {entries.map(e => (
              <div key={e.id} className="div-entry">
                <div className="row-between">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      <span className="muted" style={{ marginRight: 6 }}>{e.ticker}</span>
                      {e.company || e.ticker}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {e.divisa || 'USD'}
                    </div>
                  </div>
                  <div className="green" style={{ fontWeight: 600 }}>
                    {pv(`+$${_sf(e.neto_usd || e.neto || 0, 2)}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {dividends.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          No dividends for this period
        </div>
      )}
    </div>
  );
}
