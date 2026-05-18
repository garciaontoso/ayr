// RentabilidadTab.jsx — modelo Phil Town / Lowell Miller / Gorka (2026-05-18).
//
// Sustituye la plantilla Excel "Archivo Rentabilidad-2.xlsx" enviada por Gorka.
// Proyecta BPA + EQUITY a 10y en 3 escenarios × 3 múltiplos = matriz 9 retornos.
//
// Doc: docs/RENTABILIDAD-TAB-PLAN.md

import { useState, useMemo } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { useRentabilidad10y } from '../../hooks/useRentabilidad10y';
import { fP, fC, f2 } from '../../utils/formatters';

export default function RentabilidadTab() {
  const { fin, cfg, fmpExtra, LD } = useAnalysis();
  const ticker = cfg?.ticker || '';
  const currentPrice = cfg?.price || 0;
  const ccy = cfg?.currency || 'USD';

  const r = useRentabilidad10y({ ticker, fin, cfg, fmpExtra, currentPrice });

  const [editingCell, setEditingCell] = useState(null);  // {year, field, value}

  if (!ticker) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Selecciona una empresa para ver Rentabilidad 10y.</div>;
  }

  // Detectar REIT/ETF para banner crítico
  const sector = (fmpExtra?.profile?.sector || '').toLowerCase();
  const isReit = sector === 'real estate' || (fmpExtra?.profile?.industry || '').toLowerCase().includes('reit');
  const isEtf = fmpExtra?.profile?.isEtf === true || fmpExtra?.profile?.isFund === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ─── Banner crítico para REITs/ETFs ─── */}
      {(isReit || isEtf) && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(255, 159, 10, 0.12)',
          border: '1px solid rgba(255, 159, 10, 0.4)',
          color: '#ff9f0a',
        }}>
          {isReit
            ? '⚠️ REIT — el modelo Phil Town usa EPS, pero los REITs deben valorarse con AFFO. Las proyecciones aquí son orientativas; usa la pestaña Dividendos para el análisis correcto.'
            : '⚠️ ETF — modelo Phil Town no aplica. Esta pestaña es solo informativa para ETFs.'}
        </div>
      )}

      {/* ─── Header con coeficiente habilidad + CAGRs ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <KpiCard
          label="Coef. Habilidad"
          value={r.coefHabilidad}
          format={fP}
          tooltip="ΔBPA / Σ retenidos. Mide cuánto BPA genera por cada $ retenido. >0.15 excelente, <0.05 débil. (Phil Town)"
          benchmark={v => v > 0.15 ? 'excellent' : v > 0.05 ? 'good' : v > 0 ? 'neutral' : 'bad'}
        />
        <KpiCard label="CAGR Ventas 10y" value={r.cagr.revenue} format={fP} />
        <KpiCard label="CAGR BPA 10y" value={r.cagr.eps} format={fP} />
        <KpiCard label="CAGR DPA 10y" value={r.cagr.dps} format={fP} />
        <KpiCard label="CAGR Equity 10y" value={r.cagr.equity} format={fP} />
        <KpiCard label="Yield actual" value={r.yieldActual} format={fP} />
      </div>

      {/* ─── Asunciones editables ─── */}
      <Card title="🎚 Asunciones de proyección" icon="⚙">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <AssumptionInput
            label="Crecimiento BPA esperado (%)"
            value={r.growthBasePct}
            onChange={v => r.setOverride(-99, 'growth', v)}
            tooltip={`Default = CAGR EPS histórico capped 15%. Rango ±1.5pp aplica para escenarios negativo/positivo.`}
            suffix="%"
          />
          <AssumptionInput
            label={`P/E Deprimido (default ${r.peDefaults.low})`}
            value={r.peLow}
            onChange={v => r.setOverride(-99, 'peLow', v)}
          />
          <AssumptionInput
            label={`P/E Normal (default ${r.peDefaults.mid})`}
            value={r.peMid}
            onChange={v => r.setOverride(-99, 'peMid', v)}
          />
          <AssumptionInput
            label={`P/E Caliente (default ${r.peDefaults.high})`}
            value={r.peHigh}
            onChange={v => r.setOverride(-99, 'peHigh', v)}
          />
        </div>
        {r.sector && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Sector detectado: <strong>{r.sector}</strong>.
            P/E actual: {r.peActual != null ? `${f2(r.peActual)}x` : '—'}.
          </div>
        )}
        {r.saving && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gold)' }}>Guardando...</div>}
        {r.error && <div style={{ marginTop: 8, fontSize: 12, color: '#ff453a' }}>Error: {r.error}</div>}
      </Card>

      {/* ─── Tabla histórica editable ─── */}
      <Card title="📋 Histórico 10y (editable)" icon="📜">
        <HistoricoTable
          series={r.seriesFinal}
          seriesRaw={r.seriesFromFin}
          ticker={ticker}
          onEdit={r.setOverride}
          editingCell={editingCell}
          setEditingCell={setEditingCell}
          ccy={ccy}
        />
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
          Click en cualquier celda para sobrescribir el dato FMP. Los overrides se guardan automáticamente en D1.
        </div>
      </Card>

      {/* ─── Matriz 3x3 retornos esperados ─── */}
      <Card title="🎯 Matriz Retornos Esperados a 10 años" icon="🎯">
        <RetornoMatrix
          retornoTotal={r.retornoEsperado10y.retornoTotal}
          cagrPrecio={r.retornoEsperado10y.cagrPrecio}
          precioFuturo={r.precioFuturo10y}
          currentPrice={currentPrice}
          ccy={ccy}
        />
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <strong>Retorno total</strong> = CAGR precio + yield actual.
          Verde si ≥12% (Gorka objetivo). Rojo si &lt;8%.
        </div>
      </Card>

      {/* ─── Proyección BPA 10y ─── */}
      <Card title="📈 BPA Proyectado 10y (3 escenarios)" icon="📈">
        <ProyeccionBpaTable bpa={r.bpaProyectado} />
      </Card>

      {/* ─── Warnings ─── */}
      {r.warnings.length > 0 && (
        <Card title="⚠️ Avisos del modelo" icon="⚠️">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            {r.warnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
          </ul>
        </Card>
      )}

      {/* ─── Botón reset all ─── */}
      {r.overrides.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              if (window.confirm(`¿Borrar TODOS los overrides manuales de ${ticker}? Volverá a usar datos FMP.`)) {
                r.resetAll();
              }
            }}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}>
            ↺ Restaurar defaults FMP ({r.overrides.length} override{r.overrides.length !== 1 ? 's' : ''})
          </button>
        </div>
      )}
    </div>
  );
}

