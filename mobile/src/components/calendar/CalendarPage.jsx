import { useState, useEffect, useMemo, memo } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../api/client';
import { fDol, _sf, f0 } from '../../utils/formatters';
import BarChart from '../ui/BarChart';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MAX_ENTRIES = 50; // Limit rendered entries to prevent freeze

export default function CalendarPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const { forwardDiv, divMensual, divResumen, privacy, totalValue } = useApp();
  const [dividends, setDividends] = useState([]);
  const [loading, setLoading] = useState(false);

  const years = [
    { id: String(currentYear - 2), label: String(currentYear - 2) },
    { id: String(currentYear - 1), label: String(currentYear - 1) },
    { id: String(currentYear), label: String(currentYear) },
    { id: '1y', label: 'One year ahead' },
    { id: String(currentYear + 1), label: String(currentYear + 1) },
  ];

  useEffect(() => {
    setLoading(true);
    const yr = year === '1y' ? String(currentYear) : year;
    apiFetch(`/api/dividendos?year=${yr}`).then(d => {
      if (Array.isArray(d)) setDividends(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [year, currentYear]);

  const isForward = year === '1y' || parseInt(year) > currentYear;
  const annualProjected = forwardDiv?.annual_projected || 0;
  const yearResumen = divResumen.find(r => String(r.anio) === year);
  const annualIncome = isForward ? annualProjected : (yearResumen?.neto || dividends.reduce((s, d) => s + (d.neto_usd || d.neto || 0), 0));
  const yieldPct = totalValue > 0 ? (annualIncome / totalValue) * 100 : 0;

  const monthlyData = useMemo(() => {
    const selYear = year === '1y' ? currentYear : parseInt(year);
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${selYear}-${String(i + 1).padStart(2, '0')}`;
      const fromMensual = divMensual.find(m => m.mes === key)?.neto || 0;
      const estimated = isForward ? (forwardDiv?.monthly?.[i]?.amount || 0) : 0;
      const val = fromMensual || estimated;
      return {
        label: MONTHS[i],
        value: val,
        color: fromMensual > 0 ? 'var(--green)' : estimated > 0 ? 'var(--blue)' : 'var(--border)',
      };
    });
  }, [year, currentYear, divMensual, forwardDiv, isForward]);

  // Group dividends by month (not individual entries) for performance
  const monthGroups = useMemo(() => {
    const sorted = [...dividends].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const groups = {};
    sorted.forEach(d => {
      const m = d.fecha?.slice(0, 7); // "2026-01"
      if (!groups[m]) groups[m] = { entries: [], total: 0 };
      groups[m].entries.push(d);
      groups[m].total += (d.neto_usd || d.neto || 0);
    });
    return Object.entries(groups);
  }, [dividends]);

  const [expandedMonth, setExpandedMonth] = useState(null);
  const pv = v => privacy ? '***' : v;

  return (
    <div className="page">
      <div className="year-selector">
        {years.map(y => (
          <button key={y.id} className={`year-pill ${year === y.id ? 'active' : ''}`} onClick={() => setYear(y.id)}>
            {y.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="metric-label">Annual income</div>
        <div className="metric-big">{pv(fDol(annualIncome))}</div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div>
            <div className="metric-label">Monthly</div>
            <div className="metric-value">{pv(`$${f0(annualIncome / 12)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Daily</div>
            <div className="metric-value">{pv(`$${_sf(annualIncome / 365, 2)}`)}</div>
          </div>
          <div>
            <div className="metric-label">Yield</div>
            <div className="metric-value green">{_sf(yieldPct, 2)}%</div>
          </div>
        </div>
      </div>

      <div className="card">
        <BarChart data={monthlyData} />
        <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 12, fontSize: 11 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--green)', marginRight: 4 }} />Received</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--blue)', marginRight: 4 }} />Estimated</span>
        </div>
      </div>

      {loading && <div className="ptr-indicator">Loading...</div>}

      {/* Monthly groups — tap to expand (avoids rendering 2000+ entries) */}
      {monthGroups.map(([month, { entries, total }]) => {
        const [y, m] = month.split('-');
        const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long' });
        const isExpanded = expandedMonth === month;

        return (
          <div key={month}>
            <div className="holding-row" onClick={() => setExpandedMonth(isExpanded ? null : month)} style={{ cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{monthName} {y}</div>
                <div className="muted" style={{ fontSize: 12 }}>{entries.length} payments</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="green" style={{ fontWeight: 600 }}>{pv(`+${fDol(total)}`)}</div>
                <div className="muted" style={{ fontSize: 10 }}>{isExpanded ? 'Tap to close' : 'Tap to expand'}</div>
              </div>
            </div>
            {isExpanded && entries.slice(0, MAX_ENTRIES).map(e => (
              <div key={e.id || `${e.ticker}-${e.fecha}`} className="div-entry" style={{ paddingLeft: 32 }}>
                <div className="row-between">
                  <div>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text2)', marginRight: 6, fontSize: 11 }}>{e.ticker}</span>
                      {e.company || e.ticker}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{e.fecha}</div>
                  </div>
                  <div className="green" style={{ fontWeight: 600, fontSize: 13 }}>
                    {pv(`+$${_sf(e.neto_usd || e.neto || 0, 2)}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {!loading && dividends.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          No dividends for this period
        </div>
      )}
    </div>
  );
}
