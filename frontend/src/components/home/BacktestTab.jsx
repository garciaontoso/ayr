// BacktestTab — Safety Score vs Actual Dividend Cuts backtest.
//
// Compares Deep Dividend safety scores against real dividend payment history
// to prove (or challenge) the system's predictive track record.
//
// Backend: GET /api/backtest/safety-vs-cuts
import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';

// ─── Color helpers ───────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s == null) return 'var(--text-tertiary)';
  if (s >= 8) return '#22c55e';
  if (s >= 6) return '#d4af37';
  if (s >= 4) return '#fb923c';
  return '#ef4444';
}

function cutColor(cut) {
  if (cut === true)  return '#ef4444';
  if (cut === false) return '#22c55e';
  return 'var(--text-tertiary)';
}

function dpsPctColor(pct) {
  if (pct == null) return 'var(--text-tertiary)';
  if (pct <= -20)  return '#ef4444';
  if (pct < 0)     return '#fb923c';
  if (pct > 5)     return '#22c55e';
  return 'var(--text-secondary)';
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

// ─── Mini scatter plot (SVG, no deps) ────────────────────────────────────────
function ScatterPlot({ data }) {
  if (!data || data.length === 0) return <p style={{color:'var(--text-tertiary)',fontSize:12}}>No scatter data available yet.</p>;

  const W = 420, H = 220, PAD = { l: 44, r: 16, t: 12, b: 36 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  // X = safety_score (1-10), Y = dps_change_3m
  const xMin = 1, xMax = 10;
  const yValues = data.map(d => d.dps_change_3m ?? d.dps_change_6m ?? 0).filter(v => v != null);
  const yMin = Math.min(-25, ...yValues) - 3;
  const yMax = Math.max(15, ...yValues) + 3;

  const toX = x => PAD.l + ((x - xMin) / (xMax - xMin)) * plotW;
  const toY = y => PAD.t + ((yMax - y) / (yMax - yMin)) * plotH;

  // Zero line
  const zeroY = toY(0);

  // Y axis ticks
  const yTicks = [-20, -10, 0, 5, 10];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
      {/* background */}
      <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH}
        fill="rgba(255,255,255,0.03)" rx={4} />

      {/* zero line */}
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY}
        stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />

      {/* cut zone fill (below -20%) */}
      {yMin < -20 && (
        <rect x={PAD.l} y={toY(-20)} width={plotW} height={toY(yMin) - toY(-20)}
          fill="rgba(239,68,68,0.07)" />
      )}

      {/* Y ticks */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.l - 4} y1={toY(v)} x2={PAD.l} y2={toY(v)}
            stroke="rgba(255,255,255,0.2)" />
          <text x={PAD.l - 6} y={toY(v) + 4} textAnchor="end"
            fill="rgba(255,255,255,0.4)" fontSize={9}>
            {v > 0 ? `+${v}%` : `${v}%`}
          </text>
        </g>
      ))}

      {/* X ticks (1-10) */}
      {[1,2,3,4,5,6,7,8,9,10].map(v => (
        <g key={v}>
          <line x1={toX(v)} y1={H - PAD.b} x2={toX(v)} y2={H - PAD.b + 4}
            stroke="rgba(255,255,255,0.2)" />
          <text x={toX(v)} y={H - PAD.b + 13} textAnchor="middle"
            fill="rgba(255,255,255,0.4)" fontSize={9}>{v}</text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={W / 2} y={H - 2} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>
        Safety Score
      </text>
      <text x={10} y={PAD.t + plotH / 2} textAnchor="middle"
        fill="rgba(255,255,255,0.4)" fontSize={9}
        transform={`rotate(-90, 10, ${PAD.t + plotH / 2})`}>
        DPS Change (3m)
      </text>

      {/* Data points */}
      {data.map((d, i) => {
        const x = toX(d.safety_score + (Math.random() - 0.5) * 0.4); // jitter
        const y = toY(d.dps_change_3m ?? d.dps_change_6m ?? 0);
        const cut = d.actual_cut_3m ?? d.actual_cut_6m;
        const fill = cut === true ? '#ef4444' : cut === false ? '#22c55e' : '#94a3b8';
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={5} fill={fill} fillOpacity={0.7} stroke={fill} strokeWidth={1} />
            <title>{d.ticker} | Safety: {d.safety_score} | {fmtPct(d.dps_change_3m ?? d.dps_change_6m)}</title>
          </g>
        );
      })}

      {/* Legend */}
      <circle cx={PAD.l + 10} cy={H - PAD.b - 8} r={4} fill="#ef4444" fillOpacity={0.8} />
      <text x={PAD.l + 18} y={H - PAD.b - 4} fill="rgba(255,255,255,0.5)" fontSize={8}>Dividend Cut</text>
      <circle cx={PAD.l + 90} cy={H - PAD.b - 8} r={4} fill="#22c55e" fillOpacity={0.8} />
      <text x={PAD.l + 98} y={H - PAD.b - 4} fill="rgba(255,255,255,0.5)" fontSize={8}>Sustained</text>
    </svg>
  );
}

