import { useState, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';
import { _sf } from '../../utils/formatters';

// ── Tier badge colours ──────────────────────────────────────────
const TIER_META = {
  HOT:    { label: "HOT",    emoji: "HOT",  bg: "rgba(255,69,58,.12)",    c: "#ff453a" },
  STRONG: { label: "STRONG", emoji: "STRONG", bg: "rgba(200,164,78,.12)", c: "#c8a44e" },
  WATCH:  { label: "WATCH",  emoji: "WATCH",  bg: "rgba(10,132,255,.12)", c: "#64d2ff" },
  RADAR:  { label: "RADAR",  emoji: "RADAR",  bg: "rgba(100,100,100,.12)", c: "#8e8e93" },
};

const TIER_ORDER = ["HOT", "STRONG", "WATCH", "RADAR"];

// Score 0-100 → color
function scoreColor(s) {
  return s >= 70 ? "#30d158" : s >= 50 ? "#c8a44e" : "#ff453a";
}

function ScoreBadge({ value, label }) {
  const c = scoreColor(value);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: c, fontFamily: "var(--fm)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SourcePill({ src }) {
  const tierC = { S: "#ff453a", A: "#c8a44e", B: "#64d2ff", C: "#8e8e93" };
  const c = tierC[src.tier] || "#8e8e93";
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: `${c}18`, border: `1px solid ${c}40`, color: c, fontSize: 9, fontFamily: "var(--fm)", fontWeight: 600, margin: "1px 2px", whiteSpace: "nowrap" }}>
      {src.label}
    </span>
  );
}

