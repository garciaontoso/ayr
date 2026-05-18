// RentabilidadTab.jsx — REPLICA LITERAL del Excel de Gorka (2026-05-18).
//
// Estructura visual del Excel "Archivo Rentabilidad-2.xlsx":
//   ┌──────────────────────────────────┬─────────────────────────┐
//   │ TABLA HISTÓRICA 10y              │ PANEL CONFIGURACIÓN     │
//   │ (años en filas, métricas cols)   │ Cotización, P/E, growth │
//   │ VENTAS  BPA  DPA  EQUITY  RE A   │ Múltiplos, Coef Habil.  │
//   │ ──── CAGR ────                   │                         │
//   └──────────────────────────────────┴─────────────────────────┘
//   ┌────────────────────────────────────────────────────────────┐
//   │ PROYECCIÓN 10y                                              │
//   │ Año │ BPA (Neg/Norm/Pos) │ EQUITY (Neg/Norm/Pos)            │
//   └────────────────────────────────────────────────────────────┘
//   ┌────────────────────────────────────────────────────────────┐
//   │ VALORACIÓN AÑO 10 — Matriz 3×3                              │
//   │            Negativo   Normal    Positivo                    │
//   │ Deprimido    [...]    [...]      [...]                      │
//   │ Normal       [...]    [...]      [...]                      │
//   │ Caliente     [...]    [...]      [...]                      │
//   └────────────────────────────────────────────────────────────┘

import { useState, useMemo } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useRentabilidad10y } from '../../hooks/useRentabilidad10y';
import { fP, f2, _sf } from '../../utils/formatters';

// Formato decimal con N decimales — usa _sf para flexibilidad
const fN = (v, decimals = 0) => (v == null || !isFinite(v)) ? '—' : _sf(v, decimals);

