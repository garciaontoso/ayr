// 5 Filters display — compact 5-bar indicator per ticker.
// Based on docs/framework/AyR-Decision-Framework.md
// Each bar: Business / Moat / Management / Price / Conviction (0-10)
// Composite = weighted average (25/20/20/20/15)
import React, { useState } from 'react';

const FILTERS = [
  { key: 'business',   label: 'Business',   color: '#60a5fa', short: 'B' }, // blue
  { key: 'moat',       label: 'Moat',       color: '#a78bfa', short: 'M' }, // purple
  { key: 'management', label: 'Management', color: '#fbbf24', short: 'Mg' }, // amber
  { key: 'price',      label: 'Price',      color: '#34d399', short: 'P' }, // green
  { key: 'conviction', label: 'Conviction', color: '#f87171', short: 'C' }, // red
];

const SOURCE_LABELS = {
  deep_dividend:     'Deep Dividend',
  qs_score:          'Quality+Safety',
  sector:            'Sector mapping',
  ratios:            'FMP ratios',
  portfolio_weight:  'Position weight',
  fmp_ratios:        'FMP ratios',
  default:           'Default (5)',
};

// Color the composite by value: ≥7 green, 5-6.9 amber, <5 red
function compositeColor(v) {
  if (v >= 7) return '#30d158';
  if (v >= 5) return '#fbbf24';
  return '#ff453a';
}

export default function FiveFiltersBars({ scores, ticker, width = 60, height = 12, showComposite = true }) {
  const [hover, setHover] = useState(false);
  if (!scores) {
    return <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>—</span>;
  }

  const barGap = 1;
  const barW = (width - barGap * (FILTERS.length - 1)) / FILTERS.length;

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, position: 'relative', cursor: 'help' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width={width} height={height} style={{ display: 'block' }}>
        {FILTERS.map((f, i) => {
          const val = Number(scores[f.key] || 0);
          const h = (val / 10) * height;
          const x = i * (barW + barGap);
          return (
            <g key={f.key}>
              <rect x={x} y={0} width={barW} height={height} fill="var(--border)" opacity={0.3} rx={1} />
              <rect x={x} y={height - h} width={barW} height={h} fill={f.color} rx={1} />
            </g>
          );
        })}
      </svg>
      {showComposite && (
        <span style={{
          fontFamily: 'var(--fm)',
          fontSize: 10,
          fontWeight: 700,
          color: compositeColor(scores.composite),
          minWidth: 22,
        }}>
          {Number(scores.composite).toFixed(1)}
        </span>
      )}
      {hover && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          padding: '8px 10px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 10,
          fontFamily: 'var(--fm)',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          zIndex: 100,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {ticker || 'Scores'} — 5 Filters
          </div>
          {FILTERS.map(f => {
            const val = Number(scores[f.key] || 0);
            const src = scores.source?.[f.key] || 'default';
            return (
              <div key={f.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 1 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: f.color, borderRadius: 2 }} />
                <span style={{ minWidth: 74, color: 'var(--text-secondary)' }}>{f.label}</span>
                <span style={{ fontWeight: 700, minWidth: 24 }}>{val.toFixed(1)}</span>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>· {SOURCE_LABELS[src] || src}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px solid var(--border)', color: compositeColor(scores.composite), fontWeight: 700 }}>
            Composite: {Number(scores.composite).toFixed(1)} / 10
          </div>
          {scores.weight_pct != null && (
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              Position weight: {scores.weight_pct}%
            </div>
          )}
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {scores.has_deep_dividend ? '✓ Deep Dividend' : '—'} · {scores.has_qs ? '✓ Q+S' : '—'}
          </div>
        </div>
      )}
    </span>
  );
}
