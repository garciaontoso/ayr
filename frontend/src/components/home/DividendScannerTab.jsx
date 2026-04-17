import { useState, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { API_URL } from '../../constants/index.js';

// ── Score colour thresholds ─────────────────────────────────────
function scoreColor(s) {
  if (s >= 8) return "#30d158";   // green
  if (s >= 6) return "#c8a44e";   // gold
  if (s >= 4) return "#ff9f0a";   // orange
  return "#ff453a";               // red
}

function ScoreBadge({ value }) {
  const c = scoreColor(value || 0);
  return (
    <span style={{ display: "inline-block", minWidth: 34, textAlign: "center", padding: "3px 8px", borderRadius: 8, background: `${c}18`, border: `1px solid ${c}40`, color: c, fontSize: 13, fontWeight: 800, fontFamily: "var(--fm)" }}>
      {value != null ? value.toFixed(1) : "—"}
    </span>
  );
}

function Pill({ label, value, unit = "", colorFn }) {
  const c = colorFn ? colorFn(value) : "var(--text-secondary)";
  return (
    <div style={{ textAlign: "center", minWidth: 52 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: "var(--fm)", lineHeight: 1.1 }}>
        {value != null ? `${value}${unit}` : "—"}
      </div>
      <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 2, letterSpacing: .3 }}>
        {label}
      </div>
    </div>
  );
}

function MemberBadge({ label, color }) {
  return (
    <span style={{ padding: "2px 7px", borderRadius: 5, background: `${color}15`, border: `1px solid ${color}40`, color, fontSize: 9, fontWeight: 700, fontFamily: "var(--fm)" }}>
      {label}
    </span>
  );
}