export default function RentabilidadTab() {
  const { fin, cfg, fmpExtra } = useAnalysis();
  const ticker = cfg?.ticker || '';
  const currentPrice = cfg?.price || 0;
  const ccy = cfg?.currency || 'USD';
  const ccySym = ccy === 'USD' ? '$' : ccy === 'EUR' ? '€' : ccy === 'GBP' ? '£' : ccy;

  const r = useRentabilidad10y({ ticker, fin, cfg, fmpExtra, currentPrice });
  const [editingCell, setEditingCell] = useState(null);

  if (!ticker) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Selecciona una empresa.</div>;
  }

  const sector = (fmpExtra?.profile?.sector || '').toLowerCase();
  const isReit = sector === 'real estate' || (fmpExtra?.profile?.industry || '').toLowerCase().includes('reit');
  const isEtf = fmpExtra?.profile?.isEtf === true || fmpExtra?.profile?.isFund === true;

  // Construye filas históricas con año real (no t-X)
  const yearsHist = r.seriesFromFin.years || [];
  // El array está descending (idx 0 = más reciente). Reverse para mostrar -10..0 (de arriba abajo)
  const histRows = yearsHist.map((y, idx) => idx).reverse();  // [9,8,...,0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'var(--fm)' }}>

      {/* Banner crítico REIT/ETF */}
      {(isReit || isEtf) && (
        <div style={banner('warn')}>
          {isReit
            ? '⚠️ REIT — el modelo Phil Town usa EPS; los REITs deben valorarse con AFFO. Proyecciones orientativas.'
            : '⚠️ ETF — modelo Phil Town no aplica. Vista solo informativa.'}
        </div>
      )}

      {/* ═══ BLOQUE 1: Histórico + Configuración (lado a lado) ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Tabla histórica vertical (años en filas) */}
        <div style={panel()}>
          <div style={panelTitle()}>📋 HISTÓRICO 10 AÑOS</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tbl()}>
              <thead>
                <tr style={{ background: 'var(--card-hover)' }}>
                  <th style={th({ width: 50 })}>Año</th>
                  <th style={th()}>VENTAS</th>
                  <th style={th()}>BPA</th>
                  <th style={th()}>DPA</th>
                  <th style={th()}>EQUITY</th>
                  <th style={th()}>RET EARN</th>
                  <th style={th()}>ACTIVOS</th>
                  <th style={th({ background: 'rgba(200,164,78,0.08)' })}>Retenido</th>
                </tr>
              </thead>
              <tbody>
                {histRows.map(idx => {
                  const offset = -idx;  // year offset (-10..-0)
                  const yearLabel = idx === 0 ? '0 (hoy)' : `−${idx}`;
                  const eps = r.seriesFinal.eps[idx];
                  const dps = r.seriesFinal.dps[idx];
                  const retained = eps != null && dps != null ? eps - dps : null;
                  return (
                    <tr key={idx}>
                      <td style={td({ fontWeight: 600, color: idx === 0 ? 'var(--gold)' : 'var(--text-secondary)' })}>
                        {yearLabel}
                      </td>
                      <EditableCell value={r.seriesFinal.revenue[idx]} raw={r.seriesFromFin.revenue[idx]}
                        editing={editingCell?.year === offset && editingCell?.field === 'revenue'}
                        onEdit={() => setEditingCell({ year: offset, field: 'revenue' })}
                        onSave={(v) => { r.setOverride(offset, 'revenue', v); setEditingCell(null); }}
                        onCancel={() => setEditingCell(null)} />
                      <EditableCell value={eps} raw={r.seriesFromFin.eps[idx]} decimals={2}
                        editing={editingCell?.year === offset && editingCell?.field === 'eps'}
                        onEdit={() => setEditingCell({ year: offset, field: 'eps' })}
                        onSave={(v) => { r.setOverride(offset, 'eps', v); setEditingCell(null); }}
                        onCancel={() => setEditingCell(null)} />
                      <EditableCell value={dps} raw={r.seriesFromFin.dps[idx]} decimals={2}
                        editing={editingCell?.year === offset && editingCell?.field === 'dps'}
                        onEdit={() => setEditingCell({ year: offset, field: 'dps' })}
                        onSave={(v) => { r.setOverride(offset, 'dps', v); setEditingCell(null); }}
                        onCancel={() => setEditingCell(null)} />
                      <EditableCell value={r.seriesFinal.equity[idx]} raw={r.seriesFromFin.equity[idx]}
                        editing={editingCell?.year === offset && editingCell?.field === 'equity'}
                        onEdit={() => setEditingCell({ year: offset, field: 'equity' })}
                        onSave={(v) => { r.setOverride(offset, 'equity', v); setEditingCell(null); }}
                        onCancel={() => setEditingCell(null)} />
                      <EditableCell value={r.seriesFinal.retEarnings[idx]} raw={r.seriesFromFin.retEarnings[idx]}
                        editing={editingCell?.year === offset && editingCell?.field === 'retEarnings'}
                        onEdit={() => setEditingCell({ year: offset, field: 'retEarnings' })}
                        onSave={(v) => { r.setOverride(offset, 'retEarnings', v); setEditingCell(null); }}
                        onCancel={() => setEditingCell(null)} />
                      <EditableCell value={r.seriesFinal.assets[idx]} raw={r.seriesFromFin.assets[idx]}
                        editing={editingCell?.year === offset && editingCell?.field === 'assets'}
                        onEdit={() => setEditingCell({ year: offset, field: 'assets' })}
                        onSave={(v) => { r.setOverride(offset, 'assets', v); setEditingCell(null); }}
                        onCancel={() => setEditingCell(null)} />
                      <td style={td({ textAlign: 'right', background: 'rgba(200,164,78,0.04)', color: retained != null && retained < 0 ? '#ff453a' : 'var(--text-secondary)' })}>
                        {retained != null ? f2(retained) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--card-hover)', borderTop: '2px solid var(--gold)' }}>
                  <td style={td({ fontWeight: 700, color: 'var(--gold)' })}>CAGR</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, color: cagrColor(r.cagr.revenue) })}>{r.cagr.revenue != null ? fP(r.cagr.revenue) : '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, color: cagrColor(r.cagr.eps) })}>{r.cagr.eps != null ? fP(r.cagr.eps) : '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, color: cagrColor(r.cagr.dps) })}>{r.cagr.dps != null ? fP(r.cagr.dps) : '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, color: cagrColor(r.cagr.equity) })}>{r.cagr.equity != null ? fP(r.cagr.equity) : '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, color: cagrColor(r.cagr.retEarnings) })}>{r.cagr.retEarnings != null ? fP(r.cagr.retEarnings) : '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, color: cagrColor(r.cagr.assets) })}>{r.cagr.assets != null ? fP(r.cagr.assets) : '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 700, background: 'rgba(200,164,78,0.08)', color: 'var(--gold)' })}>
                    Σ {r.retainedSum != null ? f2(r.retainedSum) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            Click cualquier celda para overridear FMP. Override = celdas en <span style={{ color: 'var(--gold)' }}>dorado</span>.
            Retenido = BPA − DPA por año.
          </div>
        </div>

        {/* Panel configuración (lado derecho) */}
        <div style={panel()}>
          <div style={panelTitle()}>⚙️ CONFIGURACIÓN</div>

          {/* Cotización + P/E + Yield (read-only, calculados) */}
          <ConfigRow label="Cotización cálculo" value={`${ccySym}${f2(currentPrice)}`} />
          <ConfigRow label="P/E actual" value={r.peActual != null ? `${f2(r.peActual)}x` : '—'} />

          <div style={{ height: 8 }} />

          {/* Escenarios de crecimiento */}
          <ConfigEditable
            label="Escenario positivo"
            value={r.growthBasePct + 1.5}
            suffix="%"
            tooltip="= Crecimiento base + 1.5pp"
            disabled
          />
          <ConfigEditable
            label="Crecimiento esperado"
            value={r.growthBasePct}
            suffix="%"
            tooltip="Default = CAGR EPS histórico capped 15%. Persistido en D1."
            onSave={(v) => r.setOverride(-99, 'growth', v)}
          />
          <ConfigEditable
            label="Escenario negativo"
            value={r.growthBasePct - 1.5}
            suffix="%"
            tooltip="= Crecimiento base − 1.5pp"
            disabled
          />

          <div style={{ height: 8 }} />

          {/* Dividendo + Yield */}
          <ConfigRow label="Dividendo (DPA año 0)" value={r.seriesFinal.dps[0] != null ? `${ccySym}${f2(r.seriesFinal.dps[0])}` : '—'} />
          <ConfigRow label="Yield actual" value={r.yieldActual != null ? fP(r.yieldActual) : '—'} highlight />

          <div style={{ height: 8 }} />

          {/* Rango de múltiplos P/E */}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>RANGO MÚLTIPLOS P/E</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <ConfigPe label="Deprimido" value={r.peLow} def={r.peDefaults.low} onSave={v => r.setOverride(-99, 'peLow', v)} />
            <ConfigPe label="Normal" value={r.peMid} def={r.peDefaults.mid} onSave={v => r.setOverride(-99, 'peMid', v)} />
            <ConfigPe label="Caliente" value={r.peHigh} def={r.peDefaults.high} onSave={v => r.setOverride(-99, 'peHigh', v)} />
          </div>

          <div style={{ height: 10 }} />

          {/* Coeficiente Habilidad — la métrica clave */}
          <div style={{
            padding: 12, borderRadius: 10,
            background: 'rgba(200,164,78,0.10)',
            border: '1px solid rgba(200,164,78,0.30)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Coeficiente de Habilidad
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: coefColor(r.coefHabilidad), marginTop: 4 }}>
              {r.coefHabilidad != null ? fP(r.coefHabilidad) : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
              ΔBPA / Σ retenidos = {r.bpaDelta != null ? f2(r.bpaDelta) : '—'} / {r.retainedSum != null ? f2(r.retainedSum) : '—'}
            </div>
          </div>

          {r.sector && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
              Sector: <strong>{r.sector}</strong>
            </div>
          )}
          {r.saving && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gold)' }}>Guardando...</div>}
        </div>
      </div>

      {/* ═══ BLOQUE 2: Proyección 10y BPA + EQUITY ═══ */}
      <div style={panel()}>
        <div style={panelTitle()}>📈 PROYECCIÓN 10 AÑOS — BPA + EQUITY (3 escenarios)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tbl()}>
            <thead>
              <tr style={{ background: 'var(--card-hover)' }}>
                <th rowSpan="2" style={th({ width: 60, verticalAlign: 'middle' })}>Año</th>
                <th colSpan="3" style={th({ textAlign: 'center', borderBottom: '1px solid var(--gold)', color: 'var(--gold)' })}>BPA</th>
                <th colSpan="3" style={th({ textAlign: 'center', borderBottom: '1px solid #64d2ff', color: '#64d2ff' })}>EQUITY</th>
              </tr>
              <tr style={{ background: 'var(--card-hover)' }}>
                <th style={th({ textAlign: 'right', color: '#ff9f0a', fontSize: 10 })}>Negativo</th>
                <th style={th({ textAlign: 'right', fontSize: 10 })}>Normal</th>
                <th style={th({ textAlign: 'right', color: '#30d158', fontSize: 10 })}>Positivo</th>
                <th style={th({ textAlign: 'right', color: '#ff9f0a', fontSize: 10 })}>Negativo</th>
                <th style={th({ textAlign: 'right', fontSize: 10 })}>Normal</th>
                <th style={th({ textAlign: 'right', color: '#30d158', fontSize: 10 })}>Positivo</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td style={td({ fontWeight: 600 })}>+{i + 1}</td>
                  <td style={td({ textAlign: 'right', color: '#ff9f0a' })}>{f2(r.bpaProyectado.negativo[i] || 0)}</td>
                  <td style={td({ textAlign: 'right' })}>{f2(r.bpaProyectado.normal[i] || 0)}</td>
                  <td style={td({ textAlign: 'right', color: '#30d158' })}>{f2(r.bpaProyectado.positivo[i] || 0)}</td>
                  <td style={td({ textAlign: 'right', color: '#ff9f0a' })}>{f2(r.equityProyectado.negativo[i] || 0)}</td>
                  <td style={td({ textAlign: 'right' })}>{f2(r.equityProyectado.normal[i] || 0)}</td>
                  <td style={td({ textAlign: 'right', color: '#30d158' })}>{f2(r.equityProyectado.positivo[i] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ BLOQUE 3: Valoración matriz 3×3 ═══ */}
      <div style={panel()}>
        <div style={panelTitle()}>🎯 VALORACIÓN AÑO 10 — Matriz 3×3</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tbl()}>
            <thead>
              <tr style={{ background: 'var(--card-hover)' }}>
                <th style={th({ width: 110 })}></th>
                <th style={th({ textAlign: 'center', color: '#ff9f0a' })}>BPA Negativo</th>
                <th style={th({ textAlign: 'center' })}>BPA Normal</th>
                <th style={th({ textAlign: 'center', color: '#30d158' })}>BPA Positivo</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'deprimido', label: `Deprimido (${r.peLow}x)` },
                { key: 'normal', label: `Normal (${r.peMid}x)` },
                { key: 'caliente', label: `Caliente (${r.peHigh}x)` },
              ].map(mult => (
                <tr key={mult.key}>
                  <td style={td({ fontWeight: 600 })}>{mult.label}</td>
                  {['negativo', 'normal', 'positivo'].map(esc => {
                    const total = r.retornoEsperado10y.retornoTotal[mult.key][esc];
                    const cagr = r.retornoEsperado10y.cagrPrecio[mult.key][esc];
                    const precio = r.precioFuturo10y[mult.key][esc];
                    return (
                      <td key={esc} style={td({ textAlign: 'center', padding: '12px 10px' })}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: retornoColor(total) }}>
                          {fP(total)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          CAGR {fP(cagr)} · {ccySym}{f2(precio)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
          Retorno total = CAGR precio + yield actual ({r.yieldActual != null ? fP(r.yieldActual) : '—'}).
          🟢 ≥12% objetivo Gorka · 🔵 8-12% · 🟡 4-8% · 🔴 &lt;4%
        </div>
      </div>

      {/* Warnings + Reset */}
      {r.warnings.length > 0 && (
        <div style={banner('warn')}>
          <strong>Avisos:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {r.overrides.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              if (window.confirm(`¿Borrar TODOS los overrides de ${ticker}?`)) r.resetAll();
            }}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            }}>
            ↺ Restaurar FMP ({r.overrides.length})
          </button>
        </div>
      )}
    </div>
  );
}

// ═══ Subcomponentes ═══

function EditableCell({ value, raw, decimals = 0, editing, onEdit, onSave, onCancel }) {
  const isOverride = raw !== value && raw != null;
  return (
    <td
      style={td({
        textAlign: 'right',
        color: isOverride ? 'var(--gold)' : value == null ? 'var(--text-tertiary)' : 'var(--text-primary)',
        cursor: 'pointer',
        background: editing ? 'rgba(200,164,78,0.08)' : 'transparent',
        fontWeight: isOverride ? 600 : 400,
      })}
      onClick={() => !editing && onEdit()}>
      {editing ? (
        <input
          type="number" step={decimals === 0 ? '1' : '0.01'}
          defaultValue={value ?? ''}
          autoFocus
          onBlur={e => {
            const num = e.target.value === '' ? null : Number(e.target.value);
            onSave(num);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const num = e.target.value === '' ? null : Number(e.target.value);
              onSave(num);
            } else if (e.key === 'Escape') onCancel();
          }}
          style={{
            width: 80, padding: 3, fontSize: 11, fontFamily: 'var(--fm)',
            textAlign: 'right',
            background: 'var(--card-hover)',
            border: '1px solid var(--gold)',
            color: 'var(--text-primary)', borderRadius: 4,
          }}
        />
      ) : (value == null ? '—' : fN(value, decimals))}
    </td>
  );
}

function ConfigRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: highlight ? 'var(--gold)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function ConfigEditable({ label, value, suffix, tooltip, onSave, disabled }) {
  const [local, setLocal] = useState(value);
  useMemo(() => setLocal(value), [value]);
  const commit = () => {
    const num = Number(local);
    if (isFinite(num) && num !== value && onSave) onSave(num);
  };
  return (
    <div title={tooltip || ''} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number" step="0.1"
          value={Number.isFinite(local) ? local : ''}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          disabled={disabled}
          style={{
            width: 60, padding: '3px 6px', borderRadius: 4,
            background: disabled ? 'transparent' : 'var(--card-hover)',
            border: '1px solid var(--border)',
            color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
            fontSize: 12, textAlign: 'right',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 12 }}>{suffix}</span>
      </div>
    </div>
  );
}

function ConfigPe({ label, value, def, onSave }) {
  const [local, setLocal] = useState(value);
  useMemo(() => setLocal(value), [value]);
  const isOverride = value !== def;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
      <input
        type="number" step="0.5"
        value={Number.isFinite(local) ? local : ''}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { const n = Number(local); if (isFinite(n) && n !== value) onSave(n); }}
        onKeyDown={e => { if (e.key === 'Enter') { const n = Number(local); if (isFinite(n) && n !== value) onSave(n); } }}
        style={{
          width: '100%', padding: '4px 6px', borderRadius: 6,
          background: 'var(--card-hover)',
          border: `1px solid ${isOverride ? 'var(--gold)' : 'var(--border)'}`,
          color: isOverride ? 'var(--gold)' : 'var(--text-primary)',
          fontSize: 13, fontWeight: 600, textAlign: 'center',
          fontFamily: 'var(--fm)',
        }}
      />
      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>def {def}x</div>
    </div>
  );
}

