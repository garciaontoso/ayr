import { useMemo } from 'react';
import { _sf, fDol } from '../../../utils/formatters.js';

const SECTOR_COLORS = {
  "Technology":"#3b82f6","Information Technology":"#3b82f6","Tech":"#3b82f6",
  "Real Estate":"#a855f7","REIT":"#a855f7",
  "Financial Services":"#22c55e","Financials":"#22c55e","Finance":"#22c55e",
  "Healthcare":"#06b6d4",
  "Consumer Cyclical":"#f97316","Consumer Defensive":"#fb923c","Consumer Staples":"#fb923c","Consumer Discretionary":"#f97316",
  "Energy":"#ef4444",
  "Industrials":"#eab308",
  "Communication Services":"#ec4899","Communication":"#ec4899",
  "Utilities":"#14b8a6",
  "Basic Materials":"#a78bfa","Materials":"#a78bfa",
};

function yieldColor(y) {
  if (y >= 4) return "#4ade80";
  if (y >= 2) return "var(--gold)";
  return "#6b7280";
}

export default function DividendView({ positions, openAnalysis, hide, POS_STATIC }) {
  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => {
      const ya = (a.divYieldTTM || a.divYield || 0);
      const yb = (b.divYieldTTM || b.divYield || 0);
      return yb - ya;
    });
  }, [positions]);

  const stats = useMemo(() => {
    let totalIncome = 0, totalYield = 0, totalYoc = 0, yieldCount = 0;
    let highest = null;
    positions.forEach(p => {
      const income = (p.divTTM || 0) * (p.shares || 0);
      totalIncome += income;
      const y = p.divYieldTTM || p.divYield || 0;
      if (y > 0) { totalYield += y; yieldCount++; }
      const yoc = p.yoc || 0;
      if (yoc > 0) totalYoc += yoc;
      if (!highest || y > (highest.divYieldTTM || highest.divYield || 0)) highest = p;
    });
    return {
      totalIncome,
      avgYield: yieldCount > 0 ? totalYield / yieldCount : 0,
      avgYoc: yieldCount > 0 ? totalYoc / yieldCount : 0,
      highest,
    };
  }, [positions]);

  // Sector income breakdown for donut
  const sectorIncome = useMemo(() => {
    const map = {};
    positions.forEach(p => {
      const sec = p.sector || "Otro";
      const income = (p.divTTM || 0) * (p.shares || 0);
      if (income > 0) map[sec] = (map[sec] || 0) + income;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [positions]);

  const totalSectorIncome = sectorIncome.reduce((s, [, v]) => s + v, 0) || 1;

  // Build donut SVG
  const donutSegments = useMemo(() => {
    const segs = [];
    let cumAngle = 0;
    sectorIncome.forEach(([sec, val]) => {
      const pct = val / totalSectorIncome;
      const angle = pct * 360;
      const startAngle = cumAngle;
      const endAngle = cumAngle + angle;
      const largeArc = angle > 180 ? 1 : 0;
      const r = 40;
      const cx = 50, cy = 50;
      const toRad = a => (a - 90) * Math.PI / 180;
      const x1 = cx + r * Math.cos(toRad(startAngle));
      const y1 = cy + r * Math.sin(toRad(startAngle));
      const x2 = cx + r * Math.cos(toRad(endAngle - 0.5));
      const y2 = cy + r * Math.sin(toRad(endAngle - 0.5));
      segs.push({ sec, val, pct, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: SECTOR_COLORS[sec] || "#6b7280" });
      cumAngle = endAngle;
    });
    return segs;
  }, [sectorIncome, totalSectorIncome]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 16, padding: "10px 14px", background: "linear-gradient(135deg, rgba(200,164,78,.06), rgba(200,164,78,.02))", border: "1px solid rgba(200,164,78,.15)", borderRadius: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>Ingreso Anual</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--gold)", fontFamily: "var(--fm)" }}>{hide("$" + fDol(stats.totalIncome))}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>Yield Promedio</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: yieldColor(stats.avgYield), fontFamily: "var(--fm)" }}>{_sf(stats.avgYield, 2)}%</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>YOC Promedio</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--gold)", fontFamily: "var(--fm)" }}>{_sf(stats.avgYoc * 100, 2)}%</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>Top Yield</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", fontFamily: "var(--fm)" }}>{stats.highest?.ticker || "—"} ({_sf(stats.highest?.divYieldTTM || stats.highest?.divYield || 0, 1)}%)</span>
        </div>
        {/* Mini donut */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <svg viewBox="0 0 100 100" width={60} height={60}>
            {donutSegments.map((s, i) => (
              <path key={i} d={s.d} fill={s.color} opacity={0.85} stroke="var(--bg)" strokeWidth={1}>
                <title>{s.sec}: ${fDol(s.val)} ({_sf(s.pct * 100, 0)}%)</title>
              </path>
            ))}
            <circle cx={50} cy={50} r={20} fill="var(--bg)" />
            <text x={50} y={48} textAnchor="middle" fill="var(--gold)" fontSize={8} fontWeight={700} fontFamily="var(--fm)">$/mes</text>
            <text x={50} y={58} textAnchor="middle" fill="var(--text-primary)" fontSize={9} fontWeight={800} fontFamily="var(--fm)">{hide("$" + fDol(stats.totalIncome / 12))}</text>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sectorIncome.slice(0, 5).map(([sec, val]) => (
              <div key={sec} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, fontFamily: "var(--fm)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: SECTOR_COLORS[sec] || "#6b7280", display: "inline-block" }} />
                <span style={{ color: "var(--text-tertiary)" }}>{sec.slice(0, 12)}</span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{_sf((val / totalSectorIncome) * 100, 0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "28px 58px 1fr 52px 48px 48px 65px 58px 55px 60px", gap: 4, padding: "0 8px", alignItems: "center" }}>
        {["", "TICKER", "EMPRESA", "YIELD%", "YOC%", "DPS", "ING. ANUAL", "ING./MES", "PAYOUT", "STREAK"].map((h, i) => (
          <div key={i} style={{ fontSize: 7, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: .5, textAlign: i >= 3 ? "right" : "left" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sorted.map(p => {
          const yld = p.divYieldTTM || p.divYield || 0;
          const yoc = (p.yoc || 0) * 100;
          const dps = p.divTTM ? (p.divTTM / (p.dpsFreq || 4)) : (p.dps || 0);
          const annualIncome = (p.divTTM || 0) * (p.shares || 0);
          const monthlyIncome = annualIncome / 12;
          const st = POS_STATIC?.[p.ticker] || {};
          const payout = st.po || p.payoutRatio || 0;
          const streak = p.divStreaks || st.ds || 0;
          const yc = yieldColor(yld);

          return (
            <div key={p.ticker} onClick={() => openAnalysis(p.ticker)} style={{
              display: "grid", gridTemplateColumns: "28px 58px 1fr 52px 48px 48px 65px 58px 55px 60px", gap: 4,
              padding: "6px 8px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,.01)",
              borderLeft: `3px solid ${yc}`,
              transition: "all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,164,78,.05)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.01)"; }}>
              {/* Logo */}
              <div style={{ display: "flex", alignItems: "center" }}>
                <img src={`https://assets.parqet.com/logos/symbol/${p.ticker}?format=jpg`} alt="" width={22} height={22} style={{ borderRadius: 6, background: "#1a1a2e" }} onError={e => { e.target.style.display = "none"; }} />
              </div>
              {/* Ticker */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "var(--gold)", fontFamily: "var(--fm)", display: "flex", alignItems: "center" }}>{p.ticker}</div>
              {/* Name */}
              <div style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{p.name || p.ticker}</div>
              {/* Yield */}
              <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: yc, fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{_sf(yld, 2)}%</div>
              {/* YOC */}
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--gold)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{yoc > 0 ? _sf(yoc, 1) + "%" : "—"}</div>
              {/* DPS */}
              <div style={{ textAlign: "right", fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>${_sf(p.divTTM || 0, 2)}</div>
              {/* Annual income */}
              <div style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: annualIncome > 0 ? "var(--green)" : "var(--text-tertiary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{hide("$" + fDol(annualIncome))}</div>
              {/* Monthly */}
              <div style={{ textAlign: "right", fontSize: 10, color: monthlyIncome > 0 ? "var(--green)" : "var(--text-tertiary)", fontFamily: "var(--fm)", opacity: .7, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{hide("$" + _sf(monthlyIncome, 0))}</div>
              {/* Payout */}
              <div style={{ textAlign: "right", fontSize: 10, color: payout > 80 ? "var(--red)" : payout > 60 ? "var(--gold)" : "var(--text-secondary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{payout > 0 ? _sf(payout, 0) + "%" : "—"}</div>
              {/* Streak */}
              <div style={{ textAlign: "right", fontSize: 10, fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                {streak >= 25 ? <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "rgba(200,164,78,.15)", color: "var(--gold)", fontWeight: 700 }}>ARISTOCRAT</span> : streak >= 10 ? <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "rgba(74,222,128,.1)", color: "#4ade80", fontWeight: 600 }}>{streak}y</span> : streak > 0 ? <span style={{ color: "var(--text-tertiary)" }}>{streak}y</span> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
