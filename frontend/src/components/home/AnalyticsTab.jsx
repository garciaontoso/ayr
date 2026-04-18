import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── colour helpers ────────────────────────────────────────────────────
// Correlation: -1 (blue) → 0 (neutral) → +1 (red/orange)
function corrColor(r) {
  if (r === null || r === undefined) return 'var(--surface)';
  if (r >= 0.8)  return '#ff453a';
  if (r >= 0.6)  return '#ff6b35';
  if (r >= 0.4)  return '#ff9f0a';
  if (r >= 0.2)  return '#ffd60a33';
  if (r >= -0.2) return 'var(--surface)';
  if (r >= -0.4) return '#30d15822';
  if (r >= -0.6) return '#30d15844';
  return '#30d158';
}
function corrTextColor(r) {
  if (r === null || r === undefined) return 'var(--text-tertiary)';
  if (Math.abs(r) >= 0.5) return '#fff';
  return 'var(--text-secondary)';
}

// Factor score: 0-100, benchmark 50 → colour
function factorColor(score) {
  const diff = score - 50;
  if (diff > 25) return '#30d158';
  if (diff > 10) return '#34c759';
  if (diff > -10) return 'var(--gold)';
  if (diff > -25) return '#ff9f0a';
  return '#ff453a';
}

// Stress return: negative = red, less bad = orange/yellow, positive = green
function retColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v > 0)    return '#30d158';
  if (v > -10)  return '#ffd60a';
  if (v > -25)  return '#ff9f0a';
  return '#ff453a';
}

const SUB_TABS = [
  { id: 'correlation', lbl: 'Correlación' },
  { id: 'factors',     lbl: 'Factores' },
  { id: 'stress',      lbl: 'Stress Test' },
];

const SCENARIOS = [
  { id: 'gfc',         lbl: '2008 GFC (-57%)' },
  { id: 'covid',       lbl: '2020 COVID (-34%)' },
  { id: 'rate-hike',   lbl: '2022 Subidas Tipos (-25%)' },
  { id: 'stagflation', lbl: 'Stagflation (Custom)' },
];

// ─── shared fetch helper ───────────────────────────────────────────────
// No token required — backend accepts same-origin requests (ayr.onto-so.com)
// without auth, since the worker's isAllowed check bypasses ytRequireToken
// for requests from the frontend origin.
function useAnalytics(endpoint, enabled) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback((force = false) => {
    setLoading(true);
    setError(null);
    const url = force ? `${API_URL}${endpoint}?refresh=1` : `${API_URL}${endpoint}`;
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok !== false) setData(d); else setError(d.error || 'Error'); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [endpoint]);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  return { data, loading, error, reload: load };
}

