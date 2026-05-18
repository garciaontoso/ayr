// RentabilidadCarteraTab.jsx — Vista AUTOMÁTICA de Rentabilidad 10y para
// TODA la cartera (modelo Phil Town / Gorka). No requiere intervención manual.
//
// 2026-05-18: el usuario quería "automatizado para todas igual" — esto es
// la respuesta. Una tabla con las 75 empresas mostrando los 9 retornos
// esperados a 10 años, calculados con FMP data.
//
// Click en cualquier ticker → abre análisis individual donde puede modificar.
// Filtrable, sortable, color-coded por retorno esperado.

import { useEffect, useState, useMemo } from 'react';
import { API_URL } from '../../constants/index.js';
import { fP, f2 } from '../../utils/formatters';
import { useHome } from '../../context/HomeContext';

const COLS = [
  { key: 'ticker',       lbl: 'Ticker',     w: 90,  align: 'left'   },
  { key: 'sector',       lbl: 'Sector',     w: 130, align: 'left'   },
  { key: 'currentPrice', lbl: 'Precio',     w: 80,  align: 'right'  },
  { key: 'peActual',     lbl: 'P/E',        w: 60,  align: 'right'  },
  { key: 'yieldActual',  lbl: 'Yield',      w: 70,  align: 'right'  },
  { key: 'cagrEps',      lbl: 'CAGR EPS',   w: 80,  align: 'right'  },
  { key: 'coefHabilidad',lbl: 'Coef Hab.',  w: 80,  align: 'right'  },
  { key: 'growthDefault',lbl: 'Growth',     w: 70,  align: 'right'  },
  { key: 'retDeprMid',   lbl: 'Depr·Norm',  w: 80,  align: 'right'  },
  { key: 'retNormNorm',  lbl: 'Norm·Norm',  w: 80,  align: 'right'  },
  { key: 'retCalNorm',   lbl: 'Cal·Norm',   w: 80,  align: 'right'  },
  { key: 'retornoBase',  lbl: 'Retorno*',   w: 90,  align: 'right'  },
];

