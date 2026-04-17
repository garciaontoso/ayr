// DeepDividendTab — Multi-stage Deep Dividend Analyzer dashboard.
//
// Surfaces the Deep Dividend Analyzer pipeline (Extractor → Historian →
// Analyzer → Devil's Advocate) with:
//   • Action Required panel (TRIM/SELL with urgency)
//   • Top Opportunities (BUY/ACCUMULATE)
//   • 2x2 Safety×Growth matrix scatter
//   • Smart Alerts (8-K events, insider clusters, cross-validation conflicts)
//   • Track Record / Calibration
//   • Per-ticker drill-down with multi-investor lens + Devil's Advocate
//
// Backend: /api/deep-dividend/* + /api/smart-alerts/* + /api/daily-briefing
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { API_URL } from '../../constants/index.js';
import InstitutionalReportPDF from './InstitutionalReportPDF.jsx';

const VERDICT_COLORS = {
  STRONG_BUY: { bg: 'rgba(34,197,94,.25)', fg: '#22c55e', border: '#22c55e', label: 'STRONG BUY' },
  BUY:        { bg: 'rgba(34,197,94,.18)', fg: '#22c55e', border: '#22c55e', label: 'BUY' },
  ACCUMULATE: { bg: 'rgba(34,197,94,.10)', fg: '#86efac', border: '#86efac', label: 'ACCUMULATE' },
  HOLD:       { bg: 'rgba(212,175,55,.16)', fg: '#d4af37', border: '#d4af37', label: 'HOLD' },
  TRIM:       { bg: 'rgba(249,115,22,.18)', fg: '#fb923c', border: '#fb923c', label: 'TRIM' },
  SELL:       { bg: 'rgba(239,68,68,.20)', fg: '#ef4444', border: '#ef4444', label: 'SELL' },
};

const SEVERITY_COLORS = {
  CRITICAL: { bg: 'rgba(239,68,68,.25)', fg: '#ef4444', border: '#ef4444' },
  HIGH:     { bg: 'rgba(239,68,68,.15)', fg: '#fb7185', border: '#fb7185' },
  MEDIUM:   { bg: 'rgba(212,175,55,.15)', fg: '#d4af37', border: '#d4af37' },
  LOW:      { bg: 'rgba(96,165,250,.15)', fg: '#60a5fa', border: '#60a5fa' },
};

function scoreColor(score) {
  if (score == null) return 'var(--text-tertiary)';
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#d4af37';
  if (score >= 4) return '#fb923c';
  return '#ef4444';
}

function fmtPct(v, decimals = 0) {
  if (v == null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-ES'); } catch { return d; }
}

function fmtTimeAgo(unixSec) {
  if (!unixSec) return '—';
  const ageMs = Date.now() - unixSec * 1000;
  const days = Math.floor(ageMs / 86400000);
  if (days < 1) return 'hoy';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  return `${Math.floor(days / 30)}mes`;
}

// ─── Tiny markdown renderer (in-house subset, safe — no dangerouslySetInnerHTML) ──
// Handles: # ## ### #### headings, **bold**, *italic*, `code`, pipe tables,
// - / 1. lists, paragraphs, --- hr. Returns an array of React elements.
function renderInline(text, keyPrefix = 'inl') {
  // Process inline tokens: `code`, **bold**, *italic*. Order matters.
  const out = [];
  let remaining = text;
  let counter = 0;
  // Regex captures: group 1 = code, group 2 = bold, group 3 = italic
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*/;
  while (remaining.length > 0) {
    const m = re.exec(remaining);
    if (!m) {
      out.push(remaining);
      break;
    }
    if (m.index > 0) out.push(remaining.slice(0, m.index));
    const k = `${keyPrefix}-${counter++}`;
    if (m[1] != null) {
      out.push(
        <code key={k} style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.92em',
          padding: '1px 5px',
          borderRadius: 3,
          background: 'rgba(255,255,255,.06)',
          color: 'var(--text-primary)',
        }}>{m[1]}</code>
      );
    } else if (m[2] != null) {
      out.push(<strong key={k} style={{ color: 'var(--text-primary)' }}>{m[2]}</strong>);
    } else if (m[3] != null) {
      out.push(<em key={k}>{m[3]}</em>);
    }
    remaining = remaining.slice(m.index + m[0].length);
  }
  return out;
}