// ── Score breakdown tooltip ─────────────────────────────────────
function Breakdown({ bd }) {
  if (!bd) return null;
  const rows = [
    ["Yield",   bd.yield_score],
    ["DGR 5Y",  bd.dgr_score],
    ["Payout",  bd.payout_score],
    ["Streak",  bd.streak_score],
    ["FCF Cov", bd.fcf_cov_score],
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
      {rows.map(([lbl, val]) => (
        <div key={lbl} style={{ textAlign: "center", minWidth: 44 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>
            {val != null ? val.toFixed(2) : "—"}
          </div>
          <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>{lbl}</div>
        </div>
      ))}
    </div>
  );
}

// ── Row component ───────────────────────────────────────────────
function CandidateRow({ m, rank, onAnalyze, isTop10 }) {
  const [expanded, setExpanded] = useState(false);
  const isNew = !m.in_portfolio && !m.in_watchlist;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", transition: "border-color .15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--gold)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap" }}>

        {/* Rank */}
        <div style={{ minWidth: 22, textAlign: "center", fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", fontWeight: 700 }}>
          {rank}
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {isTop10 && (
            <MemberBadge label="TOP 10" color="#c8a44e" />
          )}
          {isNew && (
            <MemberBadge label="NUEVO" color="#30d158" />
          )}
          {m.is_aristocrat && (
            <MemberBadge label="ARISTOCRAT" color="#64d2ff" />
          )}
          {m.in_portfolio && (
            <MemberBadge label="CARTERA" color="#8e8e93" />
          )}
          {m.in_watchlist && (
            <MemberBadge label="WATCHLIST" color="#5e5ce6" />
          )}
        </div>

        {/* Ticker button */}
        <button
          onClick={() => onAnalyze(m.ticker)}
          style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "var(--gold)", fontFamily: "var(--fd)", padding: 0, flexShrink: 0 }}
        >
          {m.ticker}
        </button>

        {/* Company name */}
        <div style={{ flex: "1 1 120px", fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--fm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.name || ""}
        </div>

        {/* Metric pills */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Pill label="YIELD" value={m.yield_pct} unit="%" colorFn={v => v >= 4 ? "#30d158" : v >= 3 ? "#c8a44e" : "var(--text-secondary)"} />
          <Pill label="DGR 5Y" value={m.dgr5y} unit="%" colorFn={v => v >= 10 ? "#30d158" : v >= 7 ? "#c8a44e" : "#ff9f0a"} />
          <Pill label="DGR 10Y" value={m.dgr10y} unit="%" colorFn={v => v >= 8 ? "#30d158" : v >= 5 ? "#c8a44e" : "var(--text-secondary)"} />
          <Pill label="PAYOUT FCF" value={m.payout_fcf} unit="%" colorFn={v => v < 50 ? "#30d158" : v < 70 ? "#c8a44e" : "#ff453a"} />
          <Pill label="STREAK" value={m.streak} colorFn={v => v >= 25 ? "#30d158" : v >= 10 ? "#c8a44e" : "var(--text-secondary)"} />
          <Pill label="FCF COV" value={m.fcf_cov} colorFn={v => v >= 2 ? "#30d158" : v >= 1.2 ? "#c8a44e" : "#ff453a"} />
        </div>

        {/* Score */}
        <ScoreBadge value={m.score} />

        {/* Expand */}
        <button
          onClick={() => setExpanded(p => !p)}
          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-tertiary)", fontSize: 11, cursor: "pointer", padding: "2px 6px", fontFamily: "var(--fm)", flexShrink: 0 }}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px", background: "var(--subtle-bg)", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 6, letterSpacing: .6 }}>SCORE BREAKDOWN</div>
            <Breakdown bd={m.score_breakdown} />
          </div>
          <div style={{ flex: "1 1 200px", background: "var(--subtle-bg)", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 6, letterSpacing: .6 }}>OTROS DATOS</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Pill label="ROIC" value={m.roic} unit="%" colorFn={v => v >= 15 ? "#30d158" : v >= 10 ? "#c8a44e" : "var(--text-secondary)"} />
              <Pill label="NET DEBT/EBITDA" value={m.net_debt_ebitda} colorFn={v => v < 2 ? "#30d158" : v < 3.5 ? "#c8a44e" : "#ff453a"} />
              <Pill label="OP MARGIN" value={m.op_margin} unit="%" colorFn={v => v >= 20 ? "#30d158" : v >= 10 ? "#c8a44e" : "var(--text-secondary)"} />
              {m.sector && (
                <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", background: "var(--card)", padding: "4px 8px", borderRadius: 6, alignSelf: "center" }}>
                  {m.sector}
                </span>
              )}
            </div>
          </div>
          <div style={{ flex: "0 0 auto", alignSelf: "flex-end" }}>
            <button
              onClick={() => onAnalyze(m.ticker)}
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

// ── CSV export ──────────────────────────────────────────────────
function exportCsv(candidates) {
  const headers = ["Rank","Ticker","Name","Yield%","DGR5Y%","DGR10Y%","PayoutFCF%","Streak","FCFCov","ROIC%","NetDebt/EBITDA","OpMargin%","Score","InPortfolio","InWatchlist","Aristocrat"];
  const rows = candidates.map((m, i) => [
    i + 1, m.ticker, `"${(m.name || "").replace(/"/g, '""')}"`,
    m.yield_pct ?? "", m.dgr5y ?? "", m.dgr10y ?? "", m.payout_fcf ?? "",
    m.streak ?? "", m.fcf_cov ?? "", m.roic ?? "", m.net_debt_ebitda ?? "",
    m.op_margin ?? "", m.score ?? "",
    m.in_portfolio ? "SI" : "NO",
    m.in_watchlist ? "SI" : "NO",
    m.is_aristocrat ? "SI" : "NO",
  ].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `dividend-scanner-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── Main component ──────────────────────────────────────────────
export default function DividendScannerTab() {
  const { openAnalysis } = useHome();

  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [data, setData]     = useState(null);

  // Filter state — defaults calibrated to the real Aristocrats universe.
  // The classic yield/growth tradeoff means yield>3% + DGR>7% + FCFcov>1.2x
  // simultaneously is very rare — lower defaults give a useful starting set.
  const [minYield,  setMinYield]  = useState(2);
  const [minDgr5y,  setMinDgr5y]  = useState(3);
  const [maxPayout, setMaxPayout] = useState(80);
  const [minFcfCov, setMinFcfCov] = useState(1.0);
  const [minStreak, setMinStreak] = useState(5);

  // Client-side extra filtering
  const [searchText,        setSearchText]        = useState("");
  const [sectorFilter,      setSectorFilter]       = useState("");
  const [excludePortfolio,  setExcludePortfolio]   = useState(false);
  const [onlyNew,           setOnlyNew]            = useState(false);

  const runScan = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        minYield:  String(minYield),
        minDgr5y:  String(minDgr5y),
        maxPayout: String(maxPayout),
        minFcfCov: String(minFcfCov),
        minStreak: String(minStreak),
        limit:     "200",
      });
      if (force) params.set("refresh", "1");

      const token = localStorage.getItem("ayr_token") || "";
      const res = await fetch(`${API_URL}/api/dividend-scanner?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [minYield, minDgr5y, maxPayout, minFcfCov, minStreak]);

  // Auto-run on first mount
  useEffect(() => { runScan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = data?.candidates || [];

  // Client-side secondary filters
  const filtered = candidates.filter(m => {
    if (excludePortfolio && m.in_portfolio) return false;
    if (onlyNew && (m.in_portfolio || m.in_watchlist)) return false;
    if (sectorFilter && (m.sector || "") !== sectorFilter) return false;
    if (searchText) {
      const q = searchText.toUpperCase();
      if (!m.ticker.includes(q) && !(m.name || "").toUpperCase().includes(q) && !(m.sector || "").toUpperCase().includes(q)) return false;
    }
    return true;
  });

  const sectors = [...new Set(candidates.map(m => m.sector).filter(Boolean))].sort();

  // Score distribution summary
  const topScore = filtered.length > 0 ? filtered[0].score : 0;
  const avgScore = filtered.length > 0 ? (filtered.reduce((s, m) => s + (m.score || 0), 0) / filtered.length) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)" }}>
              Dividend Compounder Scanner
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 3 }}>
              Screening de compounders: yield + DGR + cobertura FCF + streak. Score 0-10.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => runScan(true)}
              disabled={loading}
              title="Forzar refresco desde FMP (ignora cache)"
              style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 11, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "var(--fm)" }}
            >
              {loading ? "..." : "Refrescar"}
            </button>
            <button
              onClick={() => runScan()}
              disabled={loading}
              style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--gold)", background: "var(--gold-dim)", color: "var(--gold)", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "var(--fm)" }}
            >
              {loading ? "Escaneando..." : "Escanear"}
            </button>
          </div>
        </div>

        {/* Stats row */}
        {data && (
          <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{data.scanned}</span> universo
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              <span style={{ color: "var(--gold)", fontWeight: 700 }}>{data.passed_filters}</span> pasaron filtros
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              <span style={{ color: "#30d158", fontWeight: 700 }}>{filtered.length}</span> mostrando
            </div>
            {filtered.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
                  TOP score: <span style={{ color: scoreColor(topScore), fontWeight: 700 }}>{topScore.toFixed(1)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
                  Promedio: <span style={{ color: scoreColor(avgScore), fontWeight: 700 }}>{avgScore.toFixed(1)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Filter panel ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--fm)", letterSpacing: .5, marginBottom: 10 }}>FILTROS (servidor)</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>

          {/* Yield min slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
            <label style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              Yield min: <strong style={{ color: "var(--text-primary)" }}>{minYield}%</strong>
            </label>
            <input type="range" min={0} max={8} step={0.5} value={minYield}
              onChange={e => setMinYield(parseFloat(e.target.value))}
              style={{ cursor: "pointer" }} />
          </div>

          {/* DGR 5Y min slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
            <label style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              DGR 5Y min: <strong style={{ color: "var(--text-primary)" }}>{minDgr5y}%</strong>
            </label>
            <input type="range" min={0} max={20} step={0.5} value={minDgr5y}
              onChange={e => setMinDgr5y(parseFloat(e.target.value))}
              style={{ cursor: "pointer" }} />
          </div>

          {/* Payout max slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
            <label style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              Payout FCF max: <strong style={{ color: "var(--text-primary)" }}>{maxPayout}%</strong>
            </label>
            <input type="range" min={30} max={100} step={5} value={maxPayout}
              onChange={e => setMaxPayout(parseFloat(e.target.value))}
              style={{ cursor: "pointer" }} />
          </div>

          {/* FCF cov min slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
            <label style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              FCF Cov min: <strong style={{ color: "var(--text-primary)" }}>{minFcfCov}x</strong>
            </label>
            <input type="range" min={0.5} max={4} step={0.1} value={minFcfCov}
              onChange={e => setMinFcfCov(parseFloat(e.target.value))}
              style={{ cursor: "pointer" }} />
          </div>

          {/* Streak min slider */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 110 }}>
            <label style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
              Streak min: <strong style={{ color: "var(--text-primary)" }}>{minStreak} yr</strong>
            </label>
            <input type="range" min={0} max={50} step={1} value={minStreak}
              onChange={e => setMinStreak(parseInt(e.target.value, 10))}
              style={{ cursor: "pointer" }} />
          </div>

          <button
            onClick={() => runScan()}
            disabled={loading}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--green)", background: "rgba(48,209,88,.06)", color: "var(--green)", fontSize: 11, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "var(--fm)", alignSelf: "flex-end", marginBottom: 2 }}
          >
            Aplicar
          </button>
        </div>

        {/* Client-side secondary filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", fontWeight: 700, letterSpacing: .5 }}>FILTROS (cliente)</div>

          <input
            type="text"
            placeholder="Buscar ticker / empresa / sector..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ padding: "6px 10px", background: "var(--subtle-border)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: 11, outline: "none", fontFamily: "var(--fm)", width: 200 }}
          />

          <select
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            style={{ padding: "6px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: 11, fontFamily: "var(--fm)" }}
          >
            <option value="">Todos sectores</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", cursor: "pointer" }}>
            <input type="checkbox" checked={excludePortfolio} onChange={e => setExcludePortfolio(e.target.checked)} style={{ cursor: "pointer" }} />
            Excluir cartera
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ cursor: "pointer" }} />
            Solo NUEVO
          </label>

          {filtered.length > 0 && (
            <button
              onClick={() => exportCsv(filtered)}
              style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--fm)" }}
            >
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,69,58,.07)", border: "1px solid rgba(255,69,58,.2)", color: "var(--red)", fontSize: 12, fontFamily: "var(--fm)" }}>
          Error: {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, fontFamily: "var(--fm)" }}>
          <div style={{ marginBottom: 8, fontSize: 22 }}>Escaneando universo de dividendos...</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>FMP fetch + calculo de scores. Puede tardar 15-30s si el cache esta frio.</div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && data && filtered.length === 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8, color: "var(--text-secondary)" }}>
            {candidates.length === 0 ? "Sin resultados" : "Ninguno pasa los filtros actuales"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
            Intenta reducir minYield, minDgr5y, o minStreak.
          </div>
        </div>
      )}

      {/* ── Column header ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 14px", fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", fontWeight: 700, letterSpacing: .5 }}>
          <div style={{ minWidth: 22 }}>#</div>
          <div style={{ flex: 1 }}>TICKER / EMPRESA</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ minWidth: 52, textAlign: "center" }}>YIELD</div>
            <div style={{ minWidth: 52, textAlign: "center" }}>DGR 5Y</div>
            <div style={{ minWidth: 52, textAlign: "center" }}>DGR 10Y</div>
            <div style={{ minWidth: 52, textAlign: "center" }}>PAYOUT FCF</div>
            <div style={{ minWidth: 52, textAlign: "center" }}>STREAK</div>
            <div style={{ minWidth: 52, textAlign: "center" }}>FCF COV</div>
          </div>
          <div style={{ minWidth: 34, textAlign: "center" }}>SCORE</div>
          <div style={{ minWidth: 32 }}></div>
        </div>
      )}

      {/* ── Candidate rows ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((m, i) => (
            <CandidateRow
              key={m.ticker}
              m={m}
              rank={i + 1}
              isTop10={i < 10}
              onAnalyze={openAnalysis}
            />
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      {!loading && data && (
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", padding: "4px 0 10px", textAlign: "center" }}>
          Universo: {data.scanned} tickers (cartera + watchlist + Aristocrats S&P 500).
          Score = yield(2pts) + DGR5Y(3pts) + payout(2pts) + streak(1.5pts) + FCFcov(1.5pts).
          Cache 24h por ticker.
        </div>
      )}
    </div>
  );
}
