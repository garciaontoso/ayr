/**
 * StatCard — reusable KPI/stat box primitive
 *
 * Replaces the `ls/vs/ss` (label/value/sub) inline style pattern that's
 * duplicated across 12+ tabs (DashboardTab, PatrimonioTab, PresupuestoTab,
 * IncomeLabTab, FireTab, CoveredCallsTab, DividendosTab, etc.).
 *
 * Props:
 *   label    string|node  small uppercase label on top
 *   value    string|node  big number / main content
 *   sub      string|node? optional subtitle below value (change %, note)
 *   tone     'neutral' | 'success' | 'danger' | 'warning' | 'info'
 *              — tints the value text color
 *   icon     string|node? optional prefix (emoji or component)
 *   size     'sm' | 'md' | 'lg'   default 'md'
 *   align    'left' | 'center' | 'right'   default 'left'
 *   loading  bool         if true, renders skeleton value
 *   onClick  fn?          if present, renders as clickable card with hover
 *
 * Uses --ds-* tokens for colors and sizes.
 */
export default function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  size = 'md',
  align = 'left',
  loading = false,
  onClick,
  style: styleOverride = {},
}) {
  const TONE_COLORS = {
    neutral: 'var(--text-primary)',
    success: 'var(--ds-success, #30d158)',
    danger: 'var(--ds-danger, #ff453a)',
    warning: 'var(--ds-warning, #ff9f0a)',
    info: 'var(--ds-info, #64d2ff)',
    accent: 'var(--ds-accent, #c8a44e)',
  };

  const SIZE_SCALE = {
    sm: { label: 10, value: 18, sub: 10, padding: 12, gap: 4 },
    md: { label: 11, value: 24, sub: 11, padding: 16, gap: 6 },
    lg: { label: 12, value: 32, sub: 12, padding: 20, gap: 8 },
  };
  const s = SIZE_SCALE[size] || SIZE_SCALE.md;
  const valueColor = TONE_COLORS[tone] || TONE_COLORS.neutral;
  const clickable = typeof onClick === 'function';

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        padding: s.padding,
        background: 'var(--subtle-bg, var(--card))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--ds-radius-md, 10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: s.gap,
        textAlign: align,
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease, transform 0.15s ease',
        fontFamily: 'var(--fm)',
        ...styleOverride,
      }}
      onMouseEnter={clickable ? (e) => { e.currentTarget.style.borderColor = 'var(--ds-accent, #c8a44e)'; } : undefined}
      onMouseLeave={clickable ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; } : undefined}
    >
      {label != null && (
        <div
          style={{
            fontSize: s.label,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          fontSize: s.value,
          fontWeight: 700,
          color: valueColor,
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          minHeight: s.value,
        }}
      >
        {icon && <span style={{ fontSize: s.value * 0.75 }}>{icon}</span>}
        {loading ? (
          <span
            style={{
              display: 'inline-block',
              width: 80,
              height: s.value * 0.8,
              background: 'var(--border)',
              borderRadius: 4,
              opacity: 0.5,
            }}
          />
        ) : (
          value ?? '—'
        )}
      </div>
      {sub != null && (
        <div
          style={{
            fontSize: s.sub,
            color: 'var(--text-secondary)',
            lineHeight: 1.3,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