function renderMarkdown(md) {
  if (!md || typeof md !== 'string') return [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let key = 0;
  const nextKey = () => `md-${key++}`;

  const H_BASE = { margin: '14px 0 6px', fontWeight: 700 };
  const H1_STYLE = { ...H_BASE, fontSize: 24, color: 'var(--gold, #c8a44e)', marginTop: 4, borderBottom: '1px solid rgba(200,164,78,.3)', paddingBottom: 6 };
  const H2_STYLE = { ...H_BASE, fontSize: 18, color: 'var(--gold, #c8a44e)', marginTop: 18 };
  const H3_STYLE = { ...H_BASE, fontSize: 14, color: 'rgba(200,164,78,.85)', marginTop: 14 };
  const H4_STYLE = { ...H_BASE, fontSize: 12, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.4 };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — skip
    if (trimmed === '') { i++; continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      out.push(<hr key={nextKey()} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '18px 0' }} />);
      i++; continue;
    }

    // Headings
    const hMatch = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (hMatch) {
      const level = hMatch[1].length;
      const content = hMatch[2];
      const styles = [H1_STYLE, H2_STYLE, H3_STYLE, H4_STYLE];
      const Tag = `h${level}`;
      out.push(React.createElement(Tag, { key: nextKey(), style: styles[level - 1] }, renderInline(content, `h${level}-${key}`)));
      i++; continue;
    }

    // Tables: line starts with | and next line is | --- |
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      const splitRow = (row) => {
        let r = row.trim();
        if (r.startsWith('|')) r = r.slice(1);
        if (r.endsWith('|')) r = r.slice(0, -1);
        return r.split('|').map(c => c.trim());
      };
      const headers = splitRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={nextKey()} style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{
            borderCollapse: 'collapse',
            width: '100%',
            fontSize: 12,
            border: '1px solid var(--border)',
          }}>
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    background: 'rgba(200,164,78,.10)',
                    color: 'var(--gold, #c8a44e)',
                    borderBottom: '1px solid rgba(200,164,78,.3)',
                    fontWeight: 600,
                  }}>{renderInline(h, `th-${hi}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '5px 10px',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      verticalAlign: 'top',
                    }}>{renderInline(cell, `td-${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(itemText);
        i++;
      }
      out.push(
        <ul key={nextKey()} style={{ margin: '6px 0 10px 20px', padding: 0, color: 'var(--text-secondary)' }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: 3 }}>{renderInline(it, `li-${ii}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(itemText);
        i++;
      }
      out.push(
        <ol key={nextKey()} style={{ margin: '6px 0 10px 22px', padding: 0, color: 'var(--text-secondary)' }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: 3 }}>{renderInline(it, `oli-${ii}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: collect consecutive non-empty lines (until blank, heading, list, table, or hr)
    const paraLines = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === '') break;
      if (/^#{1,4}\s+/.test(t)) break;
      if (/^[-*]\s+/.test(t)) break;
      if (/^\d+\.\s+/.test(t)) break;
      if (t.startsWith('|')) break;
      if (/^-{3,}$/.test(t) || /^\*{3,}$/.test(t)) break;
      paraLines.push(t);
      i++;
    }
    if (paraLines.length > 0) {
      const joined = paraLines.join(' ');
      out.push(
        <p key={nextKey()} style={{ margin: '8px 0', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
          {renderInline(joined, `p-${key}`)}
        </p>
      );
    }
  }

  return out;
}

function VerdictBadge({ verdict, confidence, large }) {
  const c = VERDICT_COLORS[verdict] || VERDICT_COLORS.HOLD;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: large ? '4px 10px' : '2px 8px',
      borderRadius: 6,
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
      fontSize: large ? 13 : 11,
      fontWeight: 600,
      letterSpacing: 0.4,
    }}>
      {c.label}
      {confidence && (
        <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 400 }}>
          · {confidence}
        </span>
      )}
    </span>
  );
}

function ScoreBar({ value, max = 10, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{
      width: 60,
      height: 6,
      background: 'rgba(255,255,255,.08)',
      borderRadius: 3,
      overflow: 'hidden',
      display: 'inline-block',
      verticalAlign: 'middle',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: color || scoreColor(value),
        transition: 'width .3s',
      }} />
    </div>
  );
}