// ═══ Subcomponentes ═══

function KpiCard({ label, value, format, tooltip, benchmark }) {
  const score = benchmark && value != null ? benchmark(value) : null;
  const color = score === 'excellent' ? '#30d158'
              : score === 'good' ? '#64d2ff'
              : score === 'neutral' ? '#ffd60a'
              : score === 'bad' ? '#ff453a'
              : 'var(--text-primary)';
  return (
    <div
      title={tooltip || ''}
      style={{
        padding: 16, borderRadius: 12,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        textAlign: 'center',
      }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6 }}>
        {value == null ? '—' : format(value)}
      </div>
    </div>
  );
}

function AssumptionInput({ label, value, onChange, tooltip, suffix }) {
  const [local, setLocal] = useState(value);
  // Sincronizar local cuando value cambia exteriormente
  useMemo(() => setLocal(value), [value]);

  const commit = () => {
    const num = Number(local);
    if (isFinite(num) && num !== value) onChange(num);
  };

  return (
    <div title={tooltip || ''}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          step="0.01"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 8,
            background: 'var(--card-hover)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--fm)',
            width: '100%',
          }}
        />
        {suffix && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function HistoricoTable({ series, seriesRaw, ticker, onEdit, editingCell, setEditingCell, ccy }) {
  const years = series.revenue.map((_, i) => `t-${i}`);
  const fields = [
    { key: 'revenue', label: 'Ventas (M)' },
    { key: 'eps', label: 'BPA' },
    { key: 'dps', label: 'DPA' },
    { key: 'equity', label: 'Equity (M)' },
    { key: 'retEarnings', label: 'Ret. Earnings (M)' },
    { key: 'assets', label: 'Activos (M)' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
        <thead>
          <tr style={{ background: 'var(--card-hover)' }}>
            <th style={th()}>Campo</th>
            {years.map((y, i) => <th key={i} style={th()}>{i === 0 ? 'Hoy' : y}</th>)}
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.key}>
              <td style={td({ fontWeight: 600 })}>{f.label}</td>
              {series[f.key].map((v, i) => {
                const raw = seriesRaw[f.key][i];
                const isOverride = raw !== v;
                const isEditing = editingCell?.year === -i && editingCell?.field === f.key;
                return (
                  <td
                    key={i}
                    style={td({
                      textAlign: 'right',
                      color: isOverride ? 'var(--gold)' : v == null ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      background: isEditing ? 'rgba(200,164,78,0.08)' : 'transparent',
                    })}
                    onClick={() => setEditingCell({ year: -i, field: f.key })}>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={v ?? ''}
                        autoFocus
                        onBlur={e => {
                          const num = e.target.value === '' ? null : Number(e.target.value);
                          if (num !== v) onEdit(-i, f.key, num);
                          setEditingCell(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const num = e.target.value === '' ? null : Number(e.target.value);
                            if (num !== v) onEdit(-i, f.key, num);
                            setEditingCell(null);
                          } else if (e.key === 'Escape') {
                            setEditingCell(null);
                          }
                        }}
                        style={{
                          width: 80, padding: 4, fontSize: 12, fontFamily: 'var(--fm)',
                          textAlign: 'right',
                          background: 'var(--card-hover)',
                          border: '1px solid var(--gold)',
                          color: 'var(--text-primary)', borderRadius: 4,
                        }}
                      />
                    ) : (v == null ? '—' : f2(v))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetornoMatrix({ retornoTotal, cagrPrecio, precioFuturo, currentPrice, ccy }) {
  const escenarios = [
    { key: 'negativo', label: 'BPA −1.5pp' },
    { key: 'normal', label: 'BPA base' },
    { key: 'positivo', label: 'BPA +1.5pp' },
  ];
  const multipliers = [
    { key: 'deprimido', label: 'Múltiplo Deprimido' },
    { key: 'normal', label: 'Múltiplo Normal' },
    { key: 'caliente', label: 'Múltiplo Caliente' },
  ];

  const colorFor = (r) => {
    if (r >= 0.12) return '#30d158';
    if (r >= 0.08) return '#64d2ff';
    if (r >= 0.04) return '#ffd60a';
    return '#ff453a';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--card-hover)' }}>
            <th style={th()}></th>
            {multipliers.map(m => <th key={m.key} style={th()}>{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {escenarios.map(es => (
            <tr key={es.key}>
              <td style={td({ fontWeight: 600 })}>{es.label}</td>
              {multipliers.map(m => {
                const total = retornoTotal[m.key][es.key];
                const cagr = cagrPrecio[m.key][es.key];
                const precio = precioFuturo[m.key][es.key];
                return (
                  <td key={m.key} style={td({ textAlign: 'center' })}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: colorFor(total) }}>{fP(total)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      CAGR precio {fP(cagr)} · {ccy === 'USD' ? '$' : ccy} {f2(precio)}/sh @ 10y
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 14, padding: 10, background: 'var(--card-hover)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong>Cómo leer:</strong> Cada celda muestra el retorno total esperado a 10 años partiendo de hoy ({ccy === 'USD' ? '$' : ccy}{f2(currentPrice)}).
        Es la combinación CAGR precio + dividendos. Las 9 celdas representan la sensibilidad a:
        crecimiento BPA (-1.5pp / base / +1.5pp) × múltiplo de salida (deprimido / normal / caliente).
      </div>
    </div>
  );
}

function ProyeccionBpaTable({ bpa }) {
  const years = bpa.normal.map((_, i) => `+${i + 1}`);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--card-hover)' }}>
            <th style={th()}>Año</th>
            <th style={th()}>Negativo</th>
            <th style={th()}>Base</th>
            <th style={th()}>Positivo</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y, i) => (
            <tr key={i}>
              <td style={td({ fontWeight: 600 })}>{y}</td>
              <td style={td({ textAlign: 'right', color: '#ff9f0a' })}>{f2(bpa.negativo[i])}</td>
              <td style={td({ textAlign: 'right' })}>{f2(bpa.normal[i])}</td>
              <td style={td({ textAlign: 'right', color: '#30d158' })}>{f2(bpa.positivo[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helpers de estilo
const th = (extra = {}) => ({
  padding: '8px 10px', textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600, color: 'var(--text-secondary)',
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3,
  ...extra,
});
const td = (extra = {}) => ({
  padding: '6px 10px',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--fm)',
  ...extra,
});
