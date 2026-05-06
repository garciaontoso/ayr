// DCF Tab — Descuento de Flujos de Caja interactivo (rediseño 2026-05-06).
// Inspirado por skill dcf-model de Anthropic FSI cookbook.
//
// Antes: usaba estimatedGrowth/discountRate hard-coded de useAnalysisMetrics.
// Ahora: panel editable de asunciones por ticker, persistencia localStorage,
//        sensitivity table 5×5 (growth × discount), comparison A&R vs FMP.

import { useMemo, useState, useEffect } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, BarChart, Card } from '../ui';
import { _sf, f1, fP, fC, fM } from '../../utils/formatters';
import { R } from '../../utils/ratings';

// localStorage key por ticker
const lsKey = (ticker) => `dcf_assumptions_${ticker || 'default'}`;

// DCF calc puro — copy de la fórmula de useAnalysisMetrics pero con params completos.
function calcDCF(baseFCF, sharesOut, opts) {
  const { growthRate, discountRate, terminalGrowth, years } = opts;
  if (baseFCF <= 0 || sharesOut <= 0) return null;
  const projs = [];
  let pvSum = 0;
  let lastFCF = baseFCF;
  for (let i = 1; i <= years; i++) {
    lastFCF = baseFCF * Math.pow(1 + growthRate, i);
    const pv = lastFCF / Math.pow(1 + discountRate, i);
    pvSum += pv;
    projs.push({ year: new Date().getFullYear() + i, fcf: lastFCF, pv });
  }
  const tv = (discountRate !== terminalGrowth)
    ? (lastFCF * (1 + terminalGrowth)) / (discountRate - terminalGrowth) : 0;
  const tvPV = tv / Math.pow(1 + discountRate, years);
  const total = pvSum + tvPV;
  const iv = total / sharesOut;
  return { projs, pvSum, tv, tvPV, total, iv, terminalShare: total > 0 ? tvPV / total : 0 };
}

