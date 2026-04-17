import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fDol = (v, decimals = 0) => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 100) * 100 >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toFixed(0)}`;
  return `$${v.toFixed(decimals)}`;
};

const fK = (v) => {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
};

const fPct = (v, dec = 1) => (v == null || isNaN(v)) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;

// ─── Inline SVG line chart (3 scenarios) ─────────────────────────────────────
function ScenarioChart({ data, years, expenses }) {
  const W = 620, H = 260, PL = 64, PR = 20, PT = 16, PB = 40;
  const cW = W - PL - PR, cH = H - PT - PB;

  const bear = years.map(y => data.bear?.[y] ?? 0);
  const base = years.map(y => data.base?.[y] ?? 0);
  const bull = years.map(y => data.bull?.[y] ?? 0);

  const allVals = [...bear, ...base, ...bull, expenses || 0];
  const maxV = Math.max(...allVals, 1);
  const minV = 0;

  const xOf = (i) => PL + (i / Math.max(years.length - 1, 1)) * cW;
  const yOf = (v) => PT + cH - ((Math.max(v, 0) - minV) / (maxV - minV)) * cH;

  const pts = (arr) => arr.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');

  // Area fill between bear and bull (fan)
  const fanTop = bull.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' L');
  const fanBot = [...bear].reverse().map((v, i) => {
    const idx = bear.length - 1 - i;
    return `${xOf(idx)},${yOf(v)}`;
  }).join(' L');

  // Y-axis ticks
  const niceStep = maxV > 80000 ? 20000 : maxV > 40000 ? 10000 : maxV > 20000 ? 5000 : 2000;
  const yTicks = [];
  for (let v = 0; v <= maxV * 1.05; v += niceStep) yTicks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Fan (bear-to-bull band) */}
      <path d={`M${fanTop} L${fanBot} Z`} fill="#c8a44e" opacity="0.12" />

      {/* Y grid + labels */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PL} y1={yOf(v)} x2={W - PR} y2={yOf(v)} stroke="var(--border)" strokeWidth="0.5" />
          <text x={PL - 6} y={yOf(v) + 4} fill="var(--text-tertiary)" fontSize="9" textAnchor="end" fontFamily="var(--fm)">
            {fK(v)}
          </text>
        </g>
      ))}

      {/* X-axis year labels */}
      {years.map((yr, i) => (
        <text key={yr} x={xOf(i)} y={H - PB + 14} fill="var(--text-tertiary)" fontSize="9" textAnchor="middle" fontFamily="var(--fm)">
          {yr}
        </text>
      ))}

      {/* Expenses line */}
      {expenses > 0 && (
        <line
          x1={PL} y1={yOf(expenses)} x2={W - PR} y2={yOf(expenses)}
          stroke="#ff453a" strokeWidth="1" strokeDasharray="4,3" opacity="0.7"
        />
      )}
      {expenses > 0 && (
        <text x={W - PR + 2} y={yOf(expenses) + 4} fill="#ff453a" fontSize="8" fontFamily="var(--fm)">gastos</text>
      )}

      {/* Bear */}
      <polyline points={pts(bear)} fill="none" stroke="#ff9f0a" strokeWidth="1.5" strokeDasharray="5,3" />

      {/* Bull */}
      <polyline points={pts(bull)} fill="none" stroke="#30d158" strokeWidth="1.5" strokeDasharray="5,3" />

      {/* Base (solid, prominent) */}
      <polyline points={pts(base)} fill="none" stroke="#c8a44e" strokeWidth="2.5" />

      {/* Base data points */}
      {base.map((v, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(v)} r="3.5" fill="#c8a44e" />
      ))}

      {/* Legend */}
      <g transform={`translate(${PL + 10}, ${PT + 8})`}>
        <line x1="0" y1="5" x2="16" y2="5" stroke="#c8a44e" strokeWidth="2.5" />
        <text x="20" y="9" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--fm)">Base</text>
        <line x1="48" y1="5" x2="64" y2="5" stroke="#30d158" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x="68" y="9" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--fm)">Bull</text>
        <line x1="98" y1="5" x2="114" y2="5" stroke="#ff9f0a" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x="118" y="9" fill="var(--text-secondary)" fontSize="9" fontFamily="var(--fm)">Bear</text>
      </g>
    </svg>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--gold)', fontFamily: 'var(--fd)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── DGR color ───────────────────────────────────────────────────────────────
function dgrColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 8) return '#30d158';
  if (v >= 4) return '#c8a44e';
  if (v >= 0) return '#ff9f0a';
  return '#ff453a';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ForecastTab() {
  const [scenario, setScenario] = useState('base');
  const [years] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableSort, setTableSort] = useState({ col: 'current_annual', dir: -1 });
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/dividend-forecast?years=${years}&scenario=${scenario}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [scenario, years]);

  useEffect(() => { load(); }, [load]);

  const meta = data?.meta || {};
  const allScenarios = data?.all_scenarios || {};
  const yearsRange = data?.years_range || [];
  const tickers = data?.tickers || [];
  const finalYr = yearsRange[yearsRange.length - 1];

  // Sort ticker table
  const sortedTickers = useMemo(() => {
    const col = tableSort.col;
    return [...tickers].sort((a, b) => {
      let av = col === 'final_income'
        ? (a.yearly_income?.[finalYr] || 0)
        : (a[col] ?? 0);
      let bv = col === 'final_income'
        ? (b.yearly_income?.[finalYr] || 0)
        : (b[col] ?? 0);
      return tableSort.dir * (bv - av);
    });
  }, [tickers, tableSort, finalYr]);

  const displayTickers = expanded ? sortedTickers : sortedTickers.slice(0, 20);

  const changeBase = meta.current_annual > 0 && allScenarios.base?.[finalYr]
    ? ((allScenarios.base[finalYr] - meta.current_annual) / meta.current_annual) * 100
    : null;

  const finalYoC = data?.yoc_by_year?.[finalYr];

  function SortTh({ col, label, right }) {
    const active = tableSort.col === col;
    return (
      <th
        onClick={() => setTableSort(prev => ({ col, dir: active ? -prev.dir : -1 }))}
        style={{ padding: '7px 10px', textAlign: right ? 'right' : 'left', fontSize: 9, color: active ? 'var(--gold)' : 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
      >
        {label} {active ? (tableSort.dir === -1 ? '↓' : '↑') : ''}
      </th>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>
            Dividend Forecaster 2026 – {finalYr || 2030}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 3 }}>
            Proyección DGR compuesto · Base desde dividendos historicos en D1
          </div>
        </div>

        {/* Scenario selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'bear', lbl: 'Bear  (DGR×0.5)', color: '#ff9f0a' },
            { id: 'base', lbl: 'Base  (DGR×1.0)', color: '#c8a44e' },
            { id: 'bull', lbl: 'Bull  (DGR×1.3)', color: '#30d158' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setScenario(s.id)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: `1px solid ${scenario === s.id ? s.color : 'var(--border)'}`,
                background: scenario === s.id ? `${s.color}18` : 'transparent',
                color: scenario === s.id ? s.color : 'var(--text-tertiary)',
                fontSize: 11, fontWeight: scenario === s.id ? 700 : 500,
                cursor: 'pointer', fontFamily: 'var(--fb)', transition: 'all .15s',
              }}
            >
              {s.lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 60, background: 'var(--card)', borderRadius: 12, animation: 'pulse 1.5s infinite', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: 16, background: '#ff453a18', border: '1px solid #ff453a40', borderRadius: 12, color: '#ff453a', fontSize: 12, fontFamily: 'var(--fm)' }}>
          Error: {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPI row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <KPI
              label="Ingresos actuales"
              value={fK(meta.current_annual)}
              sub={`${fK(meta.current_annual / 12)}/mes`}
            />
            <KPI
              label={`En ${finalYr} (${scenario})`}
              value={fK(allScenarios[scenario]?.[finalYr])}
              sub={changeBase != null ? fPct(changeBase) + ' vs hoy' : undefined}
              color={scenario === 'bull' ? '#30d158' : scenario === 'bear' ? '#ff9f0a' : '#c8a44e'}
            />
            <KPI
              label={`YoC ${finalYr}`}
              value={finalYoC != null ? `${finalYoC.toFixed(2)}%` : '—'}
              sub={`YoC actual: ${meta.current_yoc != null ? meta.current_yoc.toFixed(2) + '%' : '—'}`}
            />
            <KPI
              label="Break-even gastos"
              value={meta.break_even_year ?? 'N/A'}
              sub={meta.annual_expenses > 0 ? `Gastos: ${fK(meta.annual_expenses)}/año` : 'Sin presupuesto'}
              color={meta.break_even_year ? '#30d158' : 'var(--text-tertiary)'}
            />
            <KPI
              label="Posiciones"
              value={meta.tickers_count || 0}
              sub="con DPS activo"
            />
          </div>

          {/* Chart */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
              Proyección anual de ingresos por dividendo — 3 escenarios
            </div>
            <ScenarioChart data={allScenarios} years={yearsRange} expenses={meta.annual_expenses} />
          </div>

          {/* Summary row: bear / base / bull in final year */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { sc: 'bear', label: `Bear ${finalYr}`, color: '#ff9f0a' },
              { sc: 'base', label: `Base ${finalYr}`, color: '#c8a44e' },
              { sc: 'bull', label: `Bull ${finalYr}`, color: '#30d158' },
            ].map(({ sc, label, color }) => {
              const val = allScenarios[sc]?.[finalYr] || 0;
              const chg = meta.current_annual > 0 ? ((val - meta.current_annual) / meta.current_annual) * 100 : null;
              return (
                <div key={sc} style={{ flex: 1, minWidth: 160, background: 'var(--card)', border: `1px solid ${color}40`, borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--fd)' }}>{fK(val)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 3 }}>
                    {chg != null ? fPct(chg) + ' vs hoy' : ''}
                    {' · '}
                    {fK(val / 12)}/mes
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-year totals grid */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, overflowX: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
              Totales año a año — escenario {scenario.toUpperCase()}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Año</th>
                  {yearsRange.map(yr => (
                    <th key={yr} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{yr}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['bear', 'base', 'bull'].map(sc => {
                  const color = sc === 'bull' ? '#30d158' : sc === 'bear' ? '#ff9f0a' : '#c8a44e';
                  const isSel = sc === scenario;
                  return (
                    <tr key={sc} style={{ background: isSel ? 'var(--gold-dim)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', fontSize: 11, fontWeight: isSel ? 700 : 500, color, fontFamily: 'var(--fm)', textTransform: 'capitalize' }}>{sc}</td>
                      {yearsRange.map(yr => (
                        <td key={yr} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: isSel ? 700 : 500, color: isSel ? color : 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                          {fK(allScenarios[sc]?.[yr])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {/* YoC row */}
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>YoC base</td>
                  {yearsRange.map(yr => (
                    <td key={yr} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--fm)' }}>
                      {data?.yoc_by_year?.[yr] != null ? `${data.yoc_by_year[yr].toFixed(2)}%` : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Per-ticker table */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 12, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fd)' }}>
                Contribución por ticker — escenario {scenario.toUpperCase()}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                {tickers.length} posiciones
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Ticker</th>
                  <SortTh col="current_annual" label="Actual/año" right />
                  <SortTh col="dps_current" label="DPS" right />
                  <SortTh col="dgr5_pct" label="DGR5Y" right />
                  <SortTh col="yoc_current" label="YoC" right />
                  {yearsRange.map(yr => (
                    <th key={yr} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{yr}</th>
                  ))}
                  <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {displayTickers.map((t, i) => {
                  const dgrCol = dgrColor(t.dgr5_pct);
                  return (
                    <tr key={t.ticker} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--row-alt, rgba(255,255,255,0.015))' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)' }}>{t.ticker}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--fm)', fontWeight: 700 }}>{fK(t.current_annual)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>${t.dps_current?.toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: dgrCol, fontFamily: 'var(--fm)', fontWeight: 700 }}>
                        {t.dgr5_pct != null ? `${t.dgr5_pct >= 0 ? '+' : ''}${t.dgr5_pct.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                        {t.yoc_current != null ? `${t.yoc_current.toFixed(2)}%` : '—'}
                      </td>
                      {yearsRange.map(yr => (
                        <td key={yr} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>
                          {fK(t.yearly_income?.[yr])}
                        </td>
                      ))}
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 9, fontFamily: 'var(--fm)' }}>
                        <span style={{ padding: '2px 6px', borderRadius: 5, background: t.has_history ? '#30d15818' : '#ff9f0a18', border: `1px solid ${t.has_history ? '#30d15840' : '#ff9f0a40'}`, color: t.has_history ? '#30d158' : '#ff9f0a', fontSize: 8, fontWeight: 700 }}>
                          {t.has_history ? 'D1' : 'TTM'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {tickers.length > 20 && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ marginTop: 12, padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--fb)', cursor: 'pointer' }}
              >
                {expanded ? 'Mostrar menos' : `Ver los ${tickers.length - 20} restantes`}
              </button>
            )}
          </div>

          {/* Footnote */}
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', lineHeight: 1.6, padding: '0 4px' }}>
            Metodología: DPS actual × (1 + DGR)^N. DGR calculado como CAGR de dividendos anuales en D1 (hasta 5 años). Fallback: cache FMP. Capped [-20%, +30%]. Bear = DGR×0.5, Bull = DGR×1.3. Fuente "D1" = 3+ años de historial propio; "TTM" = último pago anualizado sin tendencia histórica.
          </div>
        </>
      )}
    </div>
  );
}