export default function RentabilidadCarteraTab() {
  const home = useHome();
  const openAnalysis = home?.openAnalysis;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('retornoBase');
  const [sortDir, setSortDir] = useState('desc');
  const [filter, setFilter] = useState('all');  // all | excelentes | hold | trim
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/rentabilidad/portfolio`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.results) {
          // Aplanar campos calculados para sort
          const flat = data.results.map(r => ({
            ...r,
            retDeprMid: r.retornos?.deprimido?.normal ?? null,
            retNormNorm: r.retornos?.normal?.normal ?? null,
            retCalNorm: r.retornos?.caliente?.normal ?? null,
          }));
          setRows(flat);
        } else {
          setError(data.error || 'Sin datos');
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let result = rows;
    if (filter === 'excelentes') result = result.filter(r => (r.retornoBase || 0) >= 0.12);
    else if (filter === 'hold')  result = result.filter(r => (r.retornoBase || 0) >= 0.08 && (r.retornoBase || 0) < 0.12);
    else if (filter === 'trim')  result = result.filter(r => (r.retornoBase || 0) < 0.08);
    else if (filter === 'errors') result = result.filter(r => r.error || r.warning);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r => (r.ticker || '').toLowerCase().includes(s) || (r.name || '').toLowerCase().includes(s) || (r.sector || '').toLowerCase().includes(s));
    }
    // Sort
    const sorted = [...result].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (sortKey === 'ticker' || sortKey === 'sector') {
        va = (va || '').toString().toLowerCase();
        vb = (vb || '').toString().toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = (va == null || !isFinite(va)) ? -Infinity : va;
      const nb = (vb == null || !isFinite(vb)) ? -Infinity : vb;
      return sortDir === 'asc' ? na - nb : nb - na;
    });
    return sorted;
  }, [rows, filter, search, sortKey, sortDir]);

  const summary = useMemo(() => {
    const ok = rows.filter(r => !r.error);
    const excel = ok.filter(r => (r.retornoBase || 0) >= 0.12).length;
    const buen = ok.filter(r => (r.retornoBase || 0) >= 0.08 && (r.retornoBase || 0) < 0.12).length;
    const bajo = ok.filter(r => (r.retornoBase || 0) < 0.08).length;
    const errs = rows.filter(r => r.error).length;
    return { total: rows.length, ok: ok.length, excel, buen, bajo, errs };
  }, [rows]);

  const onSort = (col) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('desc'); }
  };

  const openTicker = (tk) => {
    if (openAnalysis) {
      openAnalysis(tk);
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: 'var(--fm)' }}>
      {/* Header con resumen */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📊 Retornos 10y · Cartera</h2>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Modelo Phil Town / Gorka auto-calculado para {summary.total} empresas. Click ticker → detalle.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill label={`${summary.excel} ≥12%`} color="#30d158" active={filter === 'excelentes'} onClick={() => setFilter(filter === 'excelentes' ? 'all' : 'excelentes')} />
          <Pill label={`${summary.buen} 8-12%`} color="#64d2ff" active={filter === 'hold'} onClick={() => setFilter(filter === 'hold' ? 'all' : 'hold')} />
          <Pill label={`${summary.bajo} <8%`} color="#ff9f0a" active={filter === 'trim'} onClick={() => setFilter(filter === 'trim' ? 'all' : 'trim')} />
          {summary.errs > 0 && <Pill label={`${summary.errs} sin datos`} color="#ff453a" active={filter === 'errors'} onClick={() => setFilter(filter === 'errors' ? 'all' : 'errors')} />}
        </div>
        <input
          type="text"
          placeholder="Buscar ticker, nombre, sector..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 6,
            background: 'var(--card-hover)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 12, width: 220,
          }}
        />
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Calculando rentabilidad para toda la cartera...</div>}
      {error && <div style={{ padding: 24, color: '#ff453a' }}>Error: {error}</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--card-hover)' }}>
                {COLS.map(c => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    style={{
                      padding: '8px 10px',
                      textAlign: c.align, width: c.w,
                      borderBottom: '1px solid var(--border)',
                      fontWeight: 600, color: sortKey === c.key ? 'var(--gold)' : 'var(--text-secondary)',
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3,
                      cursor: 'pointer', userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}>
                    {c.lbl} {sortKey === c.key && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.ticker + i}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => openTicker(r.ticker)}>
                  <td style={cell('left')}>
                    <strong style={{ color: 'var(--gold)' }}>{r.ticker}</strong>
                    {r.warning && <span style={{ marginLeft: 6, fontSize: 9, color: '#ff9f0a' }} title={r.warning}>⚠</span>}
                  </td>
                  <td style={cell('left', { color: 'var(--text-secondary)' })}>{r.sector || '—'}</td>
                  {r.error ? (
                    <td colSpan={COLS.length - 2} style={cell('left', { color: 'var(--text-tertiary)', fontStyle: 'italic' })}>
                      {r.error}
                    </td>
                  ) : (
                    <>
                      <td style={cell('right')}>{r.currentPrice != null ? f2(r.currentPrice) : '—'}</td>
                      <td style={cell('right')}>{r.peActual != null ? `${f2(r.peActual)}x` : '—'}</td>
                      <td style={cell('right', { color: yieldColor(r.yieldActual) })}>{r.yieldActual != null ? fP(r.yieldActual) : '—'}</td>
                      <td style={cell('right', { color: cagrColor(r.cagrEps) })}>{r.cagrEps != null ? fP(r.cagrEps) : '—'}</td>
                      <td style={cell('right', { color: coefColor(r.coefHabilidad) })}>{r.coefHabilidad != null ? fP(r.coefHabilidad) : '—'}</td>
                      <td style={cell('right')}>{r.growthDefault != null ? fP(r.growthDefault) : '—'}</td>
                      <td style={cell('right', { color: retornoColor(r.retDeprMid) })}>{r.retDeprMid != null ? fP(r.retDeprMid) : '—'}</td>
                      <td style={cell('right', { color: retornoColor(r.retNormNorm) })}>{r.retNormNorm != null ? fP(r.retNormNorm) : '—'}</td>
                      <td style={cell('right', { color: retornoColor(r.retCalNorm) })}>{r.retCalNorm != null ? fP(r.retCalNorm) : '—'}</td>
                      <td style={cell('right', { color: retornoColor(r.retornoBase), fontWeight: 700, fontSize: 13 })}>
                        {r.retornoBase != null ? fP(r.retornoBase) : '—'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <strong>Cómo leer:</strong> Cada fila es el modelo Phil Town/Gorka aplicado automáticamente.
        Los 9 retornos esperados a 10 años son combinaciones de: <strong>BPA-growth</strong> (negativo/normal/positivo)
        × <strong>múltiplo P/E salida</strong> (deprimido/normal/caliente). La columna <strong>Retorno*</strong> muestra
        el caso central (Normal·Normal). <strong>Coef Hab.</strong> = ΔBPA / Σ retenidos (Phil Town, &gt;10% excelente).
        Click cualquier ticker → análisis individual donde puedes overridear valores y guardarlos.
      </div>
    </div>
  );
}

function Pill({ label, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
        background: active ? color : 'transparent',
        color: active ? '#000' : color,
        border: `1px solid ${color}`,
        fontWeight: 600, fontFamily: 'var(--fm)',
        whiteSpace: 'nowrap',
      }}>
      {label}
    </button>
  );
}

function cell(align, extra = {}) {
  return {
    padding: '7px 10px',
    textAlign: align,
    color: 'var(--text-primary)',
    fontFamily: 'var(--fm)',
    fontSize: 12,
    ...extra,
  };
}

function retornoColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 0.12) return '#30d158';
  if (v >= 0.08) return '#64d2ff';
  if (v >= 0.04) return '#ffd60a';
  return '#ff453a';
}

function cagrColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 0.10) return '#30d158';
  if (v >= 0.05) return '#64d2ff';
  if (v >= 0) return '#ffd60a';
  return '#ff453a';
}

function coefColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 0.10) return '#30d158';
  if (v >= 0.05) return '#64d2ff';
  if (v >= 0) return '#ffd60a';
  return '#ff453a';
}

function yieldColor(v) {
  if (v == null) return 'var(--text-tertiary)';
  if (v >= 0.04) return '#30d158';
  if (v >= 0.02) return '#64d2ff';
  return 'var(--text-secondary)';
}
