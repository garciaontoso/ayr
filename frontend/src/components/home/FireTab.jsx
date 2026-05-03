import { useState, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters';
import { EmptyState } from '../ui/EmptyState.jsx';
import { useFireMetrics, FIRE_SWR } from '../../hooks/useFireMetrics.js';
import { useFxRates } from '../../hooks/useFxRates.js';
import { useNetLiquidationValue } from '../../hooks/useNetLiquidationValue.js';

// ─── Box-Muller transform: standard normal sample ───────────────────────────
function randNorm() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Monte Carlo engine ──────────────────────────────────────────────────────
// Returns { years[], p10[], p25[], p50[], p75[], p90[], successProb, p50FireYear }
// returnMean/returnStd are fractions (e.g. 0.07, 0.15)
function runMonteCarlo({ nlv, annualSavings, fireTarget, years = 30, paths = 5000, returnMean = 0.07, returnStd = 0.15 }) {
  if (!nlv || nlv <= 0 || !fireTarget || fireTarget <= 0) return null;

  // Simulate all paths
  const terminals = Array.from({ length: years }, () => []);
  let successCount = 0;

  for (let p = 0; p < paths; p++) {
    let bal = nlv;
    let hitFire = false;
    for (let y = 0; y < years; y++) {
      const r = returnMean + returnStd * randNorm();
      bal = bal * (1 + r) + annualSavings;
      if (bal < 0) bal = 0;
      terminals[y].push(bal);
      if (!hitFire && bal >= fireTarget) hitFire = true;
    }
    if (hitFire) successCount++;
  }

  // Sort each year's distribution for percentile extraction
  const sorted = terminals.map(arr => [...arr].sort((a, b) => a - b));
  const pct = (arr, p) => {
    const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(p * arr.length)));
    return arr[idx];
  };

  const yearsArr = Array.from({ length: years }, (_, i) => i + 1);
  const p10 = sorted.map(a => pct(a, 0.10));
  const p25 = sorted.map(a => pct(a, 0.25));
  const p50 = sorted.map(a => pct(a, 0.50));
  const p75 = sorted.map(a => pct(a, 0.75));
  const p90 = sorted.map(a => pct(a, 0.90));

  // Year where P50 first crosses fireTarget
  const p50FireYear = yearsArr.find((y, i) => p50[i] >= fireTarget) ?? null;
  const successProb = successCount / paths;

  return { yearsArr, p10, p25, p50, p75, p90, successProb, p50FireYear };
}

