import { useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fC as _fC } from '../../utils/formatters';
import { EmptyState } from '../ui/EmptyState.jsx';

/* ═══════════════════════════════════════════════════════════════
   NominaTab — "Mi Nomina" motivational dividend salary view
   ═══════════════════════════════════════════════════════════════ */

const GOLD = "var(--gold)";
const GOLD_DIM = "var(--gold-dim)";
const GREEN = "var(--green)";
const MNAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const blur = (privacyMode) => privacyMode ? { filter: "blur(8px)", userSelect: "none" } : {};

/* ── Section 1: Hero card — "Tu Sueldo Pasivo" ── */
function HeroCard({ annualDiv, displayCcy, privacyMode }) {
  const sym = displayCcy === "EUR" ? "\u20ac" : "$";
  const monthly = annualDiv / 12;
  const daily = annualDiv / 365;
  const hourly = daily / 24;
  const perMin = hourly / 60;

  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(200,164,78,.15) 0%, rgba(148,107,26,.08) 100%)`,
      border: `1px solid rgba(200,164,78,.35)`,
      borderRadius: 18, padding: "28px 32px", textAlign: "center", position: "relative", overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(200,164,78,.06)" }} />
      <div style={{ position: "absolute", bottom: -20, left: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(200,164,78,.04)" }} />

      <div style={{ fontSize: 11, fontWeight: 600, color: GOLD, fontFamily: "var(--fm)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2, opacity: .8 }}>
        Tu Sueldo Pasivo
      </div>
      <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginBottom: 6, opacity: .7 }}>
        neto estimado · 10% WHT (China-US treaty)
      </div>

      <div style={{ ...blur(privacyMode), fontSize: 42, fontWeight: 800, color: GOLD, fontFamily: "var(--fd)", lineHeight: 1.1 }}>
        {sym}{annualDiv >= 1000 ? Math.round(annualDiv).toLocaleString() : _sf(annualDiv, 0)}
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-tertiary)", marginLeft: 6 }}>/ano</span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
        {[
          { label: "Mes", value: monthly },
          { label: "Dia", value: daily },
          { label: "Hora", value: hourly },
          { label: "Minuto", value: perMin },
        ].map(item => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ ...blur(privacyMode), fontSize: item.label === "Minuto" ? 20 : 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fm)" }}>
              {sym}{item.value >= 100 ? Math.round(item.value).toLocaleString() : _sf(item.value, 2)}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)", letterSpacing: .5 }}>
              {item.label === "Minuto" ? "cada minuto" : `/${item.label.toLowerCase()}`}
            </div>
          </div>
        ))}
      </div>

      {/* Animated per-minute counter effect */}
      <div style={{ marginTop: 16, padding: "8px 16px", background: "rgba(200,164,78,.08)", borderRadius: 10, display: "inline-block" }}>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>Mientras duermes, tus inversiones generan </span>
        <span style={{ ...blur(privacyMode), fontSize: 12, fontWeight: 700, color: GREEN, fontFamily: "var(--fm)", animation: "nominaPulse 2s ease-in-out infinite" }}>
          {sym}{_sf(perMin, 3)}/min
        </span>
      </div>
    </div>
  );
}

/* ── Section 2: Expense coverage progress ── */
function CoberturaCard({ monthlyDiv, monthlyExp, privacyMode, sym }) {
  const pct = monthlyExp > 0 ? (monthlyDiv / monthlyExp) * 100 : 0;
  const covered = pct >= 100;
  const diff = Math.abs(monthlyDiv - monthlyExp);

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 22px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)", marginBottom: 10 }}>
        Cobertura de Gastos
      </div>

      <div style={{ ...blur(privacyMode), fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--fm)", marginBottom: 8 }}>
        Tus dividendos cubren <span style={{ fontWeight: 700, color: pct >= 100 ? GREEN : GOLD, fontSize: 14 }}>{_sf(Math.min(pct, 999), 1)}%</span> de tus gastos mensuales
      </div>

      {/* Progress bar */}
      <div style={{ height: 10, background: "var(--subtle-bg2)", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
        <div style={{
          height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 6,
          background: covered ? `linear-gradient(90deg, ${GREEN}, #20a040)` : `linear-gradient(90deg, ${GOLD}, #b8943e)`,
          transition: "width .8s ease-out",
        }} />
      </div>

      <div style={{ ...blur(privacyMode), fontSize: 11, fontWeight: 600, fontFamily: "var(--fm)", color: covered ? GREEN : "var(--text-tertiary)" }}>
        {covered
          ? `Cubres gastos + ${sym}${Math.round(diff).toLocaleString()} extra/mes`
          : `Faltan ${sym}${Math.round(diff).toLocaleString()}/mes para cubrir gastos`
        }
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
        <span>Dividendos: <span style={{ ...blur(privacyMode), color: GOLD }}>{sym}{Math.round(monthlyDiv).toLocaleString()}/mes</span></span>
        <span>Gastos: <span style={{ ...blur(privacyMode) }}>{sym}{Math.round(monthlyExp).toLocaleString()}/mes</span></span>
      </div>
    </div>
  );
}

