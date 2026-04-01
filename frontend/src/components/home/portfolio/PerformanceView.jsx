import { useMemo } from 'react';
import { _sf, fDol } from '../../../utils/formatters.js';

export default function PerformanceView({ positions, openAnalysis, hide }) {
  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => ((b.pnlPct || 0) * 100) - ((a.pnlPct || 0) * 100));
  }, [positions]);

  const stats = useMemo(() => {
    if (!sorted.length) return { best: null, worst: null, avgReturn: 0 };
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const avg = sorted.reduce((s, p) => s + (p.pnlPct || 0) * 100, 0) / sorted.length;
    return { best, worst, avgReturn: avg };
  }, [sorted]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Best performer */}
        {stats.best && (
          <div onClick={() => openAnalysis(stats.best.ticker)} style={{
            flex: 1, minWidth: 180, padding: "10px 14px", borderRadius: 10,
            background: "linear-gradient(135deg, rgba(74,222,128,.08), rgba(74,222,128,.02))",
            border: "1px solid rgba(74,222,128,.15)", cursor: "pointer",
          }}>
            <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>Mejor Rendimiento</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <img src={`https://assets.parqet.com/logos/symbol/${stats.best.ticker}?format=jpg`} alt="" width={28} height={28} style={{ borderRadius: 6, background: "#1a1a2e" }} onError={e => { e.target.style.display = "none"; }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--green)", fontFamily: "var(--fm)" }}>{stats.best.ticker}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)", fontFamily: "var(--fm)" }}>+{_sf((stats.best.pnlPct || 0) * 100, 1)}%</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>P&L</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", fontFamily: "var(--fm)" }}>{hide("+" + fDol(stats.best.pnlUSD || 0))}</div>
              </div>
            </div>
          </div>
        )}
        {/* Worst performer */}
        {stats.worst && (
          <div onClick={() => openAnalysis(stats.worst.ticker)} style={{
            flex: 1, minWidth: 180, padding: "10px 14px", borderRadius: 10,
            background: "linear-gradient(135deg, rgba(248,113,113,.08), rgba(248,113,113,.02))",
            border: "1px solid rgba(248,113,113,.15)", cursor: "pointer",
          }}>
            <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>Peor Rendimiento</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <img src={`https://assets.parqet.com/logos/symbol/${stats.worst.ticker}?format=jpg`} alt="" width={28} height={28} style={{ borderRadius: 6, background: "#1a1a2e" }} onError={e => { e.target.style.display = "none"; }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--red)", fontFamily: "var(--fm)" }}>{stats.worst.ticker}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--red)", fontFamily: "var(--fm)" }}>{_sf((stats.worst.pnlPct || 0) * 100, 1)}%</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>P&L</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", fontFamily: "var(--fm)" }}>{hide(fDol(stats.worst.pnlUSD || 0))}</div>
              </div>
            </div>
          </div>
        )}
        {/* Avg return */}
        <div style={{
          flex: 0.6, minWidth: 120, padding: "10px 14px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(200,164,78,.06), transparent)",
          border: "1px solid rgba(200,164,78,.12)",
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          <div style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>Retorno Promedio</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: stats.avgReturn >= 0 ? "var(--green)" : "var(--red)", fontFamily: "var(--fm)", marginTop: 4 }}>
            {stats.avgReturn >= 0 ? "+" : ""}{_sf(stats.avgReturn, 1)}%
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "28px 58px 1fr 65px 70px 60px 55px 120px", gap: 4, padding: "0 8px", alignItems: "center" }}>
        {["", "TICKER", "EMPRESA", "COSTE", "VALOR ACT.", "P&L $", "P&L %", "RANGO 52S"].map((h, i) => (
          <div key={i} style={{ fontSize: 7, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: .5, textAlign: i >= 3 ? "right" : "left" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sorted.map((p, idx) => {
          const pnl = (p.pnlPct || 0) * 100;
          const pnlAbs = p.pnlUSD || 0;
          const isTop3 = idx < 3;
          const isBottom3 = idx >= sorted.length - 3;
          const pnlColor = pnl >= 0 ? "var(--green)" : "var(--red)";

          // 52-week range bar
          const low52 = p.fiftyTwoWeekLow || 0;
          const high52 = p.fiftyTwoWeekHigh || 0;
          const price = p.lastPrice || 0;
          const rangePct = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50;

          const glowColor = isTop3 ? "rgba(74,222,128,.06)" : isBottom3 ? "rgba(248,113,113,.06)" : "transparent";

          return (
            <div key={p.ticker} onClick={() => openAnalysis(p.ticker)} style={{
              display: "grid", gridTemplateColumns: "28px 58px 1fr 65px 70px 60px 55px 120px", gap: 4,
              padding: "6px 8px", borderRadius: 8, cursor: "pointer",
              background: glowColor,
              borderLeft: `3px solid ${pnlColor}`,
              transition: "all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,164,78,.05)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = glowColor; }}>
              {/* Logo */}
              <div style={{ display: "flex", alignItems: "center" }}>
                <img src={`https://assets.parqet.com/logos/symbol/${p.ticker}?format=jpg`} alt="" width={22} height={22} style={{ borderRadius: 6, background: "#1a1a2e" }} onError={e => { e.target.style.display = "none"; }} />
              </div>
              {/* Ticker */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "var(--gold)", fontFamily: "var(--fm)", display: "flex", alignItems: "center" }}>
                {p.ticker}
                {isTop3 && <span style={{ marginLeft: 3, fontSize: 8 }}>&#9650;</span>}
                {isBottom3 && <span style={{ marginLeft: 3, fontSize: 8, color: "var(--red)" }}>&#9660;</span>}
              </div>
              {/* Name */}
              <div style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{p.name || p.ticker}</div>
              {/* Cost */}
              <div style={{ textAlign: "right", fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{hide("$" + fDol(p.costTotalUSD || 0))}</div>
              {/* Current Value */}
              <div style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{hide("$" + fDol(p.valueUSD || 0))}</div>
              {/* P&L $ */}
              <div style={{ textAlign: "right", fontSize: 10, fontWeight: 600, color: pnlColor, fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{hide((pnlAbs >= 0 ? "+" : "") + fDol(pnlAbs))}</div>
              {/* P&L % */}
              <div style={{ textAlign: "right", fontSize: 12, fontWeight: 800, color: pnlColor, fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{pnl >= 0 ? "+" : ""}{_sf(pnl, 1)}%</div>
              {/* 52W Range bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 4 }}>
                <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", minWidth: 25 }}>{low52 > 0 ? _sf(low52, 0) : "—"}</span>
                <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.06)", borderRadius: 3, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(rangePct, 100)}%`, background: `linear-gradient(90deg, var(--red), var(--gold), var(--green))`, borderRadius: 3, opacity: .7 }} />
                  <div style={{ position: "absolute", left: `calc(${Math.min(rangePct, 100)}% - 2px)`, top: -1, width: 4, height: 8, background: "#fff", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", minWidth: 25, textAlign: "right" }}>{high52 > 0 ? _sf(high52, 0) : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