// ─── Confusion Matrix 2x2 ────────────────────────────────────────────────────
function ConfusionMatrix({ matrix, label }) {
  if (!matrix) return null;
  const { tp, fp, tn, fn, precision, recall, n } = matrix;
  const cells = [
    { label: 'True Positive', value: tp, sub: 'Low score + cut happened', color: '#22c55e', bg: 'rgba(34,197,94,.15)' },
    { label: 'False Positive', value: fp, sub: 'Low score but no cut', color: '#fb923c', bg: 'rgba(251,146,60,.12)' },
    { label: 'False Negative', value: fn, sub: 'High score but cut happened', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
    { label: 'True Negative', value: tn, sub: 'High score, no cut', color: '#60a5fa', bg: 'rgba(96,165,250,.10)' },
  ];
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {label} — {n} tickers measured
        {precision != null && <span style={{ marginLeft: 12 }}>Precision: <span style={{ color: '#d4af37' }}>{precision}%</span></span>}
        {recall != null    && <span style={{ marginLeft: 12 }}>Recall: <span style={{ color: '#d4af37' }}>{recall}%</span></span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {cells.map(c => (
          <div key={c.label} style={{
            background: c.bg, border: `1px solid ${c.color}30`,
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'var(--fm)' }}>
              {c.value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.color, marginTop: 2 }}>{c.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tier Bar ────────────────────────────────────────────────────────────────
function TierBar({ tier, info }) {
  const stats = info.stats_3m;
  const n = stats.n_measured;
  const cuts = stats.n_cuts;
  const rate = stats.cut_rate;
  const colors = { LOW: '#ef4444', MID: '#d4af37', HIGH: '#22c55e' };
  const color = colors[tier] || 'var(--text-secondary)';
  const barPct = n > 0 ? (cuts / n) * 100 : 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {info.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {n > 0 ? `${cuts} cortes / ${n} medidos` : `${info.stats_3m.n_total} tickers, sin datos aún`}
          {rate != null && <span style={{ marginLeft: 8, color, fontWeight: 700 }}>{rate}%</span>}
        </span>
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, position: 'relative' }}>
        {n > 0 && (
          <div style={{
            width: `${barPct}%`, height: '100%', borderRadius: 4,
            background: color, transition: 'width 0.5s ease',
            minWidth: cuts > 0 ? 6 : 0,
          }} />
        )}
        {n === 0 && (
          <div style={{ position: 'absolute', right: 4, top: -2, fontSize: 9, color: 'var(--text-tertiary)' }}>
            pendiente
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
        Tickers: {info.tickers.join(', ')}
      </div>
    </div>
  );
}

// ─── Notable Case Row ─────────────────────────────────────────────────────────
function NotableRow({ r, showCutBadge = false }) {
  const cut = r.actual_cut_3m ?? r.actual_cut_6m ?? r.actual_cut_12m;
  const dpsChg = r.dps_change_pct_3m ?? r.dps_change_pct_6m;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        display: 'inline-block', width: 28, height: 28, borderRadius: 6,
        background: `${scoreColor(r.safety_score)}22`,
        border: `1px solid ${scoreColor(r.safety_score)}`,
        color: scoreColor(r.safety_score), fontWeight: 700, fontSize: 13,
        textAlign: 'center', lineHeight: '28px', flexShrink: 0,
      }}>{r.safety_score}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{r.ticker}</div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {r.quarter} · base DPS ${r.base_dps?.toFixed(3)} · {r.elapsed_months?.toFixed(1)}m desde análisis
        </div>
      </div>
      {dpsChg != null && (
        <span style={{ fontSize: 13, fontWeight: 700, color: dpsPctColor(dpsChg), flexShrink: 0 }}>
          {fmtPct(dpsChg)}
        </span>
      )}
      {showCutBadge && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: cutColor(cut) + '22', color: cutColor(cut),
          border: `1px solid ${cutColor(cut)}40`, flexShrink: 0,
        }}>
          {cut === true ? 'CORTADO' : cut === false ? 'OK' : '?'}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BacktestTab() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/backtest/safety-vs-cuts`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error del servidor');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sectionHead = (label, sub) => (
    <div style={{ marginBottom: 12, marginTop: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{label}</h3>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
      Calculando backtest...
    </div>
  );

  if (error) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: '#ef4444', fontSize: 13 }}>Error: {error}</div>
      <button onClick={load} style={{ marginTop: 12, padding: '6px 14px', borderRadius: 6,
        border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)',
        cursor: 'pointer', fontSize: 12 }}>Reintentar</button>
    </div>
  );

  if (!data) return null;

  const { tier_summary, confusion_matrix, notable, scatter, data_window, methodology } = data;

  const midCuts = tier_summary?.MID?.stats_3m?.n_cuts ?? 0;
  const midMeasured = tier_summary?.MID?.stats_3m?.n_measured ?? 0;
  const highCuts = tier_summary?.HIGH?.stats_3m?.n_cuts ?? 0;
  const highMeasured = tier_summary?.HIGH?.stats_3m?.n_measured ?? 0;
  const lowCuts = tier_summary?.LOW?.stats_3m?.n_cuts ?? 0;
  const lowMeasured = tier_summary?.LOW?.stats_3m?.n_measured ?? 0;

  return (
    <div style={{ padding: '0 4px 32px', maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Backtest: Safety Score vs Cortes Reales
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
          Compara las predicciones del Deep Dividend Analyzer con los dividendos pagados realmente.
          Objetivo: demostrar que los scores bajos predijeron los cortes.
        </p>
      </div>

      {/* ── Data window banner ── */}
      <div style={{
        background: 'rgba(212,175,55,.1)', border: '1px solid rgba(212,175,55,.3)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 11,
        color: 'var(--text-secondary)',
      }}>
        <span style={{ fontWeight: 700, color: '#d4af37' }}>Ventana de datos</span>
        {' — '}{data_window?.total_unique_tickers} tickers con historial.{' '}
        {data_window?.total_measured} observaciones medibles (post-score con pagos reales).{' '}
        {data_window?.has_3m} con ventana 3m completa · {data_window?.has_6m} con 6m completa.{' '}
        El sistema tiene solo semanas de antigüedad; los scores Q3-2025 tienen ~6m de datos hacia adelante.
        <br />
        <span style={{ opacity: 0.7 }}>Metodología: {methodology}</span>
      </div>

      {/* ── Headline stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          {
            label: 'Tasa de corte — LOW (≤4)',
            value: lowMeasured > 0 ? `${(lowCuts / lowMeasured * 100).toFixed(0)}%` : 'N/D',
            sub: `${lowCuts} cortes / ${lowMeasured} medidos`,
            color: '#ef4444',
          },
          {
            label: 'Tasa de corte — MID (5-7)',
            value: midMeasured > 0 ? `${(midCuts / midMeasured * 100).toFixed(0)}%` : 'N/D',
            sub: `${midCuts} cortes / ${midMeasured} medidos`,
            color: '#d4af37',
          },
          {
            label: 'Tasa de corte — HIGH (8-10)',
            value: highMeasured > 0 ? `${(highCuts / highMeasured * 100).toFixed(0)}%` : 'N/D',
            sub: `${highCuts} cortes / ${highMeasured} medidos`,
            color: '#22c55e',
          },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', borderRadius: 10,
            border: `1px solid ${s.color}30`, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, fontFamily: 'var(--fm)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Two column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Left: Hit rate by tier */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 18 }}>
          {sectionHead('Hit Rate por Tier (3m)', 'Ventana de 3 meses tras la fecha de referencia del score')}
          {tier_summary && Object.entries(tier_summary).map(([tier, info]) => (
            <TierBar key={tier} tier={tier} info={info} />
          ))}
        </div>

        {/* Right: Confusion matrix */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 18 }}>
          {sectionHead('Matriz de Confusión (3m)', 'Corte predicho = safety ≤ 4')}
          <ConfusionMatrix matrix={confusion_matrix?._3m} label="Ventana 3 meses" />

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Interpretación</div>
            <ul style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, padding: '0 0 0 16px', lineHeight: 1.8 }}>
              <li><strong>TP:</strong> Marcado como peligroso y efectivamente cortó. Acierto.</li>
              <li><strong>FP:</strong> Marcado como peligroso pero no cortó. Falsa alarma.</li>
              <li><strong>FN:</strong> Marcado como seguro pero cortó. Error grave.</li>
              <li><strong>TN:</strong> Marcado como seguro y no cortó. Correcto.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Scatter plot ── */}
      {scatter && scatter.length > 0 && (
        <div style={{
          background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
          padding: 18, marginTop: 20,
        }}>
          {sectionHead('Scatter: Safety Score vs Cambio Real en DPS (3m)',
            'Verde = dividendo sostenido. Rojo = corte detectado. Zona roja inferior = caida >20%.')}
          <ScatterPlot data={scatter} />
        </div>
      )}

      {/* ── Notable cases ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>

        {/* True Positives */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid rgba(34,197,94,.25)', padding: 18 }}>
          {sectionHead('Aciertos: Cortes Predichos Correctamente',
            'Safety ≤ 5 y corte confirmado en datos reales')}
          {notable?.true_positives?.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ninguno en el periodo medido aún.</p>
            : notable?.true_positives?.map(r => <NotableRow key={`${r.ticker}-${r.quarter}`} r={r} showCutBadge />)
          }
        </div>

        {/* False Negatives */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid rgba(239,68,68,.25)', padding: 18 }}>
          {sectionHead('Errores: Score Alto pero Cortaron',
            'Safety ≥ 7 y corte confirmado — el sistema falló')}
          {notable?.false_negatives?.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ninguno detectado. Sistema sin falsos negativos en el periodo medido.</p>
            : notable?.false_negatives?.map(r => <NotableRow key={`${r.ticker}-${r.quarter}`} r={r} showCutBadge />)
          }
        </div>

        {/* False Positives */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid rgba(251,146,60,.25)', padding: 18 }}>
          {sectionHead('Falsas Alarmas (3m)',
            'Safety ≤ 4 pero sin corte en la ventana observada hasta hoy')}
          {notable?.false_positives?.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ninguna en el periodo medido.</p>
            : notable?.false_positives?.map(r => <NotableRow key={`${r.ticker}-${r.quarter}`} r={r} showCutBadge />)
          }
          {notable?.false_positives?.length > 0 && (
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>
              Nota: la ventana es corta. Estos tickers pueden cortar más adelante.
            </p>
          )}
        </div>

        {/* Strong holds */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid rgba(34,197,94,.2)', padding: 18 }}>
          {sectionHead('Pagadores Sostenidos (HIGH)',
            'Safety ≥ 8, sin corte confirmado, dividendo estable o creciendo')}
          {notable?.strong_holds?.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sin datos suficientes aún.</p>
            : notable?.strong_holds?.map(r => <NotableRow key={`${r.ticker}-${r.quarter}`} r={r} />)
          }
        </div>
      </div>

      {/* ── All detail table ── */}
      <div style={{
        background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
        padding: 18, marginTop: 20, overflowX: 'auto',
      }}>
        {sectionHead('Detalle Completo por Ticker',
          `${data_window?.total_measured ?? 0} observaciones medibles de ${data_window?.total_with_history ?? 0} totales`)}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
              {['Ticker','Quarter','Score Fecha','Safety','DPS Base','Resultado 3m','DPS Chg 3m','Elapsed','Verdict'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.all_results || [])
              .filter(r => r.post_payments_3m > 0 || r.post_payments_6m > 0)
              .sort((a, b) => (a.actual_cut_3m === true ? -1 : 1) - (b.actual_cut_3m === true ? -1 : 1) || a.safety_score - b.safety_score)
              .map((r, i) => {
                const cut = r.actual_cut_3m;
                const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
                return (
                  <tr key={`${r.ticker}-${r.quarter}`} style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.ticker}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-tertiary)' }}>{r.quarter}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{r.score_date}</td>
                    <td style={{ padding: '5px 8px', fontWeight: 700, color: scoreColor(r.safety_score) }}>{r.safety_score}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>${r.base_dps?.toFixed(3)}</td>
                    <td style={{ padding: '5px 8px' }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: cutColor(cut) + '22', color: cutColor(cut),
                        border: `1px solid ${cutColor(cut)}40`,
                      }}>
                        {cut === true ? 'CORTE' : cut === false ? 'OK' : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '5px 8px', fontWeight: 700, color: dpsPctColor(r.dps_change_pct_3m) }}>
                      {fmtPct(r.dps_change_pct_3m)}
                    </td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-tertiary)' }}>
                      {r.elapsed_months?.toFixed(1)}m
                    </td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-tertiary)', fontSize: 10 }}>{r.verdict}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {(data.all_results || []).filter(r => r.post_payments_3m > 0 || r.post_payments_6m > 0).length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>
            No hay pagos post-score aún. Los datos se acumularán en los proximos meses a medida que venzan los periodos de observacion.
          </p>
        )}
      </div>

      {/* ── Footer disclaimer ── */}
      <div style={{
        marginTop: 20, padding: '12px 16px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 8,
        border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-tertiary)',
        lineHeight: 1.8,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Limitaciones:</strong>{' '}
        Todos los analisis Deep Dividend se crearon en abril 2026. La ventana de datos forward es de max. 6 meses
        para los scores Q3-2025 y 2-3 meses para los scores Q4-2025. Los resultados mejoran con el tiempo.
        El caso mas robusto es ARE (safety=5, corte -45% confirmado). HR (safety=6) corto -23% pero el score
        era MID, no LOW — el threshold de la confusion matrix usa ≤4 como prediccion de corte.
        A medida que pasen los meses, esta pagina se autoactualiza con nuevos datos reales.
      </div>
    </div>
  );
}
