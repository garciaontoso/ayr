import { useState, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { EmptyState } from '../ui/EmptyState.jsx';

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
      guaranteedIncome: Math.round(isUSD ? 23000 * fxEurUsd : 23000), // estimated guaranteed
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
      guaranteedIncome: Math.round(divNetA > 0 ? divNetA : 6000),
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
      guaranteedIncome: Math.round(divNetA > 0 ? divNetA : 6000),
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
      guaranteedIncome: Math.round(divNetA > 0 ? divNetA : 6000),
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
            <div style={{ marginTop: 8, padding: '8px', background: 'rgba(214,158,46,.06)', borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>Retorno real neto</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: r.netReturnRetired * 100 > 2 ? 'var(--green)' : r.netReturnRetired * 100 > 0 ? 'var(--gold)' : 'var(--red)', fontFamily: 'var(--fm)' }}>
                {(r.netReturnRetired * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          {/* Results */}
          <div style={{ padding: 12, background: 'rgba(214,158,46,.04)', borderRadius: 10, border: '1px solid rgba(214,158,46,.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, fontFamily: 'var(--fm)' }}>📋 RESULTADOS</div>
            {[
              ['Año jubilación', r.retirementYear, 'var(--text-primary)'],
              ['Capital acumulado', fN(r.capital), 'var(--text-primary)'],
              ['Coste vida jubilación/año', fN(r.costAtRetirement), 'var(--red)'],
              ['Ingreso garantizado/año', fN(r.guaranteedAtRetirement), 'var(--green)'],
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
                        background: isActive ? 'rgba(214,158,46,.1)' : 'transparent',
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
  } = useHome();

  // === FX RATES ===
const latest = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).slice(-1)[0] || {};
const fxEurUsd = fxRates?.EUR ? 1/fxRates.EUR : latest?.fx || 1.18;
const fxCnyUsd = fxRates?.CNY ? 1/fxRates.CNY : 1/7.25;
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

// === PATRIMONIO (use IB NLV if available, fallback to CTRL snapshot) ===
const latestCtrl = CTRL_DATA.filter(c => c.pu>0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).slice(-1)[0] || {};
const ibNlv = ibData?.summary?.nlv?.amount || 0;
const patUSD = ibNlv > 0 ? ibNlv : (latestCtrl.pu || 0);
const pat = isUSD ? patUSD : patUSD / fxEurUsd;

// === SUELDO ===
const sueldos = INCOME_DATA.filter(d => d.sl>0).map(d => d.sl);
const sueldoMUSD = sueldos.length>0 ? sueldos.reduce((s,v)=>s+v,0)/sueldos.length : 0;
const sueldoM = isUSD ? sueldoMUSD : sueldoMUSD / fxEurUsd;

// === FIRE METRICS ===
const divCoversPct = gastosAvg>0 ? (divNetM/gastosAvg*100) : 0;
const espCoversPct = espRealistaM>0 ? (divNetM/espRealistaM*100) : 0;
const espBasePct = espBaseM>0 ? (divNetM/espBaseM*100) : 0;
const baseRealCoversPct = baseRealM>0 ? (divNetM/baseRealM*100) : 0;
const fireRet = pat>0 ? (gastosAnnual/pat*100) : 0;
const gapM = divNetM - gastosAvg;
const savingsM = divNetM + sueldoM - gastosAvg;
const savingsRate = (divNetM+sueldoM)>0 ? (savingsM/(divNetM+sueldoM)*100) : 0;
const swr35 = gastosAnnual > 0 ? gastosAnnual / 0.035 : 0;
const swr35BaseReal = baseRealA > 0 ? baseRealA / 0.035 : 0;
const yearsToFire = (()=>{ if(!pat||!savingsM||!gastosAnnual||isNaN(pat)||isNaN(swr35)) return 99; if(pat>=swr35) return 0; let p=pat; for(let y=1;y<=50;y++){p=p*1.07+savingsM*12;if(p*0.035>=gastosAnnual)return y;} return 99; })();
const yearsToFireBaseReal = (()=>{ if(!pat||!savingsM||!baseRealA||isNaN(pat)||isNaN(swr35BaseReal)) return 99; if(pat>=swr35BaseReal) return 0; let p=pat; for(let y=1;y<=50;y++){p=p*1.07+savingsM*12;if(p*0.035>=baseRealA)return y;} return 99; })();

// Div by year
const divByYear={}; all.forEach(d=>{const y=d.date.slice(0,4);if(!divByYear[y])divByYear[y]={g:0,n:0};divByYear[y].g+=d.gross||0;divByYear[y].n+=d.net||0;});
const divYK=Object.keys(divByYear).sort();

const retCol = v => v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
const fK = v => Math.abs(v)>=1000?`${_sf(v/1000,1)}K`:_sf(Math.abs(v),0);

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
  {/* Toggle row: sections + currency */}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
    <div style={{display:"flex",gap:4}}>
      {[{id:"dashboard",lbl:"📊 Dashboard"},{id:"yournumber",lbl:"🔢 Your Number"}].map(t=>(
        <button key={t.id} onClick={()=>setFireSection(t.id)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${fireSection===t.id?"var(--gold)":"var(--border)"}`,background:fireSection===t.id?"var(--gold-dim)":"transparent",color:fireSection===t.id?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:fireSection===t.id?700:500,cursor:"pointer",fontFamily:"var(--fb)"}}>{t.lbl}</button>
      ))}
    </div>
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <button onClick={()=>setUseBaseReal(!useBaseReal)} title="Base real = Espana + China obligatorio. Excluye gastos voluntarios de China." style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${useBaseReal?"var(--gold)":"var(--border)"}`,background:useBaseReal?"var(--gold-dim)":"transparent",color:useBaseReal?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:useBaseReal?700:500,cursor:"pointer",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>
        {useBaseReal ? "🎯 Base Real" : "🌏 Todos Gastos"}
      </button>
      <div style={{display:"flex",borderRadius:8,border:"1px solid var(--border)",overflow:"hidden"}}>
        {["EUR","USD"].map(c=><button key={c} onClick={()=>setFireCcy(c)} style={{padding:"6px 16px",border:"none",background:fireCcy===c?"var(--gold-dim)":"transparent",color:fireCcy===c?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:fireCcy===c?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{c==="EUR"?"€ EUR":"$ USD"}</button>)}
      </div>
    </div>
  </div>

  {/* Base Real comparison banner */}
  {useBaseReal && (
    <div style={{padding:"12px 16px",background:"rgba(214,158,46,.06)",borderRadius:12,border:"1px solid rgba(214,158,46,.15)",display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",flex:"1 1 140px"}}>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600}}>FIRE TODOS GASTOS</div>
        <div style={{fontSize:14,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{sym}{fK(swr35)}</div>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
      </div>
      <div style={{fontSize:14,color:"var(--text-tertiary)"}}>vs</div>
      <div style={{textAlign:"center",flex:"1 1 140px"}}>
        <div style={{fontSize:8,color:"var(--gold)",fontFamily:"var(--fm)",fontWeight:700}}>FIRE BASE REAL</div>
        <div style={{fontSize:14,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{fK(swr35BaseReal)}</div>
        <div style={{fontSize:9,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{baseRealM.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
      </div>
      <div style={{textAlign:"center",flex:"1 1 140px"}}>
        <div style={{fontSize:8,color:"var(--green)",fontFamily:"var(--fm)",fontWeight:600}}>AHORRO</div>
        <div style={{fontSize:14,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>{sym}{fK(swr35 - swr35BaseReal)}</div>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontStyle:"italic"}}>sin China voluntario</div>
      </div>
    </div>
  )}

  {/* FI_TRACK sync warning */}
  {(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const latestFI = FI_TRACK && FI_TRACK.length > 0
      ? [...FI_TRACK].sort((a,b) => (a.m||"").localeCompare(b.m||"")).slice(-1)[0]?.m
      : null;
    if (!latestFI || latestFI < currentMonth) {
      const missingLabel = latestFI
        ? (() => { const [y,m] = currentMonth.split('-'); const mNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]; return `${mNames[parseInt(m,10)-1]} ${y}`; })()
        : "desconocido";
      return (
        <div style={{padding:"10px 14px",background:"rgba(255,159,10,.08)",border:"1px solid rgba(255,159,10,.25)",borderRadius:10,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14}}>&#9888;&#65039;</span>
          <span style={{fontSize:11,color:"var(--orange)",fontFamily:"var(--fm)",fontWeight:600}}>
            Datos de {missingLabel} no sincronizados
          </span>
          <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:4}}>
            ({latestFI ? `ultimo: ${latestFI}` : "sin datos FI_TRACK"})
          </span>
        </div>
      );
    }
    return null;
  })()}

  {/* DIVIDENDOS vs GASTOS — Comparison Card */}
  {(() => {
    const divTTM = portfolioTotals?.totalDivUSD || 0;
    const divMonthlyUSD = divTTM / 12;
    const divMonthly = isUSD ? divMonthlyUSD : divMonthlyUSD / fxEurUsd;
    const divAnnual = divMonthly * 12;
    const coveragePct = gastosAvg > 0 ? (divMonthly / gastosAvg * 100) : 0;

    // Dividend CAGR from DIV_BY_YEAR (net, last 3+ years)
    const dYears = Object.keys(DIV_BY_YEAR || {}).sort();
    let divCAGR = null;
    let yearsUsed = 0;
    let projYears = null;
    if (dYears.length >= 3) {
      const first = dYears[0];
      const last = dYears[dYears.length - 1];
      const n = parseInt(last) - parseInt(first);
      const vFirst = DIV_BY_YEAR[first]?.n || 0;
      const vLast = DIV_BY_YEAR[last]?.n || 0;
      if (n > 0 && vFirst > 0 && vLast > 0) {
        divCAGR = (Math.pow(vLast / vFirst, 1 / n) - 1) * 100;
        yearsUsed = n;
        // Project years to cover expenses: divAnnualUSD * (1+cagr)^Y >= gastosAnnualUSD
        const divAnnualUSD = divTTM;
        const gastosAnnualUSD = isUSD ? gastosAnnual : gastosAnnual * fxEurUsd;
        if (divAnnualUSD > 0 && gastosAnnualUSD > divAnnualUSD && divCAGR > 0) {
          const cagr = divCAGR / 100;
          projYears = Math.ceil(Math.log(gastosAnnualUSD / divAnnualUSD) / Math.log(1 + cagr));
        } else if (divAnnualUSD >= gastosAnnualUSD) {
          projYears = 0;
        }
      }
    }

    // Bar widths
    const maxBar = Math.max(divMonthly, gastosAvg, 1);

    return (
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
        <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>
          Dividendos vs Gastos Mensuales
        </div>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:12}}>Gastos reales (media 12 meses, incluye China + Espa&ntilde;a)</div>

        {/* Side-by-side bars */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {/* Dividends bar */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:10,color:"var(--green)",fontFamily:"var(--fm)",fontWeight:600}}>Dividendos (TTM)</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>{sym}{divMonthly.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
            </div>
            <div style={{height:20,background:"var(--subtle-border)",borderRadius:6,overflow:"hidden",position:"relative"}}>
              <div style={{width:`${Math.min(divMonthly/maxBar*100,100)}%`,height:"100%",background:"linear-gradient(90deg, rgba(48,209,88,.3), rgba(48,209,88,.6))",borderRadius:6,transition:"width .3s"}} />
            </div>
          </div>
          {/* Expenses bar */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:10,color:"var(--red)",fontFamily:"var(--fm)",fontWeight:600}}>Gastos</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
            </div>
            <div style={{height:20,background:"var(--subtle-border)",borderRadius:6,overflow:"hidden",position:"relative"}}>
              <div style={{width:`${Math.min(gastosAvg/maxBar*100,100)}%`,height:"100%",background:"linear-gradient(90deg, rgba(255,69,58,.3), rgba(255,69,58,.6))",borderRadius:6,transition:"width .3s"}} />
            </div>
          </div>
        </div>

        {/* Coverage result */}
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:16,padding:"14px 0",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",flexWrap:"wrap"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:2}}>COBERTURA</div>
            <div style={{fontSize:32,fontWeight:800,color:coveragePct>=100?"var(--green)":coveragePct>=50?"var(--gold)":"var(--red)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(coveragePct,1)}%</div>
          </div>
          <div style={{width:1,height:40,background:"var(--border)"}} />
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:2}}>GAP MENSUAL</div>
            <div style={{fontSize:20,fontWeight:700,color:(divMonthly-gastosAvg)>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{(divMonthly-gastosAvg)>=0?"+":""}{sym}{(divMonthly-gastosAvg).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
          </div>
          {divCAGR !== null && (
            <>
              <div style={{width:1,height:40,background:"var(--border)"}} />
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:2}}>DIV CAGR ({yearsUsed}a)</div>
                <div style={{fontSize:20,fontWeight:700,color:divCAGR>0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{_sf(divCAGR,1)}%</div>
              </div>
            </>
          )}
        </div>

        {/* Trajectory projection */}
        {divCAGR !== null && divCAGR > 0 && (
          <div style={{marginTop:14,padding:"12px 16px",background:projYears===0?"rgba(48,209,88,.06)":"rgba(214,158,46,.06)",borderRadius:10,textAlign:"center"}}>
            {projYears === 0 ? (
              <div style={{fontSize:12,fontWeight:600,color:"var(--green)",fontFamily:"var(--fm)"}}>
                Los dividendos ya cubren los gastos
              </div>
            ) : projYears !== null ? (
              <div style={{fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>
                A un <span style={{fontWeight:700,color:"var(--gold)"}}>{_sf(divCAGR,1)}% CAGR</span>, los dividendos cubriran los gastos en{' '}
                <span style={{fontWeight:700,color:"var(--gold)"}}>{projYears} {projYears===1?"ano":"anos"}</span>
                <span style={{fontSize:10,color:"var(--text-tertiary)",marginLeft:6}}>(~{new Date().getFullYear()+projYears})</span>
              </div>
            ) : (
              <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
                Crecimiento {_sf(divCAGR,1)}% anual ({yearsUsed} anos de datos)
              </div>
            )}
          </div>
        )}
      </div>
    );
  })()}

  {fireSection === "yournumber" && <YourNumberSection pat={pat} divNetA={divNetA} gastosAnnual={gastosAnnual} espRealistaA={espRealistaA} baseRealA={baseRealA} fxEurUsd={fxEurUsd} fireCcy={fireCcy} />}
  {fireSection === "dashboard" && <>

  {/* GASTOS MENSUALES POR DIVISA — con filtro año */}
  {(() => {
    const mNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const allYears = [...new Set(gMonths.map(m=>m.slice(0,4)))].sort().reverse();
    const selYear = fireGastosYear || allYears[0] || "2026";
    const yearMonths = gMonths.filter(m=>m.startsWith(selYear)).sort().reverse();
    const yearTotal = yearMonths.reduce((s,m)=>s+toDisp(gNative[m]?.eur||0,gNative[m]?.cny||0,gNative[m]?.usd||0),0);
    const yearAvg = yearMonths.length > 0 ? yearTotal / yearMonths.length : 0;
    return <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>Gastos Mensuales por Divisa</div>
        <div style={{display:"flex",gap:4}}>
          {allYears.map(y=><button key={y} onClick={()=>setFireGastosYear(y)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${selYear===y?"var(--gold)":"var(--border)"}`,background:selYear===y?"var(--gold-dim)":"transparent",color:selYear===y?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{y}</button>)}
        </div>
      </div>
      {/* Year summary */}
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{padding:"8px 14px",background:"var(--subtle-bg)",borderRadius:8,display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL {selYear}</span>
          <span style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{yearTotal.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
        </div>
        <div style={{padding:"8px 14px",background:"var(--subtle-bg)",borderRadius:8,display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MEDIA/MES</span>
          <span style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{yearAvg.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
        </div>
        <div style={{padding:"8px 14px",background:"var(--subtle-bg)",borderRadius:8,display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MESES</span>
          <span style={{fontSize:16,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{yearMonths.length}</span>
        </div>
      </div>
      {/* Monthly grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
        {yearMonths.map(m => {
          const d = gNative[m] || {eur:0,cny:0,usd:0};
          const mi = parseInt(m.slice(5,7))-1;
          const total = toDisp(d.eur, d.cny, d.usd);
          const maxM = Math.max(...yearMonths.map(mm=>toDisp(gNative[mm]?.eur||0,gNative[mm]?.cny||0,gNative[mm]?.usd||0)),1);
          const pct = total/maxM*100;
          return <div key={m} style={{padding:"10px 12px",background:"var(--row-alt)",borderRadius:10,border:"1px solid var(--subtle-border)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{mNames[mi]}</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{total.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
            </div>
            <div style={{height:4,background:"var(--subtle-bg2)",borderRadius:2,marginBottom:6,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:"var(--gold)",borderRadius:2,opacity:.5}}/></div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {d.eur > 0 && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(48,209,88,.06)",color:"var(--green)",fontFamily:"var(--fm)"}}>🇪🇸 €{d.eur.toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
              {d.cny > 0 && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(255,69,58,.06)",color:"var(--red)",fontFamily:"var(--fm)"}}>🇨🇳 ¥{d.cny.toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
              {d.usd > 0 && <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(10,132,255,.06)",color:"#0a84ff",fontFamily:"var(--fm)"}}>🇺🇸 ${d.usd.toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
            </div>
          </div>;
        })}
      </div>
    </div>;
  })()}

  {/* DESGLOSE MEDIAS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:14}}>Media Mensual (últimos 12m)</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
      <div style={{padding:"12px",background:"var(--row-alt)",borderRadius:10,textAlign:"center",border:"1px solid var(--subtle-border)"}}>
        <div style={{fontSize:16,marginBottom:2}}>🇪🇸</div>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>ESPAÑA</div>
        <div style={{fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>€{avgEur.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
      </div>
      <div style={{padding:"12px",background:"rgba(239,68,68,.03)",borderRadius:10,textAlign:"center",border:"1px solid rgba(239,68,68,.06)"}}>
        <div style={{fontSize:16,marginBottom:2}}>🇨🇳</div>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>CHINA VIDA</div>
        <div style={{fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>¥{avgCnyVida.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>≈ €{cnyVidaEur.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
      </div>
      <div style={{padding:"12px",background:"rgba(239,68,68,.03)",borderRadius:10,textAlign:"center",border:"1px solid rgba(239,68,68,.04)"}}>
        <div style={{fontSize:16,marginBottom:2}}>🏠</div>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>SOLO-CHINA</div>
        <div style={{fontSize:20,fontWeight:700,color:"#ef4444",fontFamily:"var(--fm)"}}>¥{avgCnyChinaOnly.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>alquiler, utils, viajes</div>
      </div>
    </div>
    <div style={{padding:"10px 14px",background:"var(--subtle-bg)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL</span>
      <span style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
      <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{sym}{gastosAnnual.toLocaleString(undefined,{maximumFractionDigits:0})}/año</span>
    </div>
  </div>

  {/* BANNER — 4 escenarios cobertura dividendos */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
    <div style={{padding:"20px",background:"rgba(255,159,10,.04)",border:"1px solid rgba(255,159,10,.15)",borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>VIDA ACTUAL (CHINA + ESPANA)</div>
      <div style={{fontSize:42,fontWeight:700,color:divCoversPct>=100?"var(--green)":"var(--orange)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(divCoversPct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(divCoversPct,100)}%`,height:"100%",background:divCoversPct>=100?"var(--green)":"var(--orange)",borderRadius:3}}/></div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
    </div>
    <div style={{padding:"20px",background:`rgba(214,158,46,${useBaseReal?".08":".04"})`,border:`1px solid rgba(214,158,46,${useBaseReal?".3":".12"})`,borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:useBaseReal?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6,fontWeight:useBaseReal?700:400}}>BASE REAL (FIRE)</div>
      <div style={{fontSize:42,fontWeight:700,color:baseRealCoversPct>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(baseRealCoversPct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(baseRealCoversPct,100)}%`,height:"100%",background:baseRealCoversPct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{sym}{baseRealM.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
      <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2,fontStyle:"italic"}}>Espana + China oblig.</div>
    </div>
    <div style={{padding:"20px",background:"rgba(48,209,88,.04)",border:"1px solid rgba(48,209,88,.15)",borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>VIDA EN ESPANA (REALISTA)</div>
      <div style={{fontSize:42,fontWeight:700,color:espCoversPct>=100?"var(--green)":"#d69e2e",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(espCoversPct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(espCoversPct,100)}%`,height:"100%",background:espCoversPct>=100?"var(--green)":"#d69e2e",borderRadius:3}}/></div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{sym}{espRealistaM.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
    </div>
    <div style={{padding:"20px",background:"rgba(100,210,255,.04)",border:"1px solid rgba(100,210,255,.12)",borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>GASTOS FIJOS ESPANA</div>
      <div style={{fontSize:42,fontWeight:700,color:espBasePct>=100?"var(--green)":"var(--text-secondary)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(espBasePct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"var(--subtle-bg2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(espBasePct,100)}%`,height:"100%",background:espBasePct>=100?"var(--green)":"var(--text-secondary)",borderRadius:3}}/></div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{sym}{espBaseM.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
    </div>
  </div>

  {/* DIVIDENDOS vs GASTOS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:16}}>💰 Dividendos vs Gastos ({fireCcy})</div>
    <div style={{display:"flex",gap:20,alignItems:"center",justifyContent:"center",flexWrap:"wrap"}}>
      <div style={{textAlign:"center",flex:"1 1 180px"}}>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>DIVIDENDOS NET / MES</div>
        <div style={{fontSize:28,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>{sym}{fK(divNetM)}</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{sym}{fK(divNetA)}/año</div>
      </div>
      <div style={{fontSize:20,color:"var(--text-tertiary)"}}>vs</div>
      <div style={{textAlign:"center",flex:"1 1 180px"}}>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>GASTOS TOTALES / MES</div>
        <div style={{fontSize:28,fontWeight:700,color:"var(--red)",fontFamily:"var(--fm)"}}>{sym}{fK(gastosAvg)}</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>🇪🇸 realista: {sym}{fK(espRealistaM)}</div>
      </div>
    </div>
    <div style={{textAlign:"center",marginTop:14,padding:"10px 0",borderTop:"1px solid var(--border)"}}>
      <span style={{fontSize:18,fontWeight:700,color:retCol(gapM),fontFamily:"var(--fm)"}}>{gapM>=0?"+":""}{sym}{fK(gapM)}/mes</span>
      <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:8}}>{gapM>=0?"superávit":"déficit"}</span>
    </div>
  </div>

  {/* METRICS + FIRE GAUGE */}
  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"stretch"}}>
    {/* KPI cards */}
    <div style={{flex:"1 1 400px",display:"flex",gap:10,flexWrap:"wrap"}}>
      {[
        {l:"PATRIMONIO",v:`${sym}${fDol(pat)}`,c:"var(--text-primary)"},
        {l:"RENT. NECESARIA",v:`${_sf(activeFireRet,1)}%`,sub:useBaseReal?"base real":"sobre patrimonio",c:activeFireRet<4?"var(--green)":activeFireRet<7?"var(--gold)":"var(--red)"},
        {l:"AÑOS PARA FIRE",v:activeYearsToFire===0?"✓ YA":activeYearsToFire>=50?"50+":String(activeYearsToFire),sub:useBaseReal?"base real @3.5%":"@3.5% + 7% return",c:activeYearsToFire===0?"var(--green)":activeYearsToFire<5?"var(--gold)":"var(--orange)"},
        {l:"TASA DE AHORRO",v:`${_sf(savingsRate,0)}%`,sub:`${savingsM>=0?"+":""}${sym}${fK(savingsM)}/mes`,c:savingsRate>30?"var(--green)":savingsRate>15?"var(--gold)":"var(--red)"},
      ].map((k,i)=>(<div key={i} style={{flex:"1 1 130px",padding:"12px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600,marginBottom:4}}>{k.l}</div><div style={{fontSize:20,fontWeight:700,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div>{k.sub&&<div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{k.sub}</div>}</div>))}
    </div>
    {/* FIRE Progress Gauge */}
    {(() => {
      const firePct = Math.min(swr35 > 0 ? (pat / swr35 * 100) : 0, 150);
      const clampPct = Math.min(firePct, 100);
      const gR = 70, gCx = 90, gCy = 80;
      const startAngle = Math.PI;
      const endAngle = 0;
      const gaugeAngle = startAngle - (clampPct / 100) * Math.PI;
      const arcEnd = (angle) => ({ x: gCx + gR * Math.cos(angle), y: gCy - gR * Math.sin(angle) });
      const pStart = arcEnd(startAngle);
      const pEnd = arcEnd(gaugeAngle);
      const largeArc = clampPct > 50 ? 1 : 0;
      // Color based on pct
      const gaugeColor = clampPct >= 66 ? '#30d158' : clampPct >= 33 ? '#ffd60a' : '#ff453a';
      const bgArcStart = arcEnd(startAngle);
      const bgArcEnd = arcEnd(endAngle);
      return (
        <div style={{flex:"0 0 180px",padding:"14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <svg viewBox="0 0 180 100" style={{width:180,height:100}}>
            <defs>
              <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff453a" />
                <stop offset="50%" stopColor="#ffd60a" />
                <stop offset="100%" stopColor="#30d158" />
              </linearGradient>
            </defs>
            {/* Background arc */}
            <path d={`M${bgArcStart.x},${bgArcStart.y} A${gR},${gR} 0 1,1 ${bgArcEnd.x},${bgArcEnd.y}`} fill="none" stroke="var(--subtle-bg2)" strokeWidth="10" strokeLinecap="round" />
            {/* Colored arc */}
            {clampPct > 0 && (
              <path d={`M${pStart.x},${pStart.y} A${gR},${gR} 0 ${largeArc},1 ${pEnd.x},${pEnd.y}`} fill="none" stroke={gaugeColor} strokeWidth="10" strokeLinecap="round" />
            )}
            {/* Center text */}
            <text x={gCx} y={gCy - 8} textAnchor="middle" fill={gaugeColor} fontSize="26" fontWeight="800" fontFamily="var(--fm)">{Math.round(firePct)}%</text>
            <text x={gCx} y={gCy + 8} textAnchor="middle" fill="var(--text-tertiary)" fontSize="8" fontWeight="600" fontFamily="var(--fm)">FIRE Progress</text>
          </svg>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",marginTop:2}}>
            {sym}{fK(pat)} / {sym}{fK(swr35)}
          </div>
        </div>
      );
    })()}
  </div>

  {/* MONTHLY NATIVE BREAKDOWN TABLE */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>📅 Gastos Mensuales por Divisa</div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}><thead><tr>
      {["MES","🇪🇸 EUR","🇨🇳 CNY","$ USD","TOTAL "+fireCcy,"DIV NET","CUBRE"].map((h,i)=><th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}
    </tr></thead><tbody>
      {[...last12g].reverse().map((m,i) => {
        const g = gNative[m]||{eur:0,cny:0,usd:0};
        const total = toDisp(g.eur, g.cny, g.usd);
        const divN = isUSD ? (divByMonth[m]?.n||0) : (divByMonth[m]?.n||0)/fxEurUsd;
        const pct = total > 0 ? (divN/total*100) : 0;
        const mn = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(m.slice(5), 10)-1];
        return (<tr key={m} style={{background:i%2?"var(--row-alt)":"transparent"}}>
          <td style={{padding:"5px 8px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid var(--subtle-bg)"}}>{mn} {m.slice(2,4)}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>€{(g.eur||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>¥{(g.cny||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:g.usd>0?"var(--text-primary)":"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)"}}>{g.usd>0?`$${_sf(g.usd,0)}`:"-"}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{sym}{total.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid var(--subtle-bg)"}}>{sym}{divN.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:pct>=100?"var(--green)":pct>=50?"var(--gold)":"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{_sf(pct,0)}%</td>
        </tr>);
      })}
    </tbody></table></div>
  </div>

  {/* FREEDOM NUMBERS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>🎯 Freedom Numbers ({fireCcy})</div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {[{l:"@3%",fn:activeGastosA/0.03},{l:"@3.5%",fn:activeSwr35},{l:"@4%",fn:activeGastosA/0.04},{l:"BASE REAL @3.5%",fn:baseRealA/0.035,sub:"ESP+CN oblig",hl:useBaseReal},{l:"ESPANA @3.5%",fn:espRealistaA/0.035,sub:"solo EUR"},{l:"LEAN @3.5%",fn:activeGastosA*0.7/0.035,sub:"70%"}].map((f,i)=>{const pct=f.fn>0?(pat/f.fn*100):0;const dP=f.fn>0?(divNetA/(f.fn*0.035)*100):0;return(<div key={i} style={{flex:"1 1 110px",padding:"12px",background:f.hl?"rgba(214,158,46,.06)":"var(--row-alt)",borderRadius:10,border:`1px solid ${f.hl?"rgba(214,158,46,.2)":"var(--subtle-border)"}`}}><div style={{fontSize:9,color:f.hl?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:4}}>{f.l}{f.sub?` (${f.sub})`:""}</div><div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{fK(f.fn)}</div><div style={{height:5,background:"var(--subtle-bg2)",borderRadius:3,marginTop:6,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:pct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:9,fontWeight:600,color:pct>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(pct,0)}%</span><span style={{fontSize:9,color:dP>=100?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>div {_sf(dP,0)}%</span></div></div>);})}
    </div>
  </div>

  {/* DIV TRAJECTORY */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📈 Dividendos Netos por Año</div>
    <div style={{display:"flex",alignItems:"flex-end",gap:8,height:130}}>
      {divYK.length > 0 && divYK.map((y,i)=>{const d=divByYear[y];const nV=isUSD?d.n:d.n/fxEurUsd;const mx=Math.max(...divYK.map(k=>isUSD?divByYear[k].n:divByYear[k].n/fxEurUsd),1);const h=nV/mx*100;const prev=i>0?(isUSD?divByYear[divYK[i-1]].n:divByYear[divYK[i-1]].n/fxEurUsd):0;const gr=prev>0?((nV-prev)/prev*100):null;return(<div key={y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>{gr!=null&&<div style={{fontSize:7,fontWeight:600,color:retCol(gr),fontFamily:"var(--fm)",marginBottom:2}}>{gr>=0?"+":""}{_sf(gr,0)}%</div>}<div style={{fontSize:8,fontWeight:600,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:2}}>{sym}{fK(nV)}</div><div style={{width:"100%",maxWidth:32,height:`${Math.max(h,4)}%`,background:"var(--green)",borderRadius:"3px 3px 0 0",opacity:.6}}/><div style={{fontSize:9,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:3}}>{y}</div></div>);})}
    </div>
  </div>

  {/* SCENARIOS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>🧪 Escenarios</div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:450}}><thead><tr>{["","GASTOS","FREEDOM","PAT","DIV","GAP"].map((h,i)=><th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
      {[{l:"🌏 Actual",g:gastosAnnual},{l:"🎯 Base Real",g:baseRealA,hl:true},{l:"🇪🇸 Espana",g:espRealistaA},{l:"🔻 Lean (70%)",g:gastosAnnual*0.7},{l:"🔻🔻 Ultra (50%)",g:gastosAnnual*0.5},{l:"🔺 Fat (+30%)",g:gastosAnnual*1.3}].map((s,i)=>{const fn=s.g/0.035;const pp=fn>0?(pat/fn*100):0;const dp=s.g>0?(divNetA/s.g*100):0;const gap=divNetA-s.g;return(<tr key={i} style={{background:s.hl?"rgba(214,158,46,.06)":i%2?"var(--row-alt)":"transparent"}}><td style={{padding:"5px 8px",fontWeight:s.hl?700:600,fontFamily:"var(--fm)",color:s.hl?"var(--gold)":"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)"}}>{s.l}</td><td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{sym}{fK(s.g)}</td><td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid var(--subtle-bg)"}}>{sym}{fK(fn)}</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:pp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid var(--subtle-bg)"}}>{_sf(pp,0)}%</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:dp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid var(--subtle-bg)"}}>{_sf(dp,0)}%</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:gap>=0?"var(--green)":"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{gap>=0?"+":""}{sym}{fK(gap)}</td></tr>);})}
    </tbody></table></div>
  </div>

  {/* INSIGHTS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:8}}>💡 Conclusiones</div>
    <div style={{display:"flex",flexDirection:"column",gap:4,fontSize:11,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
      <div>• Gastas <span style={{fontWeight:600}}>€{avgEur.toLocaleString(undefined,{maximumFractionDigits:0})}/mes en España</span> + <span style={{fontWeight:600}}>¥{avgCny.toLocaleString(undefined,{maximumFractionDigits:0})}/mes en China</span></div>
      <div>• Total convertido: <span style={{color:"var(--red)",fontWeight:700}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span></div>
      <div>• Dividendos netos: <span style={{color:"var(--green)",fontWeight:700}}>{sym}{fK(divNetM)}/mes</span> → cubren el <span style={{fontWeight:700,color:divCoversPct>=100?"var(--green)":"var(--orange)"}}>{_sf(divCoversPct,0)}%</span></div>
      <div>• 🇪🇸 Si te vas a España (sin China): cubres el <span style={{fontWeight:700,color:espCoversPct>=100?"var(--green)":"var(--gold)"}}>{_sf(espCoversPct,0)}%</span></div>
      {gapM<0&&<div>• Déficit: <span style={{color:"var(--red)"}}>-{sym}{fK(Math.abs(gapM))}/mes</span></div>}
      {gapM>=0&&<div>• 🎉 <span style={{color:"var(--green)",fontWeight:700}}>Superávit de {sym}{fK(gapM)}/mes</span></div>}
      <div style={{marginTop:4,fontSize:10,color:"var(--text-tertiary)",fontStyle:"italic"}}>FX: €1 = ${_sf(fxEurUsd,2)} · ¥1 = €{_sf(fxCnyEur,4)} · Gastos en divisa nativa, solo se convierten para el total.</div>
    </div>
  </div>
  </>}
</div>
);
}
