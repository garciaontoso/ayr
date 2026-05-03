import { useState, useEffect } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters';
import { API_URL } from '../../constants/index.js';

const VERDICT_COLORS = { STRONG_BUY:"#30d158", BUY:"#30d158", ACCUMULATE:"#34c759", HOLD:"var(--gold)", TRIM:"#ff9f0a", SELL:"#ff453a", EXIT:"#ff453a", AVOID:"#ff453a" };

export default function PeerCompareTab() {
  const { POS_STATIC, openAnalysis } = useHome();
  const [ddData, setDdData] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch Deep Dividend scores
  useEffect(() => {
    fetch(`${API_URL}/api/deep-dividend/list`)
      .then(r => r.json())
      .then(d => {
        // Dedupe: keep latest per ticker
        const byTicker = {};
        for (const r of (d.rows || [])) {
          if (!byTicker[r.ticker] || r.id > byTicker[r.ticker].id) byTicker[r.ticker] = r;
        }
        setDdData(Object.values(byTicker));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tickers = Object.keys(POS_STATIC || {}).sort();
  const ddMap = {};
  ddData.forEach(d => { ddMap[d.ticker] = d; });

  const filteredTickers = search
    ? tickers.filter(t => t.toLowerCase().includes(search.toLowerCase()))
    : tickers;

  const toggle = (t) => {
    setSelected(prev => prev.includes(t) ? prev.filter(x => x !== t) : prev.length >= 5 ? prev : [...prev, t]);
  };

  const metrics = [
    { k: "composite_score", l: "Composite", fmt: v => v ? _sf(v, 1) + "/10" : "—", best: "max" },
    { k: "safety_score", l: "Safety", fmt: v => v ? v + "/10" : "—", best: "max" },
    { k: "growth_score", l: "Growth", fmt: v => v ? v + "/10" : "—", best: "max" },
    { k: "honesty_score", l: "Honesty", fmt: v => v ? v + "/10" : "—", best: "max" },
    { k: "verdict", l: "Verdict", fmt: v => v || "—", best: null },
    { k: "confidence", l: "Confianza", fmt: v => v || "—", best: null },
    { k: "red_flags_count", l: "Red Flags", fmt: v => v != null ? v : "—", best: "min" },
    { k: "green_flags_count", l: "Green Flags", fmt: v => v != null ? v : "—", best: "max" },
  ];

  const getBestWorst = (metric, values) => {
    const nums = values.map((v, i) => ({ v: parseFloat(v) || 0, i })).filter(x => x.v > 0);
    if (!nums.length || !metric.best) return { best: -1, worst: -1 };
    nums.sort((a, b) => a.v - b.v);
    return {
      best: metric.best === "max" ? nums[nums.length - 1].i : nums[0].i,
      worst: metric.best === "max" ? nums[0].i : nums[nums.length - 1].i,
    };
  };

  const sH = { fontFamily: "var(--fd)", color: "var(--gold)" };
  const sCard = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ ...sCard, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, ...sH }}>⚖️ Comparar Empresas</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
          Selecciona 2-5 empresas ({selected.length}/5)
        </span>
        {selected.length > 0 && (
          <button onClick={() => setSelected([])}
            style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 9, cursor: "pointer", fontFamily: "var(--fm)" }}>
            ✕ Limpiar
          </button>
        )}
        <input
          type="text" placeholder="Buscar ticker..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: "auto", width: 120, padding: "5px 8px", background: "var(--subtle-border)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 10, fontFamily: "var(--fm)" }}
        />
      </div>

      {/* Ticker chips */}
      <div style={{ ...sCard, display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 120, overflowY: "auto" }}>
        {loading ? (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Cargando...</span>
        ) : filteredTickers.map(t => {
          const isSel = selected.includes(t);
          const dd = ddMap[t];
          const hasDd = !!dd;
          return (
            <button key={t} onClick={() => toggle(t)}
              style={{
                padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: "var(--fm)", cursor: "pointer",
                border: `1px solid ${isSel ? "var(--gold)" : hasDd ? "var(--border)" : "rgba(100,100,100,.2)"}`,
                background: isSel ? "var(--gold-dim)" : "transparent",
                color: isSel ? "var(--gold)" : hasDd ? "var(--text-secondary)" : "var(--text-tertiary)",
                opacity: hasDd ? 1 : 0.5,
              }}>
              {t} {dd ? `${_sf(dd.composite_score, 1)}` : ""}
            </button>
          );
        })}
      </div>

      {/* Comparison Table */}
      {selected.length >= 2 && (
        <div style={{ ...sCard, overflowX: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 600, ...sH, marginBottom: 10 }}>Comparativa</div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>MÉTRICA</th>
                {selected.map(t => (
                  <th key={t} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)", textAlign: "center", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => openAnalysis && openAnalysis(t)}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const values = selected.map(t => ddMap[t]?.[m.k]);
                const { best, worst } = getBestWorst(m, values);
                return (
                  <tr key={m.k}>
                    <td style={{ padding: "5px 8px", fontSize: 9, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--fm)", borderBottom: "1px solid var(--subtle-bg)" }}>{m.l}</td>
                    {values.map((v, i) => {
                      const isVerdict = m.k === "verdict";
                      const color = isVerdict ? (VERDICT_COLORS[v] || "var(--text-primary)")
                        : i === best ? "var(--green)" : i === worst ? "var(--red)" : "var(--text-primary)";
                      return (
                        <td key={i} style={{ padding: "5px 8px", fontSize: 11, fontWeight: 700, fontFamily: "var(--fm)", textAlign: "center", borderBottom: "1px solid var(--subtle-bg)", color }}>
                          {m.fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Visual Bars */}
      {selected.length >= 2 && (
        <div style={{ ...sCard }}>
          <div style={{ fontSize: 12, fontWeight: 600, ...sH, marginBottom: 10 }}>Scores Visuales</div>
          {["safety_score", "growth_score", "composite_score"].map(scoreKey => {
            const label = scoreKey === "safety_score" ? "Safety" : scoreKey === "growth_score" ? "Growth" : "Composite";
            const maxVal = 10;
            return (
              <div key={scoreKey} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 4 }}>{label}</div>
                {selected.map(t => {
                  const val = ddMap[t]?.[scoreKey] || 0;
                  const pct = (val / maxVal) * 100;
                  return (
                    <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ width: 55, fontSize: 9, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--fm)", textAlign: "right" }}>{t}</span>
                      <div style={{ flex: 1, height: 14, background: "var(--subtle-bg)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%", borderRadius: 4,
                          background: val >= 8 ? "var(--green)" : val >= 6 ? "var(--gold)" : val >= 4 ? "var(--orange)" : "var(--red)",
                          transition: "width .3s",
                        }} />
                      </div>
                      <span style={{ width: 30, fontSize: 9, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>{_sf(val, 1)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {selected.length < 2 && (
        <div style={{ ...sCard, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚖️</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--fd)" }}>Selecciona al menos 2 empresas</div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 4 }}>
            Haz click en los tickers de arriba para comparar scores, verdicts y métricas lado a lado
          </div>
        </div>
      )}
    </div>
  );
}
