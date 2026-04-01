import { useMemo, useState } from 'react';
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

const getSectorColor = (sector) => SECTOR_COLORS[sector] || "#6b7280";

export default function SectorView({ positions, openAnalysis, hide }) {
  const [expanded, setExpanded] = useState({});

  const sectors = useMemo(() => {
    const map = {};
    positions.forEach(p => {
      const sec = p.sector || "Otro";
      if (!map[sec]) map[sec] = { positions: [], totalValue: 0, totalCost: 0, totalDiv: 0 };
      map[sec].positions.push(p);
      map[sec].totalValue += p.valueUSD || 0;
      map[sec].totalCost += p.costTotalUSD || 0;
      map[sec].totalDiv += (p.divTTM || 0) * (p.shares || 0);
    });

    const totalPortValue = positions.reduce((s, p) => s + (p.valueUSD || 0), 0) || 1;

    return Object.entries(map)
      .map(([sec, data]) => ({
        sec,
        color: getSectorColor(sec),
        count: data.positions.length,
        totalValue: data.totalValue,
        weight: data.totalValue / totalPortValue,
        pnl: data.totalCost > 0 ? (data.totalValue - data.totalCost) / data.totalCost : 0,
        avgYield: data.positions.reduce((s, p) => s + (p.divYieldTTM || p.divYield || 0), 0) / (data.positions.length || 1),
        totalDiv: data.totalDiv,
        positions: data.positions.sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0)),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [positions]);

  // Donut SVG
  const donutSegments = useMemo(() => {
    const segs = [];
    let cumAngle = 0;
    const total = sectors.reduce((s, sec) => s + sec.totalValue, 0) || 1;
    sectors.forEach(sec => {
      const pct = sec.totalValue / total;
      const angle = pct * 360;
      const startAngle = cumAngle;
      const endAngle = cumAngle + angle;
      const largeArc = angle > 180 ? 1 : 0;
      const r = 90, ir = 55;
      const cx = 120, cy = 120;
      const toRad = a => (a - 90) * Math.PI / 180;
      const ox1 = cx + r * Math.cos(toRad(startAngle));
      const oy1 = cy + r * Math.sin(toRad(startAngle));
      const ox2 = cx + r * Math.cos(toRad(endAngle - 0.3));
      const oy2 = cy + r * Math.sin(toRad(endAngle - 0.3));
      const ix1 = cx + ir * Math.cos(toRad(endAngle - 0.3));
      const iy1 = cy + ir * Math.sin(toRad(endAngle - 0.3));
      const ix2 = cx + ir * Math.cos(toRad(startAngle));
      const iy2 = cy + ir * Math.sin(toRad(startAngle));
      segs.push({
        sec: sec.sec, pct, color: sec.color,
        d: `M ${ox1} ${oy1} A ${r} ${r} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`,
      });
      cumAngle = endAngle;
    });
    return segs;
  }, [sectors]);

  const toggle = sec => setExpanded(prev => ({ ...prev, [sec]: !prev[sec] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Donut + Legend */}
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", padding: "10px 0" }}>
        <svg viewBox="0 0 240 240" width={200} height={200}>
          {donutSegments.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} opacity={0.85} stroke="var(--bg)" strokeWidth={2} style={{ cursor: "pointer", transition: "opacity .15s" }}
              onMouseEnter={e => e.target.style.opacity = 1}
              onMouseLeave={e => e.target.style.opacity = 0.85}
              onClick={() => toggle(s.sec)}>
              <title>{s.sec}: {_sf(s.pct * 100, 1)}%</title>
            </path>
          ))}
          <circle cx={120} cy={120} r={50} fill="var(--bg)" />
          <text x={120} y={112} textAnchor="middle" fill="var(--text-tertiary)" fontSize={9} fontFamily="var(--fm)">Sectores</text>
          <text x={120} y={128} textAnchor="middle" fill="var(--gold)" fontSize={18} fontWeight={800} fontFamily="var(--fm)">{sectors.length}</text>
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
          {sectors.map(sec => (
            <div key={sec.sec} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "var(--fm)", cursor: "pointer", padding: "3px 0" }}
              onClick={() => toggle(sec.sec)}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: sec.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--text-primary)", fontWeight: 600, minWidth: 120 }}>{sec.sec}</span>
              <span style={{ color: "var(--text-tertiary)" }}>{sec.count} pos</span>
              <span style={{ color: "var(--gold)", fontWeight: 700 }}>{_sf(sec.weight * 100, 1)}%</span>
              <span style={{ color: sec.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{sec.pnl >= 0 ? "+" : ""}{_sf(sec.pnl * 100, 1)}%</span>
              <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 12 }}>{expanded[sec.sec] ? "▾" : "▸"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sector accordions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sectors.map(sec => (
          <div key={sec.sec} style={{ background: "var(--card)", border: `1px solid ${expanded[sec.sec] ? sec.color + "40" : "var(--border)"}`, borderRadius: 10, overflow: "hidden", transition: "border-color .2s" }}>
            {/* Header */}
            <div onClick={() => toggle(sec.sec)} style={{
              display: "grid", gridTemplateColumns: "14px 1fr 60px 60px 55px 55px 55px 20px",
              gap: 8, padding: "10px 12px", cursor: "pointer", alignItems: "center",
              background: expanded[sec.sec] ? `${sec.color}08` : "transparent",
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${sec.color}0a`}
            onMouseLeave={e => e.currentTarget.style.background = expanded[sec.sec] ? `${sec.color}08` : "transparent"}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: sec.color }} />
              <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>{sec.sec} <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 400 }}>({sec.count})</span></span>
              <span style={{ textAlign: "right", fontSize: 10, color: "var(--gold)", fontWeight: 700, fontFamily: "var(--fm)" }}>{_sf(sec.weight * 100, 1)}%</span>
              <span style={{ textAlign: "right", fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fm)" }}>{hide("$" + fDol(sec.totalValue))}</span>
              <span style={{ textAlign: "right", fontSize: 10, color: sec.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600, fontFamily: "var(--fm)" }}>{sec.pnl >= 0 ? "+" : ""}{_sf(sec.pnl * 100, 1)}%</span>
              <span style={{ textAlign: "right", fontSize: 10, color: "var(--gold)", fontFamily: "var(--fm)" }}>{_sf(sec.avgYield, 1)}%</span>
              <span style={{ textAlign: "right", fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fm)" }}>{hide("$" + fDol(sec.totalDiv))}</span>
              <span style={{ textAlign: "right", fontSize: 12, color: "var(--text-tertiary)" }}>{expanded[sec.sec] ? "▾" : "▸"}</span>
            </div>

            {/* Expanded positions */}
            {expanded[sec.sec] && (
              <div style={{ borderTop: `1px solid ${sec.color}20`, padding: "4px 0" }}>
                {/* Sub-header */}
                <div style={{ display: "grid", gridTemplateColumns: "24px 60px 1fr 60px 55px 55px 55px 50px", gap: 4, padding: "2px 12px" }}>
                  {["", "TICKER", "EMPRESA", "PRECIO", "PESO", "P&L", "YIELD", "VALOR"].map((h, i) => (
                    <div key={i} style={{ fontSize: 7, color: "var(--text-tertiary)", fontFamily: "var(--fm)", textAlign: i >= 3 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
                {sec.positions.map(p => {
                  const pnl = (p.pnlPct || 0) * 100;
                  return (
                    <div key={p.ticker} onClick={() => openAnalysis(p.ticker)}
                      style={{ display: "grid", gridTemplateColumns: "24px 60px 1fr 60px 55px 55px 55px 50px", gap: 4, padding: "5px 12px", cursor: "pointer", borderRadius: 6, transition: "background .15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(200,164,78,.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <img src={`https://assets.parqet.com/logos/symbol/${p.ticker}?format=jpg`} alt="" width={18} height={18} style={{ borderRadius: 4, background: "#1a1a2e" }} onError={e => { e.target.style.display = "none"; }} />
                      <span style={{ fontWeight: 700, fontSize: 10, color: "var(--gold)", fontFamily: "var(--fm)", display: "flex", alignItems: "center" }}>{p.ticker}</span>
                      <span style={{ fontSize: 9, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{p.name || p.ticker}</span>
                      <span style={{ textAlign: "right", fontSize: 10, color: "var(--text-primary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>${_sf(p.lastPrice || 0, 2)}</span>
                      <span style={{ textAlign: "right", fontSize: 10, color: "var(--text-secondary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{_sf((p.weight || 0) * 100, 1)}%</span>
                      <span style={{ textAlign: "right", fontSize: 10, color: pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600, fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{pnl >= 0 ? "+" : ""}{_sf(pnl, 1)}%</span>
                      <span style={{ textAlign: "right", fontSize: 10, color: "var(--gold)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{_sf(p.divYieldTTM || p.divYield || 0, 1)}%</span>
                      <span style={{ textAlign: "right", fontSize: 10, color: "var(--text-primary)", fontFamily: "var(--fm)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{hide("$" + fDol(p.valueUSD || 0))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
