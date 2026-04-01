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

export default function BubbleView({ positions, openAnalysis, hide }) {
  const [hovered, setHovered] = useState(null);

  const { bubbles, xMin, xMax, yMin, yMax, W, H, sectors } = useMemo(() => {
    const W = 900, H = 550;
    const PAD = 60;

    const data = positions.map(p => ({
      ...p,
      yieldVal: p.divYieldTTM || p.divYield || 0,
      pnlVal: (p.pnlPct || 0) * 100,
      weightVal: (p.weight || 0) * 100,
    }));

    let xMin = 0, xMax = Math.max(...data.map(d => d.yieldVal), 8);
    let yMin = Math.min(...data.map(d => d.pnlVal), -30);
    let yMax = Math.max(...data.map(d => d.pnlVal), 30);

    // Add some padding
    xMax = xMax * 1.15;
    yMin = yMin * 1.15;
    yMax = yMax * 1.15;

    const maxWeight = Math.max(...data.map(d => d.weightVal), 1);

    const toX = v => PAD + ((v - xMin) / (xMax - xMin)) * (W - PAD * 2);
    const toY = v => PAD + ((yMax - v) / (yMax - yMin)) * (H - PAD * 2);

    const bubbles = data.map(p => ({
      ...p,
      cx: toX(p.yieldVal),
      cy: toY(p.pnlVal),
      r: Math.max(6, Math.min(35, (p.weightVal / maxWeight) * 35)),
      color: getSectorColor(p.sector),
    }));

    const sectorSet = {};
    data.forEach(d => { if (d.sector) sectorSet[d.sector] = getSectorColor(d.sector); });
    const sectors = Object.entries(sectorSet);

    return { bubbles, xMin, xMax, yMin, yMax, W, H, sectors };
  }, [positions]);

  const PAD = 60;
  const toX = v => PAD + ((v - xMin) / (xMax - xMin)) * (W - PAD * 2);
  const toY = v => PAD + ((yMax - v) / (yMax - yMin)) * (H - PAD * 2);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ borderRadius: 12, background: "var(--card)", border: "1px solid var(--border)", display: "block" }}>
        {/* Grid lines */}
        {[0, 2, 4, 6, 8, 10, 12].filter(v => v <= xMax).map(v => (
          <line key={"xg" + v} x1={toX(v)} y1={PAD} x2={toX(v)} y2={H - PAD} stroke="var(--subtle-border)" strokeWidth={1} />
        ))}
        {[-40, -20, 0, 20, 40, 60, 80, 100].filter(v => v >= yMin && v <= yMax).map(v => (
          <line key={"yg" + v} x1={PAD} y1={toY(v)} x2={W - PAD} y2={toY(v)} stroke={v === 0 ? "var(--border-hover)" : "var(--subtle-border)"} strokeWidth={v === 0 ? 1.5 : 1} />
        ))}

        {/* Axes */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border-hover)" strokeWidth={1} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--border-hover)" strokeWidth={1} />

        {/* Axis labels */}
        <text x={W / 2} y={H - 10} textAnchor="middle" fill="var(--text-tertiary)" fontSize={10} fontFamily="var(--fm)">Dividend Yield %</text>
        <text x={14} y={H / 2} textAnchor="middle" fill="var(--text-tertiary)" fontSize={10} fontFamily="var(--fm)" transform={`rotate(-90,14,${H / 2})`}>P&L %</text>

        {/* X ticks */}
        {[0, 2, 4, 6, 8, 10, 12].filter(v => v <= xMax).map(v => (
          <text key={"xt" + v} x={toX(v)} y={H - PAD + 14} textAnchor="middle" fill="var(--text-tertiary)" fontSize={9} fontFamily="var(--fm)">{v}%</text>
        ))}
        {/* Y ticks */}
        {[-40, -20, 0, 20, 40, 60, 80, 100].filter(v => v >= yMin && v <= yMax).map(v => (
          <text key={"yt" + v} x={PAD - 6} y={toY(v) + 3} textAnchor="end" fill="var(--text-tertiary)" fontSize={9} fontFamily="var(--fm)">{v}%</text>
        ))}

        {/* Quadrant labels */}
        <text x={W - PAD - 10} y={PAD + 16} textAnchor="end" fill="rgba(74,222,128,.25)" fontSize={9} fontWeight={700} fontFamily="var(--fm)">Alto Yield + Ganancia</text>
        <text x={PAD + 10} y={PAD + 16} textAnchor="start" fill="rgba(74,222,128,.15)" fontSize={9} fontWeight={700} fontFamily="var(--fm)">Bajo Yield + Ganancia</text>
        <text x={W - PAD - 10} y={H - PAD - 8} textAnchor="end" fill="rgba(248,113,113,.2)" fontSize={9} fontWeight={700} fontFamily="var(--fm)">Alto Yield + Perdida</text>
        <text x={PAD + 10} y={H - PAD - 8} textAnchor="start" fill="rgba(248,113,113,.12)" fontSize={9} fontWeight={700} fontFamily="var(--fm)">Bajo Yield + Perdida</text>

        {/* Zero line for Y */}
        {yMin < 0 && yMax > 0 && (
          <line x1={PAD} y1={toY(0)} x2={W - PAD} y2={toY(0)} stroke="rgba(200,164,78,.2)" strokeWidth={1} strokeDasharray="4,4" />
        )}

        {/* Bubbles */}
        {bubbles.map((b, i) => {
          const isHov = hovered === b.ticker;
          return (
            <g key={b.ticker} style={{ cursor: "pointer" }}
              onClick={() => openAnalysis(b.ticker)}
              onMouseEnter={() => setHovered(b.ticker)}
              onMouseLeave={() => setHovered(null)}>
              <circle cx={b.cx} cy={b.cy} r={isHov ? b.r * 1.15 : b.r}
                fill={b.color} opacity={isHov ? 0.9 : 0.55}
                stroke={isHov ? "#fff" : b.color} strokeWidth={isHov ? 2 : 1} />
              {b.r > 12 && (
                <text x={b.cx} y={b.cy + 1} textAnchor="middle" dominantBaseline="middle"
                  fill="#fff" fontSize={b.r > 20 ? 10 : 8} fontWeight={700} fontFamily="var(--fm)"
                  style={{ pointerEvents: "none" }}>
                  {b.ticker}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, padding: "0 4px" }}>
        {sectors.map(([sec, color]) => (
          <div key={sec} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontFamily: "var(--fm)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", opacity: .7 }} />
            <span style={{ color: "var(--text-tertiary)" }}>{sec}</span>
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hovered && (() => {
        const p = positions.find(x => x.ticker === hovered);
        if (!p) return null;
        return (
          <div style={{
            position: "absolute", top: 8, left: 8,
            background: "rgba(13,17,23,.95)", border: "1px solid var(--gold)", borderRadius: 10,
            padding: "10px 14px", zIndex: 10, minWidth: 160,
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--gold)", fontFamily: "var(--fm)" }}>{p.ticker}</div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontSize: 10, fontFamily: "var(--fm)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span>Yield: <b style={{ color: "var(--gold)" }}>{_sf(p.divYieldTTM || p.divYield || 0, 2)}%</b></span>
              <span>P&L: <b style={{ color: (p.pnlPct || 0) >= 0 ? "var(--green)" : "var(--red)" }}>{((p.pnlPct || 0) * 100) >= 0 ? "+" : ""}{_sf((p.pnlPct || 0) * 100, 1)}%</b></span>
              <span>Peso: <b>{_sf((p.weight || 0) * 100, 1)}%</b></span>
              <span>Valor: <b>{hide("$" + fDol(p.valueUSD || 0))}</b></span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