// ─── Correlation Heatmap ───────────────────────────────────────────────
function CorrelationView() {
  const { data, loading, error, reload } = useAnalytics('/api/analytics/correlation', true);

  if (loading) return <LoadingSpinner label="Calculando correlaciones (3 años datos)" />;
  if (error)   return <ErrorBox msg={error} onRetry={() => reload(true)} />;
  if (!data)   return null;

  const { tickers, matrix_rows, high_corr_pairs, unexpected_correlations, clusters, stats } = data;

  // Only show top N tickers to keep heatmap readable
  const MAX_DISP = 20;
  const dispTickers = tickers.slice(0, MAX_DISP);
  const dispRows = matrix_rows.slice(0, MAX_DISP).map(r => ({
    ...r,
    values: r.values.slice(0, MAX_DISP),
  }));

  const cellSize = Math.max(28, Math.min(44, Math.floor(560 / (dispTickers.length + 1))));
  const fontSize = cellSize < 32 ? 8 : 9;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { lbl: 'Tickers analizados', val: tickers.length },
          { lbl: 'Pares alta correl (>0.7)', val: stats.high_corr_count },
          { lbl: 'Correlación media', val: stats.avg_correlation?.toFixed(2) },
          { lbl: 'Clusters (>0.6)', val: clusters?.length || 0 },
        ].map(s => (
          <div key={s.lbl} style={{ background: 'var(--surface)', borderRadius: 8, padding: '8px 14px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 2 }}>{s.lbl}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>{s.val}</div>
          </div>
        ))}
        <button onClick={() => reload(true)} style={REFRESH_BTN_STYLE}>Actualizar</button>
      </div>

      {/* Heatmap */}
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ borderCollapse: 'collapse', fontSize }}>
          <thead>
            <tr>
              <th style={{ width: cellSize * 1.5, padding: 2 }} />
              {dispTickers.map(t => (
                <th key={t} style={{ width: cellSize, padding: 2, textAlign: 'center' }}>
                  <div style={{
                    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                    color: 'var(--text-secondary)', fontWeight: 600,
                    fontSize: fontSize - 1, height: 56, overflow: 'hidden',
                    fontFamily: 'var(--fm)',
                  }}>{t}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dispRows.map((row, ri) => (
              <tr key={row.ticker}>
                <td style={{
                  padding: '1px 4px', textAlign: 'right',
                  color: 'var(--text-secondary)', fontWeight: 600,
                  fontSize: fontSize - 1, fontFamily: 'var(--fm)',
                  whiteSpace: 'nowrap',
                }}>{row.ticker}</td>
                {row.values.map((val, ci) => (
                  <td key={ci} title={`${row.ticker} × ${dispTickers[ci]}: ${val?.toFixed(2) ?? 'N/A'}`}
                    style={{
                      width: cellSize, height: cellSize,
                      background: corrColor(val),
                      textAlign: 'center', verticalAlign: 'middle',
                      fontSize: fontSize - 1,
                      color: corrTextColor(val),
                      fontFamily: 'var(--fm)',
                      border: '1px solid rgba(0,0,0,.1)',
                    }}>
                    {val !== null ? val.toFixed(2) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {tickers.length > MAX_DISP && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Mostrando primeros {MAX_DISP} de {tickers.length} tickers (ordenados por peso).
          </p>
        )}
      </div>

      {/* Clusters */}
      {clusters && clusters.length > 0 && (
        <Section title="Clusters de movimiento conjunto (r > 0.6)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {clusters.map((cl, i) => (
              <div key={i} style={{ background: 'rgba(255,149,10,.08)', border: '1px solid rgba(255,149,10,.25)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: '#ff9f0a', marginBottom: 4, fontFamily: 'var(--fm)' }}>{cl.theme}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {cl.tickers.map(t => (
                    <span key={t} style={{ background: 'var(--surface)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* High-corr pairs */}
      {high_corr_pairs && high_corr_pairs.length > 0 && (
        <Section title="Pares alta correlación (r > 0.7)">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Ticker 1', 'Ticker 2', 'Correlación', 'Mismo sector'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontFamily: 'var(--fm)', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {high_corr_pairs.slice(0, 15).map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  <td style={CELL}>{p.t1}</td>
                  <td style={CELL}>{p.t2}</td>
                  <td style={{ ...CELL, fontWeight: 700, color: corrColor(p.r) === 'var(--surface)' ? 'var(--text-primary)' : '#ff6b35' }}>{p.r?.toFixed(3)}</td>
                  <td style={{ ...CELL, color: p.sameSector ? '#ffd60a' : 'var(--text-tertiary)' }}>{p.sameSector ? `${p.s1}` : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Unexpected correlations */}
      {unexpected_correlations && unexpected_correlations.length > 0 && (
        <Section title="Correlaciones inesperadas (sectores distintos, r > 0.75)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unexpected_correlations.map((p, i) => (
              <div key={i} style={{ background: 'rgba(255,69,58,.07)', border: '1px solid rgba(255,69,58,.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.t1}</span>
                {' '}<span style={{ color: 'var(--text-tertiary)' }}>({p.s1 || '?'})</span>
                {' ↔ '}
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.t2}</span>
                {' '}<span style={{ color: 'var(--text-tertiary)' }}>({p.s2 || '?'})</span>
                {' — '}
                <span style={{ fontWeight: 700, color: '#ff453a' }}>r = {p.r?.toFixed(3)}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)' }}>Se mueven juntos aunque son de sectores diferentes</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Factor Exposure Radar ─────────────────────────────────────────────
function FactorsView() {
  const { data, loading, error, reload } = useAnalytics('/api/analytics/factors', true);

  if (loading) return <LoadingSpinner label="Calculando exposición a factores" />;
  if (error)   return <ErrorBox msg={error} onRetry={() => reload(true)} />;
  if (!data)   return null;

  const { portfolio_factors, tilts, per_ticker, benchmark_note } = data;

  const FACTOR_ORDER = ['value', 'growth', 'quality', 'momentum', 'yield', 'size'];

  // Radar bars (horizontal bar chart 0-100, midpoint = benchmark 50)
  const RadarBar = ({ label, score, description }) => {
    const diff = score - 50;
    const isPositive = diff >= 0;
    const barPct = Math.min(Math.abs(diff), 50) / 50 * 100;
    const color = factorColor(score);
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'var(--fm)' }}>
            {score} <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)' }}>/ 100</span>
          </span>
        </div>
        <div style={{ position: 'relative', height: 10, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden' }}>
          {/* Center line at 50 */}
          <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'var(--border)', zIndex: 1 }} />
          {/* Bar from center */}
          <div style={{
            position: 'absolute',
            left: isPositive ? '50%' : `${50 - barPct / 2}%`,
            width: `${barPct / 2}%`,
            height: '100%',
            background: color,
            borderRadius: 6,
            opacity: 0.85,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{description}</span>
          <span style={{ fontSize: 9, color: diff > 0 ? '#30d158' : diff < 0 ? '#ff453a' : 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
            {diff > 0 ? '+' : ''}{diff} vs benchmark
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--fm)' }}>
          {benchmark_note}
        </p>
        <button onClick={() => reload(true)} style={REFRESH_BTN_STYLE}>Actualizar</button>
      </div>

      {/* Factor bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {FACTOR_ORDER.map(k => {
          const f = portfolio_factors[k];
          if (!f) return null;
          return (
            <div key={k} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <RadarBar label={f.label} score={f.score} description={f.description} />
            </div>
          );
        })}
      </div>

      {/* Tilts */}
      {tilts && tilts.length > 0 && (
        <Section title="Tilts significativos (>15 puntos del benchmark)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            {tilts.map(t => (
              <div key={t.factor} style={{
                borderRadius: 10, padding: '8px 14px',
                background: t.tilt === 'overweight' ? 'rgba(48,209,88,.1)' : 'rgba(255,69,58,.08)',
                border: `1px solid ${t.tilt === 'overweight' ? 'rgba(48,209,88,.3)' : 'rgba(255,69,58,.25)'}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.tilt === 'overweight' ? '#30d158' : '#ff453a', fontFamily: 'var(--fm)' }}>
                  {t.factor}: {t.score} {t.tilt === 'overweight' ? '▲' : '▼'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                  {t.tilt === 'overweight' ? 'Sobreponderado' : 'Infraponderado'} {t.magnitude}pts
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Per-ticker table */}
      {per_ticker && per_ticker.length > 0 && (
        <Section title="Exposición por posición">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ticker', 'Peso%', 'Valor', 'Growth', 'Quality', 'Momentum', 'Yield', 'Size'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontFamily: 'var(--fm)', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {per_ticker.slice(0, 30).map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                    <td style={{ ...CELL, fontWeight: 700 }}>{p.ticker}</td>
                    <td style={CELL}>{p.weight_pct?.toFixed(1)}%</td>
                    {['valueScore','growthScore','qualityScore','momentumScore','yieldScore','sizeScore'].map(k => (
                      <td key={k} style={{ ...CELL, color: factorColor(p.scores?.[k] ?? 50), fontWeight: 600 }}>
                        {p.scores?.[k] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Stress Test ───────────────────────────────────────────────────────
function StressView() {
  const [scenario, setScenario] = useState('gfc');
  const { data, loading, error, reload } = useAnalytics(`/api/analytics/stress-test?scenario=${scenario}`, true);

  // reload when scenario changes
  useEffect(() => { reload(); }, [scenario]);  // eslint-disable-line react-hooks/exhaustive-deps

  const forceReload = () => {
    const orig = fetch;
    void orig;
    reload(true);
  };

  return (
    <div>
      {/* Scenario selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {SCENARIOS.map(s => (
          <button key={s.id} onClick={() => setScenario(s.id)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontFamily: 'var(--fb)', cursor: 'pointer',
              border: `1px solid ${scenario === s.id ? 'var(--gold)' : 'var(--border)'}`,
              background: scenario === s.id ? 'var(--gold-dim)' : 'transparent',
              color: scenario === s.id ? 'var(--gold)' : 'var(--text-tertiary)',
              fontWeight: scenario === s.id ? 700 : 500, transition: 'all .15s',
            }}>
            {s.lbl}
          </button>
        ))}
        <button onClick={forceReload} style={REFRESH_BTN_STYLE}>Actualizar</button>
      </div>

      {loading && <LoadingSpinner label="Buscando datos históricos..." />}
      {error && <ErrorBox msg={error} onRetry={() => reload(true)} />}

      {!loading && !error && data && (
        <>
          {/* Scenario header */}
          <div style={{ background: 'rgba(255,69,58,.06)', border: '1px solid rgba(255,69,58,.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: 'var(--fb)' }}>
              {data.scenario.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
              {data.scenario.reference}
              {data.scenario.note && <span> · {data.scenario.note}</span>}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { lbl: 'Portafolio estimado', val: `${data.summary.portfolio_return?.toFixed(1)}%`, color: retColor(data.summary.portfolio_return) },
              { lbl: 'S&P 500 en ese período', val: `${data.summary.spy_return?.toFixed(1)}%`, color: retColor(data.summary.spy_return) },
              { lbl: 'vs S&P 500', val: `${data.summary.vs_spy > 0 ? '+' : ''}${data.summary.vs_spy?.toFixed(1)}%`, color: data.summary.vs_spy >= 0 ? '#30d158' : '#ff453a' },
              { lbl: 'vs Cartera 60/40', val: `${data.summary.vs_60_40 > 0 ? '+' : ''}${data.summary.vs_60_40?.toFixed(1)}%`, color: data.summary.vs_60_40 >= 0 ? '#30d158' : '#ff453a' },
              { lbl: 'Cobertura datos', val: `${data.summary.data_coverage_pct?.toFixed(0)}%`, color: 'var(--text-secondary)' },
            ].map(c => (
              <div key={c.lbl} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginBottom: 4 }}>{c.lbl}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color, fontFamily: 'var(--fm)' }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Underperformers */}
          {data.underperformers && data.underperformers.length > 0 && (
            <Section title={`Posiciones que peor lo habrían pasado (${data.underperformers.length})`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Ticker', 'Sector', 'Peso%', 'Retorno período', 'Max Drawdown', 'vs SPY'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontFamily: 'var(--fm)', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.underperformers.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                      <td style={{ ...CELL, fontWeight: 700 }}>{h.ticker}</td>
                      <td style={{ ...CELL, color: 'var(--text-tertiary)' }}>{h.sector || '—'}</td>
                      <td style={CELL}>{h.weight_pct?.toFixed(1)}%</td>
                      <td style={{ ...CELL, fontWeight: 700, color: retColor(h.scenario_data?.periodReturn) }}>
                        {h.scenario_data ? `${h.scenario_data.periodReturn?.toFixed(1)}%` : 'N/A'}
                      </td>
                      <td style={{ ...CELL, color: retColor(h.scenario_data?.maxDrawdown ? -h.scenario_data.maxDrawdown : null) }}>
                        {h.scenario_data ? `-${Math.abs(h.scenario_data.maxDrawdown)?.toFixed(1)}%` : 'N/A'}
                      </td>
                      <td style={{ ...CELL, color: (h.scenario_data?.periodReturn - data.scenario.spyReturn) >= 0 ? '#30d158' : '#ff453a' }}>
                        {h.scenario_data
                          ? `${(h.scenario_data.periodReturn - data.scenario.spyReturn) > 0 ? '+' : ''}${(h.scenario_data.periodReturn - data.scenario.spyReturn)?.toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* All holdings table */}
          <Section title="Todas las posiciones">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Ticker', 'Nombre', 'Sector', 'Peso%', 'Retorno', 'Max DD'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontFamily: 'var(--fm)', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.all_holdings || []).map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                      <td style={{ ...CELL, fontWeight: 700 }}>{h.ticker}</td>
                      <td style={{ ...CELL, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{h.name}</td>
                      <td style={{ ...CELL, color: 'var(--text-tertiary)' }}>{h.sector || '—'}</td>
                      <td style={CELL}>{h.weight_pct?.toFixed(1)}%</td>
                      <td style={{ ...CELL, fontWeight: 600, color: retColor(h.scenario_data?.periodReturn) }}>
                        {h.scenario_data ? `${h.scenario_data.periodReturn?.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ ...CELL, color: retColor(h.scenario_data ? -h.scenario_data.maxDrawdown : null) }}>
                        {h.scenario_data ? `-${Math.abs(h.scenario_data.maxDrawdown)?.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, fontFamily: 'var(--fb)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function LoadingSpinner({ label }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', fontSize: 13 }}>
      <div style={{ fontSize: 24, marginBottom: 10, animation: 'spin 1s linear infinite' }}>⟳</div>
      {label}
    </div>
  );
}

function ErrorBox({ msg, onRetry }) {
  return (
    <div style={{ background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.25)', borderRadius: 10, padding: '14px 18px', color: '#ff453a', fontSize: 12 }}>
      {msg}
      {onRetry && (
        <button onClick={onRetry} style={{ marginLeft: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #ff453a', background: 'transparent', color: '#ff453a', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--fb)' }}>
          Reintentar
        </button>
      )}
    </div>
  );
}

const CELL = { padding: '5px 8px', color: 'var(--text-primary)', fontFamily: 'var(--fm)' };
const REFRESH_BTN_STYLE = {
  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontFamily: 'var(--fb)',
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-tertiary)', cursor: 'pointer',
};

// ─── Main tab ─────────────────────────────────────────────────────────
export default function AnalyticsTab() {
  const [sub, setSub] = useState(() => localStorage.getItem('analytics_sub') || 'correlation');

  const handleSub = (id) => {
    setSub(id);
    localStorage.setItem('analytics_sub', id);
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fb)' }}>
          Portfolio Analytics
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          Correlación · Exposición a Factores · Stress Test histórico
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => handleSub(t.id)}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--fb)',
              border: `1px solid ${sub === t.id ? 'var(--gold)' : 'var(--border)'}`,
              background: sub === t.id ? 'var(--gold-dim)' : 'transparent',
              color: sub === t.id ? 'var(--gold)' : 'var(--text-tertiary)',
              fontWeight: sub === t.id ? 700 : 500, cursor: 'pointer', transition: 'all .15s',
            }}>
            {t.lbl}
          </button>
        ))}
      </div>

      {sub === 'correlation' && <CorrelationView />}
      {sub === 'factors'     && <FactorsView     />}
      {sub === 'stress'      && <StressView      />}
    </div>
  );
}
