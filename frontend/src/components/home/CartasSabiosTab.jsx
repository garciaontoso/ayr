import { useState } from 'react';

// ── Manager catalogue ─────────────────────────────────────────────
// MVP: 6 Spanish value managers. URLs point to their public letter pages.
// lastLetter is manually maintained; enrich via backend pipeline in Fase 1.
const MANAGERS = [
  {
    id: "cobas",
    name: "Cobas Asset Management",
    author: "Francisco García Paramés",
    style: "Deep Value global",
    freq: "Trimestral",
    tier: "A",
    lang: "ES",
    url: "https://www.cobasam.com/carta-trimestral",
    lastLetter: "Q4 2025",
    lastDate: "2026-02",
    color: "#c8a44e",
  },
  {
    id: "magallanes",
    name: "Magallanes Value Investors",
    author: "Iván Martín",
    style: "Quality Value europeo",
    freq: "Trimestral",
    tier: "A",
    lang: "ES",
    url: "https://www.magallanesvalue.com/publicaciones",
    lastLetter: "Q4 2025",
    lastDate: "2026-02",
    color: "#64d2ff",
  },
  {
    id: "azvalor",
    name: "azValor Asset Management",
    author: "Álvaro Guzmán + Fernando Bernad",
    style: "Value + Commodities",
    freq: "Trimestral",
    tier: "A",
    lang: "ES",
    url: "https://www.azvalor.com/az-cartas",
    lastLetter: "Q4 2025",
    lastDate: "2026-02",
    color: "#ff9f0a",
  },
  {
    id: "horos",
    name: "Horos Asset Management",
    author: "José María Concejo",
    style: "Deep Value global",
    freq: "Trimestral",
    tier: "B",
    lang: "ES",
    url: "https://horosam.com/conoce-horos/cartas",
    lastLetter: "Q4 2025",
    lastDate: "2026-02",
    color: "#30d158",
  },
  {
    id: "truevalue",
    name: "True Value Investments",
    author: "Alejandro Estebaranz",
    style: "Quality Compounders",
    freq: "Mensual",
    tier: "B",
    lang: "ES",
    url: "https://www.truevaluecapital.com/descargas",
    lastLetter: "Mar 2026",
    lastDate: "2026-03",
    color: "#bf5af2",
  },
  {
    id: "bestinver",
    name: "Bestinver",
    author: "Equipo Bestinver",
    style: "Value español post-Paramés",
    freq: "Trimestral",
    tier: "B",
    lang: "ES",
    url: "https://www.bestinver.es/publicaciones",
    lastLetter: "Q4 2025",
    lastDate: "2026-02",
    color: "#ff453a",
  },
];

// Tier colours
const TIER_META = {
  S: { label: "TIER S", bg: "rgba(255,69,58,.12)",    c: "#ff453a" },
  A: { label: "TIER A", bg: "rgba(200,164,78,.12)",   c: "#c8a44e" },
  B: { label: "TIER B", bg: "rgba(100,100,100,.12)",  c: "#8e8e93" },
};

// Frequency → badge colour
const FREQ_COLOR = {
  "Trimestral": "#c8a44e",
  "Mensual":    "#30d158",
  "Anual":      "#64d2ff",
  "Irregular":  "#8e8e93",
};

// ── ManagerCard ───────────────────────────────────────────────────
function ManagerCard({ m }) {
  const tier = TIER_META[m.tier] || TIER_META.B;
  const freqColor = FREQ_COLOR[m.freq] || "#8e8e93";

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "border-color .15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = m.color}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {/* Header row: tier badge + freq badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          padding: "2px 8px", borderRadius: 6,
          background: tier.bg, color: tier.c,
          fontSize: 9, fontWeight: 800, fontFamily: "var(--fm)", letterSpacing: .4,
        }}>
          {tier.label}
        </span>
        <span style={{
          padding: "2px 8px", borderRadius: 6,
          background: `${freqColor}18`, color: freqColor,
          fontSize: 9, fontWeight: 700, fontFamily: "var(--fm)", letterSpacing: .3,
        }}>
          {m.freq.toUpperCase()}
        </span>
      </div>

      {/* Manager name */}
      <div>
        <div style={{
          fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
          fontFamily: "var(--fd)", lineHeight: 1.25,
        }}>
          {m.name}
        </div>
        <div style={{
          fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--fb)", marginTop: 3,
        }}>
          {m.author}
        </div>
      </div>

      {/* Style tag */}
      <div style={{
        fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fb)",
        fontStyle: "italic",
      }}>
        {m.style}
      </div>

      {/* Last letter info */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2,
      }}>
        <div>
          <div style={{
            fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)",
            textTransform: "uppercase", letterSpacing: .5, marginBottom: 2,
          }}>
            Ultima carta
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--fm)",
          }}>
            {m.lastLetter}
          </div>
        </div>

        {/* Ver carta button */}
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "7px 14px", borderRadius: 8,
            background: `${m.color}18`, border: `1px solid ${m.color}50`,
            color: m.color, fontSize: 11, fontWeight: 600,
            fontFamily: "var(--fb)", textDecoration: "none",
            cursor: "pointer", transition: "background .15s, border-color .15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = `${m.color}30`;
            e.currentTarget.style.borderColor = m.color;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = `${m.color}18`;
            e.currentTarget.style.borderColor = `${m.color}50`;
          }}
        >
          Ver carta →
        </a>
      </div>
    </div>
  );
}

// ── CartasSabiosTab ───────────────────────────────────────────────
export default function CartasSabiosTab() {
  const [filter, setFilter] = useState("all");

  // Filter options
  const FILTERS = [
    { id: "all",  lbl: "Todos" },
    { id: "A",    lbl: "Tier A" },
    { id: "B",    lbl: "Tier B" },
    { id: "trimestral", lbl: "Trimestrales" },
    { id: "mensual",    lbl: "Mensuales" },
  ];

  const visible = MANAGERS.filter(m => {
    if (filter === "all") return true;
    if (filter === "A" || filter === "B" || filter === "S") return m.tier === filter;
    if (filter === "trimestral") return m.freq === "Trimestral";
    if (filter === "mensual")    return m.freq === "Mensual";
    return true;
  });

  return (
    <div style={{ padding: "0 0 40px 0", fontFamily: "var(--fb)" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--fd)" }}>
          Cartas de los Sabios
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
          Cartas trimestrales de los mejores gestores value españoles — el razonamiento detrás de sus posiciones.
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "5px 13px", borderRadius: 8,
              border: `1px solid ${filter === f.id ? "var(--gold)" : "var(--border)"}`,
              background: filter === f.id ? "var(--gold-dim)" : "transparent",
              color: filter === f.id ? "var(--gold)" : "var(--text-tertiary)",
              fontSize: 11, fontWeight: filter === f.id ? 700 : 500,
              cursor: "pointer", fontFamily: "var(--fb)", transition: "all .15s",
            }}
          >
            {f.lbl}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}>
        {visible.map(m => (
          <ManagerCard key={m.id} m={m} />
        ))}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          color: "var(--text-tertiary)", fontSize: 13,
        }}>
          No hay gestores para este filtro.
        </div>
      )}

      {/* Footer note */}
      <div style={{
        marginTop: 28, padding: "12px 16px",
        borderRadius: 10, background: "var(--subtle-bg)",
        border: "1px solid var(--border)",
        fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.6,
      }}>
        MVP — Las fechas de ultima carta se actualizan manualmente. Fase 2: pipeline automatico con extraccion PDF + analisis Opus.
      </div>
    </div>
  );
}
