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

function pnlToColor(pnl) {
  if (pnl > 30) return "#166534";
  if (pnl > 15) return "#15803d";
  if (pnl > 5) return "#1a5c2a";
  if (pnl > 0) return "#1a3d24";
  if (pnl > -5) return "#3d2020";
  if (pnl > -15) return "#7f1d1d";
  return "#991b1b";
}

// Squarified treemap layout algorithm
function squarify(items, x, y, w, h) {
  if (!items.length) return [];
  if (items.length === 1) {
    return [{ ...items[0], x, y, w, h }];
  }

  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const rects = [];

  // Simple slice-and-dice based on aspect ratio
  let remaining = [...items];
  let rx = x, ry = y, rw = w, rh = h;

  while (remaining.length > 0) {
    const isWide = rw >= rh;
    let row = [remaining[0]];
    let rowSum = remaining[0].value;
    let best = Infinity;

    for (let i = 1; i < remaining.length; i++) {
      const testSum = rowSum + remaining[i].value;
      const ratio = isWide
        ? Math.max((rh * rh * remaining[i].value) / (testSum * testSum), (testSum * testSum) / (rh * rh * remaining[i].value))
        : Math.max((rw * rw * remaining[i].value) / (testSum * testSum), (testSum * testSum) / (rw * rw * remaining[i].value));
      const prevRatio = isWide
        ? Math.max((rh * rh * row[row.length - 1].value) / (rowSum * rowSum), (rowSum * rowSum) / (rh * rh * row[row.length - 1].value))
        : Math.max((rw * rw * row[row.length - 1].value) / (rowSum * rowSum), (rowSum * rowSum) / (rw * rw * row[row.length - 1].value));

      if (ratio < prevRatio && row.length < 6) {
        row.push(remaining[i]);
        rowSum += remaining[i].value;
      } else {
        break;
      }
    }

    const rowFraction = rowSum / (remaining.reduce((s, i) => s + i.value, 0) || 1);

    if (isWide) {
      const rowW = rw * rowFraction;
      let cy = ry;
      row.forEach(item => {
        const itemH = rh * (item.value / rowSum);
        rects.push({ ...item, x: rx, y: cy, w: rowW, h: itemH });
        cy += itemH;
      });
      rx += rowW;
      rw -= rowW;
    } else {
      const rowH = rh * rowFraction;
      let cx = rx;
      row.forEach(item => {
        const itemW = rw * (item.value / rowSum);
        rects.push({ ...item, x: cx, y: ry, w: itemW, h: rowH });
        cx += itemW;
      });
      ry += rowH;
      rh -= rowH;
    }

    remaining = remaining.slice(row.length);
  }

  return rects;
}

