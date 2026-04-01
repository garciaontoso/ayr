/**
 * EmptyState — Beautiful empty state for tabs with no data
 * LoadingSkeleton — Pulsing skeleton placeholders while data loads
 */

/* ── Empty State ── */
export function EmptyState({ icon, title, subtitle, action, onAction, secondaryAction, onSecondaryAction }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "60px 24px", textAlign: "center", minHeight: 320,
    }}>
      <div style={{
        fontSize: 48, marginBottom: 16, lineHeight: 1,
        filter: "drop-shadow(0 2px 8px rgba(200,164,78,.15))",
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 700, color: "var(--text-primary)",
        fontFamily: "var(--fb)", marginBottom: 8, maxWidth: 360,
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--fm)",
          lineHeight: 1.5, maxWidth: 340, marginBottom: action ? 20 : 0,
        }}>
          {subtitle}
        </div>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {action && (
            <button
              onClick={onAction}
              style={{
                padding: "10px 24px", borderRadius: 10,
                border: "1px solid var(--gold)",
                background: "var(--gold-dim, rgba(214,158,46,.12))",
                color: "var(--gold)", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "var(--fm)",
                transition: "all .2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--gold)"; e.currentTarget.style.color = "#000"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--gold-dim, rgba(214,158,46,.12))"; e.currentTarget.style.color = "var(--gold)"; }}
            >
              {action}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={onSecondaryAction}
              style={{
                padding: "10px 24px", borderRadius: 10,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--fm)",
                transition: "all .2s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--text-secondary)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
            >
              {secondaryAction}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Loading Skeleton ── */
export function LoadingSkeleton({ rows = 5, cards = 0, message = "Cargando..." }) {
  const pulseStyle = (delay = 0) => ({
    background: "linear-gradient(90deg, var(--row-alt) 25%, var(--subtle-bg2) 50%, var(--row-alt) 75%)",
    backgroundSize: "200% 100%",
    animation: `shimmer 1.5s ease-in-out infinite`,
    animationDelay: `${delay}s`,
    borderRadius: 8,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
      {/* Optional message */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "12px 0", color: "var(--text-tertiary)", fontSize: 12, fontFamily: "var(--fm)",
      }}>
        <span style={{
          display: "inline-block", width: 14, height: 14, border: "2px solid var(--gold)",
          borderTopColor: "transparent", borderRadius: "50%",
          animation: "spin .8s linear infinite",
        }} />
        {message}
      </div>

      {/* Summary cards skeleton */}
      {cards > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cards, 4)}, 1fr)`, gap: 10 }}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} style={{
              ...pulseStyle(i * 0.15),
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 12, padding: 16, height: 72,
            }}>
              <div style={{ ...pulseStyle(i * 0.15), width: 70, height: 8, marginBottom: 10 }} />
              <div style={{ ...pulseStyle(i * 0.15 + 0.1), width: 100, height: 20 }} />
            </div>
          ))}
        </div>
      )}

      {/* Table rows skeleton */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: "flex", gap: 12, alignItems: "center",
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "10px 16px",
        }}>
          <div style={{ ...pulseStyle(i * 0.1), width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...pulseStyle(i * 0.1), width: 80 + i * 8, height: 10, marginBottom: 6 }} />
            <div style={{ ...pulseStyle(i * 0.1 + 0.05), width: 50, height: 7 }} />
          </div>
          <div style={{ ...pulseStyle(i * 0.1 + 0.1), width: 55, height: 14 }} />
          <div style={{ ...pulseStyle(i * 0.1 + 0.15), width: 45, height: 14 }} />
          <div style={{ ...pulseStyle(i * 0.1 + 0.2), width: 50, height: 14 }} />
        </div>
      ))}
    </div>
  );
}

/* ── Inline mini loading (for sub-sections) ── */
export function InlineLoading({ message = "Cargando..." }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      padding: 30, color: "var(--text-tertiary)", fontSize: 12, fontFamily: "var(--fm)",
    }}>
      <span style={{
        display: "inline-block", width: 14, height: 14, border: "2px solid var(--gold)",
        borderTopColor: "transparent", borderRadius: "50%",
        animation: "spin .8s linear infinite",
      }} />
      {message}
    </div>
  );
}
