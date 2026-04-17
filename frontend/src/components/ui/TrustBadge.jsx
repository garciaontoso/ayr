// TrustBadge — compact data-provenance indicator
// Usage: <TrustBadge level="fresh" source="FMP /key-metrics" updatedAt="2026-04-17" />
// levels: "verified" | "fresh" | "stale" | "unverified"
// Renders as a tiny emoji with a native title tooltip. No state, no effects — pure presentational.

const ICONS = {
  verified:   "✅",
  fresh:      "🟡",
  stale:      "🟠",
  unverified: "🔴",
};

const LABELS = {
  verified:   "Verificado",
  fresh:      "Actualizado (<24h)",
  stale:      "Desactualizado (1-7d)",
  unverified: "Sin verificar / estimado",
};

export function TrustBadge({ level = "unverified", source = "", updatedAt = "", note = "" }) {
  const icon = ICONS[level] ?? ICONS.unverified;
  const label = LABELS[level] ?? LABELS.unverified;
  const parts = [
    label,
    source ? `Fuente: ${source}` : "",
    updatedAt ? `Actualizado: ${updatedAt}` : "",
    note || "",
  ].filter(Boolean).join("\n");

  return (
    <span
      title={parts}
      style={{ fontSize: 8, marginLeft: 3, cursor: "help", userSelect: "none", flexShrink: 0 }}
      aria-label={parts}
    >
      {icon}
    </span>
  );
}

export default TrustBadge;