export default function DCFTab() {
  const { cfg, dcf: dcfDefault, fmpExtra, L, LD, estimatedGrowth, discountRate } = useAnalysis();

  // Default assumptions desde context
  const defaults = useMemo(() => ({
    growthRate: Number((estimatedGrowth || 0.05).toFixed(4)),
    discountRate: Number((discountRate || 0.09).toFixed(4)),
    terminalGrowth: 0.025,
    years: 10,
  }), [estimatedGrowth, discountRate]);

  // State editable
  const [assumptions, setAssumptions] = useState(defaults);
  const [dirty, setDirty] = useState(false);

  // Cargar assumptions del localStorage al cambiar ticker
  useEffect(() => {
    if (!cfg?.ticker) return;
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey(cfg.ticker)) || 'null');
      if (saved && typeof saved === 'object') {
        setAssumptions({ ...defaults, ...saved });
        setDirty(false);
        return;
      }
    } catch {}
    setAssumptions(defaults);
    setDirty(false);
  }, [cfg?.ticker, defaults]);

  // Recalcular DCF cuando cambian assumptions o L
  const customDcf = useMemo(() => {
    return calcDCF(L?.fcf || 0, LD?.sharesOut || 0, assumptions);
  }, [L?.fcf, LD?.sharesOut, assumptions]);

  // Margin of safety con custom IV
  const customMos = useMemo(() => {
    if (!customDcf?.iv || !cfg?.price) return 0;
    return (customDcf.iv - cfg.price) / customDcf.iv;
  }, [customDcf?.iv, cfg?.price]);

  // Sensitivity table 5×5 — growth ±2pp, discount ±1pp
  const sensitivityTable = useMemo(() => {
    if (!customDcf) return null;
    const gs = [-0.02, -0.01, 0, 0.01, 0.02].map(d => assumptions.growthRate + d);
    const rs = [-0.01, -0.005, 0, 0.005, 0.01].map(d => assumptions.discountRate + d);
    return rs.map(r => gs.map(g => {
      const result = calcDCF(L.fcf, LD.sharesOut, { ...assumptions, growthRate: g, discountRate: r });
      return result?.iv || 0;
    }));
  }, [customDcf, L, LD, assumptions]);

  const updateAssumption = (key, value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    setAssumptions(prev => ({ ...prev, [key]: num }));
    setDirty(true);
  };

  const saveAssumptions = () => {
    try { localStorage.setItem(lsKey(cfg.ticker), JSON.stringify(assumptions)); setDirty(false); } catch {}
  };

  const resetAssumptions = () => {
    setAssumptions(defaults);
    setDirty(true);
  };

  if (!L?.fcf || L.fcf <= 0) {
    return <Card><div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>△</div>
      Sin datos de FCF para generar DCF. Carga los financieros del ticker.
    </div></Card>;
  }

  if (!customDcf) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fd)' }}>△ Descuento de Flujos de Caja (DCF)</h2>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
          Modelo interactivo basado en FCF base de <strong style={{ color: 'var(--gold)' }}>{fM(L.fcf)}</strong> · {LD.sharesOut?.toLocaleString()} shares
        </p>
      </div>

      {/* Hero card con resultados */}
      <Card glow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--fm)' }}>Valor Intrínseco</div>
            <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--fm)', marginTop: 4 }}>{fC(customDcf.iv)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--fm)' }}>Precio Actual</div>
            <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)', marginTop: 4 }}>{fC(cfg.price)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--fm)' }}>Margen de Seguridad</div>
            <div style={{ fontSize: 38, fontWeight: 700, color: customMos > .15 ? 'var(--green)' : customMos > 0 ? 'var(--yellow)' : 'var(--red)', fontFamily: 'var(--fm)', marginTop: 4 }}>{f1(customMos * 100)}%</div>
            <Badge val={customMos} rules={R.mos}/>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--fm)' }}>Valor Total</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)', marginTop: 4 }}>{fM(customDcf.total)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Terminal: {f1(customDcf.terminalShare * 100)}% del total</div>
          </div>
        </div>
      </Card>

      {/* Asunciones editable */}
      <Card title="🎛️ Asunciones del modelo" icon="🎛️">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
          <AssumptionInput
            label="Crecimiento FCF" value={assumptions.growthRate} suffix="%"
            min={-10} max={50} step={0.5} multiplier={100}
            onChange={(v) => updateAssumption('growthRate', v / 100)}
            tooltip="CAGR esperado del FCF en los próximos N años. Default: estimatedGrowth de FMP."
          />
          <AssumptionInput
            label="Tasa de descuento (WACC)" value={assumptions.discountRate} suffix="%"
            min={3} max={20} step={0.25} multiplier={100}
            onChange={(v) => updateAssumption('discountRate', v / 100)}
            tooltip="Coste capital ponderado. Para empresas calidad: 7-10%. Para growth: 10-12%. Para riesgo elevado: 12%+."
          />
          <AssumptionInput
            label="Crecimiento terminal" value={assumptions.terminalGrowth} suffix="%"
            min={0} max={5} step={0.25} multiplier={100}
            onChange={(v) => updateAssumption('terminalGrowth', v / 100)}
            tooltip="Crecimiento perpetuo después de N años. Conservador: 2-2.5%. Optimista: 3%."
          />
          <AssumptionInput
            label="Años de proyección" value={assumptions.years} suffix="años"
            min={5} max={20} step={1} multiplier={1}
            onChange={(v) => updateAssumption('years', Math.round(v))}
            tooltip="Periodo explícito de proyección antes de aplicar terminal value. Standard: 10 años."
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', justifyContent: 'flex-end' }}>
          {dirty && <span style={{ fontSize: 10, color: 'var(--orange)', fontStyle: 'italic', marginRight: 'auto' }}>⚠ Cambios sin guardar</span>}
          <button onClick={resetAssumptions}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--fm)' }}>
            ↺ Restaurar defaults
          </button>
          <button onClick={saveAssumptions} disabled={!dirty}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--gold)', background: dirty ? 'var(--gold-dim)' : 'transparent', color: dirty ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'var(--fm)' }}>
            💾 Guardar para {cfg.ticker}
          </button>
        </div>
      </Card>

      {/* Layout 2-col: chart + sensitivity */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Card title={`Proyección FCF (${assumptions.years} años)`} icon="📈">
          <BarChart
            data={customDcf.projs.map(p => p.fcf)}
            labels={customDcf.projs.map(p => String(p.year).slice(2))}
            color="var(--green)" height={140} formatFn={fM}
          />
        </Card>
        <Card title="Sensibilidad — Crecimiento × Descuento" icon="🎛️">
          <SensitivityGrid
            table={sensitivityTable}
            growthRates={[-0.02, -0.01, 0, 0.01, 0.02].map(d => assumptions.growthRate + d)}
            discountRates={[-0.01, -0.005, 0, 0.005, 0.01].map(d => assumptions.discountRate + d)}
            currentPrice={cfg.price}
          />
        </Card>
      </div>

      {/* Tabla detallada año-por-año */}
      <Card style={{ overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead><tr>
            <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--gold)', fontWeight: 600, borderBottom: '2px solid var(--table-border)', fontFamily: 'var(--fm)', fontSize: 10 }}>AÑO</th>
            <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '2px solid var(--table-border)', fontFamily: 'var(--fm)', fontSize: 10 }}>FCF PROY.</th>
            <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '2px solid var(--table-border)', fontFamily: 'var(--fm)', fontSize: 10 }}>VALOR PRESENTE</th>
            <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '2px solid var(--table-border)', fontFamily: 'var(--fm)', fontSize: 10 }}>% TOTAL</th>
          </tr></thead>
          <tbody>
            {customDcf.projs.map((p, i) => (
              <tr key={p.year} style={{ background: i % 2 ? 'var(--row-alt)' : 'transparent' }}>
                <td style={{ padding: '7px 14px', color: 'var(--text-primary)', fontWeight: 500, borderBottom: '1px solid var(--table-border)' }}>{p.year}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--table-border)', fontFamily: 'var(--fm)' }}>{fM(p.fcf)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-secondary)', borderBottom: '1px solid var(--table-border)', fontFamily: 'var(--fm)' }}>{fM(p.pv)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--table-border)', fontFamily: 'var(--fm)', fontSize: 10 }}>{f1(p.pv / customDcf.total * 100)}%</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(255,159,10,.08)' }}>
              <td style={{ padding: '7px 14px', color: 'var(--orange)', fontWeight: 600, borderBottom: '1px solid var(--table-border)' }}>Terminal Value</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--table-border)' }}>—</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--orange)', fontWeight: 600, borderBottom: '1px solid var(--table-border)', fontFamily: 'var(--fm)' }}>{fM(customDcf.tvPV)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--orange)', fontWeight: 600, borderBottom: '1px solid var(--table-border)', fontFamily: 'var(--fm)' }}>{f1(customDcf.terminalShare * 100)}%</td>
            </tr>
            <tr style={{ background: 'rgba(48,209,88,.08)' }}>
              <td style={{ padding: '10px 14px', color: 'var(--green)', fontWeight: 700, borderTop: '2px solid var(--table-border)' }}>TOTAL</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', borderTop: '2px solid var(--table-border)' }}/>
              <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700, borderTop: '2px solid var(--table-border)', fontFamily: 'var(--fm)' }}>{fM(customDcf.total)}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700, borderTop: '2px solid var(--table-border)', fontFamily: 'var(--fm)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* FMP comparison */}
      {fmpExtra?.dcf?.dcf > 0 && (
        <Card title="DCF — Tu Modelo vs FMP" icon="⚖">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#64d2ff', fontWeight: 700, fontFamily: 'var(--fm)', letterSpacing: 1 }}>A&R DCF (custom)</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: customMos > 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--fm)' }}>{fC(customDcf.iv)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>MOS: {f1(customMos * 100)}% · g={fP(assumptions.growthRate)} · r={fP(assumptions.discountRate)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>vs</div>
              {(() => {
                const diff = customDcf.iv && fmpExtra.dcf.dcf ? ((customDcf.iv / fmpExtra.dcf.dcf - 1) * 100) : null;
                return diff != null ? <div style={{ fontSize: 10, color: Math.abs(diff) < 15 ? 'var(--green)' : 'var(--orange)', fontFamily: 'var(--fm)' }}>
                  Δ {diff > 0 ? '+' : ''}{_sf(diff, 0)}%
                </div> : null;
              })()}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#bf5af2', fontWeight: 700, fontFamily: 'var(--fm)', letterSpacing: 1 }}>FMP DCF</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: fmpExtra.dcf.dcf > cfg.price ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--fm)' }}>{fC(fmpExtra.dcf.dcf)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>MOS: {cfg.price > 0 ? f1((1 - cfg.price / fmpExtra.dcf.dcf) * 100) : 0}%</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.6, textAlign: 'center' }}>
            {Math.abs((customDcf.iv / fmpExtra.dcf.dcf - 1) * 100) < 15
              ? '✓ Los dos modelos convergen (±15%). Alta confianza en la valoración.'
              : '⚠ Diferencia significativa entre modelos. Revisa los supuestos: ¿growth realista? ¿WACC reflejando riesgo?'}
          </div>
        </Card>
      )}

      {/* Footer info */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', fontStyle: 'italic' }}>
        🎛️ Asunciones se guardan por ticker en localStorage · 💡 Edita y guarda para preservar tu thesis
      </div>
    </div>
  );
}