// ═══ Helpers ═══

function cagrColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 0.10) return '#30d158';
  if (v >= 0.05) return '#64d2ff';
  if (v >= 0) return '#ffd60a';
  return '#ff453a';
}

function coefColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 0.15) return '#30d158';
  if (v >= 0.05) return '#64d2ff';
  if (v >= 0) return '#ffd60a';
  return '#ff453a';
}

function retornoColor(v) {
  if (v >= 0.12) return '#30d158';
  if (v >= 0.08) return '#64d2ff';
  if (v >= 0.04) return '#ffd60a';
  return '#ff453a';
}

const panel = () => ({
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
});
const panelTitle = () => ({
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--gold)',
  letterSpacing: 0.5,
  marginBottom: 12,
  textTransform: 'uppercase',
});
const tbl = () => ({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
});
const th = (extra = {}) => ({
  padding: '6px 8px',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  ...extra,
});
const td = (extra = {}) => ({
  padding: '5px 8px',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--fm)',
  ...extra,
});
const banner = (kind) => ({
  padding: '10px 14px',
  borderRadius: 10,
  background: kind === 'warn' ? 'rgba(255,159,10,0.12)' : 'rgba(255,69,58,0.12)',
  border: `1px solid ${kind === 'warn' ? 'rgba(255,159,10,0.4)' : 'rgba(255,69,58,0.4)'}`,
  color: kind === 'warn' ? '#ff9f0a' : '#ff453a',
  fontSize: 13,
});