// ─── Monte Carlo Section ─────────────────────────────────────────────────────
function MonteCarloSection({ nlv, annualSavings, fireTarget, fireCcy, sym, privacyMode }) {
  const [returnMean, setReturnMean] = useState(7);   // %
  const [returnStd, setReturnStd]   = useState(15);  // %
  const [horizonYrs, setHorizonYrs] = useState(30);

  const mc = useMemo(() => runMonteCarlo({
    nlv,
    annualSavings,
    fireTarget,
    years: horizonYrs,
    paths: 5000,
    returnMean: returnMean / 100,
    returnStd: returnStd / 100,
  }), [nlv, annualSavings, fireTarget, horizonYrs, returnMean, returnStd]);

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 };

  const fShort = v => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${_sf(v / 1e6, 2)}M`;
    if (a >= 1e3) return `${_sf(v / 1e3, 0)}K`;
    return String(Math.round(v));
  };

  if (!mc) {
    return (
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 8 }}>
          Monte Carlo — Proyecciones Probabilísticas
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
          Se necesitan datos de patrimonio y objetivo FIRE para ejecutar la simulación.
        </div>
      </div>
    );
  }

  // ── SVG Fan Chart ──────────────────────────────────────────────────────────
  const W = 600, H = 270, PL = 58, PR = 16, PT = 22, PB = 34;
  const cW = W - PL - PR, cH = H - PT - PB;
  const startYear = new Date().getFullYear();

  const allVals = [...mc.p10, ...mc.p90, fireTarget * 1.05];
  const maxV = Math.max(...allVals, 1);
  const minV = 0;

  const xOf = (i) => PL + (i / (mc.yearsArr.length - 1)) * cW;
  const yOf = (v) => PT + cH - ((Math.max(v, 0) - minV) / (maxV - minV)) * cH;

  const polyPoints = (arr) => arr.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');

  // Band fill: path that traces top then bottom reversed
  const bandPath = (arrTop, arrBot) => {
    const top = arrTop.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' L');
    const botRev = [...arrBot].reverse().map((v, i2) => {
      const i = arrBot.length - 1 - i2;
      return `${xOf(i)},${yOf(v)}`;
    }).join(' L');
    return `M${top} L${botRev} Z`;
  };

  // Y-axis ticks
  const niceStep = maxV > 4e6 ? 1e6 : maxV > 2e6 ? 500000 : maxV > 1e6 ? 500000 : maxV > 500000 ? 250000 : 100000;
  const yTicks = [];
  for (let v = 0; v <= maxV; v += niceStep) yTicks.push(v);

  // X-axis ticks every 5 years
  const xTickIdxs = mc.yearsArr.filter(y => y % 5 === 0 || y === 1).map(y => y - 1);

  const targetY = yOf(fireTarget);
  const p50FireIdx = mc.p50FireYear ? mc.p50FireYear - 1 : null;

  const successPct = mc.successProb * 100;
  const successColor = successPct >= 85 ? 'var(--green)' : successPct >= 60 ? 'var(--gold)' : 'var(--red)';

  const inp = (val, onChange, min, max, step) => ({
    type: 'number', value: val, min, max, step,
    onChange: e => onChange(parseFloat(e.target.value) || 0),
    style: { width: 62, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--fm)', textAlign: 'right' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {[
          { l: 'PROB. ÉXITO', v: `${_sf(successPct, 0)}%`, c: successColor, sub: 'rutas que alcanzan FIRE' },
          { l: 'AÑO P50', v: mc.p50FireYear ? String(startYear + mc.p50FireYear) : '> horizonte', c: 'var(--gold)', sub: `en ${mc.p50FireYear ?? '??'} años (mediana)` },
          { l: 'P50 TERMINAL', v: privacyMode ? '•••' : `${sym}${fShort(mc.p50[mc.p50.length - 1])}`, c: 'var(--text-primary)', sub: `en ${horizonYrs} años` },
          { l: 'P10 TERMINAL', v: privacyMode ? '•••' : `${sym}${fShort(mc.p10[mc.p10.length - 1])}`, c: 'var(--red)', sub: 'escenario pesimista' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 7, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', letterSpacing: .5, fontWeight: 600 }}>{k.l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.c, fontFamily: 'var(--fm)', marginTop: 2 }}>{k.v}</div>
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', background: 'var(--row-alt)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>PARÁMETROS</span>
        {[
          { label: 'Retorno medio (%)', val: returnMean, set: setReturnMean, min: 1, max: 20, step: 0.5 },
          { label: 'Volatilidad σ (%)',  val: returnStd,  set: setReturnStd,  min: 1, max: 40, step: 0.5 },
          { label: 'Horizonte (años)',   val: horizonYrs, set: setHorizonYrs, min: 5, max: 50, step: 5  },
        ].map(({ label, val, set, min, max, step }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>{label}</span>
            <input {...inp(val, set, min, max, step)} />
          </div>
        ))}
        <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>5 000 rutas · N({returnMean}%, σ={returnStd}%)</span>
      </div>

      {/* Fan chart */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          Abanico Monte Carlo — {horizonYrs} años
        </div>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto', fontFamily: 'var(--fm)' }}>
            <defs>
              <linearGradient id="mc90Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c8a44e" stopOpacity="0.07" />
                <stop offset="100%" stopColor="#c8a44e" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="mc75Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c8a44e" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#c8a44e" stopOpacity="0.04" />
              </linearGradient>
              <linearGradient id="mc25Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64d2ff" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#64d2ff" stopOpacity="0.02" />
              </linearGradient>
              <clipPath id="mcClip">
                <rect x={PL} y={PT} width={cW} height={cH} />
              </clipPath>
            </defs>

            {/* Grid lines */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PL} y1={yOf(v)} x2={W - PR} y2={yOf(v)} stroke="var(--subtle-bg2)" strokeWidth="0.5" />
                <text x={PL - 4} y={yOf(v) + 3} textAnchor="end" fill="var(--text-tertiary)" fontSize="7">{sym}{fShort(v)}</text>
              </g>
            ))}

            {/* Fan bands clipped */}
            <g clipPath="url(#mcClip)">
              {/* P10–P90 outer band */}
              <path d={bandPath(mc.p90, mc.p10)} fill="url(#mc90Grad)" />
              {/* P25–P75 inner band */}
              <path d={bandPath(mc.p75, mc.p25)} fill="url(#mc75Grad)" />
              {/* P25–P10 lower band tint */}
              <path d={bandPath(mc.p25, mc.p10)} fill="url(#mc25Grad)" />

              {/* Border lines */}
              <polyline points={polyPoints(mc.p90)} fill="none" stroke="#c8a44e" strokeWidth="1" strokeOpacity="0.4" />
              <polyline points={polyPoints(mc.p75)} fill="none" stroke="#c8a44e" strokeWidth="1.2" strokeOpacity="0.6" />
              <polyline points={polyPoints(mc.p25)} fill="none" stroke="#64d2ff" strokeWidth="1.2" strokeOpacity="0.6" />
              <polyline points={polyPoints(mc.p10)} fill="none" stroke="#64d2ff" strokeWidth="1" strokeOpacity="0.4" />

              {/* P50 median line — bold */}
              <polyline points={polyPoints(mc.p50)} fill="none" stroke="#c8a44e" strokeWidth="2.5" />
            </g>

            {/* FIRE target dashed line */}
            {targetY >= PT && targetY <= PT + cH && (
              <g>
                <line x1={PL} y1={targetY} x2={W - PR} y2={targetY} stroke="#30d158" strokeWidth="1.2" strokeDasharray="5,3" opacity="0.8" />
                <rect x={PL + 2} y={targetY - 11} width={90} height={13} rx="3" fill="rgba(0,0,0,.75)" />
                <text x={PL + 6} y={targetY - 2} fill="#30d158" fontSize="7.5" fontWeight="700">FIRE {sym}{fShort(fireTarget)}</text>
              </g>
            )}

            {/* P50 crossover vertical marker */}
            {p50FireIdx !== null && p50FireIdx < mc.yearsArr.length && (
              <g>
                <line
                  x1={xOf(p50FireIdx)} y1={PT}
                  x2={xOf(p50FireIdx)} y2={PT + cH}
                  stroke="#30d158" strokeWidth="1" strokeDasharray="3,3" opacity="0.7"
                />
                <rect x={xOf(p50FireIdx) - 22} y={PT + 2} width={44} height={13} rx="3" fill="rgba(0,0,0,.8)" />
                <text x={xOf(p50FireIdx)} y={PT + 12} textAnchor="middle" fill="#30d158" fontSize="7.5" fontWeight="700">
                  P50 {startYear + mc.p50FireYear}
                </text>
              </g>
            )}

            {/* X-axis labels */}
            {xTickIdxs.map(i => (
              <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fill="var(--text-tertiary)" fontSize="8">
                {startYear + mc.yearsArr[i]}
              </text>
            ))}

            {/* Axes */}
            <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke="var(--border)" strokeWidth="0.5" />
            <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="var(--border)" strokeWidth="0.5" />
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { color: '#c8a44e', label: 'P90 — optimista', dashed: true },
            { color: '#c8a44e', label: 'P75' },
            { color: '#c8a44e', label: 'P50 (mediana)', bold: true },
            { color: '#64d2ff', label: 'P25' },
            { color: '#64d2ff', label: 'P10 — pesimista', dashed: true },
            { color: '#30d158', label: 'Objetivo FIRE', dashed: true },
          ].map(({ color, label, dashed, bold }) => (
            <span key={label} style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="20" height="8">
                <line x1="0" y1="4" x2="20" y2="4"
                  stroke={color}
                  strokeWidth={bold ? 2.5 : 1.5}
                  strokeDasharray={dashed ? '4,2' : 'none'}
                  opacity={dashed ? 0.6 : 1}
                />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Percentile table */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 10 }}>
          Distribución por Año (cada 5 años)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 420 }}>
            <thead>
              <tr>
                {['AÑO', 'P10 — PESI.', 'P25', 'P50 MEDIANA', 'P75', 'P90 — OPTI.', 'PROB. FIRE'].map((h, i) => (
                  <th key={i} style={{ padding: '5px 8px', textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mc.yearsArr.filter(y => y % 5 === 0).map((y, i) => {
                const idx = y - 1;
                // Probability FIRE reached BY year y: count paths where p50 at idx >= fireTarget is approximate
                // We use success-by-year: for quick UI we derive from sorted[idx]
                // paths where bal >= fireTarget at year idx / total paths
                const pFireByY = mc.p10[idx] >= fireTarget ? 100 :
                  mc.p25[idx] >= fireTarget ? 75 :
                  mc.p50[idx] >= fireTarget ? 50 :
                  mc.p75[idx] >= fireTarget ? 25 :
                  mc.p90[idx] >= fireTarget ? 10 : 0;
                const atFire = mc.p50[idx] >= fireTarget;
                return (
                  <tr key={y} style={{ background: atFire ? 'rgba(48,209,88,.04)' : i % 2 ? 'var(--row-alt)' : 'transparent' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 700, fontFamily: 'var(--fm)', color: 'var(--text-primary)' }}>
                      {startYear + y} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(+{y})</span>
                    </td>
                    {privacyMode
                      ? [null, null, null, null, null].map((_, j) => <td key={j} style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--fm)' }}>•••</td>)
                      : [mc.p10[idx], mc.p25[idx], mc.p50[idx], mc.p75[idx], mc.p90[idx]].map((v, j) => {
                          const aboveFire = v >= fireTarget;
                          const cols = ['var(--red)', 'var(--orange, #ff9f43)', 'var(--text-primary)', '#c8a44e', 'var(--green)'];
                          return (
                            <td key={j} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: j === 2 ? 800 : 600, fontFamily: 'var(--fm)', color: aboveFire ? 'var(--green)' : cols[j], borderBottom: '1px solid var(--subtle-bg)' }}>
                              {sym}{fShort(v)}{aboveFire ? ' ✓' : ''}
                            </td>
                          );
                        })
                    }
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--fm)', color: pFireByY >= 75 ? 'var(--green)' : pFireByY >= 50 ? 'var(--gold)' : 'var(--text-tertiary)' }}>
                      ~{pFireByY}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 6 }}>
          5 000 rutas · retornos anuales N({returnMean}%, σ={returnStd}%) · ahorros ${_sf(annualSavings / 12, 0)}/mes · objetivo FIRE {sym}{fShort(fireTarget)} · ✓ supera objetivo
        </div>
      </div>
    </div>
  );
}

// ─── Your Number Calculator ───
function YourNumberSection({ pat, divNetA, gastosAnnual, espRealistaA, baseRealA, fxEurUsd, fireCcy }) {
  const isUSD = fireCcy === "USD";
  const sym = isUSD ? "$" : "€";
  const toD = v => isUSD ? v : v / fxEurUsd;

  // Editable scenario params — pre-filled with user's real data
  const [scenarios, setScenarios] = useState([
    {
      name: "🏠 Vida Actual",
      lifestyleCost: Math.round(gastosAnnual > 0 ? (isUSD ? gastosAnnual : gastosAnnual) : 50000),
      guaranteedIncome: 0, // no pension / no guaranteed income
      inflation: 3.6,
      yearsBefore: 10,
      yearsIn: 40,
      capitalToday: Math.round(pat > 0 ? pat : 600000),
      savePerYear: 12000,
      returnWorking: 7,
      returnRetired: 5,
      inflationRetired: 3.6,
    },
    {
      name: "🚀 Agresivo",
      lifestyleCost: Math.round(gastosAnnual > 0 ? (isUSD ? gastosAnnual : gastosAnnual) : 50000),
      guaranteedIncome: 0, // no pension / no guaranteed income
      inflation: 3.6,
      yearsBefore: 10,
      yearsIn: 40,
      capitalToday: Math.round(pat > 0 ? pat : 600000),
      savePerYear: 24000,
      returnWorking: 12,
      returnRetired: 8,
      inflationRetired: 3.6,
    },
    {
      name: "🎯 Base Real",
      lifestyleCost: Math.round(baseRealA > 0 ? baseRealA : 40000),
      guaranteedIncome: 0, // no pension / no guaranteed income
      inflation: 3.6,
      yearsBefore: 10,
      yearsIn: 40,
      capitalToday: Math.round(pat > 0 ? pat : 600000),
      savePerYear: 12000,
      returnWorking: 7,
      returnRetired: 5,
      inflationRetired: 3.6,
    },
    {
      name: "🇪🇸 Solo Espana",
      lifestyleCost: Math.round(espRealistaA > 0 ? espRealistaA : 45000),
      guaranteedIncome: 0, // no pension / no guaranteed income
      inflation: 3.6,
      yearsBefore: 15,
      yearsIn: 35,
      capitalToday: Math.round(pat > 0 ? pat : 600000),
      savePerYear: 18000,
      returnWorking: 7,
      returnRetired: 5,
      inflationRetired: 3.6,
    },
  ]);

  const [activeScenario, setActiveScenario] = useState(0);

  const updateField = (idx, field, value) => {
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  // Calculate Your Number for a scenario
  const calcYourNumber = (s) => {
    const requiredIncome = s.lifestyleCost - s.guaranteedIncome;
    const retirementYear = new Date().getFullYear() + s.yearsBefore;

    // Capital at retirement (FV of current + annual contributions)
    let capital = s.capitalToday;
    for (let y = 0; y < s.yearsBefore; y++) {
      capital = capital * (1 + s.returnWorking / 100) + s.savePerYear;
    }

    // Cost of living at retirement year (inflated)
    const costAtRetirement = s.lifestyleCost * Math.pow(1 + s.inflation / 100, s.yearsBefore);
    const guaranteedAtRetirement = s.guaranteedIncome * Math.pow(1 + s.inflation / 100, s.yearsBefore);
    const requiredAtRetirement = costAtRetirement - guaranteedAtRetirement;

    // Net real return during retirement
    const netReturnRetired = (s.returnRetired - s.inflationRetired) / 100;

    // Your Number = PV of annuity of required income during retirement
    let yourNumber;
    if (Math.abs(netReturnRetired) < 0.001) {
      yourNumber = requiredAtRetirement * s.yearsIn;
    } else {
      yourNumber = requiredAtRetirement * (1 - Math.pow(1 + netReturnRetired, -s.yearsIn)) / netReturnRetired;
    }

    // Years until money runs out in retirement
    let bal = capital;
    let yearsLast = 0;
    let annualCost = costAtRetirement;
    let annualGuaranteed = guaranteedAtRetirement;
    for (let y = 1; y <= s.yearsIn + 30; y++) {
      bal = bal * (1 + s.returnRetired / 100) - (annualCost - annualGuaranteed);
      annualCost *= (1 + s.inflationRetired / 100);
      annualGuaranteed *= (1 + s.inflationRetired / 100);
      if (bal <= 0) { yearsLast = y; break; }
      yearsLast = y;
      if (y >= s.yearsIn + 30) break;
    }
    const runsOut = bal > 0 ? false : true;

    // Build full trajectory: working phase + retirement phase
    const trajectory = [];
    const startYear = new Date().getFullYear();
    // Working phase
    let wBal = s.capitalToday;
    for (let y = 0; y <= s.yearsBefore; y++) {
      trajectory.push({ year: startYear + y, balance: wBal, phase: 'working' });
      if (y < s.yearsBefore) wBal = wBal * (1 + s.returnWorking / 100) + s.savePerYear;
    }
    // Retirement phase
    let tBal = capital;
    let tCost = costAtRetirement;
    let tInc = guaranteedAtRetirement;
    for (let y = 1; y <= Math.min(s.yearsIn, 50); y++) {
      tBal = tBal * (1 + s.returnRetired / 100) - (tCost - tInc);
      tCost *= (1 + s.inflationRetired / 100);
      tInc *= (1 + s.inflationRetired / 100);
      if (tBal < 0) tBal = 0;
      trajectory.push({ year: retirementYear + y, balance: tBal, phase: 'retired' });
    }

    const overUnder = capital - yourNumber;

    return {
      requiredIncome, retirementYear, capital, costAtRetirement,
      requiredAtRetirement, netReturnRetired, yourNumber, yearsLast,
      runsOut, overUnder, trajectory, guaranteedAtRetirement,
    };
  };

  const results = scenarios.map(calcYourNumber);
  const s = scenarios[activeScenario];
  const r = results[activeScenario];

  const fN = v => `${sym}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fNs = v => `${v >= 0 ? '' : '-'}${sym}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 };
  const inp = (val, onChange, step = 1) => ({
    value: val, onChange: e => onChange(parseFloat(e.target.value) || 0),
    type: 'number', step,
    style: { width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--fm)', textAlign: 'right' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Scenario tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {scenarios.map((sc, i) => (
          <button key={i} onClick={() => setActiveScenario(i)}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${activeScenario === i ? 'var(--gold)' : 'var(--border)'}`, background: activeScenario === i ? 'var(--gold-dim)' : 'transparent', color: activeScenario === i ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 11, fontWeight: activeScenario === i ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--fb)' }}>
            {sc.name}
          </button>
        ))}
      </div>

      {/* Comparison cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {scenarios.map((sc, i) => {
          const rc = results[i];
          const ok = rc.overUnder >= 0;
          return (
            <div key={i} onClick={() => setActiveScenario(i)}
              style={{ ...card, cursor: 'pointer', borderColor: activeScenario === i ? 'var(--gold)' : 'var(--border)', transition: 'all .15s', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: activeScenario === i ? 'var(--gold)' : 'var(--text-secondary)', marginBottom: 8 }}>{sc.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>YOUR NUMBER</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--fm)', margin: '4px 0' }}>{fN(rc.yourNumber)}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>CAPITAL JUBILACIÓN</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fm)', marginBottom: 4 }}>{fN(rc.capital)}</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--fm)', color: ok ? 'var(--green)' : 'var(--red)', padding: '6px 0', borderTop: '1px solid var(--border)', marginTop: 6 }}>
                {ok ? '✅' : '❌'} {fNs(rc.overUnder)}
              </div>
              <div style={{ fontSize: 9, color: ok ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--fm)' }}>
                {ok ? `Sobran ${fN(rc.overUnder)}` : `Faltan ${fN(Math.abs(rc.overUnder))}`}
              </div>
              {rc.runsOut && <div style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--fm)', marginTop: 4 }}>⚠️ Se acaba en {rc.yearsLast} años</div>}
              {!rc.runsOut && <div style={{ fontSize: 9, color: 'var(--green)', fontFamily: 'var(--fm)', marginTop: 4 }}>💎 Dinero para {rc.yearsLast}+ años</div>}
            </div>
          );
        })}
      </div>

      {/* Active scenario detail */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 14 }}>
          🔢 {s.name} — Parámetros
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {/* Working phase */}
          <div style={{ padding: 12, background: 'var(--row-alt)', borderRadius: 10, border: '1px solid var(--subtle-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64d2ff', marginBottom: 8, fontFamily: 'var(--fm)' }}>📊 FASE TRABAJO</div>
            {[
              ['Coste de vida/año', 'lifestyleCost', 1000],
              ['Ingresos garantizados/año', 'guaranteedIncome', 1000],
              ['Capital hoy', 'capitalToday', 1000],
              ['Ahorro adicional/año', 'savePerYear', 1000],
              ['Años hasta jubilación', 'yearsBefore', 1],
              ['Retorno inversión (%)', 'returnWorking', 0.5],
              ['Inflación (%)', 'inflation', 0.1],
            ].map(([label, field, step]) => (
              <div key={field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{label}</span>
                <input {...inp(s[field], v => updateField(activeScenario, field, v), step)} />
              </div>
            ))}
          </div>
          {/* Retirement phase */}
          <div style={{ padding: 12, background: 'var(--row-alt)', borderRadius: 10, border: '1px solid var(--subtle-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ff9f43', marginBottom: 8, fontFamily: 'var(--fm)' }}>🏖️ FASE JUBILACIÓN</div>
            {[
              ['Años en jubilación', 'yearsIn', 1],
              ['Retorno inversión (%)', 'returnRetired', 0.5],
              ['Inflación jubilación (%)', 'inflationRetired', 0.1],
            ].map(([label, field, step]) => (
              <div key={field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{label}</span>
                <input {...inp(s[field], v => updateField(activeScenario, field, v), step)} />
              </div>
            ))}
            <div style={{ marginTop: 8, padding: '8px', background: 'rgba(200,164,78,.06)', borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Retorno real neto</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: r.netReturnRetired * 100 > 2 ? 'var(--green)' : r.netReturnRetired * 100 > 0 ? 'var(--gold)' : 'var(--red)', fontFamily: 'var(--fm)' }}>
                {(r.netReturnRetired * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          {/* Results */}
          <div style={{ padding: 12, background: 'rgba(200,164,78,.04)', borderRadius: 10, border: '1px solid rgba(200,164,78,.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, fontFamily: 'var(--fm)' }}>📋 RESULTADOS</div>
            {[
              ['Año jubilación', r.retirementYear, 'var(--text-primary)'],
              ['Capital acumulado', fN(r.capital), 'var(--text-primary)'],
              ['Coste vida jubilación/año', fN(r.costAtRetirement), 'var(--red)'],
              ...(r.guaranteedAtRetirement > 0 ? [['Ingreso garantizado/año', fN(r.guaranteedAtRetirement), 'var(--green)']] : []),
              ['Necesitas generar/año', fN(r.requiredAtRetirement), 'var(--orange)'],
              ['YOUR NUMBER', fN(r.yourNumber), 'var(--gold)'],
              ['OVER / (UNDER)', fNs(r.overUnder), r.overUnder >= 0 ? 'var(--green)' : 'var(--red)'],
              [r.runsOut ? 'Se acaba en' : 'Dura al menos', `${r.yearsLast} años`, r.runsOut ? 'var(--red)' : 'var(--green)'],
            ].map(([label, val, color], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, padding: i >= 5 ? '4px 0' : 0, borderTop: i === 5 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--fm)' }}>{label}</span>
                <span style={{ fontSize: i >= 5 ? 14 : 11, fontWeight: i >= 5 ? 800 : 600, color, fontFamily: 'var(--fm)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Trajectory chart */}
      {(() => {
        const traj = r.trajectory;
        if (!traj || traj.length < 2) return null;
        const W = 600, H = 250, PL = 55, PR = 15, PT = 20, PB = 32;
        const cW = W - PL - PR, cH = H - PT - PB;
        const maxBal = Math.max(...traj.map(t => t.balance), r.yourNumber * 1.1, 1);
        const minYear = traj[0].year, maxYear = traj[traj.length - 1].year;
        const ySpan = maxYear - minYear || 1;

        const xOf = (yr) => PL + ((yr - minYear) / ySpan) * cW;
        const yOf = (bal) => PT + cH - (Math.max(bal, 0) / maxBal) * cH;

        // Build points
        const pts = traj.map(t => ({ x: xOf(t.year), y: yOf(t.balance), bal: t.balance, yr: t.year, phase: t.phase }));

        // Smooth bezier path
        const bezier = (points) => {
          if (points.length < 2) return '';
          let d = `M${points[0].x},${points[0].y}`;
          for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1], p1 = points[i];
            const cx = (p0.x + p1.x) / 2;
            d += ` C${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
          }
          return d;
        };

        const linePath = bezier(pts);
        // Area path (close to bottom)
        const areaPath = linePath + ` L${pts[pts.length - 1].x},${PT + cH} L${pts[0].x},${PT + cH} Z`;

        // Split into working/retired segments for coloring
        const retireIdx = pts.findIndex(p => p.phase === 'retired');
        const workPts = retireIdx >= 0 ? pts.slice(0, retireIdx) : pts;
        const retPts = retireIdx >= 0 ? pts.slice(retireIdx) : [];

        const workArea = (() => {
          const p = bezier(workPts);
          if (!p || workPts.length < 2) return '';
          return p + ` L${workPts[workPts.length - 1].x},${PT + cH} L${workPts[0].x},${PT + cH} Z`;
        })();
        const retArea = (() => {
          if (retPts.length < 2) return '';
          const p = bezier(retPts);
          return p + ` L${retPts[retPts.length - 1].x},${PT + cH} L${retPts[0].x},${PT + cH} Z`;
        })();

        // Target line Y
        const targetY = yOf(r.yourNumber);

        // Milestone markers
        const milestones = [];
        const steps = [500000, 1000000, 1500000, 2000000, 2500000, 3000000, 4000000, 5000000];
        steps.forEach(m => {
          if (m < maxBal * 0.95) {
            // Find first point that crosses this milestone
            for (let i = 1; i < traj.length; i++) {
              if (traj[i - 1].balance < m && traj[i].balance >= m) {
                const denom = traj[i].balance - traj[i - 1].balance;
                if (denom === 0) break;
                const ratio = (m - traj[i - 1].balance) / denom;
                const mx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * ratio;
                const my = yOf(m);
                const label = m >= 1000000 ? `${(m / 1000000).toFixed(m % 1000000 === 0 ? 0 : 1)}M` : `${(m / 1000).toFixed(0)}K`;
                milestones.push({ x: mx, y: my, label });
                break;
              }
            }
          }
        });

        // Y-axis labels
        const yTicks = [];
        const niceStep = maxBal > 2000000 ? 1000000 : maxBal > 500000 ? 500000 : maxBal > 200000 ? 100000 : 50000;
        for (let v = 0; v <= maxBal; v += niceStep) {
          yTicks.push(v);
        }

        // X-axis labels (every ~5 years)
        const xStep = Math.max(1, Math.round(ySpan / 8));
        const xTicks = [];
        for (let yr = minYear; yr <= maxYear; yr += xStep) xTicks.push(yr);
        if (xTicks[xTicks.length - 1] !== maxYear) xTicks.push(maxYear);

        const fShort = v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v));

        return (
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
              📈 Trayectoria de Capital — {s.name}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto', fontFamily: 'var(--fm)' }}>
                <defs>
                  <linearGradient id="workGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c8a44e" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#c8a44e" stopOpacity="0.03" />
                  </linearGradient>
                  <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#64d2ff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#64d2ff" stopOpacity="0.03" />
                  </linearGradient>
                  <clipPath id="aboveTarget">
                    <rect x={PL} y={PT} width={cW} height={targetY - PT} />
                  </clipPath>
                  <clipPath id="belowTarget">
                    <rect x={PL} y={targetY} width={cW} height={PT + cH - targetY} />
                  </clipPath>
                </defs>

                {/* Grid lines */}
                {yTicks.map((v, i) => (
                  <g key={i}>
                    <line x1={PL} y1={yOf(v)} x2={W - PR} y2={yOf(v)} stroke="var(--subtle-bg2)" strokeWidth="0.5" />
                    <text x={PL - 4} y={yOf(v) + 3} textAnchor="end" fill="var(--text-tertiary)" fontSize="7">{sym}{fShort(v)}</text>
                  </g>
                ))}

                {/* Filled areas */}
                {workArea && <path d={workArea} fill="url(#workGrad)" />}
                {retArea && <path d={retArea} fill="url(#retGrad)" />}

                {/* Line — green above target, gold below */}
                <path d={linePath} fill="none" stroke="#30d158" strokeWidth="2" clipPath="url(#aboveTarget)" />
                <path d={linePath} fill="none" stroke="#c8a44e" strokeWidth="2" clipPath="url(#belowTarget)" />

                {/* Target dashed line */}
                <line x1={PL} y1={targetY} x2={W - PR} y2={targetY} stroke="#c8a44e" strokeWidth="1" strokeDasharray="6,3" opacity="0.7" />
                <rect x={PL + 2} y={targetY - 12} width={80} height={14} rx="3" fill="rgba(0,0,0,.7)" />
                <text x={PL + 6} y={targetY - 3} fill="#c8a44e" fontSize="8" fontWeight="700">YOUR NUMBER {sym}{fShort(r.yourNumber)}</text>

                {/* Retirement start vertical line */}
                {retireIdx > 0 && (
                  <g>
                    <line x1={pts[retireIdx].x} y1={PT} x2={pts[retireIdx].x} y2={PT + cH} stroke="rgba(100,210,255,.3)" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={pts[retireIdx].x} y={PT + 10} textAnchor="middle" fill="#64d2ff" fontSize="7" fontWeight="600">Jubilacion</text>
                  </g>
                )}

                {/* Milestone markers */}
                {milestones.map((m, i) => (
                  <g key={i}>
                    <circle cx={m.x} cy={m.y} r="3.5" fill="var(--bg, #000)" stroke="#c8a44e" strokeWidth="1.5" />
                    <text x={m.x} y={m.y - 7} textAnchor="middle" fill="var(--text-secondary)" fontSize="7" fontWeight="600">{sym}{m.label}</text>
                  </g>
                ))}

                {/* X-axis labels */}
                {xTicks.map((yr, i) => (
                  <text key={i} x={xOf(yr)} y={H - 6} textAnchor="middle" fill="var(--text-tertiary)" fontSize="8">{yr}</text>
                ))}

                {/* Axis lines */}
                <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke="var(--border-hover)" strokeWidth="0.5" />
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6 }}>
              <span style={{ fontSize: 9, color: '#30d158', fontFamily: 'var(--fm)' }}>━ Sobre Your Number</span>
              <span style={{ fontSize: 9, color: '#c8a44e', fontFamily: 'var(--fm)' }}>━ Fase trabajo</span>
              <span style={{ fontSize: 9, color: '#64d2ff', fontFamily: 'var(--fm)' }}>━ Fase jubilacion</span>
            </div>
          </div>
        );
      })()}

      {/* Sensitivity table */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', fontFamily: 'var(--fd)', marginBottom: 12 }}>
          🎯 Sensibilidad — ¿Cuántos años dura tu dinero?
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>
                  Retorno ↓ / Ahorro →
                </th>
                {[0, 6000, 12000, 24000, 36000, 48000].map(sv => (
                  <th key={sv} style={{ padding: '6px 8px', textAlign: 'center', color: s.savePerYear === sv ? 'var(--gold)' : 'var(--text-tertiary)', fontSize: 8, fontWeight: 600, fontFamily: 'var(--fm)', borderBottom: '1px solid var(--border)' }}>
                    {sym}{sv >= 1000 ? `${sv / 1000}K` : sv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[4, 5, 6, 7, 8, 10, 12].map(ret => (
                <tr key={ret}>
                  <td style={{ padding: '5px 8px', fontWeight: 600, fontFamily: 'var(--fm)', color: s.returnWorking === ret ? 'var(--gold)' : 'var(--text-secondary)', borderBottom: '1px solid var(--subtle-bg)' }}>{ret}%</td>
                  {[0, 6000, 12000, 24000, 36000, 48000].map(sv => {
                    const testS = { ...s, returnWorking: ret, savePerYear: sv };
                    const testR = calcYourNumber(testS);
                    const yrs = testR.runsOut ? testR.yearsLast : 99;
                    const isActive = s.returnWorking === ret && s.savePerYear === sv;
                    return (
                      <td key={sv} style={{
                        padding: '5px 8px', textAlign: 'center', fontWeight: isActive ? 800 : 600,
                        fontFamily: 'var(--fm)', borderBottom: '1px solid var(--subtle-bg)',
                        color: yrs >= s.yearsIn ? 'var(--green)' : yrs >= s.yearsIn * 0.7 ? 'var(--gold)' : 'var(--red)',
                        background: isActive ? 'rgba(200,164,78,.1)' : 'transparent',
                      }}>
                        {yrs >= 99 ? '∞' : yrs}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)', marginTop: 6, textAlign: 'center' }}>
          🟢 ≥ {s.yearsIn} años (cubres jubilación completa) · 🟡 ≥ {Math.round(s.yearsIn * 0.7)} años · 🔴 menos
        </div>
      </div>
    </div>
  );
}

export default function FireTab() {
  const {
    divLog, fxRates,
    fireCcy, setFireCcy, fireGastosYear, setFireGastosYear,
    gastosLog,
    CTRL_DATA, INCOME_DATA, GASTOS_MONTH,
    ibData,
    FI_TRACK, DIV_BY_YEAR, portfolioTotals,
    privacyMode,
  } = useHome();

  // === FX RATES (centralized via useFxRates hook) ===
const fxFire = useFxRates(fxRates);
const fxEurUsd = fxFire.usdEur;   // USD per EUR (~1.14)
const fxCnyUsd = fxFire.usdCny;   // USD per CNY (~0.138)
const fxCnyEur = fxCnyUsd / fxEurUsd; // CNY → EUR
const isUSD = fireCcy === "USD";
const sym = isUSD ? "$" : "€";

// === GASTOS: native currencies from GASTOS_MONTH ===
const gMonths = Object.keys(GASTOS_MONTH).sort();
const last12g = gMonths.slice(-12);
const nGM = last12g.length || 1;

// Monthly native totals
const gNative = {};
gMonths.forEach(m => {
  const d = GASTOS_MONTH[m];
  gNative[m] = {eur: d.eur||0, cny: d.cny||0, usd: d.usd||0};
});

// Convert to display currency for totals
const toDisp = (eur, cny, usd) => {
  if (isUSD) return eur * fxEurUsd + cny * fxCnyUsd + usd;
  return eur + cny * fxCnyEur + usd / fxEurUsd;
};

// Last 12m averages in native
const avgEur = last12g.reduce((s,m) => s + (gNative[m]?.eur||0), 0) / nGM;
const avgCny = last12g.reduce((s,m) => s + (gNative[m]?.cny||0), 0) / nGM;
const avgUsd = last12g.reduce((s,m) => s + (gNative[m]?.usd||0), 0) / nGM;
const gastosAvg = toDisp(avgEur, avgCny, avgUsd);
const gastosAnnual = gastosAvg * 12;

// === ESCENARIOS ESPAÑA: from gastosLog with categories ===
const chinaCats = new Set(["ALQ","UCH","VIA","Alquiler","Utilities China","Viajes"]);
const gByMonth = {};
gastosLog.filter(g => g.amount < 0 && !g.secreto).forEach(g => {
  const m = g.date?.slice(0,7); if (!m) return;
  if (!gByMonth[m]) gByMonth[m] = {eurFijo:0, eurVida:0, cnyVida:0, cnyChinaOnly:0, usd:0, thb:0};
  const ccy = (g.currency||"EUR").toUpperCase();
  const cat = g.catCode || g.cat || "";
  const amt = Math.abs(g.amount);
  if (ccy === "CNY") {
    if (chinaCats.has(cat)) gByMonth[m].cnyChinaOnly += amt;
    else gByMonth[m].cnyVida += amt;
  } else if (ccy === "USD") { gByMonth[m].usd += amt; }
  else if (ccy === "THB") { gByMonth[m].thb += amt; }
  else { gByMonth[m].eurVida += amt; }
});
const gMK = Object.keys(gByMonth).sort().slice(-12);
const nGE = gMK.length || 1;

// España realista: EUR todos + CNY vida diaria (convertida, lo que gastarías en España)
const avgEurAll = gMK.reduce((s,m) => s + (gByMonth[m]?.eurFijo||0) + (gByMonth[m]?.eurVida||0), 0) / nGE;
const avgCnyVida = gMK.reduce((s,m) => s + (gByMonth[m]?.cnyVida||0), 0) / nGE;
const avgCnyChinaOnly = gMK.reduce((s,m) => s + (gByMonth[m]?.cnyChinaOnly||0), 0) / nGE;
const cnyVidaEur = avgCnyVida * fxCnyEur;

// Escenario España = gastos EUR + gastos vida CNY convertidos (comida, ropa, ocio, etc serían igual en España)
const espRealistaM = isUSD ? (avgEurAll + cnyVidaEur) * fxEurUsd : avgEurAll + cnyVidaEur;
const espRealistaA = espRealistaM * 12;
// Escenario Base España = solo gastos EUR (mínimo estructural sin vida diaria China)
const espBaseM = isUSD ? avgEurAll * fxEurUsd : avgEurAll;
const espBaseA = espBaseM * 12;

// Base Real = España + China obligatorio (ALQ, UCH, UTI — gastos que tendras siempre)
const cnyChinaObligEur = avgCnyChinaOnly * fxCnyEur;
const baseRealM = isUSD ? (avgEurAll + cnyChinaObligEur) * fxEurUsd : avgEurAll + cnyChinaObligEur;
const baseRealA = baseRealM * 12;

// === DIVIDENDOS (USD from IB) ===
const all = divLog.filter(d => d.date && d.gross);
const divByMonth = {};
all.forEach(d => { const m=d.date.slice(0,7); if(!divByMonth[m])divByMonth[m]={g:0,n:0}; divByMonth[m].g+=d.gross||0; divByMonth[m].n+=d.net||0; });
const last12d = Object.keys(divByMonth).sort().slice(-12);
const divNet12mUSD = last12d.reduce((s,m) => s+(divByMonth[m]?.n||0), 0);
const divNetMUSD = divNet12mUSD / 12;
const divNetM = isUSD ? divNetMUSD : divNetMUSD / fxEurUsd;
const divNetA = divNetM * 12;

// === PATRIMONIO (canonical via useNetLiquidationValue: IB live → CTRL fallback) ===
const patUSD = useNetLiquidationValue({ ibData, ctrlData: CTRL_DATA });
const pat = isUSD ? patUSD : patUSD / fxEurUsd;

// === SUELDO ===
const sueldos = INCOME_DATA.filter(d => d.sl>0).map(d => d.sl);
const sueldoMUSD = sueldos.length>0 ? sueldos.reduce((s,v)=>s+v,0)/sueldos.length : 0;
const sueldoM = isUSD ? sueldoMUSD : sueldoMUSD / fxEurUsd;

// === FIRE METRICS (single source of truth via useFireMetrics hook) ===
const divCoversPct = gastosAvg>0 ? (divNetM/gastosAvg*100) : 0;
const espCoversPct = espRealistaM>0 ? (divNetM/espRealistaM*100) : 0;
const espBasePct = espBaseM>0 ? (divNetM/espBaseM*100) : 0;
const baseRealCoversPct = baseRealM>0 ? (divNetM/baseRealM*100) : 0;
const gapM = divNetM - gastosAvg;
const savingsM = divNetM + sueldoM - gastosAvg;
const savingsRate = (divNetM+sueldoM)>0 ? (savingsM/(divNetM+sueldoM)*100) : 0;

// Canonical FIRE metrics for "Vida Actual" (full gastos)
const fireMain = useFireMetrics({
  nlv: patUSD,
  annualExpenses: gastosAnnual,
  annualDividendsNet: divNetA,
  monthlySavings: savingsM,
});
// FIRE metrics for "Base Real" (Spain + China obligatorio)
const fireBaseReal = useFireMetrics({
  nlv: patUSD,
  annualExpenses: baseRealA,
  annualDividendsNet: divNetA,
  monthlySavings: savingsM,
});
const swr35 = fireMain.fireTarget;
const swr35BaseReal = fireBaseReal.fireTarget;
const yearsToFire = fireMain.yearsToFire;
const yearsToFireBaseReal = fireBaseReal.yearsToFire;
const fireRet = pat>0 ? (gastosAnnual/pat*100) : 0;

// Div by year
const divByYear={}; all.forEach(d=>{const y=d.date.slice(0,4);if(!divByYear[y])divByYear[y]={g:0,n:0};divByYear[y].g+=d.gross||0;divByYear[y].n+=d.net||0;});
const divYK=Object.keys(divByYear).sort();

const retCol = v => v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
// fK: short money formatter. Uses M for >=1M (was always K — Audit shows
// FIRE numbers like $3,661,000 displayed as "$3661.0K" instead of "$3.66M").
const fK = v => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${_sf(v/1e6, 2)}M`;
  if (a >= 1000) return `${_sf(v/1000, 1)}K`;
  return _sf(a, 0);
};

const [fireSection, setFireSection] = useState("dashboard");
const [useBaseReal, setUseBaseReal] = useState(false);
// When toggle is on, use base real (Spain + China obligatorio) for FIRE calcs
const activeGastosM = useBaseReal ? baseRealM : gastosAvg;
const activeGastosA = useBaseReal ? baseRealA : gastosAnnual;
const activeSwr35 = useBaseReal ? swr35BaseReal : swr35;
const activeYearsToFire = useBaseReal ? yearsToFireBaseReal : yearsToFire;
const activeFireRet = pat>0 ? (activeGastosA/pat*100) : 0;
const activeGapM = divNetM - activeGastosM;
const activeDivCoversPct = activeGastosM>0 ? (divNetM/activeGastosM*100) : 0;

if (!pat && !gastosAnnual && divLog.length === 0) {
  return <EmptyState icon="🔥" title="Sin datos para calcular FIRE" subtitle="Se necesitan datos de patrimonio, gastos y dividendos para generar las proyecciones de independencia financiera." action="Cargar datos" onAction={() => {}} />;
}

return (
<div style={{display:"flex",flexDirection:"column",gap:14}}>
  {/* Toggle: Dashboard | Your Number | Monte Carlo */}
  <div style={{display:"flex",gap:4}}>
    {[{id:"dashboard",lbl:"📊 Dashboard"},{id:"yournumber",lbl:"🔢 Tu Número"},{id:"montecarlo",lbl:"🎲 Monte Carlo"}].map(t=>(
      <button key={t.id} onClick={()=>setFireSection(t.id)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${fireSection===t.id?"var(--gold)":"var(--border)"}`,background:fireSection===t.id?"var(--gold-dim)":"transparent",color:fireSection===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:fireSection===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)"}}>{t.lbl}</button>
    ))}
  </div>

  {fireSection === "yournumber" && <YourNumberSection pat={pat} divNetA={divNetA} gastosAnnual={gastosAnnual} espRealistaA={espRealistaA} baseRealA={baseRealA} fxEurUsd={fxEurUsd} fireCcy={fireCcy} />}
  {fireSection === "montecarlo" && (
    <MonteCarloSection
      nlv={patUSD}
      annualSavings={savingsM * 12}
      fireTarget={swr35}
      fireCcy={fireCcy}
      sym={sym}
      privacyMode={privacyMode}
    />
  )}
  {fireSection === "dashboard" && <>

  {/* ── SECTION 1: Hero — Cobertura central + KPIs ── */}
  <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:10}}>
    {/* Big coverage % */}
    <div style={{padding:"20px 30px",background:activeDivCoversPct>=100?"rgba(48,209,88,.06)":activeDivCoversPct>=50?"rgba(200,164,78,.06)":"rgba(255,69,58,.06)",border:`2px solid ${activeDivCoversPct>=100?"rgba(48,209,88,.3)":activeDivCoversPct>=50?"rgba(200,164,78,.3)":"rgba(255,69,58,.3)"}`,borderRadius:16,textAlign:"center",display:"flex",flexDirection:"column",justifyContent:"center",minWidth:160}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,fontWeight:600,marginBottom:4}}>COBERTURA NETA</div>
      <div style={{fontSize:52,fontWeight:900,color:activeDivCoversPct>=100?"var(--green)":activeDivCoversPct>=50?"var(--gold)":"var(--red)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(activeDivCoversPct,0)}%</div>
      <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>div neto / gastos</div>
      <div style={{maxWidth:140,margin:"8px auto 0",height:6,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(activeDivCoversPct,100)}%`,height:"100%",background:activeDivCoversPct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div>
    </div>
    {/* KPI grid */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8}}>
      {[
        {l:"PATRIMONIO",v:privacyMode?"•••":`$${fDol(patUSD)}`,c:"var(--text-primary)",sub:privacyMode?"•••":`FIRE: $${fK(swr35)} (${_sf(patUSD/swr35*100,0)}%)`},
        {l:"DIV NETO TTM",v:privacyMode?"•••":`$${fDol(divNet12mUSD)}`,c:"var(--green)",sub:privacyMode?"•••":`$${_sf(divNetMUSD,0)}/mes · $${_sf(divNetMUSD/30,1)}/dia`},
        {l:"GASTOS TTM",v:privacyMode?"•••":`$${fDol(toDisp(avgEur,avgCny,avgUsd)*12)}`,c:"var(--red)",sub:privacyMode?"•••":`$${_sf(toDisp(avgEur,avgCny,avgUsd),0)}/mes`},
        {l:"GAP MENSUAL",v:privacyMode?"•••":`${activeGapM>=0?"+":"-"}$${_sf(Math.abs(activeGapM),0)}`,c:activeGapM>=0?"var(--green)":"var(--red)",sub:activeGapM>=0?"superavit":"deficit mensual"},
        {l:"TASA DE AHORRO",v:`${_sf(savingsRate,0)}%`,c:savingsRate>30?"var(--green)":savingsRate>15?"var(--gold)":"var(--red)",sub:`div+sueldo-gastos`},
        {l:"FIRE NUMBER @3.5%",v:privacyMode?"•••":`$${fK(swr35)}`,c:"var(--gold)",sub:`${_sf(patUSD/swr35*100,0)}% patrimonio`},
      ].map((k,i)=>(
        <div key={i} style={{padding:"10px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}>
          <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600}}>{k.l}</div>
          <div style={{fontSize:16,fontWeight:800,color:k.c,fontFamily:"var(--fm)",marginTop:2}}>{k.v}</div>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{k.sub}</div>
        </div>
      ))}
    </div>
  </div>


  {/* ── SECTION 3: Cobertura por Escenario ── */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
    {[
      {l:"VIDA ACTUAL",sub:"China + España",m:gastosAvg,pct:divCoversPct,bg:"rgba(255,159,10,.04)",bc:"rgba(255,159,10,.15)"},
      {l:"BASE REAL",sub:"ESP + CN obligatorio",m:baseRealM,pct:baseRealCoversPct,bg:"rgba(200,164,78,.06)",bc:"rgba(200,164,78,.2)"},
      {l:"ESPAÑA REALISTA",sub:"EUR + vida diaria CN",m:espRealistaM,pct:espCoversPct,bg:"rgba(48,209,88,.04)",bc:"rgba(48,209,88,.15)"},
      {l:"FIJOS ESPAÑA",sub:"solo EUR",m:espBaseM,pct:espBasePct,bg:"rgba(100,210,255,.04)",bc:"rgba(100,210,255,.12)"},
    ].map((s,i)=>{
      const gap = divNetM - s.m;
      return <div key={i} style={{padding:16,background:s.bg,border:`1px solid ${s.bc}`,borderRadius:14,textAlign:"center"}}>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,marginBottom:4,fontWeight:600}}>{s.l}</div>
        <div style={{fontSize:36,fontWeight:800,color:s.pct>=100?"var(--green)":s.pct>=70?"var(--gold)":"var(--red)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(s.pct,0)}%</div>
        <div style={{maxWidth:180,margin:"8px auto",height:5,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(s.pct,100)}%`,height:"100%",background:s.pct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":`$${_sf(s.m,0)}/mes`}</div>
        <div style={{fontSize:10,fontWeight:700,color:gap>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",marginTop:4}}>{privacyMode?"•••":`${gap>=0?"+":""}$${_sf(gap,0)}/mes`}</div>
        <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,fontStyle:"italic"}}>{s.sub}</div>
      </div>;
    })}
  </div>

  {/* ── SECTION 3b: Monthly Breakdown Table ── */}
  {(() => {
    const [period, setPeriod] = [fireGastosYear, setFireGastosYear];
    const allM = Object.keys(GASTOS_MONTH).sort();
    const now = new Date();
    const getMonths = (p) => {
      if (p === "6m") return allM.slice(-6);
      if (p === "12m" || !p) return allM.slice(-12);
      if (p === "24m") return allM.slice(-24);
      return allM.filter(m => m.startsWith(p)); // year like "2025"
    };
    const selMonths = getMonths(period || "12m");
    const years = [...new Set(allM.map(m=>m.slice(0,4)))].sort().reverse();
    const mNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

    // Build rows
    const rows = selMonths.map(m => {
      const g = gNative[m] || {eur:0,cny:0,usd:0};
      const totalAll = toDisp(g.eur, g.cny, g.usd);
      const totalSinChina = toDisp(g.eur, 0, g.usd);
      const dNet = divByMonth[m]?.n || 0;
      const dNetDisp = isUSD ? dNet : dNet / fxEurUsd;
      const covAll = totalAll > 0 ? (dNetDisp/totalAll*100) : 0;
      const covSinCN = totalSinChina > 0 ? (dNetDisp/totalSinChina*100) : 0;
      return { m, eur: g.eur, cny: g.cny, usd: g.usd, totalAll, totalSinChina, dNet: dNetDisp, covAll, covSinCN };
    }).reverse();

    const sumGAll = rows.reduce((s,r) => s+r.totalAll, 0);
    const sumGSin = rows.reduce((s,r) => s+r.totalSinChina, 0);
    const sumDiv = rows.reduce((s,r) => s+r.dNet, 0);
    const avgGAll = rows.length > 0 ? sumGAll/rows.length : 0;
    const avgDiv = rows.length > 0 ? sumDiv/rows.length : 0;

    const td = {padding:"5px 8px",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)",fontSize:11};

    return <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
        <span style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>Gastos vs Dividendos Mensual</span>
        <div style={{display:"flex",gap:3}}>
          {["6m","12m","24m",...years].map(p=>(
            <button key={p} onClick={()=>setFireGastosYear(p)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${(period||"12m")===p?"var(--gold)":"var(--border)"}`,background:(period||"12m")===p?"var(--gold-dim)":"transparent",color:(period||"12m")===p?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6,marginBottom:10}}>
        <div style={{padding:"6px 10px",background:"var(--subtle-bg)",borderRadius:6,fontSize:9,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--text-tertiary)"}}>Media gastos: </span><b style={{color:"var(--red)"}}>{privacyMode?"•••":`$${_sf(avgGAll,0)}/mes`}</b>
        </div>
        <div style={{padding:"6px 10px",background:"var(--subtle-bg)",borderRadius:6,fontSize:9,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--text-tertiary)"}}>Media div neto: </span><b style={{color:"var(--green)"}}>{privacyMode?"•••":`$${_sf(avgDiv,0)}/mes`}</b>
        </div>
        <div style={{padding:"6px 10px",background:"var(--subtle-bg)",borderRadius:6,fontSize:9,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--text-tertiary)"}}>Cobertura media: </span><b style={{color:avgGAll>0&&avgDiv/avgGAll>=1?"var(--green)":"var(--gold)"}}>{avgGAll>0?_sf(avgDiv/avgGAll*100,0):0}%</b>
        </div>
      </div>
      {/* Bar chart with exact numbers */}
      <div style={{overflowX:"auto",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:2,minWidth:Math.max(rows.length*70,400),height:220,padding:"0 4px"}}>
          {[...rows].reverse().map((r,i) => {
            const maxBar = Math.max(...rows.map(rr => Math.max(rr.totalAll, rr.dNet)), 1);
            const hD = r.dNet / maxBar * 160;
            const hG = r.totalAll / maxBar * 160;
            const covCol = r.covAll >= 100 ? "var(--green)" : r.covAll >= 50 ? "var(--gold)" : "var(--red)";
            const mi = parseInt(r.m.slice(5,7))-1;
            return <div key={r.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",minWidth:55}}>
              {/* Coverage % on top */}
              <div style={{fontSize:10,fontWeight:800,color:covCol,fontFamily:"var(--fm)",marginBottom:2}}>{_sf(r.covAll,0)}%</div>
              {/* Bars side by side */}
              <div style={{display:"flex",gap:2,alignItems:"flex-end",width:"100%",justifyContent:"center",height:160}}>
                {/* Div bar */}
                <div style={{width:"42%",maxWidth:28,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{fontSize:8,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>{privacyMode?"•":r.dNet>=1000?`$${_sf(r.dNet/1000,1)}K`:`$${_sf(r.dNet,0)}`}</div>
                  <div style={{width:"100%",height:Math.max(hD,3),background:"rgba(48,209,88,.65)",borderRadius:"3px 3px 0 0"}}/>
                </div>
                {/* Gastos bar */}
                <div style={{width:"42%",maxWidth:28,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{fontSize:8,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>{privacyMode?"•":r.totalAll>=1000?`$${_sf(r.totalAll/1000,1)}K`:`$${_sf(r.totalAll,0)}`}</div>
                  <div style={{width:"100%",height:Math.max(hG,3),background:"rgba(255,69,58,.45)",borderRadius:"3px 3px 0 0"}}/>
                </div>
              </div>
              {/* Month label */}
              <div style={{fontSize:9,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4}}>{mNames[mi]}</div>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{r.m.slice(0,4)}</div>
            </div>;
          })}
        </div>
        <div style={{display:"flex",gap:14,justifyContent:"center",marginTop:6,fontSize:9,fontFamily:"var(--fm)"}}>
          <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"rgba(48,209,88,.65)"}}/> Div neto</span>
          <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"rgba(255,69,58,.45)"}}/> Gastos</span>
        </div>
      </div>

      <div style={{overflowX:"auto",maxHeight:400}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
          <thead><tr>
            {["MES","EUR","CNY","USD","TOTAL","SIN CHINA","DIV NETO","COB %","COB s/CN"].map((h,i)=>
              <th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)",position:"sticky",top:0,background:"var(--bg)"}}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {rows.map((r,i) => {
              const mi = parseInt(r.m.slice(5,7))-1;
              return <tr key={r.m} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                <td style={{...td,fontWeight:600,color:"var(--text-secondary)"}}>{mNames[mi]} {r.m.slice(2,4)}</td>
                <td style={{...td,textAlign:"right",color:r.eur>0?"var(--text-primary)":"var(--text-tertiary)"}}>{privacyMode?"•••":`€${_sf(r.eur,0)}`}</td>
                <td style={{...td,textAlign:"right",color:r.cny>0?"var(--text-primary)":"var(--text-tertiary)"}}>{privacyMode?"•••":`¥${_sf(r.cny,0)}`}</td>
                <td style={{...td,textAlign:"right",color:r.usd>0?"var(--text-primary)":"var(--text-tertiary)"}}>{privacyMode?"•••":r.usd>0?`$${_sf(r.usd,0)}`:"-"}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:"var(--red)"}}>{privacyMode?"•••":`$${_sf(r.totalAll,0)}`}</td>
                <td style={{...td,textAlign:"right",color:"var(--orange)"}}>{privacyMode?"•••":`$${_sf(r.totalSinChina,0)}`}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:"var(--green)"}}>{privacyMode?"•••":`$${_sf(r.dNet,0)}`}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:r.covAll>=100?"var(--green)":r.covAll>=50?"var(--gold)":"var(--red)"}}>{_sf(r.covAll,0)}%</td>
                <td style={{...td,textAlign:"right",fontWeight:600,color:r.covSinCN>=100?"var(--green)":r.covSinCN>=50?"var(--gold)":"var(--text-secondary)"}}>{_sf(r.covSinCN,0)}%</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>;
  })()}

  {/* ── SECTION 4: Freedom Numbers ── */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>Freedom Numbers</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
      {[
        {l:"@3% SWR",fn:gastosAnnual/0.03},{l:"@3.5% SWR",fn:swr35},{l:"@4% SWR",fn:gastosAnnual/0.04},
        {l:"BASE REAL",fn:baseRealA/0.035,sub:"ESP+CN oblig"},{l:"ESPAÑA",fn:espRealistaA/0.035,sub:"realista"},{l:"LEAN 70%",fn:gastosAnnual*0.7/0.035},
      ].map((f,i)=>{
        const pct=f.fn>0?(patUSD/f.fn*100):0;
        const divPct=f.fn>0?(divNet12mUSD/(f.fn*0.035)*100):0;
        return <div key={i} style={{padding:12,background:"var(--row-alt)",borderRadius:10,border:"1px solid var(--subtle-border)"}}>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:4}}>{f.l}{f.sub?` (${f.sub})`:""}</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{privacyMode?"•••":`$${fK(f.fn)}`}</div>
          <div style={{height:5,background:"var(--subtle-bg2)",borderRadius:3,marginTop:6,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:pct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:9,fontWeight:600,color:pct>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(pct,0)}% pat</span>
            <span style={{fontSize:9,color:divPct>=100?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{_sf(divPct,0)}% div</span>
          </div>
        </div>;
      })}
    </div>
  </div>

  {/* ── SECTION 5: Dividendos Netos por Año ── */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>Dividendos Netos por Año</div>
    <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140}}>
      {divYK.map((y,i)=>{
        const d=divByYear[y]; const nV=d.n; const mx=Math.max(...divYK.map(k=>divByYear[k].n),1); const h=nV/mx*100;
        const prev=i>0?divByYear[divYK[i-1]].n:0; const gr=prev>0?((nV-prev)/prev*100):null;
        return <div key={y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
          {gr!=null&&<div style={{fontSize:7,fontWeight:600,color:retCol(gr),fontFamily:"var(--fm)",marginBottom:2}}>{gr>=0?"+":""}{_sf(gr,0)}%</div>}
          <div style={{fontSize:9,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:2}}>{privacyMode?"•••":`$${fK(nV)}`}</div>
          <div style={{width:"100%",maxWidth:36,height:`${Math.max(h,4)}%`,background:"var(--green)",borderRadius:"4px 4px 0 0",opacity:.6}}/>
          <div style={{fontSize:9,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:3}}>{y}</div>
        </div>;
      })}
    </div>
  </div>

  {/* ── SECTION 6: Escenarios Table ── */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>Escenarios</div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:450}}><thead><tr>
      {["","GASTOS/AÑO","FREEDOM #","PAT %","DIV %","GAP/MES"].map((h,i)=><th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
    </tr></thead><tbody>
      {[
        {l:"Vida Actual",g:gastosAnnual},{l:"Base Real",g:baseRealA,hl:true},{l:"España Realista",g:espRealistaA},
        {l:"Lean (70%)",g:gastosAnnual*0.7},{l:"Ultra (50%)",g:gastosAnnual*0.5},{l:"Fat (+30%)",g:gastosAnnual*1.3},
      ].map((s,i)=>{
        const fn=s.g/0.035; const pp=fn>0?(patUSD/fn*100):0; const dp=s.g>0?(divNet12mUSD/s.g*100):0; const gap=(divNet12mUSD-s.g)/12;
        return <tr key={i} style={{background:s.hl?"rgba(200,164,78,.06)":i%2?"var(--row-alt)":"transparent"}}>
          <td style={{padding:"5px 8px",fontWeight:s.hl?700:500,fontFamily:"var(--fm)",color:s.hl?"var(--gold)":"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>{s.l}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{privacyMode?"•••":`$${fK(s.g)}`}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid var(--subtle-bg)"}}>{privacyMode?"•••":`$${fK(fn)}`}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:pp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid var(--subtle-bg)"}}>{_sf(pp,0)}%</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:dp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid var(--subtle-bg)"}}>{_sf(dp,0)}%</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:gap>=0?"var(--green)":"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{privacyMode?"•••":`${gap>=0?"+":""}$${_sf(Math.abs(gap),0)}`}</td>
        </tr>;
      })}
    </tbody></table></div>
  </div>

  </>}
</div>
);
}