export default function TreemapView({ positions, openAnalysis, hide }) {
  const [hovered, setHovered] = useState(null);

  // Group by sector, then layout
  const { rects, sectorLabels, totalW, totalH } = useMemo(() => {
    const W = 1000, H = 600;
    const bySecObj = {};
    positions.forEach(p => {
      const sec = p.sector || "Otro";
      if (!bySecObj[sec]) bySecObj[sec] = [];
      bySecObj[sec].push(p);
    });

    const sectors = Object.entries(bySecObj)
      .map(([sec, items]) => ({
        sec,
        totalValue: items.reduce((s, p) => s + (p.valueUSD || 0), 0),
        items: items.sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0)),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    // First layout sectors as blocks
    const sectorItems = sectors.map(s => ({ ...s, value: s.totalValue }));
    const sectorRects = squarify(sectorItems, 0, 0, W, H);

    // Then layout items within each sector
    const allRects = [];
    const labels = [];
    sectorRects.forEach(sr => {
      const padding = 2;
      const headerH = 16;
      const innerX = sr.x + padding;
      const innerY = sr.y + padding + headerH;
      const innerW = sr.w - padding * 2;
      const innerH = sr.h - padding * 2 - headerH;

      labels.push({ sec: sr.sec, x: sr.x + padding + 4, y: sr.y + padding + 11, w: sr.w, color: SECTOR_COLORS[sr.sec] || "#6b7280" });

      if (innerW > 0 && innerH > 0) {
        const itemData = sr.items.map(p => ({ ...p, value: Math.max(p.valueUSD || 0, 1) }));
        const itemRects = squarify(itemData, innerX, innerY, innerW, innerH);
        allRects.push(...itemRects);
      }
    });

    return { rects: allRects, sectorLabels: labels, totalW: W, totalH: H };
  }, [positions]);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" style={{ borderRadius: 12, background: "var(--card)", border: "1px solid var(--border)", display: "block" }}>
        {/* Sector labels */}
        {sectorLabels.map((sl, i) => (
          <text key={i} x={sl.x} y={sl.y} fill={sl.color} fontSize={10} fontWeight={700} fontFamily="var(--fm)" opacity={0.7}>{sl.sec}</text>
        ))}
        {/* Position rectangles */}
        {rects.map((r, i) => {
          const pnl = (r.pnlPct || 0) * 100;
          const bg = pnlToColor(pnl);
          const isLarge = r.w > 60 && r.h > 45;
          const isMedium = r.w > 35 && r.h > 30;
          const isHov = hovered === r.ticker;
          return (
            <g key={r.ticker || i} style={{ cursor: "pointer" }}
              onClick={() => openAnalysis(r.ticker)}
              onMouseEnter={() => setHovered(r.ticker)}
              onMouseLeave={() => setHovered(null)}>
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(r.w - 2, 0)} height={Math.max(r.h - 2, 0)}
                fill={bg} rx={4} ry={4}
                stroke={isHov ? "var(--gold)" : "var(--subtle-bg2)"}
                strokeWidth={isHov ? 2 : 0.5}
                opacity={isHov ? 1 : 0.92} />
              {isMedium && (
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 - (isLarge ? 6 : 0)}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#fff" fontSize={isLarge ? 13 : 10} fontWeight={700} fontFamily="var(--fm)">
                  {r.ticker}
                </text>
              )}
              {isLarge && (
                <>
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 8}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={pnl >= 0 ? "#4ade80" : "#f87171"} fontSize={12} fontWeight={700} fontFamily="var(--fm)">
                    {pnl >= 0 ? "+" : ""}{_sf(pnl, 1)}%
                  </text>
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 22}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="rgba(255,255,255,.4)" fontSize={9} fontFamily="var(--fm)">
                    ${_sf(r.lastPrice || 0, 2)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {/* Hover tooltip */}
      {hovered && (() => {
        const p = positions.find(x => x.ticker === hovered);
        if (!p) return null;
        const pnl = (p.pnlPct || 0) * 100;
        return (
          <div style={{
            position: "absolute", top: 8, right: 8,
            background: "rgba(13,17,23,.95)", border: "1px solid var(--gold)", borderRadius: 10,
            padding: "10px 14px", zIndex: 10, minWidth: 180,
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--gold)", fontFamily: "var(--fm)", marginBottom: 4 }}>{p.ticker}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 6 }}>{p.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px", fontSize: 10, fontFamily: "var(--fm)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Precio</span><span style={{ textAlign: "right", color: "var(--text-primary)" }}>${_sf(p.lastPrice || 0, 2)}</span>
              <span style={{ color: "var(--text-tertiary)" }}>Valor</span><span style={{ textAlign: "right", color: "var(--text-primary)" }}>{hide("$" + fDol(p.valueUSD || 0))}</span>
              <span style={{ color: "var(--text-tertiary)" }}>P&L</span><span style={{ textAlign: "right", color: pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{pnl >= 0 ? "+" : ""}{_sf(pnl, 1)}%</span>
              <span style={{ color: "var(--text-tertiary)" }}>Peso</span><span style={{ textAlign: "right", color: "var(--text-secondary)" }}>{_sf((p.weight || 0) * 100, 1)}%</span>
              <span style={{ color: "var(--text-tertiary)" }}>Yield</span><span style={{ textAlign: "right", color: "var(--gold)" }}>{_sf(p.divYieldTTM || p.divYield || 0, 2)}%</span>
              <span style={{ color: "var(--text-tertiary)" }}>Sector</span><span style={{ textAlign: "right", color: SECTOR_COLORS[p.sector] || "var(--text-secondary)" }}>{p.sector || "—"}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
