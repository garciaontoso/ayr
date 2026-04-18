import { useState, useEffect } from 'react';
import { API_URL } from '../../constants/index.js';

// ── helpers ────────────────────────────────────────────────────────────────
const fmt$ = (n) =>
  n == null
    ? '—'
    : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (n) => (n == null ? '—' : Number(n).toFixed(1) + '%');

// Color-code WHT rate: 0%=green, 0–15%=yellow-ish, >15%=orange, >25%=red
const rateColor = (rate) => {
  if (rate === 0)      return '#30d158';
  if (rate <= 0.10)    return '#a3e635';
  if (rate <= 0.15)    return '#ffd60a';
  if (rate <= 0.20)    return '#ff9f0a';
  return '#ff453a';
};

// ── styles ─────────────────────────────────────────────────────────────────
const S = {
  wrap: {
    maxWidth: 960,
    margin: '0 auto',
    fontFamily: 'var(--fm, ui-monospace, monospace)',
    color: 'var(--text-primary, #e5e5ea)',
    padding: '16px 0',
  },
  card: {
    background: 'var(--card, #1c1c1e)',
    border: '1px solid var(--border, #3a3a3c)',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 16,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginTop: 8,
  },
  kpi: {
    background: 'var(--subtle-bg, #2c2c2e)',
    borderRadius: 8,
    padding: '12px 16px',
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 800,
    color: '#c8a44e',
    letterSpacing: '-0.5px',
    lineHeight: 1.1,
  },
  kpiLabel: {
    fontSize: 10,
    color: 'var(--text-tertiary, #636366)',
    marginTop: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#c8a44e',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: 10,
    borderBottom: '1px solid rgba(200,164,78,0.2)',
    paddingBottom: 6,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 11,
  },
  th: {
    padding: '6px 10px',
    textAlign: 'right',
    color: 'var(--text-tertiary, #636366)',
    fontWeight: 700,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '1px solid var(--border, #3a3a3c)',
    whiteSpace: 'nowrap',
  },
  thLeft: {
    padding: '6px 10px',
    textAlign: 'left',
    color: 'var(--text-tertiary, #636366)',
    fontWeight: 700,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '1px solid var(--border, #3a3a3c)',
  },
  td: {
    padding: '7px 10px',
    textAlign: 'right',
    fontSize: 12,
    borderBottom: '1px solid rgba(58,58,60,0.5)',
    whiteSpace: 'nowrap',
  },
  tdLeft: {
    padding: '7px 10px',
    textAlign: 'left',
    fontSize: 12,
    borderBottom: '1px solid rgba(58,58,60,0.5)',
  },
  badge: (rate) => ({
    display: 'inline-block',
    padding: '1px 7px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: rateColor(rate) + '22',
    color: rateColor(rate),
    border: `1px solid ${rateColor(rate)}44`,
  }),
  suggestionCard: {
    background: 'rgba(200,164,78,0.06)',
    border: '1px solid rgba(200,164,78,0.25)',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
};

// ── Tabs within this tab ───────────────────────────────────────────────────
const INNER_TABS = [
  { id: 'country', lbl: 'Por País' },
  { id: 'positions', lbl: 'Por Posición' },
  { id: 'suggestions', lbl: 'Optimización' },
];

export default function TaxOptimizationTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [innerTab, setInnerTab] = useState('country');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('ayr_worker_token') || '';
      const r = await fetch(`${API_URL}/api/tax/optimization-report`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    // padding shorthand complete (no mezclar con S.wrap.padding — React warning)
    <div style={{ ...S.wrap, textAlign: 'center', padding: '60px 0 16px' }}>
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Calculando retenciones...</div>
    </div>
  );

  if (error) return (
    <div style={{ ...S.wrap }}>
      <div style={{ ...S.card, border: '1px solid #ff453a33' }}>
        <div style={{ color: '#ff453a', fontSize: 12 }}>Error: {error}</div>
        <button onClick={load} style={{ marginTop: 8, padding: '5px 12px', borderRadius: 6, background: 'transparent', border: '1px solid #ff453a', color: '#ff453a', cursor: 'pointer', fontSize: 11 }}>
          Reintentar
        </button>
      </div>
    </div>
  );

  if (!data) return null;

  const { summary, by_country, positions, worst_offenders, rebalancing_suggestions } = data;

  return (
    <div style={S.wrap}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
            Análisis de Retenciones (WHT)
          </span>
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>
            Residente fiscal China · Actualizado {new Date(summary.generated_at).toLocaleDateString('es-ES')}
          </span>
        </div>
        <button onClick={load} title="Recalcular" style={{
          padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-tertiary)', fontSize: 10, cursor: 'pointer',
        }}>
          ↻ Actualizar
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={S.card}>
        <div style={S.summaryGrid}>
          <div style={S.kpi}>
            <div style={S.kpiValue}>{fmt$(summary.total_gross)}</div>
            <div style={S.kpiLabel}>Dividendo bruto anual</div>
          </div>
          <div style={{ ...S.kpi, border: '1px solid rgba(255,69,58,0.25)', background: 'rgba(255,69,58,0.07)' }}>
            <div style={{ ...S.kpiValue, color: '#ff453a' }}>{fmt$(summary.total_wht)}</div>
            <div style={S.kpiLabel}>Retención total WHT</div>
          </div>
          <div style={S.kpi}>
            <div style={{ ...S.kpiValue, color: '#30d158' }}>{fmt$(summary.total_net)}</div>
            <div style={S.kpiLabel}>Neto recibido</div>
          </div>
          <div style={{ ...S.kpi, border: '1px solid rgba(255,69,58,0.2)' }}>
            <div style={{ ...S.kpiValue, color: rateColor(summary.wht_pct_of_gross / 100) }}>
              {fmtPct(summary.wht_pct_of_gross)}
            </div>
            <div style={S.kpiLabel}>% WHT sobre bruto</div>
          </div>
          <div style={S.kpi}>
            <div style={{ ...S.kpiValue, color: 'var(--text-secondary, #aeaeb2)' }}>
              {summary.positions_analyzed}
            </div>
            <div style={S.kpiLabel}>Posiciones analizadas</div>
          </div>
        </div>

        {/* Mini WHT drag bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>
            <span>Neto recibido</span>
            <span>WHT drag</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--subtle-bg)', overflow: 'hidden', display: 'flex' }}>
            <div style={{
              width: `${100 - summary.wht_pct_of_gross}%`,
              background: 'linear-gradient(90deg, #30d158, #a3e635)',
              borderRadius: '4px 0 0 4px',
              transition: 'width .5s ease',
            }} />
            <div style={{
              flex: 1,
              background: 'linear-gradient(90deg, #ff9f0a, #ff453a)',
              borderRadius: '0 4px 4px 0',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)', marginTop: 3 }}>
            <span>{fmtPct(100 - summary.wht_pct_of_gross)} neto</span>
            <span>{fmtPct(summary.wht_pct_of_gross)} perdido en retenciones</span>
          </div>
        </div>
      </div>

      {/* ── Inner tab switcher ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {INNER_TABS.map(t => (
          <button key={t.id} onClick={() => setInnerTab(t.id)}
            style={{
              padding: '5px 14px', borderRadius: 7,
              border: `1px solid ${innerTab === t.id ? '#c8a44e' : 'var(--border)'}`,
              background: innerTab === t.id ? 'rgba(200,164,78,0.14)' : 'transparent',
              color: innerTab === t.id ? '#c8a44e' : 'var(--text-tertiary)',
              fontSize: 11, fontWeight: innerTab === t.id ? 700 : 500, cursor: 'pointer',
              fontFamily: 'var(--fm)', transition: 'all .12s',
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {/* ── By Country ── */}
      {innerTab === 'country' && (
        <div style={S.card}>
          <div style={S.sectionTitle}>WHT por País</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>País</th>
                <th style={S.th}>Tasa WHT</th>
                <th style={S.th}>Bruto anual</th>
                <th style={S.th}>WHT pagado</th>
                <th style={S.th}>Neto</th>
                <th style={S.th}>WHT%</th>
                <th style={S.th}>Posiciones</th>
              </tr>
            </thead>
            <tbody>
              {by_country.map(c => (
                <tr key={c.country} style={{ transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,164,78,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={S.tdLeft}>
                    <span style={{ marginRight: 6, fontSize: 14 }}>{c.flag}</span>
                    <span style={{ fontWeight: 600 }}>{c.country_name}</span>
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>{c.country}</span>
                  </td>
                  <td style={S.td}>
                    <span style={S.badge(c.wht_rate)}>{fmtPct(c.wht_rate * 100)}</span>
                  </td>
                  <td style={S.td}>{fmt$(c.gross)}</td>
                  <td style={{ ...S.td, color: c.wht > 0 ? '#ff453a' : 'var(--text-tertiary)' }}>
                    {fmt$(c.wht)}
                  </td>
                  <td style={{ ...S.td, color: '#30d158' }}>{fmt$(c.net)}</td>
                  <td style={{ ...S.td, color: rateColor(c.wht_rate) }}>{fmtPct(c.wht_pct_of_gross)}</td>
                  <td style={{ ...S.td, color: 'var(--text-tertiary)' }}>{c.positions}</td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(200,164,78,0.04)' }}>
                <td style={{ ...S.tdLeft, fontWeight: 700, color: '#c8a44e' }}>Total cartera</td>
                <td style={{ ...S.td, color: rateColor(summary.wht_pct_of_gross / 100) }}>
                  ~{fmtPct(summary.wht_pct_of_gross)}
                </td>
                <td style={{ ...S.td, fontWeight: 700 }}>{fmt$(summary.total_gross)}</td>
                <td style={{ ...S.td, fontWeight: 700, color: '#ff453a' }}>{fmt$(summary.total_wht)}</td>
                <td style={{ ...S.td, fontWeight: 700, color: '#30d158' }}>{fmt$(summary.total_net)}</td>
                <td style={{ ...S.td }}>{fmtPct(summary.wht_pct_of_gross)}</td>
                <td style={{ ...S.td }}>{summary.positions_analyzed}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── By Position ── */}
      {innerTab === 'positions' && (
        <div style={S.card}>
          <div style={S.sectionTitle}>
            WHT por Posición
            {worst_offenders.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 9, color: '#ff453a', background: 'rgba(255,69,58,0.12)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(255,69,58,0.25)' }}>
                {worst_offenders.length} con WHT &gt; 20%
              </span>
            )}
          </div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Ticker</th>
                <th style={S.thLeft}>País</th>
                <th style={S.th}>Tasa</th>
                <th style={S.th}>Bruto anual</th>
                <th style={S.th}>WHT</th>
                <th style={S.th}>Neto</th>
                <th style={S.th}>Yield</th>
                <th style={S.th}>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.ticker}
                  style={{ background: p.wht_rate > 0.20 ? 'rgba(255,69,58,0.04)' : 'transparent', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,164,78,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = p.wht_rate > 0.20 ? 'rgba(255,69,58,0.04)' : 'transparent'}>
                  <td style={S.tdLeft}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{p.ticker}</span>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>{p.name}</div>
                  </td>
                  <td style={S.tdLeft}>
                    <span style={{ marginRight: 4 }}>{p.flag}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.country}</span>
                  </td>
                  <td style={S.td}>
                    <span style={S.badge(p.wht_rate)}>{fmtPct(p.wht_rate * 100)}</span>
                  </td>
                  <td style={S.td}>{fmt$(p.annual_gross)}</td>
                  <td style={{ ...S.td, color: p.annual_wht > 0 ? '#ff453a' : 'var(--text-tertiary)' }}>
                    {fmt$(p.annual_wht)}
                  </td>
                  <td style={{ ...S.td, color: '#30d158' }}>{fmt$(p.annual_net)}</td>
                  <td style={{ ...S.td, color: 'var(--text-tertiary)' }}>
                    {p.div_yield > 0 ? fmtPct(p.div_yield) : '—'}
                  </td>
                  <td style={{ ...S.td, fontSize: 9, color: p.source === 'actual' ? '#30d158' : '#ffd60a' }}>
                    {p.source === 'actual' ? 'Real' : 'Est.'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Rebalancing Suggestions ── */}
      {innerTab === 'suggestions' && (
        <div>
          {/* Worst offenders */}
          {worst_offenders.length > 0 && (
            <div style={S.card}>
              <div style={S.sectionTitle}>Mayores contribuyentes a retención (&gt;20% WHT)</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.thLeft}>Posición</th>
                    <th style={S.thLeft}>País</th>
                    <th style={S.th}>WHT Rate</th>
                    <th style={S.th}>WHT anual</th>
                    <th style={S.th}>Bruto</th>
                    <th style={S.th}>Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {worst_offenders.map(p => (
                    <tr key={p.ticker}>
                      <td style={S.tdLeft}>
                        <span style={{ fontWeight: 700 }}>{p.ticker}</span>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{p.name}</div>
                      </td>
                      <td style={S.tdLeft}>
                        <span style={{ marginRight: 4 }}>{p.flag}</span>
                        <span style={{ fontSize: 10 }}>{p.country_name}</span>
                      </td>
                      <td style={S.td}>
                        <span style={S.badge(p.wht_rate)}>{fmtPct(p.wht_rate * 100)}</span>
                      </td>
                      <td style={{ ...S.td, fontWeight: 700, color: '#ff453a' }}>{fmt$(p.annual_wht)}</td>
                      <td style={S.td}>{fmt$(p.annual_gross)}</td>
                      <td style={{ ...S.td, color: '#30d158' }}>{fmt$(p.annual_net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rebalancing suggestions */}
          <div style={S.card}>
            <div style={S.sectionTitle}>Sugerencias de optimización</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 12, fontStyle: 'italic' }}>
              Estas sugerencias muestran el ahorro potencial si se sustituyera exposición a países de alta retención
              por equivalentes de menor WHT. No se recomienda vender — es solo una referencia informativa.
            </div>
            {rebalancing_suggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '16px 0' }}>
                No hay sugerencias significativas con los datos actuales.
              </div>
            ) : (
              rebalancing_suggestions.map((s, i) => (
                <div key={i} style={S.suggestionCard}>
                  <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: 22 }}>{s.from_flag}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#ff453a' }}>{s.from_country}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtPct(s.from_wht_rate * 100)} WHT</div>
                  </div>
                  <div style={{ fontSize: 18, color: 'var(--text-tertiary)', flex: '0 0 auto' }}>→</div>
                  <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: 22 }}>{s.to_flag}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#30d158' }}>{s.to_country}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtPct(s.to_wht_rate * 100)} WHT</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.from_country_name}</strong>
                      {' → '}<strong style={{ color: 'var(--text-primary)' }}>{s.to_country_name}</strong>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.note}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
                      Bruto en riesgo: {fmt$(s.annual_gross_at_risk)} · WHT actual: {fmt$(s.current_wht)}
                    </div>
                  </div>
                  <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#30d158' }}>
                      +{fmt$(s.potential_saving)}
                    </div>
                    <div style={{ fontSize: 9, color: '#30d158', fontWeight: 600 }}>ahorro anual estimado</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Disclaimer */}
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '8px 12px', background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)' }}>
            Nota: Las tasas WHT se basan en los convenios de doble imposición con China. La tasa efectiva puede variar
            según el tipo de instrumento (ADR vs acción directa), las reglas del broker y si se ha presentado el W-8BEN.
            Los datos "Real" provienen del historial IB (últimos 12 meses); "Est." se proyecta desde div_ttm × acciones.
          </div>
        </div>
      )}
    </div>
  );
}