// ── AssumptionInput component ────────────────────────────────────────────
function AssumptionInput({ label, value, suffix, min, max, step, multiplier, onChange, tooltip }) {
  const displayValue = (value * multiplier).toFixed(multiplier === 1 ? 0 : 2);
  return (
    <div title={tooltip}>
      <label style={{ display: 'block', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5, fontFamily: 'var(--fm)', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="range" min={min} max={max} step={step} value={Number(displayValue)}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--gold)' }}/>
        <input type="number" min={min} max={max} step={step} value={Number(displayValue)}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--subtle-bg)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--fm)', textAlign: 'right', fontWeight: 600 }}/>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 30 }}>{suffix}</span>
      </div>
    </div>
  );
}

// ── SensitivityGrid component ────────────────────────────────────────────
function SensitivityGrid({ table, growthRates, discountRates, currentPrice }) {
  if (!table) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'var(--fm)' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 9 }}>WACC \ G</th>
            {growthRates.map((g, i) => (
              <th key={i} style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 9 }}>{(g * 100).toFixed(1)}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((row, ri) => (
            <tr key={ri}>
              <td style={{ padding: '4px 6px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 9 }}>{(discountRates[ri] * 100).toFixed(2)}%</td>
              {row.map((iv, ci) => {
                const mos = currentPrice > 0 ? (iv - currentPrice) / iv : 0;
                const color = mos > 0.2 ? '#30d158' : mos > 0 ? '#c8a44e' : mos > -0.2 ? '#ff9f0a' : '#ff453a';
                return (
                  <td key={ci} title={`IV: ${fC(iv)} · MOS: ${f1(mos * 100)}%`}
                    style={{ padding: '4px 6px', textAlign: 'right', color, fontWeight: 600, background: `${color}10` }}>
                    {fC(iv)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 6, textAlign: 'center', fontStyle: 'italic' }}>
        Verde = MOS &gt; 20% · Gold = positivo · Naranja = ligeramente caro · Rojo = caro
      </div>
    </div>
  );
}
