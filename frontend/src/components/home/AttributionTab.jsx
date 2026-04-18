import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── colour helpers ────────────────────────────────────────────────────
function pnlColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v > 0)   return '#30d158';
  if (v < 0)   return '#ff453a';
  return 'var(--text-tertiary)';
}
function pctColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v > 5)   return '#30d158';
  if (v > 0)   return '#34c759';
  if (v > -5)  return '#ff9f0a';
  return '#ff453a';
}
function barColor(v) {
  return v >= 0 ? '#30d158' : '#ff453a';
}
function fmt$(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '+';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtPct(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

const PERIODS = [
  { id: 'ytd',  lbl: 'YTD 2026' },
  { id: '3m',   lbl: '3 meses' },
  { id: '6m',   lbl: '6 meses' },
  { id: '12m',  lbl: '12 meses' },
];

const REFRESH_BTN = {
  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontFamily: 'var(--fb)',
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-tertiary)', cursor: 'pointer',
};

function Stat({ lbl, val, color, sub }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '10px 16px', border: '1px solid var(--border)', minWidth: 120 }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 3 }}>{lbl}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--gold)', fontFamily: 'var(--fm)', letterSpacing: '-0.5px' }}>{val}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fb)', letterSpacing: '.5px', marginBottom: 10, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Horizontal bar chart (sector / currency / strategy) ─────────────
function BarChart({ rows, labelKey, maxAbs }) {
  if (!rows || !rows.length) return <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Sin datos</div>;
  const max = maxAbs || Math.max(...rows.map(r => Math.abs(r.pnl_usd || 0)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => {
        const pnl = r.pnl_usd || 0;
        const barW = Math.round((Math.abs(pnl) / max) * 100);
        const isPos = pnl >= 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Label */}
            <div style={{ width: 140, textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r[labelKey] || '—'}
            </div>
            {/* Bar track */}
            <div style={{ flex: 1, position: 'relative', height: 22, background: 'var(--surface)', borderRadius: 5, overflow: 'hidden' }}>
              {/* Bar */}
              <div style={{
                position: 'absolute',
                left: isPos ? '50%' : `calc(50% - ${barW / 2}%)`,
                width: `${barW / 2}%`,
                height: '100%',
                background: barColor(pnl),
                opacity: 0.75,
                borderRadius: isPos ? '0 4px 4px 0' : '4px 0 0 4px',
                transition: 'width .3s ease',
              }} />
              {/* Centre line */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
            </div>
            {/* Values */}
            <div style={{ width: 80, textAlign: 'right', fontSize: 11, fontFamily: 'var(--fm)', color: pnlColor(pnl), fontWeight: 700 }}>
              {fmt$(pnl)}
            </div>
            <div style={{ width: 50, textAlign: 'right', fontSize: 10, fontFamily: 'var(--fm)', color: pctColor(r.pnl_pct) }}>
              {fmtPct(r.pnl_pct)}
            </div>
            <div style={{ width: 30, textAlign: 'right', fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--text-tertiary)' }}>
              ({r.count})
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Contributor / Detractor table ───────────────────────────────────
function ContribTable({ rows, title, isDetractor }) {
  if (!rows || !rows.length) return null;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.pnl_usd || 0)), 1);
  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${isDetractor ? 'rgba(255,69,58,.2)' : 'rgba(48,209,88,.2)'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: isDetractor ? '#ff453a' : '#30d158', fontFamily: 'var(--fb)' }}>
        {isDetractor ? '▼ ' : '▲ '}{title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              {['Ticker', 'Nombre', 'Sector', 'Peso', 'P&L $', 'Retorno', 'FX'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
              <th style={{ padding: '6px 8px', width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => {
              const barW = Math.round((Math.abs(h.pnl_usd || 0) / maxAbs) * 80);
              return (
                <tr key={h.ticker} style={{ borderTop: '1px solid var(--subtle-bg)', background: i % 2 === 0 ? 'transparent' : 'var(--row-alt)' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>{h.ticker}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--fm)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 10, whiteSpace: 'nowrap' }}>{h.sector || '—'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{h.weight_pct?.toFixed(1)}%</td>
                  <td style={{ padding: '7px 8px', color: pnlColor(h.pnl_usd), fontWeight: 700, fontFamily: 'var(--fm)' }}>{fmt$(h.pnl_usd)}</td>
                  <td style={{ padding: '7px 8px', color: pctColor(h.pnl_pct), fontFamily: 'var(--fm)' }}>{fmtPct(h.pnl_pct)}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 10 }}>
                    {h.fx_impact_pct != null ? fmtPct(h.fx_impact_pct) : '—'}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <div style={{ height: 14, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barW}%`, background: barColor(h.pnl_usd), opacity: .7, borderRadius: 3 }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Benchmark comparison bar ─────────────────────────────────────────
function BenchmarkBar({ portfolioRet, spyRet }) {
  if (portfolioRet == null) return null;
  const vals = [
    { lbl: 'Portafolio', val: portfolioRet, color: 'var(--gold)' },
    spyRet != null && { lbl: 'SPY', val: spyRet, color: '#64d2ff' },
  ].filter(Boolean);
  const maxAbs = Math.max(...vals.map(v => Math.abs(v.val)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {vals.map((v, i) => {
        const barW = Math.round((Math.abs(v.val) / maxAbs) * 120);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: 600, color: v.color, fontFamily: 'var(--fm)' }}>{v.lbl}</div>
            <div style={{ width: 240, position: 'relative', height: 28, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute',
                left: v.val >= 0 ? '50%' : `calc(50% - ${barW / 2}%)`,
                width: `${barW / 2}%`,
                height: '100%',
                background: v.color,
                opacity: 0.6,
                borderRadius: v.val >= 0 ? '0 5px 5px 0' : '5px 0 0 5px',
              }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: v.color, fontFamily: 'var(--fm)' }}>
              {fmtPct(v.val)}
            </div>
          </div>
        );
      })}
      {spyRet != null && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2 }}>
          Alpha vs SPY: <span style={{ color: pnlColor(portfolioRet - spyRet), fontWeight: 700 }}>
            {fmtPct(portfolioRet - spyRet)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────
// Backend accepts same-origin requests without auth (isAllowed bypass).
export default function AttributionTab() {
  const [period, setPeriod] = useState(() => localStorage.getItem('attribution_period') || 'ytd');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback((force = false) => {
    setLoading(true);
    setError(null);
    const qs = force ? `period=${period}&refresh=1` : `period=${period}`;
    fetch(`${API_URL}/api/analytics/attribution?${qs}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok !== false) setData(d); else setError(d.error || 'Error'); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const handlePeriod = (p) => {
    setPeriod(p);
    localStorage.setItem('attribution_period', p);
  };

  const { summary } = data || {};

  return (
    <div style={{ padding: '0 0 48px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fb)' }}>
            Atribución de Rendimiento
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
            Desglose P&L por sector · divisa · estrategia
          </p>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => handlePeriod(p.id)} disabled={loading}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 11, fontFamily: 'var(--fb)', cursor: 'pointer',
                border: `1px solid ${period === p.id ? 'var(--gold)' : 'var(--border)'}`,
                background: period === p.id ? 'var(--gold-dim)' : 'transparent',
                color: period === p.id ? 'var(--gold)' : 'var(--text-tertiary)',
                fontWeight: period === p.id ? 700 : 500, transition: 'all .12s',
              }}>
              {p.lbl}
            </button>
          ))}
          <button onClick={() => load(true)} disabled={loading} style={REFRESH_BTN}>
            {loading ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> : '⟳ Actualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.25)', borderRadius: 10, padding: '14px 18px', color: '#ff453a', fontSize: 12, fontFamily: 'var(--fm)', marginBottom: 16 }}>
          Error: {error}
          <button onClick={() => load(true)} style={{ marginLeft: 12, ...REFRESH_BTN, padding: '3px 8px', fontSize: 10 }}>Reintentar</button>
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--fm)' }}>
          <div style={{ fontSize: 28, marginBottom: 10, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
          <div>Calculando atribución (puede tardar ~30s la primera vez)...</div>
        </div>
      )}

      {data && summary && (
        <>
          {/* Hero stats */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            <Stat lbl="P&L Total"
              val={fmt$(summary.total_pnl_usd)}
              color={pnlColor(summary.total_pnl_usd)}
              sub={`Desde ${data.period_start}`} />
            <Stat lbl="Retorno Portafolio"
              val={fmtPct(summary.total_return_pct)}
              color={pctColor(summary.total_return_pct)} />
            {summary.spy_return_pct != null && (
              <Stat lbl="SPY"
                val={fmtPct(summary.spy_return_pct)}
                color={pctColor(summary.spy_return_pct)} />
            )}
            {summary.vs_spy_pct != null && (
              <Stat lbl="Alpha vs SPY"
                val={fmtPct(summary.vs_spy_pct)}
                color={pnlColor(summary.vs_spy_pct)}
                sub={summary.vs_spy_pct >= 0 ? 'Superando al índice' : 'Por debajo del índice'} />
            )}
            {summary.fx_drag_pct !== 0 && (
              <Stat lbl="Impacto FX"
                val={fmtPct(summary.fx_drag_pct)}
                color={pnlColor(summary.fx_drag_pct)}
                sub="Efecto divisa sobre cartera" />
            )}
            <Stat lbl="Cobertura datos"
              val={`${summary.data_coverage_pct}%`}
              color={summary.data_coverage_pct >= 80 ? '#30d158' : '#ff9f0a'}
              sub={`${summary.positions_with_historical_data}/${summary.positions_total} con historial`} />
          </div>

          {/* Benchmark bar */}
          <Section title="vs Benchmark (SPY)">
            <BenchmarkBar
              portfolioRet={summary.total_return_pct}
              spyRet={summary.spy_return_pct} />
          </Section>

          {/* Sector attribution */}
          <Section title={`Atribución por Sector (${(data.by_sector || []).length} sectores)`}>
            <BarChart rows={data.by_sector || []} labelKey="sector" />
            {Array.isArray(data.by_sector) && data.by_sector.some(s => s.contribution_pct) && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.by_sector.slice(0, 6).map(s => (
                  <div key={s.sector} style={{ background: 'var(--surface)', borderRadius: 7, padding: '4px 10px', border: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--fm)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{s.sector}</span>
                    <span style={{ color: pnlColor(s.pnl_usd), marginLeft: 6, fontWeight: 700 }}>
                      {s.contribution_pct >= 0 ? '+' : ''}{s.contribution_pct?.toFixed(1)}pp
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Top contributors / detractors side by side */}
          <Section title="Top 10 Contribuidores y Detractores">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ContribTable rows={data.top_contributors} title="Top 10 Contribuidores" isDetractor={false} />
              <ContribTable rows={data.top_detractors}   title="Top 10 Detractores"  isDetractor={true} />
            </div>
          </Section>

          {/* Currency and Strategy split side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
            <Section title="Por Divisa / Región">
              <BarChart rows={data.by_currency} labelKey="currency" />
            </Section>
            <Section title="Por Estrategia">
              <BarChart rows={data.by_strategy} labelKey="strategy" />
            </Section>
          </div>

          {/* All holdings sortable table */}
          <Section title={`Todas las Posiciones (${data.all_holdings?.length || 0})`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Ticker', 'Nombre', 'Sector', 'Div.', 'Peso', 'Inicio USD', 'Actual USD', 'P&L $', 'Retorno', 'FX Impact', 'Hist.'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.all_holdings || []).map((h, i) => (
                    <tr key={h.ticker} style={{ borderTop: '1px solid var(--subtle-bg)', background: i % 2 === 0 ? 'transparent' : 'var(--row-alt)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>{h.ticker}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--fm)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 10 }}>{h.sector || '—'}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 10 }}>{h.currency}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{h.weight_pct?.toFixed(1)}%</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>${(h.start_price_usd || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>${(h.current_price_usd || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: pnlColor(h.pnl_usd), fontFamily: 'var(--fm)' }}>{fmt$(h.pnl_usd)}</td>
                      <td style={{ padding: '6px 8px', color: pctColor(h.pnl_pct), fontFamily: 'var(--fm)' }}>{fmtPct(h.pnl_pct)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 10 }}>
                        {h.fx_impact_pct != null ? fmtPct(h.fx_impact_pct) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span title={h.used_historical ? 'Precio histórico de FMP' : 'Sin dato histórico — usa precio medio'} style={{ fontSize: 12 }}>
                          {h.used_historical ? '✓' : '~'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 6 }}>
              ✓ = precio de inicio de período desde FMP · ~ = aproximado usando precio medio de compra
            </div>
          </Section>

          {/* Footer */}
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            Calculado: {data.computed_at ? new Date(data.computed_at).toLocaleString('es-ES') : '—'} ·
            Período desde {data.period_start} · Caché 24h · Precios FMP EOD
          </div>
        </>
      )}
    </div>
  );
}