/* ── Section 3: Monthly payroll grid ── */
function NominaMensual({ DIV_BY_MONTH, annualDivUSD, privacyMode, sym }) {
  const curYear = new Date().getFullYear();
  const curMonth = new Date().getMonth(); // 0-indexed

  const { monthData, maxVal, runningTotal } = useMemo(() => {
    const data = [];
    let total = 0;
    let max = 1;

    // Use the single source of truth (portfolioTotals.totalDivUSD) for projections
    const projectedMonthly = (annualDivUSD || 0) / 12;

    for (let m = 0; m < 12; m++) {
      const key = `${curYear}-${String(m + 1).padStart(2, "0")}`;
      const actual = DIV_BY_MONTH?.[key]?.g || 0;
      const isPast = m <= curMonth;
      const value = isPast ? actual : projectedMonthly;
      total += value;
      max = Math.max(max, value);
      data.push({ month: m, actual: isPast ? actual : 0, projected: isPast ? 0 : projectedMonthly, total, isPast });
    }
    return { monthData: data, maxVal: max, runningTotal: total };
  }, [DIV_BY_MONTH, annualDivUSD, curYear, curMonth]);

  const barW = 48, barH = 80, gap = 6;
  const svgW = 12 * (barW + gap);

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)" }}>
          Nomina Mensual {curYear}
        </div>
        <div style={{ ...blur(privacyMode), fontSize: 11, fontWeight: 600, color: GOLD, fontFamily: "var(--fm)" }}>
          Acumulado: {sym}{Math.round(runningTotal).toLocaleString()}
        </div>
      </div>

      <div style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        <svg width={svgW} height={barH + 36} viewBox={`0 0 ${svgW} ${barH + 36}`} style={{ display: "block" }}>
          {monthData.map((d, i) => {
            const x = i * (barW + gap);
            const val = d.actual || d.projected;
            const h = maxVal > 0 ? (val / maxVal) * barH : 0;
            const isProjected = !d.isPast;

            return (
              <g key={i}>
                {/* Bar */}
                <rect x={x} y={barH - h + 4} width={barW} height={Math.max(h, 2)} rx={4}
                  fill={isProjected ? "none" : GOLD}
                  stroke={isProjected ? GOLD : "none"}
                  strokeWidth={isProjected ? 1.5 : 0}
                  strokeDasharray={isProjected ? "4 3" : "none"}
                  opacity={isProjected ? 0.5 : 0.7 + (val / maxVal) * 0.3}
                />
                {/* Value label */}
                <text x={x + barW / 2} y={barH - h - 1} textAnchor="middle"
                  style={{ ...blur(privacyMode), fontSize: 8, fontWeight: 600, fill: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
                  {val >= 1000 ? `${_sf(val / 1000, 1)}K` : `${Math.round(val)}`}
                </text>
                {/* Month label */}
                <text x={x + barW / 2} y={barH + 18} textAnchor="middle"
                  style={{ fontSize: 9, fontWeight: i === curMonth ? 700 : 500, fill: i === curMonth ? GOLD : "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
                  {MNAMES[i]}
                </text>
                {/* Running total */}
                <text x={x + barW / 2} y={barH + 30} textAnchor="middle"
                  style={{ ...blur(privacyMode), fontSize: 7, fill: "var(--text-tertiary)", fontFamily: "var(--fm)", opacity: .6 }}>
                  {d.total >= 1000 ? `${_sf(d.total / 1000, 1)}K` : Math.round(d.total)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6, fontSize: 9, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 8, borderRadius: 2, background: GOLD, opacity: .7 }} /> Cobrado
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 8, borderRadius: 2, border: `1.5px dashed ${GOLD}`, opacity: .5 }} /> Proyectado
        </span>
      </div>
    </div>
  );
}

/* ── Section 4: Top dividend payers ── */
function TopPayers({ positions, privacyMode, sym }) {
  const topPayers = useMemo(() => {
    return (positions || [])
      .map(p => ({
        ticker: p.ticker,
        name: p.name || p.ticker,
        annual: p.divAnnualUSD || 0,
        monthly: (p.divAnnualUSD || 0) / 12,
        yld: p.divYield || p.divYieldTTM || 0,
      }))
      .filter(p => p.annual > 0)
      .sort((a, b) => b.annual - a.annual)
      .slice(0, 15);
  }, [positions]);

  const maxAnnual = topPayers.length > 0 ? topPayers[0].annual : 1;

  if (topPayers.length === 0) return null;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 22px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)", marginBottom: 12 }}>
        Quien te paga
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {topPayers.map((p, _i) => {
          const pct = maxAnnual > 0 ? (p.annual / maxAnnual) * 100 : 0;
          const yldColor = p.yld > 0.05 ? GREEN : p.yld > 0.03 ? "#e6b940" : GOLD;
          return (
            <div key={p.ticker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", fontFamily: "var(--fm)", textAlign: "right", flexShrink: 0 }}>
                {p.ticker.length > 5 ? p.ticker.slice(0, 5) : p.ticker}
              </div>
              <div style={{ flex: 1, height: 22, background: "var(--subtle-bg)", borderRadius: 5, overflow: "hidden", position: "relative" }}>
                <div style={{
                  height: "100%", width: `${pct}%`, borderRadius: 5, minWidth: 2,
                  background: `linear-gradient(90deg, ${yldColor}66, ${yldColor}cc)`,
                  transition: "width .5s ease-out",
                }} />
                <div style={{ position: "absolute", top: 0, left: 8, right: 8, height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)", maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  <span style={{ ...blur(privacyMode), fontSize: 9, fontWeight: 700, color: yldColor, fontFamily: "var(--fm)" }}>
                    {sym}{Math.round(p.annual).toLocaleString()} <span style={{ fontSize: 7, opacity: .7 }}>({sym}{Math.round(p.monthly)}/m)</span>
                  </span>
                </div>
              </div>
              <div style={{ width: 32, fontSize: 8, fontWeight: 600, color: yldColor, fontFamily: "var(--fm)", textAlign: "right", flexShrink: 0 }}>
                {_sf((p.yld || 0) * 100, 1)}%
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 10, fontSize: 8, color: "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
        <span><span style={{ color: GOLD }}>&#9679;</span> &lt;3%</span>
        <span><span style={{ color: "#e6b940" }}>&#9679;</span> 3-5%</span>
        <span><span style={{ color: GREEN }}>&#9679;</span> &gt;5%</span>
      </div>
    </div>
  );
}

/* ── Section 5: YoY growth ── */
function CrecimientoCard({ DIV_BY_YEAR, privacyMode, sym }) {
  const { years, data, maxG, cagr, totalYears } = useMemo(() => {
    const yrs = Object.keys(DIV_BY_YEAR || {}).sort();
    const d = yrs.map(y => ({ year: y, gross: DIV_BY_YEAR[y]?.g || 0 }));
    const mx = Math.max(...d.map(r => r.gross), 1);

    let cagrVal = null;
    let numYears = 0;
    if (d.length >= 2) {
      const first = d[0].gross;
      const last = d[d.length - 1].gross;
      numYears = d.length - 1;
      if (first > 0 && last > 0 && numYears > 0) {
        cagrVal = (Math.pow(last / first, 1 / numYears) - 1) * 100;
      }
    }

    return { years: yrs, data: d, maxG: mx, cagr: cagrVal, totalYears: numYears };
  }, [DIV_BY_YEAR]);

  if (years.length === 0) return null;

  const barH = 24;
  const gap = 5;
  const svgH = data.length * (barH + gap) + 4;
  const barArea = 280;
  const labelW = 38;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)" }}>
          Tu Sueldo Crece
        </div>
        {cagr !== null && (
          <div style={{ fontSize: 10, fontWeight: 600, color: cagr > 0 ? GREEN : "var(--red)", fontFamily: "var(--fm)" }}>
            CAGR: {cagr > 0 ? "+" : ""}{_sf(cagr, 1)}% en {totalYears} anos
          </div>
        )}
      </div>

      <svg width="100%" viewBox={`0 0 ${labelW + barArea + 80} ${svgH}`} style={{ display: "block" }}>
        {data.map((d, i) => {
          const w = maxG > 0 ? (d.gross / maxG) * barArea : 0;
          const y = i * (barH + gap) + 2;
          const intensity = maxG > 0 ? 0.3 + (d.gross / maxG) * 0.7 : 0.3;
          const prevGross = i > 0 ? data[i - 1].gross : 0;
          const yoyPct = prevGross > 0 ? ((d.gross - prevGross) / prevGross * 100) : null;

          return (
            <g key={d.year}>
              <text x={labelW - 4} y={y + barH / 2 + 4} textAnchor="end"
                style={{ fontSize: 10, fontWeight: 700, fill: "var(--text-secondary)", fontFamily: "var(--fm)" }}>{d.year}</text>
              <rect x={labelW} y={y} width={Math.max(w, 3)} height={barH} rx={5}
                fill={`rgba(200,164,78,${intensity})`} />
              <text x={labelW + Math.max(w, 3) + 6} y={y + barH / 2 + 4}
                style={{ ...blur(privacyMode), fontSize: 10, fontWeight: 700, fill: GOLD, fontFamily: "var(--fm)" }}>
                {sym}{d.gross >= 1000 ? `${_sf(d.gross / 1000, 1)}K` : _sf(d.gross, 0)}
              </text>
              {yoyPct !== null && (
                <text x={labelW + barArea + 60} y={y + barH / 2 + 4} textAnchor="end"
                  style={{ fontSize: 9, fontWeight: 600, fill: yoyPct >= 0 ? GREEN : "var(--red)", fontFamily: "var(--fm)" }}>
                  {yoyPct >= 0 ? "+" : ""}{_sf(yoyPct, 0)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Section 6: Freedom countdown ── */
function CountdownCard({ annualDiv, monthlyExp, cagr, privacyMode, sym }) {
  const annualExp = monthlyExp * 12;
  const pctCovered = annualExp > 0 ? (annualDiv / annualExp) * 100 : 0;
  const isFree = pctCovered >= 100;

  // Calculate years to freedom at current CAGR
  let yearsToFreedom = null;
  if (!isFree && cagr > 0 && annualDiv > 0 && annualExp > 0) {
    // annualDiv * (1 + cagr)^n = annualExp => n = ln(annualExp/annualDiv) / ln(1+cagr)
    const growthRate = cagr / 100;
    if (growthRate > 0) {
      yearsToFreedom = Math.log(annualExp / annualDiv) / Math.log(1 + growthRate);
    }
  }

  const milestones = [
    { pct: 25, label: "25% cubierto", emoji: "🌱" },
    { pct: 50, label: "50% cubierto", emoji: "🌿" },
    { pct: 75, label: "75% cubierto", emoji: "🌳" },
    { pct: 100, label: "Libre!", emoji: "🏖️" },
  ];

  return (
    <div style={{
      background: isFree
        ? "linear-gradient(135deg, rgba(48,209,88,.12) 0%, rgba(48,209,88,.04) 100%)"
        : "var(--card)",
      border: `1px solid ${isFree ? "rgba(48,209,88,.3)" : "var(--border)"}`,
      borderRadius: 14, padding: "18px 22px", textAlign: "center",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--fd)", marginBottom: 12 }}>
        Countdown a la Libertad
      </div>

      {isFree ? (
        <div>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: GREEN, fontFamily: "var(--fd)" }}>
            FELICIDADES!
          </div>
          <div style={{ fontSize: 12, color: GREEN, fontFamily: "var(--fm)", marginTop: 4 }}>
            Eres financieramente libre
          </div>
          <div style={{ ...blur(privacyMode), fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 8 }}>
            Divs: {sym}{Math.round(annualDiv).toLocaleString()}/ano vs Gastos: {sym}{Math.round(annualExp).toLocaleString()}/ano
          </div>
        </div>
      ) : (
        <div>
          {yearsToFreedom !== null && yearsToFreedom < 100 ? (
            <>
              <div style={{ ...blur(privacyMode), fontSize: 36, fontWeight: 800, color: GOLD, fontFamily: "var(--fd)", lineHeight: 1.1 }}>
                {Math.floor(yearsToFreedom)}<span style={{ fontSize: 14, fontWeight: 500 }}>a</span>{" "}
                {Math.round((yearsToFreedom % 1) * 12)}<span style={{ fontSize: 14, fontWeight: 500 }}>m</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)", marginTop: 4 }}>
                para alcanzar libertad financiera (al {_sf(cagr, 1)}% CAGR)
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--fm)", padding: 12 }}>
              Necesitas mas datos historicos para proyectar
            </div>
          )}
        </div>
      )}

      {/* Milestone badges */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
        {milestones.map(m => {
          const reached = pctCovered >= m.pct;
          return (
            <div key={m.pct} style={{
              padding: "5px 10px", borderRadius: 8,
              background: reached ? (m.pct === 100 ? "rgba(48,209,88,.12)" : GOLD_DIM) : "var(--subtle-bg)",
              border: `1px solid ${reached ? (m.pct === 100 ? "rgba(48,209,88,.3)" : "rgba(200,164,78,.3)") : "var(--subtle-bg2)"}`,
              opacity: reached ? 1 : 0.4,
            }}>
              <div style={{ fontSize: 16 }}>{m.emoji}</div>
              <div style={{ fontSize: 7, fontWeight: 600, color: reached ? (m.pct === 100 ? GREEN : GOLD) : "var(--text-tertiary)", fontFamily: "var(--fm)" }}>
                {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main NominaTab
   ═══════════════════════════════════════════════════════════════ */
export default function NominaTab() {
  const {
    portfolioList, portfolioTotals,
    DIV_BY_YEAR, DIV_BY_MONTH,
    FIRE_PARAMS,
    displayCcy, fxRates,
    privacyMode,
  } = useHome();

  const sym = displayCcy === "EUR" ? "\u20ac" : "$";
  const toDisplay = displayCcy === "EUR" ? (fxRates?.EUR || 0.92) : 1;

  // Annual dividend in display currency.
  // Apply DEFAULT_WHT_NET (0.90, China-US treaty 10%) so "Sueldo Pasivo"
  // reflects actual take-home, not gross. Audit C flagged that the
  // previous gross number overstated freedom by ~10% on US dividend
  // stocks. HeroCard subtitle makes the treatment explicit.
  const annualDivUSDGross = portfolioTotals?.totalDivUSD || 0;
  const annualDivUSD = annualDivUSDGross * 0.9;
  const annualDiv = annualDivUSD * toDisplay;

  const monthlyExp = (FIRE_PARAMS?.monthlyExp || 4000) * toDisplay;
  const monthlyDiv = annualDiv / 12;

  // CAGR from DIV_BY_YEAR
  const cagr = useMemo(() => {
    const yrs = Object.keys(DIV_BY_YEAR || {}).sort();
    if (yrs.length < 2) return 0;
    const first = DIV_BY_YEAR[yrs[0]]?.g || 0;
    const last = DIV_BY_YEAR[yrs[yrs.length - 1]]?.g || 0;
    const n = yrs.length - 1;
    if (first > 0 && last > 0 && n > 0) {
      return (Math.pow(last / first, 1 / n) - 1) * 100;
    }
    return 0;
  }, [DIV_BY_YEAR]);

  if (annualDiv <= 0 && (!portfolioList || portfolioList.length === 0)) {
    return <EmptyState icon="💵" title="Tu nomina pasiva esta en camino" subtitle="Anade posiciones que paguen dividendos para ver tu sueldo pasivo calculado al minuto." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* CSS animation for pulse effect */}
      <style>{`
        @keyframes nominaPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .6; }
        }
      `}</style>

      {/* Section 1: Hero */}
      <HeroCard annualDiv={annualDiv} displayCcy={displayCcy} privacyMode={privacyMode} />

      {/* Section 2 + Section 6: Two columns on desktop */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <CoberturaCard monthlyDiv={monthlyDiv} monthlyExp={monthlyExp} privacyMode={privacyMode} sym={sym} />
        <CountdownCard annualDiv={annualDiv} monthlyExp={monthlyExp / toDisplay * toDisplay} cagr={cagr} privacyMode={privacyMode} sym={sym} />
      </div>

      {/* Section 3: Monthly grid */}
      <NominaMensual DIV_BY_MONTH={DIV_BY_MONTH} annualDivUSD={annualDivUSD} privacyMode={privacyMode} sym={sym} />

      {/* Section 4: Top payers */}
      <TopPayers positions={portfolioTotals?.positions} privacyMode={privacyMode} sym={sym} />

      {/* Section 5: YoY growth */}
      <CrecimientoCard DIV_BY_YEAR={DIV_BY_YEAR} privacyMode={privacyMode} sym={sym} />
    </div>
  );
}
