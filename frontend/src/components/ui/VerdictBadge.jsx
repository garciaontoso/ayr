// Unified verdict badge for ADD/HOLD/TRIM/SELL + confidence modifier.
// Used by Daily Briefing, Research Agent tab, Acciones tab, Advisor, etc.
// Ensures color/typography consistency across the app.

const VERDICT_CONFIG = {
  ADD:         { color: '#22c55e', bg: 'rgba(34,197,94,0.14)',   label: 'ADD' },
  BUY:         { color: '#22c55e', bg: 'rgba(34,197,94,0.14)',   label: 'BUY' },
  ACCUMULATE:  { color: '#22c55e', bg: 'rgba(34,197,94,0.14)',   label: 'ACCUMULATE' },
  HOLD:        { color: '#64d2ff', bg: 'rgba(100,210,255,0.12)', label: 'HOLD' },
  TRIM:        { color: '#f59e0b', bg: 'rgba(245,158,11,0.14)',  label: 'TRIM' },
  SELL:        { color: '#ef4444', bg: 'rgba(239,68,68,0.14)',   label: 'SELL' },
  NEEDS_HUMAN: { color: '#a78bfa', bg: 'rgba(167,139,250,0.14)', label: 'NEEDS HUMAN' },
  INSUFFICIENT_DATA: { color: 'var(--text-tertiary)', bg: 'rgba(100,100,100,0.1)', label: 'INSUF. DATA' },
};

export function VerdictBadge({ verdict, confidence, size = 'md' }) {
  const cfg = VERDICT_CONFIG[String(verdict || '').toUpperCase()] || {
    color: 'var(--text-secondary)', bg: 'rgba(100,100,100,0.08)', label: verdict || '—',
  };
  const isLg = size === 'lg';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: isLg ? 11 : 10,
      fontWeight: 700,
      padding: isLg ? '3px 10px' : '2px 8px',
      borderRadius: 5,
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.color}`,
      textTransform: 'uppercase',
      letterSpacing: '.03em',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--fm, monospace)',
    }}>
      {cfg.label}
      {confidence && (
        <span style={{
          opacity: 0.75,
          fontWeight: 500,
          fontSize: isLg ? 9 : 8,
          textTransform: 'none',
          letterSpacing: 0,
        }}>{confidence}</span>
      )}
    </span>
  );
}

export const verdictColor = (v) => VERDICT_CONFIG[String(v || '').toUpperCase()]?.color || 'var(--text-secondary)';