// ─── Section: Action Required ────────────────────────────────────
function ActionRequiredPanel({ items, onClick }) {
  if (!items?.length) {
    return (
      <div style={{ padding: 14, color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
        ✓ Sin acciones críticas pendientes. Toda la cartera en HOLD/ACCUMULATE.
      </div>
    );
  }
  return (
    <div>
      {items.map((item, idx) => (
        <div
          key={`${item.ticker}-${idx}`}
          onClick={() => onClick && onClick(item.ticker)}
          style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr auto auto',
            gap: 12,
            alignItems: 'center',
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'background .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div>
            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.ticker}</strong>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{item.quarter}</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {item.red_flags_count > 0 && (
              <span style={{ color: '#ef4444', marginRight: 8 }}>🚩 {item.red_flags_count}</span>
            )}
            Cut prob: <strong style={{ color: scoreColor(10 - (item.cut_probability_3y || 0) * 10) }}>
              {fmtPct(item.cut_probability_3y, 0)}
            </strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Score <strong style={{ color: scoreColor(item.composite_score) }}>{item.composite_score?.toFixed(1)}</strong>
          </div>
          <VerdictBadge verdict={item.verdict} confidence={item.confidence} />
        </div>
      ))}
    </div>
  );
}

// ─── Section: Top Opportunities ──────────────────────────────────
function TopOpportunitiesPanel({ items, onClick }) {
  if (!items?.length) {
    return (
      <div style={{ padding: 14, color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
        Sin análisis profundos completados aún. Ejecuta el pipeline en algunas posiciones.
      </div>
    );
  }
  return (
    <div>
      {items.map((item, idx) => (
        <div
          key={`${item.ticker}-${idx}`}
          onClick={() => onClick && onClick(item.ticker)}
          style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr auto auto',
            gap: 12,
            alignItems: 'center',
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            cursor: onClick ? 'pointer' : 'default',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div>
            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.ticker}</strong>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{item.quarter}</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Raise prob 12m: <strong style={{ color: '#22c55e' }}>{fmtPct(item.raise_probability_12m, 0)}</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Score <strong style={{ color: scoreColor(item.composite_score) }}>{item.composite_score?.toFixed(1)}</strong>
          </div>
          <VerdictBadge verdict={item.verdict} confidence={item.confidence} />
        </div>
      ))}
    </div>
  );
}

// ─── Section: 2x2 Safety × Growth Matrix ────────────────────────
function SafetyGrowthMatrix({ rows, onClick }) {
  // Render as SVG scatter plot
  const W = 360, H = 360, M = 40;
  const xMax = 10, yMax = 10;
  const x = (g) => M + (g / xMax) * (W - 2 * M);
  const y = (s) => H - M - (s / yMax) * (H - 2 * M);
  return (
    <svg width={W} height={H} style={{ background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 8 }}>
      {/* Quadrant fills */}
      <rect x={M} y={M} width={(W - 2*M)/2} height={(H-2*M)/2} fill="rgba(212,175,55,.04)" />
      <rect x={M+(W-2*M)/2} y={M} width={(W-2*M)/2} height={(H-2*M)/2} fill="rgba(34,197,94,.06)" />
      <rect x={M} y={M+(H-2*M)/2} width={(W-2*M)/2} height={(H-2*M)/2} fill="rgba(239,68,68,.06)" />
      <rect x={M+(W-2*M)/2} y={M+(H-2*M)/2} width={(W-2*M)/2} height={(H-2*M)/2} fill="rgba(249,115,22,.04)" />

      {/* Quadrant labels */}
      <text x={M + 10} y={M + 18} fill="var(--text-tertiary)" fontSize={9}>BOND PROXY</text>
      <text x={W - M - 10} y={M + 18} fill="var(--text-tertiary)" fontSize={9} textAnchor="end">⭐ COMPOUNDER</text>
      <text x={M + 10} y={H - M - 8} fill="var(--text-tertiary)" fontSize={9}>💀 TRAP</text>
      <text x={W - M - 10} y={H - M - 8} fill="var(--text-tertiary)" fontSize={9} textAnchor="end">⚠️ SPECULATIVE</text>

      {/* Axes */}
      <line x1={M} y1={H - M} x2={W - M} y2={H - M} stroke="var(--border)" strokeWidth={1} />
      <line x1={M} y1={M} x2={M} y2={H - M} stroke="var(--border)" strokeWidth={1} />
      {/* Mid lines */}
      <line x1={M + (W-2*M)/2} y1={M} x2={M + (W-2*M)/2} y2={H-M} stroke="var(--border)" strokeDasharray="2 4" />
      <line x1={M} y1={M + (H-2*M)/2} x2={W-M} y2={M + (H-2*M)/2} stroke="var(--border)" strokeDasharray="2 4" />

      {/* Axis labels */}
      <text x={W / 2} y={H - 8} fill="var(--text-secondary)" fontSize={11} textAnchor="middle">Growth Score →</text>
      <text x={12} y={H/2} fill="var(--text-secondary)" fontSize={11} textAnchor="middle" transform={`rotate(-90 12 ${H/2})`}>Safety Score →</text>

      {/* Tickers */}
      {(rows || []).map(r => {
        const c = VERDICT_COLORS[r.verdict] || VERDICT_COLORS.HOLD;
        return (
          <g key={r.ticker} style={{ cursor: 'pointer' }} onClick={() => onClick && onClick(r.ticker)}>
            <circle
              cx={x(r.growth_score || 0)}
              cy={y(r.safety_score || 0)}
              r={5 + (r.composite_score || 0) / 4}
              fill={c.fg}
              fillOpacity={0.7}
              stroke={c.border}
              strokeWidth={1.5}
            />
            <text
              x={x(r.growth_score || 0)}
              y={y(r.safety_score || 0) - 8}
              fill="var(--text-primary)"
              fontSize={9}
              fontWeight={600}
              textAnchor="middle"
            >
              {r.ticker}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Section: Smart Alerts (8-K + insider + conflicts) ──────────
function SmartAlertsPanel({ events8k, insiderClusters, conflicts }) {
  const total = (events8k?.length || 0) + (insiderClusters?.length || 0) + (conflicts?.length || 0);
  if (total === 0) {
    return (
      <div style={{ padding: 14, color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
        Sin alertas activas. Cuando lleguen 8-K materiales, insider clusters o conflictos
        del cross-validation, aparecerán aquí.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(events8k || []).map((e, i) => {
        const sev = SEVERITY_COLORS[e.severity] || SEVERITY_COLORS.MEDIUM;
        return (
          <div key={`8k-${i}`} style={{
            padding: '8px 10px',
            background: sev.bg,
            border: `1px solid ${sev.border}`,
            borderLeft: `3px solid ${sev.fg}`,
            borderRadius: 4,
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ color: sev.fg }}>📄 8-K · {e.ticker}</strong>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtDate(e.filing_date)}</span>
            </div>
            <div style={{ marginTop: 3, color: 'var(--text-secondary)' }}>
              <strong>{e.event_type}</strong> · items {e.item_codes}
            </div>
            <div style={{ marginTop: 2, color: 'var(--text-tertiary)', fontSize: 11 }}>
              {e.event_summary}
            </div>
          </div>
        );
      })}
      {(insiderClusters || []).map((c, i) => {
        const sev = SEVERITY_COLORS[c.severity] || SEVERITY_COLORS.MEDIUM;
        const dirIcon = c.direction === 'buy' ? '🟢' : '🔴';
        return (
          <div key={`ic-${i}`} style={{
            padding: '8px 10px',
            background: sev.bg,
            border: `1px solid ${sev.border}`,
            borderLeft: `3px solid ${sev.fg}`,
            borderRadius: 4,
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: sev.fg }}>{dirIcon} Insider {c.direction.toUpperCase()} cluster · {c.ticker}</strong>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.window_end}</span>
            </div>
            <div style={{ marginTop: 3, color: 'var(--text-secondary)' }}>
              {c.n_insiders} insiders en ventana de 60 días
            </div>
          </div>
        );
      })}
      {(conflicts || []).map((cf, i) => (
        <div key={`cf-${i}`} style={{
          padding: '8px 10px',
          background: 'rgba(212,175,55,.10)',
          border: '1px solid #d4af37',
          borderLeft: '3px solid #d4af37',
          borderRadius: 4,
          fontSize: 12,
        }}>
          <strong style={{ color: '#d4af37' }}>⚠️ Conflicto cross-validation · {cf.ticker}</strong>
          <div style={{ marginTop: 3, color: 'var(--text-secondary)' }}>
            Deep verdict <strong>{cf.deep_verdict}</strong> ({cf.deep_confidence}) discrepa con
            otras fuentes (acuerdo: {fmtPct(cf.agreement_pct, 0)})
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section: Track Record / Calibration ─────────────────────────
function TrackRecordPanel({ data }) {
  if (!data) {
    return (
      <div style={{ padding: 14, color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
        Sin predicciones evaluadas todavía. El track record se construye automáticamente
        a 30/90/180/365 días después de cada predicción.
      </div>
    );
  }
  const totalEval = data.n_evaluated || 0;
  const brier = data.avg_brier_score;
  const baseline = data.baseline_brier_random || 0.25;
  const brierBetter = brier != null && brier < baseline;
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12 }}>
        <div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>EVALUADAS</div>
          <strong style={{ fontSize: 18, color: 'var(--text-primary)' }}>{totalEval}</strong>
        </div>
        <div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>BRIER SCORE</div>
          <strong style={{ fontSize: 18, color: brierBetter ? '#22c55e' : '#fb923c' }}>
            {brier != null ? brier.toFixed(3) : '—'}
          </strong>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>
            (random {baseline.toFixed(2)})
          </span>
        </div>
      </div>
      {data.by_verdict && Object.keys(data.by_verdict).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>HIT RATE BY VERDICT</div>
          {Object.entries(data.by_verdict).map(([v, stats]) => {
            const hit = stats.n > 0 ? stats.correct / stats.n : 0;
            return (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
                <span style={{ width: 80, color: 'var(--text-secondary)' }}>{v}</span>
                <ScoreBar value={hit * 10} max={10} />
                <span style={{ color: 'var(--text-secondary)' }}>{stats.correct}/{stats.n}</span>
                <span style={{ color: scoreColor(hit * 10) }}>{fmtPct(hit, 0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section: Per-ticker drill-down modal ───────────────────────
function DeepAnalysisModal({ ticker, data, onClose, onRun, runStatus }) {
  // TDZ-safe: declare all state hooks BEFORE any early returns or effects.
  const [showFullReport, setShowFullReport] = useState(false);
  const [showPDF, setShowPDF] = useState(false);
  if (!ticker) return null;
  const r = data?.result_json;
  const safety = r?.["2_dividend_safety"] || {};
  const growth = r?.["2b_dividend_growth"] || {};
  const flags = r?.["3_red_and_green_flags"] || {};
  const thesis = r?.["4_thesis_impact"] || {};
  const verdict = r?.["7_verdict"] || {};
  const lens = r?.investor_lens_synthesis || {};
  const tax = r?.tax_adjusted_for_user || {};
  const dvls = data?.devils_advocate_json;
  const cv = data?.cross_validation_json;

  // Render to document.body via portal so CSS `zoom` on parent #root wrapper
  // (from the app-level zoom controls) doesn't scale the fixed modal beyond
  // the viewport and break scrolling. This is a load-bearing fix for users
  // who have increased page zoom above 100%.
  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,.92)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card, var(--bg, #0d1117))',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 12,
          maxWidth: 900,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.15)',
          position: 'relative',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>
            🔍 {ticker}
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 10 }}>
              {data?.quarter || ''} · {data?.sector_bucket || ''}
            </span>
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => onRun && onRun(ticker)}
              disabled={runStatus === 'running'}
              style={{
                padding: '6px 12px',
                background: runStatus === 'running' ? 'rgba(212,175,55,.2)' : 'rgba(96,165,250,.15)',
                border: '1px solid #60a5fa',
                color: '#60a5fa',
                borderRadius: 4,
                cursor: runStatus === 'running' ? 'wait' : 'pointer',
                fontSize: 12,
              }}
            >
              {runStatus === 'running' ? '⏳ Ejecutando…' : '↻ Re-analizar'}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >✕ Cerrar</button>
          </div>
        </div>

        {!r && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Sin análisis profundo guardado para este ticker. Click "Re-analizar" para ejecutar
            el pipeline completo (~$0.60-1.20).
          </div>
        )}

        {r && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {/* Summary card */}
            <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                <VerdictBadge verdict={data?.verdict} confidence={data?.confidence} large />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Safety <strong style={{ color: scoreColor(data?.safety_score) }}>{data?.safety_score}</strong>/10 ·
                  {' '}Growth <strong style={{ color: scoreColor(data?.growth_score) }}>{data?.growth_score}</strong>/10 ·
                  {' '}Honesty <strong style={{ color: scoreColor(data?.honesty_score) }}>{data?.honesty_score}</strong>/10
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {typeof r["1_executive_summary"] === 'string'
                  ? r["1_executive_summary"]
                  : (r["1_executive_summary"]?.summary || '')}
              </div>
            </div>

            {/* 📄 Informe Extenso — moved to top so it's reachable without scrolling the structured sections */}
            {data?.result_md && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setShowFullReport(v => !v)}
                    style={{
                      flex: '1 1 220px',
                      padding: '12px 14px',
                      background: showFullReport ? 'rgba(200,164,78,.22)' : 'rgba(200,164,78,.12)',
                      border: '1px solid var(--gold, #c8a44e)',
                      color: 'var(--gold, #c8a44e)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textAlign: 'center',
                      transition: 'background .15s',
                    }}
                  >
                    {showFullReport ? '▲ Ocultar' : '📄 Ver'} informe institucional completo ({Math.round(data.result_md.length / 1024)}k chars)
                  </button>
                  <button
                    onClick={() => setShowPDF(true)}
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(200,164,78,.12)',
                      border: '1px solid var(--gold, #c8a44e)',
                      color: 'var(--gold, #c8a44e)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                    title="Ver informe institucional en formato PDF imprimible (con glosario + resumen simple + portada)"
                  >
                    📥 PDF
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([data.result_md], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${ticker}-${new Date().toISOString().slice(0, 10)}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      padding: '12px 14px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                    title="Descargar informe como archivo .md (raw markdown)"
                  >
                    ⬇ .md
                  </button>
                </div>
                {showFullReport && (
                  <div style={{
                    marginTop: 12,
                    padding: '16px 18px',
                    background: 'var(--subtle-bg, rgba(255,255,255,.02))',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: 'var(--text-primary)',
                    overflow: 'auto',
                  }}>
                    {renderMarkdown(data.result_md)}
                  </div>
                )}
              </div>
            )}

            {/* Safety detail */}
            <div style={{ padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Dividend Safety {safety.score}/10
              </h4>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {safety.rationale}
              </div>
              {safety.key_metrics && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {Object.entries(safety.key_metrics).filter(([k, v]) => v != null && k !== 'cut_warning_severity').map(([k, v]) => (
                    <div key={k}>{k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--text-primary)' }}>{typeof v === 'number' ? v.toFixed(2) : v}</strong></div>
                  ))}
                </div>
              )}
            </div>

            {/* Growth detail */}
            <div style={{ padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Dividend Growth {growth.score}/10
              </h4>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {growth.rationale}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                Expected 5y CAGR: <strong style={{ color: '#22c55e' }}>{growth.expected_5y_cagr}</strong>
                {growth.underrated_grower_flag && (
                  <span style={{ marginLeft: 6, color: '#22c55e' }}>⭐ UNDERRATED</span>
                )}
              </div>
            </div>

            {/* Red flags */}
            <div style={{ padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: '#ef4444', textTransform: 'uppercase' }}>
                Red Flags ({(flags.red || []).length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(flags.red || []).slice(0, 5).map((f, i) => {
                  const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.MEDIUM;
                  return (
                    <div key={i} style={{ fontSize: 11, padding: 6, borderLeft: `2px solid ${sev.fg}`, background: 'var(--subtle-bg, rgba(255,255,255,.02))' }}>
                      <div style={{ color: 'var(--text-primary)' }}>
                        <span style={{ color: sev.fg, fontWeight: 600 }}>{f.severity}</span> · {f.description}
                      </div>
                      {f.quote && <div style={{ marginTop: 2, fontStyle: 'italic', color: 'var(--text-tertiary)' }}>"{f.quote}"</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Green flags */}
            <div style={{ padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: '#22c55e', textTransform: 'uppercase' }}>
                Green Flags ({(flags.green || []).length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(flags.green || []).slice(0, 5).map((f, i) => (
                  <div key={i} style={{ fontSize: 11, padding: 6, borderLeft: '2px solid #22c55e', background: 'var(--subtle-bg, rgba(255,255,255,.02))' }}>
                    <div style={{ color: 'var(--text-primary)' }}>{f.description}</div>
                    {f.quote && <div style={{ marginTop: 2, fontStyle: 'italic', color: 'var(--text-tertiary)' }}>"{f.quote}"</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Thesis impact */}
            <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Thesis Impact
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginBottom: 2 }}>HORIZON 5Y</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{thesis.horizon_5y}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginBottom: 2 }}>HORIZON 10Y</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{thesis.horizon_10y}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 11 }}>
                <div>Cut prob 3y: <strong style={{ color: scoreColor(10 - (thesis.dividend_cut_probability_3y || 0) * 10) }}>{fmtPct(thesis.dividend_cut_probability_3y, 0)}</strong></div>
                <div>Freeze prob 3y: <strong>{fmtPct(thesis.dividend_freeze_probability_3y, 0)}</strong></div>
                <div>Raise prob 12m: <strong style={{ color: '#22c55e' }}>{fmtPct(thesis.dividend_raise_probability_12m, 0)}</strong></div>
              </div>
            </div>

            {/* Tax-adjusted yield (China resident specific) */}
            {tax && (tax.current_yield_gross || tax.dividend_yield_gross) && (
              <div style={{ gridColumn: '1 / -1', padding: 12, background: 'rgba(212,175,55,.05)', borderRadius: 6, border: '1px solid rgba(212,175,55,.2)' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 12, color: '#d4af37', textTransform: 'uppercase' }}>
                  💰 Yield ajustado fiscalmente (residente China, WHT 10%)
                </h4>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Yield bruto: <strong>{fmtPct(tax.current_yield_gross || tax.dividend_yield_gross, 2)}</strong>
                  {' → '}
                  Neto China: <strong style={{ color: '#d4af37' }}>{fmtPct(tax.current_yield_net_china_wht || tax.dividend_yield_net_for_user, 2)}</strong>
                  {tax.tax_efficiency_note && (
                    <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {tax.tax_efficiency_note}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Multi-investor lens */}
            {lens && Object.keys(lens).length > 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Multi-investor lens
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 11 }}>
                  {lens.buffett_munger && (
                    <div><strong style={{ color: '#d4af37' }}>Buffett/Munger</strong><div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{lens.buffett_munger}</div></div>
                  )}
                  {lens.marks && (
                    <div><strong style={{ color: '#60a5fa' }}>Marks</strong><div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{lens.marks}</div></div>
                  )}
                  {lens.klarman && (
                    <div><strong style={{ color: '#a78bfa' }}>Klarman</strong><div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{lens.klarman}</div></div>
                  )}
                </div>
              </div>
            )}

            {/* Devil's Advocate */}
            {dvls && !dvls.error && dvls.contrarian_case && (
              <div style={{ gridColumn: '1 / -1', padding: 12, background: 'rgba(168,85,247,.05)', borderRadius: 6, border: '1px solid rgba(168,85,247,.2)' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 12, color: '#a78bfa', textTransform: 'uppercase' }}>
                  😈 Devil's Advocate (vs verdict {dvls.original_verdict})
                </h4>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                  {dvls.contrarian_case.thesis}
                </div>
                {dvls.calibration_recommendation && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {dvls.calibration_recommendation.should_change_verdict && (
                      <div>⚠️ Suggested verdict change: <strong>{dvls.calibration_recommendation.suggested_verdict}</strong></div>
                    )}
                    {dvls.calibration_recommendation.should_lower_confidence && (
                      <div>⚠️ Suggested confidence: <strong>{dvls.calibration_recommendation.suggested_confidence}</strong></div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Cross-validation */}
            {cv && cv.sources && (
              <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Cross-validation con otras señales
                  {cv.conflict_detected && <span style={{ color: '#ef4444', marginLeft: 8 }}>⚠️ CONFLICTO</span>}
                </h4>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Acuerdo: <strong>{cv.agreement_count}/{cv.total_sources}</strong> ({fmtPct(cv.agreement_pct, 0)})
                </div>
              </div>
            )}

            {/* Verdict reasoning */}
            <div style={{ gridColumn: '1 / -1', padding: 12, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Verdict reasoning
              </h4>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {verdict.reasoning}
              </div>
              {(verdict.price_trigger_buy_more || verdict.price_trigger_trim) && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {verdict.price_trigger_buy_more && <span>📈 Buy more bajo: <strong>${verdict.price_trigger_buy_more}</strong></span>}
                  {verdict.price_trigger_buy_more && verdict.price_trigger_trim && <span> · </span>}
                  {verdict.price_trigger_trim && <span>📉 Trim sobre: <strong>${verdict.price_trigger_trim}</strong></span>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {showPDF && (
        <InstitutionalReportPDF
          ticker={ticker}
          data={data}
          onClose={() => setShowPDF(false)}
        />
      )}
    </div>
  ), document.body);
}

// ─── Main component ──────────────────────────────────────────────
export default function DeepDividendTab() {
  const [dashboard, setDashboard] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [calibration, setCalibration] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [drillTicker, setDrillTicker] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [runStatus, setRunStatus] = useState({});

  // Smart alerts
  const [events8k, setEvents8k] = useState([]);
  const [insiderClusters, setInsiderClusters] = useState([]);
  const [conflicts, setConflicts] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, listRes, calRes, briefRes, e8k, ic, cf] = await Promise.all([
        fetch(`${API_URL}/api/deep-dividend/dashboard`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/deep-dividend/list?limit=200`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/deep-dividend/calibration`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/daily-briefing`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/smart-alerts/8k-events?days=14`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/smart-alerts/insider-clusters?days=30`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_URL}/api/smart-alerts/cross-validation-conflicts`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setDashboard(dashRes);
      setAllRows(listRes?.rows || []);
      setCalibration(calRes);
      setBriefing(briefRes);
      setEvents8k(e8k?.events || []);
      setInsiderClusters(ic?.clusters || []);
      setConflicts(cf?.conflicts || []);
    } catch (e) {
      setError(e.message || 'Error cargando dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openDrill = useCallback(async (ticker) => {
    setDrillTicker(ticker);
    setDrillData(null);
    try {
      const r = await fetch(`${API_URL}/api/deep-dividend/get?ticker=${encodeURIComponent(ticker)}`);
      if (r.ok) {
        const data = await r.json();
        setDrillData(data?.analysis || null);
      }
    } catch {}
  }, []);

  const runDeep = useCallback(async (ticker) => {
    setRunStatus(prev => ({ ...prev, [ticker]: 'running' }));
    try {
      const r = await fetch(`${API_URL}/api/deep-dividend/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, force: true }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      // After run, reload the drill data
      const r2 = await fetch(`${API_URL}/api/deep-dividend/get?ticker=${encodeURIComponent(ticker)}`);
      if (r2.ok) {
        const newData = await r2.json();
        setDrillData(newData?.analysis || null);
      }
      // Refresh dashboard counts
      loadAll();
    } catch (e) {
      alert(`Error ejecutando análisis: ${e.message}`);
    } finally {
      setRunStatus(prev => ({ ...prev, [ticker]: null }));
    }
  }, [loadAll]);

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
        Cargando Deep Dividend Analyzer…
      </div>
    );
  }

  const counts = dashboard?.counts || {};
  const byVerdict = counts.by_verdict || {};
  const totalAnalyzed = counts.total_analyzed || 0;
  const portfolioTotal = counts.portfolio_total || 0;

  return (
    <div style={{ padding: 16, color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          🔍 Deep Dividend Analyzer
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 10 }}>
            v1.0 · Multi-stage pipeline
          </span>
        </h2>
        <button
          onClick={loadAll}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >↻ Refresh</button>
      </div>

      {error && (
        <div style={{ padding: 10, background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', borderRadius: 4, marginBottom: 12, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Top stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 10, background: 'var(--subtle-bg, rgba(255,255,255,.02))', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>ANALIZADOS</div>
          <strong style={{ fontSize: 16 }}>{totalAnalyzed} <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>/ {portfolioTotal}</span></strong>
        </div>
        {Object.entries(VERDICT_COLORS).slice(0, 5).map(([v, c]) => (
          <div key={v} style={{ padding: 10, background: c.bg, borderRadius: 6, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 9, color: c.fg }}>{c.label}</div>
            <strong style={{ fontSize: 16, color: c.fg }}>{byVerdict[v] || 0}</strong>
          </div>
        ))}
      </div>

      {/* 2-column main layout (responsive: stacks on narrow screens) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {/* LEFT: Action Required + Top Opportunities + Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ background: 'var(--subtle-bg, rgba(255,255,255,.02))', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,.04)' }}>
              <strong style={{ fontSize: 12, color: '#fb923c' }}>⚠️ ACCIÓN REQUERIDA</strong>
              {dashboard?.action_required?.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {dashboard.action_required.length} posiciones
                </span>
              )}
            </header>
            <ActionRequiredPanel items={dashboard?.action_required} onClick={openDrill} />
          </section>

          <section style={{ background: 'var(--subtle-bg, rgba(255,255,255,.02))', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(34,197,94,.04)' }}>
              <strong style={{ fontSize: 12, color: '#86efac' }}>⭐ TOP OPORTUNIDADES</strong>
              {dashboard?.top_opportunities?.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {dashboard.top_opportunities.length} compounders
                </span>
              )}
            </header>
            <TopOpportunitiesPanel items={dashboard?.top_opportunities} onClick={openDrill} />
          </section>

          <section style={{ background: 'var(--subtle-bg, rgba(255,255,255,.02))', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(212,175,55,.04)' }}>
              <strong style={{ fontSize: 12, color: '#d4af37' }}>🔔 SMART ALERTS</strong>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                8-K · insider clusters · cross-validation conflicts
              </span>
            </header>
            <div style={{ padding: 12 }}>
              <SmartAlertsPanel events8k={events8k} insiderClusters={insiderClusters} conflicts={conflicts} />
            </div>
          </section>
        </div>

        {/* RIGHT: 2x2 matrix + track record */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ background: 'var(--subtle-bg, rgba(255,255,255,.02))', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📊 SAFETY × GROWTH MATRIX</strong>
            </header>
            <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
              <SafetyGrowthMatrix rows={allRows} onClick={openDrill} />
            </div>
          </section>

          <section style={{ background: 'var(--subtle-bg, rgba(255,255,255,.02))', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🎯 TRACK RECORD</strong>
            </header>
            <TrackRecordPanel data={calibration} />
          </section>
        </div>
      </div>

      {/* Drill-down modal */}
      <DeepAnalysisModal
        ticker={drillTicker}
        data={drillData}
        onClose={() => { setDrillTicker(null); setDrillData(null); }}
        onRun={runDeep}
        runStatus={drillTicker ? runStatus[drillTicker] : null}
      />
    </div>
  );
}