function CandidateCard({ c, onAnalyze }) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_META[c.tier] || TIER_META.RADAR;
  const dd = c.deep_dividend;

  return (
    <div
      style={{ background: "var(--card)", border: `1px solid var(--border)`, borderRadius: 14, padding: "14px 18px", cursor: "pointer", transition: "border-color .15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {/* Top row: tier + ticker + score */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Tier badge */}
        <span style={{ padding: "3px 9px", borderRadius: 8, background: tier.bg, color: tier.c, fontSize: 9, fontWeight: 800, fontFamily: "var(--fm)", letterSpacing: .4, flexShrink: 0 }}>
          {tier.label}
        </span>

        {/* Ticker button */}
        <button
          onClick={() => onAnalyze(c.ticker)}
          style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 15, color: "var(--gold)", fontFamily: "var(--fd)", padding: 0 }}
        >
          {c.ticker}
        </button>

        {/* Sector */}
        {c.sector && (
          <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", background: "var(--subtle-bg)", padding: "2px 7px", borderRadius: 5 }}>
            {c.sector}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Discovery score */}
        <div style={{ textAlign: "center", minWidth: 48 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: tier.c, fontFamily: "var(--fm)", lineHeight: 1 }}>{c.discovery_score}</div>
          <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>DISCO</div>
        </div>

        {/* Q+S mini badges */}
        <div style={{ display: "flex", gap: 10 }}>
          <ScoreBadge value={Math.round(c.quality_score)} label="QUALITY" />
          <ScoreBadge value={Math.round(c.safety_score)} label="SAFETY" />
        </div>

        {/* Yield */}
        {c.yield_pct > 0 && (
          <div style={{ textAlign: "center", minWidth: 40 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.yield_pct >= 3 ? "#30d158" : c.yield_pct >= 2 ? "#c8a44e" : "var(--text-secondary)", fontFamily: "var(--fm)" }}>
              {_sf(c.yield_pct, 1)}%
            </div>
            <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>YIELD</div>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer", padding: "2px 6px", fontFamily: "var(--fm)" }}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Sources row */}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 2 }}>
        <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginRight: 4, lineHeight: "20px" }}>
          {c.source_count} {c.source_count === 1 ? "fuente" : "fuentes"}:
        </span>
        {c.sources.map(s => <SourcePill key={s.id} src={s} />)}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>

            {/* Deep Dividend block */}
            {dd && (
              <div style={{ flex: "1 1 200px", background: "var(--subtle-bg)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 6, letterSpacing: .6 }}>DEEP DIVIDEND</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>Veredicto: </span>
                    <span style={{ fontSize: 11, color: dd.verdict === "HOLD" ? "#c8a44e" : dd.verdict === "TRIM" ? "#ff9f0a" : dd.verdict === "BUY" ? "#30d158" : "#ff453a", fontWeight: 700, fontFamily: "var(--fm)" }}>{dd.verdict}</span>
                  </div>
                  {dd.cut_probability_3y != null && (
                    <div>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>Riesgo corte 3y: </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: (dd.cut_probability_3y * 100) > 30 ? "#ff453a" : "#30d158", fontFamily: "var(--fm)" }}>{Math.round(dd.cut_probability_3y * 100)}%</span>
                    </div>
                  )}
                  {dd.raise_probability_12m != null && (
                    <div>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>Prob. subida 12m: </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: (dd.raise_probability_12m * 100) >= 60 ? "#30d158" : "#c8a44e", fontFamily: "var(--fm)" }}>{Math.round(dd.raise_probability_12m * 100)}%</span>
                    </div>
                  )}
                </div>
                {/* Deep dividend scores are 0-10; multiply for ScoreBadge color range */}
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <ScoreBadge value={dd.safety_score * 10} label={`SAFETY ${dd.safety_score}/10`} />
                  <ScoreBadge value={dd.growth_score * 10} label={`GROWTH ${dd.growth_score}/10`} />
                  <ScoreBadge value={Math.round(dd.composite_score * 10)} label={`COMP ${dd.composite_score}/10`} />
                </div>
              </div>
            )}

            {/* Q+S breakdown */}
            <div style={{ flex: "1 1 160px", background: "var(--subtle-bg)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 6, letterSpacing: .6 }}>Q+S SCORES</div>
              <div style={{ display: "flex", gap: 12 }}>
                <ScoreBadge value={Math.round(c.quality_score)} label="QUALITY" />
                <ScoreBadge value={Math.round(c.safety_score)} label="SAFETY" />
                {c.yield_pct > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: c.yield_pct >= 3 ? "#30d158" : "#c8a44e", fontFamily: "var(--fm)" }}>{_sf(c.yield_pct, 1)}%</div>
                    <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>YIELD</div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => onAnalyze(c.ticker)}
              style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--gold)", background: "var(--gold-dim)", color: "var(--gold)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--fm)" }}
            >
              Abrir analisis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscoveryTab() {
  const { openAnalysis } = useHome();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Filters
  const [minQuality, setMinQuality] = useState(60);
  const [minSafety, setMinSafety] = useState(55);
  const [minYield, setMinYield] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [tierFilter, setTierFilter] = useState("ALL");
  const [sectorFilter, setSectorFilter] = useState("");
  const [excludePortfolio, setExcludePortfolio] = useState(true);
  const [searchText, setSearchText] = useState("");

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: "100",
        minQuality: String(minQuality),
        minSafety: String(minSafety),
        minYield: String(minYield),
        minScore: String(minScore),
        excludePortfolio: String(excludePortfolio),
      });
      if (sectorFilter) params.set("sector", sectorFilter);

      const token = localStorage.getItem("ayr_token") || "";
      const res = await fetch(`${API_URL}/api/discovery/scan?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [minQuality, minSafety, minYield, minScore, sectorFilter, excludePortfolio]);

  // Auto-run on first mount
  useEffect(() => { runScan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = data?.candidates || [];

  // Client-side filtering: tier + text search
  const filtered = candidates.filter(c => {
    if (tierFilter !== "ALL" && c.tier !== tierFilter) return false;
    if (searchText) {
      const q = searchText.toUpperCase();
      if (!c.ticker.includes(q) && !(c.sector || "").toUpperCase().includes(q)) return false;
    }
    return true;
  });

  // Derive sectors from results for the sector dropdown
  const sectors = [...new Set(candidates.map(c => c.sector).filter(Boolean))].sort();

  // Tier summary counts
  const tierCounts = {};
  for (const t of TIER_ORDER) tierCounts[t] = candidates.filter(c => c.tier === t).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)" }}>Discovery Engine</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 3 }}>
              Ideas de inversion curadas — fuera de cartera, ordenadas por discovery score
            </div>
          </div>
          <button
            onClick={runScan}
            disabled={loading}
            style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid var(--gold)", background: "var(--gold-dim)", color: "var(--gold)", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "var(--fm)" }}
          >
            {loading ? "Escaneando..." : "Escanear"}
          </button>
        </div>

        {/* Tier summary pills */}
        {data && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {TIER_ORDER.map(t => {
              const m = TIER_META[t];
              const n = tierCounts[t] || 0;
              return (
                <button
                  key={t}
                  onClick={() => setTierFilter(prev => prev === t ? "ALL" : t)}
                  style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${tierFilter === t ? m.c : "var(--border)"}`, background: tierFilter === t ? m.bg : "transparent", color: tierFilter === t ? m.c : "var(--text-tertiary)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--fm)" }}
                >
                  {m.label} {n}
                </button>
              );
            })}
            <button
              onClick={() => setTierFilter("ALL")}
              style={{ padding: "5px 14px", borderRadius: 8, border: `1px solid ${tierFilter === "ALL" ? "var(--gold)" : "var(--border)"}`, background: tierFilter === "ALL" ? "var(--gold-dim)" : "transparent", color: tierFilter === "ALL" ? "var(--gold)" : "var(--text-tertiary)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--fm)" }}
            >
              Todos {candidates.length}
            </button>
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar ticker / sector..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ padding: "7px 11px", background: "var(--subtle-border)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 11, outline: "none", fontFamily: "var(--fm)", width: 180 }}
        />

        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          style={{ padding: "7px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--fm)" }}
        >
          <option value="">Todos sectores</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={minYield}
          onChange={e => setMinYield(Number(e.target.value))}
          style={{ padding: "7px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--fm)" }}
        >
          <option value={0}>Yield min: todos</option>
          <option value={1}>Yield &ge; 1%</option>
          <option value={2}>Yield &ge; 2%</option>
          <option value={3}>Yield &ge; 3%</option>
          <option value={4}>Yield &ge; 4%</option>
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>Quality min:</span>
          <input
            type="number"
            min={0} max={100} step={5}
            value={minQuality}
            onChange={e => setMinQuality(Number(e.target.value))}
            style={{ width: 52, padding: "5px 8px", background: "var(--subtle-border)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: 11, outline: "none", fontFamily: "var(--fm)" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>Safety min:</span>
          <input
            type="number"
            min={0} max={100} step={5}
            value={minSafety}
            onChange={e => setMinSafety(Number(e.target.value))}
            style={{ width: 52, padding: "5px 8px", background: "var(--subtle-border)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: 11, outline: "none", fontFamily: "var(--fm)" }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={excludePortfolio}
            onChange={e => setExcludePortfolio(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          Excluir cartera
        </label>

        <button
          onClick={runScan}
          disabled={loading}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--green)", background: "rgba(48,209,88,.06)", color: "var(--green)", fontSize: 11, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "var(--fm)" }}
        >
          Aplicar
        </button>

        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginLeft: "auto" }}>
          {filtered.length} de {candidates.length} candidatos
        </span>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,69,58,.07)", border: "1px solid rgba(255,69,58,.2)", color: "var(--red)", fontSize: 12, fontFamily: "var(--fm)" }}>
          Error: {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, fontFamily: "var(--fm)" }}>
          Calculando discovery scores...
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && data && filtered.length === 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>
            {candidates.length === 0 ? "No hay datos" : "Sin resultados con estos filtros"}
          </div>
          {candidates.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              Necesitas Q+S scores. Ejecuta primero{" "}
              <code style={{ background: "var(--subtle-bg)", padding: "1px 5px", borderRadius: 4 }}>
                POST /api/scores/compute?all=1
              </code>
              {" "}desde el Screener o via curl.
            </div>
          )}
        </div>
      )}

      {/* ── Candidate cards ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(c => (
            <CandidateCard key={c.ticker} c={c} onAnalyze={openAnalysis} />
          ))}
        </div>
      )}

      {/* ── Footer note ── */}
      {!loading && data && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", padding: "4px 0 8px", textAlign: "center" }}>
          {data.portfolio_excluded ? `${data.portfolio_size} posiciones excluidas.` : "Incluye posiciones en cartera."}{" "}
          Scores basados en Q+S + Deep Dividend. Click en ticker para analisis completo.
        </div>
      )}
    </div>
  );
}
