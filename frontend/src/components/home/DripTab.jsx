import { useState, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';

// ─── Helpers ────────────────────────────────────────────────────────────────
const fDol = (v, decimals = 0) => {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(decimals)}`;
};

const fPct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');

// ─── Core DRIP calculator ────────────────────────────────────────────────────
// Returns an array of year-by-year rows for DRIP and no-DRIP scenarios.
// All rates as decimals (e.g. 0.05). taxRate = fraction of dividends taxed away.
function calcDrip({ startValue, yieldRate, capGrowth, dgr, years, reinvestPct, taxRate }) {
  if (!startValue || startValue <= 0 || years <= 0) return [];

  const rows = [];
  let dripVal = startValue;
  let noDripVal = startValue;
  let dripYield = yieldRate;   // yield grows with DGR on DRIP
  let noDripYield = yieldRate; // yield grows with DGR on no-DRIP

  for (let y = 1; y <= years; y++) {
    // DRIP scenario
    const dripDivGross = dripVal * dripYield;
    const dripDivNet = dripDivGross * (1 - taxRate);
    const dripReinvested = dripDivNet * reinvestPct;
    const dripCash = dripDivNet * (1 - reinvestPct);
    const dripEndVal = (dripVal + dripReinvested) * (1 + capGrowth);

    // No-DRIP scenario (reinvestPct=0 by definition, baseline)
    const noDripDivGross = noDripVal * noDripYield;
    const noDripDivNet = noDripDivGross * (1 - taxRate);
    const noDripEndVal = noDripVal * (1 + capGrowth);

    rows.push({
      year: y,
      // DRIP
      dripStart: dripVal,
      dripDivGross,
      dripDivNet,
      dripReinvested,
      dripCash,
      dripEnd: dripEndVal,
      // No-DRIP
      noDripStart: noDripVal,
      noDripDivGross,
      noDripDivNet,
      noDripEnd: noDripEndVal,
      // YoC (on original cost = startValue)
      yocDrip: dripDivNet / startValue,
      yocNoDrip: noDripDivNet / startValue,
    });

    dripVal = dripEndVal;
    noDripVal = noDripEndVal;
    // Yield on cost basis stays static for YoC calc; portfolio yield re-prices with DGR
    dripYield = dripYield * (1 + dgr);
    noDripYield = noDripYield * (1 + dgr);
  }

  return rows;
}

// ─── Tiny SVG line chart ─────────────────────────────────────────────────────
// series: [{ label, color, values[] }]
function LineChart({ series, labels, title, formatY = fDol, height = 220 }) {
  const W = 580, H = height, PL = 64, PR = 16, PT = 28, PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const allVals = series.flatMap(s => s.values);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);

  const xOf = (i) => PL + (i / (labels.length - 1)) * cW;
  const yOf = (v) => PT + cH - ((v - minV) / (maxV - minV)) * cH;

  // Y ticks
  const niceStep = (() => {
    const range = maxV - minV || 1;
    const raw = range / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const candidates = [1, 2, 5, 10].map(f => f * mag);
    return candidates.find(c => c >= raw) || candidates[candidates.length - 1];
  })();
  const yTicks = [];
  for (let v = Math.ceil(minV / niceStep) * niceStep; v <= maxV + niceStep * 0.1; v += niceStep) {
    yTicks.push(Math.round(v * 1000) / 1000);
  }

  // X labels — every 5 years
  const xTickIdxs = labels.map((_, i) => i).filter(i => (i + 1) % 5 === 0 || i === 0);

  return (
    <div>
      {title && (
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .8, textTransform: 'uppercase', marginBottom: 4 }}>
          {title}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = yOf(v);
          if (y < PT || y > PT + cH) return null;
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={PL + cW} y2={y} stroke="var(--border)" strokeWidth={0.5} />
              <text x={PL - 4} y={y + 3.5} textAnchor="end" fontSize="8" fill="var(--text-tertiary)" fontFamily="var(--fm)">
                {formatY(v)}
              </text>
            </g>
          );
        })}

        {/* X axis ticks */}
        {xTickIdxs.map(i => (
          <text key={i} x={xOf(i)} y={PT + cH + 14} textAnchor="middle" fontSize="8" fill="var(--text-tertiary)" fontFamily="var(--fm)">
            {labels[i]}
          </text>
        ))}

        {/* Series lines */}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');
          return (
            <polyline key={si} points={pts} fill="none" stroke={s.color}
              strokeWidth={si === 0 ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={si === 1 ? '5,3' : undefined} />
          );
        })}

        {/* Last-point dots */}
        {series.map((s, si) => {
          const last = s.values[s.values.length - 1];
          return <circle key={si} cx={xOf(s.values.length - 1)} cy={yOf(last)} r={3} fill={s.color} />;
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6 }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={20} height={8}>
              <line x1={0} y1={4} x2={20} y2={4} stroke={s.color} strokeWidth={2}
                strokeDasharray={i === 1 ? '4,2' : undefined} />
            </svg>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Slider input row ────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', width: 180, flexShrink: 0 }}>
        {label}
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--gold)', cursor: 'pointer' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fm)', width: 52, textAlign: 'right', flexShrink: 0 }}>
        {fmt(value)}
      </span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function DripTab() {
  const { portfolioTotals, ibData, privacyMode } = useHome();

  // Derive portfolio NLV and yield from context data.
  // Prefer IB NLV (net liquidation value) if available; fall back to portfolio value.
  const autoNlv = (ibData?.summary?.nlv?.amount || portfolioTotals?.totalValueUSD || 0);
  const autoYield = (portfolioTotals?.yieldUSD || 0) * 100; // to percent

  // ── Inputs (all useState before all useEffects / useMemos that reference them) ──
  const [startValue, setStartValue] = useState(() => Math.round(autoNlv / 1000) * 1000 || 1350000);
  const [yieldPct, setYieldPct] = useState(() => parseFloat((autoYield || 3.5).toFixed(2)));
  const [capGrowth, setCapGrowth] = useState(5);       // % / yr
  const [dgr, setDgr] = useState(6);                   // % / yr
  const [years, setYears] = useState(20);
  const [reinvestPct, setReinvestPct] = useState(100); // %
  const [taxRate, setTaxRate] = useState(10);          // %
  const [showTable, setShowTable] = useState(false);

  // ── Calculator ──
  const rows = useMemo(() => calcDrip({
    startValue,
    yieldRate: yieldPct / 100,
    capGrowth: capGrowth / 100,
    dgr: dgr / 100,
    years,
    reinvestPct: reinvestPct / 100,
    taxRate: taxRate / 100,
  }), [startValue, yieldPct, capGrowth, dgr, years, reinvestPct, taxRate]);

  // ── Derived KPIs ──
  const lastRow = rows[rows.length - 1];
  const dripFinal = lastRow?.dripEnd ?? 0;
  const noDripFinal = lastRow?.noDripEnd ?? 0;
  const alpha = dripFinal - noDripFinal;
  const alphaPct = noDripFinal > 0 ? alpha / noDripFinal : 0;
  const yocFinal = lastRow?.yocDrip ?? 0;

  // Total cash dividends accumulated in no-DRIP scenario (received but not reinvested)
  const totalCashDivs = rows.reduce((s, r) => s + r.noDripDivNet, 0);
  // Total cash flow in DRIP partial scenario
  const _totalDripCash = rows.reduce((s, r) => s + r.dripCash, 0);

  // Chart data
  const chartYears = rows.map(r => `${new Date().getFullYear() + r.year}`);
  const valueChartSeries = [
    { label: `Con DRIP ${reinvestPct}%`, color: '#c8a44e', values: rows.map(r => r.dripEnd) },
    { label: 'Sin DRIP', color: '#6b7280', values: rows.map(r => r.noDripEnd) },
  ];
  const divChartSeries = [
    { label: `Ingresos DRIP (neto)`, color: '#c8a44e', values: rows.map(r => r.dripDivNet) },
    { label: 'Ingresos sin DRIP (neto)', color: '#6b7280', values: rows.map(r => r.noDripDivNet) },
  ];

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 };
  const pv = (v) => privacyMode ? '•••' : fDol(v);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 40 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fd)' }}>
          ♻️ Simulador DRIP
        </h2>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          Dividend Reinvestment Plan — impacto del interés compuesto
        </span>
      </div>

      {/* ── Inputs card ── */}
      <div style={card}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .8, textTransform: 'uppercase', marginBottom: 12 }}>
          Parámetros
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0 32px' }}>
          <div>
            {/* Portfolio value — number input for direct edit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', width: 180, flexShrink: 0 }}>
                Valor del portfolio ($)
              </span>
              <input
                type="number" value={startValue} min={1000} step={10000}
                onChange={e => setStartValue(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg, var(--card))', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--fm)', textAlign: 'right' }}
              />
              {autoNlv > 0 && (
                <button
                  onClick={() => setStartValue(Math.round(autoNlv))}
                  title="Usar NLV actual de IB"
                  style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid var(--gold)', background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: 9, cursor: 'pointer', fontFamily: 'var(--fm)', flexShrink: 0 }}>
                  Auto
                </button>
              )}
            </div>
            <SliderRow label="Dividend yield actual (%)" value={yieldPct} min={0.1} max={15} step={0.1}
              onChange={setYieldPct} fmt={v => `${v.toFixed(1)}%`} />
            <SliderRow label="Revalorización anual esperada (%)" value={capGrowth} min={0} max={15} step={0.5}
              onChange={setCapGrowth} fmt={v => `${v.toFixed(1)}%`} />
          </div>
          <div>
            <SliderRow label="DGR esperado (%/año)" value={dgr} min={0} max={20} step={0.5}
              onChange={setDgr} fmt={v => `${v.toFixed(1)}%`} />
            <SliderRow label="Horizonte (años)" value={years} min={5} max={40} step={1}
              onChange={setYears} fmt={v => `${v} años`} />
            <SliderRow label="% dividendos reinvertidos" value={reinvestPct} min={0} max={100} step={5}
              onChange={setReinvestPct} fmt={v => `${v.toFixed(0)}%`} />
            <SliderRow label="WHT / Tipo impositivo (%)" value={taxRate} min={0} max={40} step={1}
              onChange={setTaxRate} fmt={v => `${v.toFixed(0)}%`} />
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        {[
          {
            l: `CON DRIP ${reinvestPct}% — AÑO ${years}`,
            v: pv(dripFinal),
            c: 'var(--gold)',
            sub: `vs ${pv(startValue)} inicial`,
          },
          {
            l: `SIN DRIP — AÑO ${years}`,
            v: pv(noDripFinal),
            c: 'var(--text-primary)',
            sub: `+ ${pv(totalCashDivs)} dividendos cobrados`,
          },
          {
            l: 'ALPHA DRIP',
            v: alpha >= 0 ? `+${pv(alpha)}` : pv(alpha),
            c: alpha >= 0 ? 'var(--green)' : 'var(--red)',
            sub: `${alpha >= 0 ? '+' : ''}${(alphaPct * 100).toFixed(1)}% vs sin DRIP`,
          },
          {
            l: `YoC AÑO ${years} (DRIP)`,
            v: fPct(yocFinal, 1),
            c: yocFinal >= 0.10 ? '#30d158' : yocFinal >= 0.05 ? 'var(--gold)' : 'var(--text-secondary)',
            sub: 'sobre coste original',
          },
        ].map((k, i) => (
          <div key={i} style={{ padding: '12px 14px', background: 'var(--card)', border: `1px solid ${i === 0 ? 'var(--gold)' : i === 2 ? (alpha >= 0 ? 'rgba(48,209,88,.3)' : 'rgba(255,69,58,.3)') : 'var(--border)'}`, borderRadius: 12 }}>
            <div style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .5, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c, fontFamily: 'var(--fm)', lineHeight: 1.1 }}>{k.v}</div>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <div style={card}>
          <LineChart
            title="Valor del portfolio"
            series={valueChartSeries}
            labels={chartYears}
            formatY={v => {
              const a = Math.abs(v);
              if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
              if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
              return `$${Math.round(a)}`;
            }}
          />
        </div>
        <div style={card}>
          <LineChart
            title={`Ingresos anuales por dividendos (neto ${100 - taxRate}% WHT)`}
            series={divChartSeries}
            labels={chartYears}
            formatY={v => {
              const a = Math.abs(v);
              if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
              if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
              return `$${Math.round(a)}`;
            }}
          />
        </div>
      </div>

      {/* ── Year-by-year table (collapsible) ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showTable ? 12 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .8, textTransform: 'uppercase' }}>
            Tabla año a año
          </div>
          <button
            onClick={() => setShowTable(v => !v)}
            style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--fm)' }}>
            {showTable ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {showTable && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'var(--fm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Año', 'Val. inicio (DRIP)', 'Div. bruto', 'Div. neto', 'Reinvertido', 'Val. fin (DRIP)', 'Val. fin (sin DRIP)', 'YoC (DRIP)'].map((h, i) => (
                    <th key={i} style={{ padding: '5px 8px', textAlign: i === 0 ? 'center' : 'right', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: .3, fontSize: 9 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.year} style={{ background: i % 2 === 0 ? 'var(--row-alt)' : 'transparent', borderBottom: '1px solid var(--subtle-bg)' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                      {new Date().getFullYear() + r.year}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{pv(r.dripStart)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--gold)' }}>{pv(r.dripDivGross)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>{pv(r.dripDivNet)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--green, #30d158)' }}>{pv(r.dripReinvested)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--gold)', fontWeight: 700 }}>{pv(r.dripEnd)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{pv(r.noDripEnd)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: r.yocDrip >= 0.1 ? '#30d158' : r.yocDrip >= 0.05 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                      {fPct(r.yocDrip, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Methodology note ── */}
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', lineHeight: 1.6, padding: '0 4px' }}>
        Metodología: el valor del portfolio crece cada año por la revalorización del capital más los dividendos netos reinvertidos.
        El yield se aplica al valor de mercado corriente; el DGR incrementa el yield anualmente.
        WHT se descuenta antes de reinvertir. Escenario "sin DRIP" usa los mismos inputs excepto reinversión = 0%.
        Cifras son estimaciones proyectivas — no garantía de rentabilidad futura.
      </div>
    </div>
  );
}
