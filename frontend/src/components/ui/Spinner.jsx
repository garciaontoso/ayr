/**
 * Spinner — unified loading primitive
 *
 * Replaces ad-hoc spinner implementations. Uses the `ar-spin` @keyframes
 * defined in App.css (added in Phase 1 design tokens).
 *
 * Props:
 *   size       number         pixel dimension (default 20)
 *   color      string         stroke color (default var(--ds-accent))
 *   thickness  number         border width (default 2)
 *   label      string         accessible label (default "Cargando")
 *   inline     bool           if true, renders without wrapper padding (for inline use)
 */
export default function Spinner({
  size = 20,
  color = 'var(--ds-accent, #c8a44e)',
  thickness = 2,
  label = 'Cargando',
  inline = false,
}) {
  const spinner = (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${thickness}px solid rgba(128,128,128,0.2)`,
        borderTopColor: color,
        animation: 'ar-spin 0.8s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  );
  if (inline) return spinner;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--text-secondary)',
        fontSize: 'var(--ds-font-sm, 12px)',
      }}
    >
      {spinner}
      <span>{label}</span>
    </div>
  );
}
