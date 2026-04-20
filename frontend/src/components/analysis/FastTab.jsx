// FastTab — Análisis profundo de valoración precio vs métrica.
// Herramienta original de A&R inspirada en conceptos estándar de finance:
//  - Serie histórica de precio mensual (20y)
//  - Línea de Valor Justo: métrica × P/E usuario
//  - Línea Normal P/E: métrica × avg P/E histórico 10y/5y
//  - Proyección futura (años editables)
//  - Panel derecho con 12 métricas clave (growth, yield, credit rating, etc.)
//  - Tabla de números por año debajo (FY, métrica, ∆%, dividendo)
//  - Dropdown con 8 bases de métrica (EPS adj/basic/diluted, OCF/FCFE, EBITDA/EBIT/Sales)
//
// Datos: /api/fg-history (FMP cacheado 24h) + AnalysisContext (fin, comp, cfg).
// Coste marginal: $0 — ninguna llamada a Anthropic. FMP ya incluido en plan.

import { useState, useEffect, useMemo } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { n, fP, fC, div } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';

const RANGES = [
  { id: 'MAX', years: 99 },
  { id: '20Y', years: 20 },
  { id: '10Y', years: 10 },
  { id: '5Y',  years: 5 },
  { id: '3Y',  years: 3 },
  { id: '1Y',  years: 1 },
];

const METRIC_OPTIONS = [
  { group: 'Earnings',  id: 'eps_adj',     label: 'EPS Ajustado (Operating)' },
  { group: 'Earnings',  id: 'eps_basic',   label: 'EPS Básico' },
  { group: 'Earnings',  id: 'eps_diluted', label: 'EPS Diluido' },
  { group: 'Cash Flow', id: 'ocf',         label: 'Operating Cash Flow (OCF, FFO)' },
  { group: 'Cash Flow', id: 'fcfe',        label: 'Free Cash Flow to Equity (FCFE, AFFO)' },
  { group: 'Otras',     id: 'ebitda',      label: 'EBITDA' },
  { group: 'Otras',     id: 'ebit',        label: 'EBIT' },
  { group: 'Otras',     id: 'sales',       label: 'Ventas / Revenue' },
];

const METRIC_LABEL = Object.fromEntries(METRIC_OPTIONS.map(m => [m.id, m.label]));

export default function FastTab() {
  const { DATA_YEARS, cfg, comp, fgGrowth, fgMode, fgPE, fgProjYears, fin,
    setFgGrowth, setFgMode, setFgPE, setFgProjYears, setShowDiv, showDiv } = useAnalysis();

  const ticker = cfg?.ticker || '';
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('MAX');
  const [peMode, setPeMode] = useState('custom'); // custom | normal_5y | normal_10y | normal_all

  // Fetch historical price + ratios on ticker change
  useEffect(() => {
    if (!ticker) { setHistory(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API_URL}/api/fg-history?ticker=${encodeURIComponent(ticker)}&years=20`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { if (d.error) setError(d.error); else setHistory(d); setLoading(false); }})
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); }});
    return () => { cancelled = true; };
  }, [ticker]);

  // Active P/E for valor justo
  const activePE = useMemo(() => {
    if (peMode === 'normal_5y' && history?.avg_pe_5y) return history.avg_pe_5y;
    if (peMode === 'normal_10y' && history?.avg_pe_10y) return history.avg_pe_10y;
    if (peMode === 'normal_all' && history?.avg_pe_all) return history.avg_pe_all;
    return fgPE;
  }, [peMode, history, fgPE]);

  // Helper: per-share metric for given year
  const getMetric = (y) => {
    const f = fin[y]; if (!f) return null;
    const so = f.sharesOut;
    if (fgMode === 'eps_adj') return f.eps;
    if (fgMode === 'eps_basic') return f.epsBasic ?? f.eps;
    if (fgMode === 'eps_diluted') return f.epsDiluted ?? f.eps;
    if (fgMode === 'fcf' || fgMode === 'fcfe') return comp[y]?.fcfps;
    if (fgMode === 'ocf') return div(f.ocf, so);
    if (fgMode === 'ebitda') return div((f.operatingIncome || 0) + (f.depreciation || 0), so);
    if (fgMode === 'ebit') return div(f.operatingIncome, so);
    if (fgMode === 'sales') return div(f.revenue, so);
    if (fgMode === 'eps') return f.eps;
    return f.eps;
  };

  // Historical yearly values (for metric-based lines)
  const histYrs = [...DATA_YEARS].reverse();
  const validHist = histYrs.map(y => ({
    y, val: getMetric(y), div: fin[y]?.dps || 0,
  })).filter(d => n(d.val) != null && d.val !== 0);

  // Projection years (future)
  const lastHistY = validHist.length ? validHist[validHist.length - 1].y : new Date().getFullYear();
  const lastVal = validHist.length ? validHist[validHist.length - 1].val : 0;
  const projData = Array.from({length: fgProjYears}, (_, i) => ({
    y: lastHistY + i + 1,
    val: lastVal > 0 ? lastVal * Math.pow(1 + fgGrowth / 100, i + 1) : null,
  }));

  // Monthly prices filtered by range
  const monthlyPrices = history?.monthly_prices || [];
  const nowY = new Date().getFullYear();
  const selRange = RANGES.find(r => r.id === range) || RANGES[0];
  const cutoffY = nowY - selRange.years;
  const pricesInRange = monthlyPrices.filter(p => {
    const y = parseInt(p.date.slice(0, 4), 10);
    return y >= cutoffY;
  });

  // Chart bounds — X axis
  const minXYear = pricesInRange.length
    ? parseFloat(pricesInRange[0].date.slice(0, 4)) + parseFloat(pricesInRange[0].date.slice(5, 7)) / 12
    : lastHistY - selRange.years;
  const maxXYear = lastHistY + fgProjYears + 0.5;

  // Y-axis: compute from price range + fair value lines
  const fairValues = [...validHist.map(d => d.val * activePE), ...projData.map(d => d.val ? d.val * activePE : null)].filter(v => v != null && v > 0);
  const prices = pricesInRange.map(p => p.close);
  const allY = [...fairValues, ...prices, cfg?.price].filter(v => Number.isFinite(v) && v > 0);
  const rawMax = allY.length ? Math.max(...allY) * 1.12 : 100;
  const rawMin = allY.length ? Math.max(0, Math.min(...allY) * 0.85) : 0;

  // Chart dims
  const W = 900, H = 440;
  const PADL = 64, PADR = 24, PADT = 24, PADB = 44;
  const chartW = W - PADL - PADR;
  const chartH = H - PADT - PADB;

  const xScale = (year) => PADL + ((year - minXYear) / (maxXYear - minXYear || 1)) * chartW;
  const yScale = (v) => PADT + chartH - ((v - rawMin) / (rawMax - rawMin || 1)) * chartH;

  // Y grid
  const gridCount = 6;
  const gridLines = Array.from({length: gridCount + 1}, (_, i) => {
    const val = rawMin + (rawMax - rawMin) * (i / gridCount);
    return { val, y: yScale(val) };
  });

  // Historical price polyline
  const pricePts = pricesInRange.map(p => {
    const y = parseFloat(p.date.slice(0, 4)) + parseFloat(p.date.slice(5, 7)) / 12;
    return { x: xScale(y), yp: yScale(p.close) };
  });
  const pricePoly = pricePts.map(p => `${p.x},${p.yp}`).join(' ');

  // Fair value historical line (metric × activePE)
  const fairHistPts = validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(Math.max(d.val * activePE, rawMin)),
  }));
  const fairHistPoly = fairHistPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Fair value projection (dashed)
  const projFairPts = projData.filter(d => d.val != null).map(d => ({
    x: xScale(d.y),
    yp: yScale(d.val * activePE),
  }));
  // Connect from last hist point
  const projFairFull = validHist.length ? [{ x: xScale(lastHistY), yp: yScale(lastVal * activePE) }, ...projFairPts] : projFairPts;
  const projFairPoly = projFairFull.map(p => `${p.x},${p.yp}`).join(' ');

  // Shaded fair value area (from base to fair line)
  const fairAreaPts = [
    ...fairHistPts,
    { x: xScale(validHist[validHist.length - 1]?.y || minXYear), yp: yScale(rawMin) },
    { x: xScale(validHist[0]?.y || minXYear), yp: yScale(rawMin) },
  ];
  const fairAreaPoly = fairAreaPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Normal P/E reference line (if different from active)
  const normalPE = history?.avg_pe_10y || history?.avg_pe_5y || null;
  const showNormalRef = peMode !== 'normal_10y' && normalPE && normalPE !== activePE;
  const normalRefPts = showNormalRef ? validHist.map(d => ({
    x: xScale(d.y),
    yp: yScale(Math.max(d.val * normalPE, rawMin)),
  })) : [];
  const normalRefPoly = normalRefPts.map(p => `${p.x},${p.yp}`).join(' ');

  // Year ticks
  const yearTicks = [];
  const rangeYears = Math.floor(maxXYear - minXYear);
  const step = rangeYears > 15 ? 2 : rangeYears > 8 ? 1 : 1;
  for (let yr = Math.ceil(minXYear); yr <= Math.floor(maxXYear); yr += step) yearTicks.push(yr);

  // Current price dot
  const currentY = cfg?.price != null && rawMax > 0 ? yScale(cfg.price) : null;

  // Computed metrics for right panel
  const latestMetric = validHist.length ? validHist[validHist.length - 1].val : null;
  const impliedPE = latestMetric && cfg?.price ? cfg.price / latestMetric : null;
  const fairValue = latestMetric ? latestMetric * activePE : null;
  const mosVsFair = fairValue && cfg?.price ? 1 - cfg.price / fairValue : null;
  const futureMetric = latestMetric ? latestMetric * Math.pow(1 + fgGrowth / 100, fgProjYears) : null;
  const futureFair = futureMetric ? futureMetric * activePE : null;
  const futureReturn = futureFair && cfg?.price ? Math.pow(futureFair / cfg.price, 1 / fgProjYears) - 1 : null;
  const latestDPS = validHist.length ? validHist[validHist.length - 1].div : null;
  const divYield = latestDPS && cfg?.price ? latestDPS / cfg.price : null;
  const epsYield = latestMetric && cfg?.price ? latestMetric / cfg.price : null;
  const blendedPE = impliedPE; // simplified

  // Metric growth rate — CAGR from first to last historical year
  const metricCAGR = (() => {
    if (validHist.length < 2) return null;
    const first = validHist[0], last = validHist[validHist.length - 1];
    if (first.val <= 0 || last.val <= 0) return null;
    const years = last.y - first.y;
    if (years <= 0) return null;
    return Math.pow(last.val / first.val, 1 / years) - 1;
  })();

  const profile = history?.profile || {};
  const debtCap = (() => {
    const lastF = fin[lastHistY];
    if (!lastF) return null;
    const ltDebt = lastF.totalDebt || 0;
    const cap = ltDebt + (lastF.equity || 0);
    return cap > 0 ? ltDebt / cap : null;
  })();

  // Change/year table
  const tableRows = validHist.map((d, i) => {
    const prev = i > 0 ? validHist[i - 1].val : null;
    const chg = prev && prev !== 0 ? (d.val - prev) / prev : null;
    return { y: d.y, val: d.val, chg, div: d.div };
  });

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:'0 0 4px',fontSize:20,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fd)'}}>⚡ FAST — Precio vs Valor</h2>
          <p style={{margin:0,fontSize:11,color:'var(--text-secondary)',lineHeight:1.45}}>
            Línea blanca = precio histórico mensual · Línea dorada = {METRIC_LABEL[fgMode] || 'EPS'} × {activePE ? activePE.toFixed(1)+'x' : fgPE+'x'} P/E · Punteada azul = proyección · Punto rojo = precio actual
          </p>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          {/* Metric dropdown */}
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            <span style={{fontSize:8,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:'.3px',textTransform:'uppercase'}}>Correlacionar con</span>
            <select value={fgMode} onChange={e=>setFgMode(e.target.value)}
              style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--gold)',background:'var(--gold-dim)',color:'var(--gold)',fontSize:11,fontWeight:600,fontFamily:'var(--fm)',cursor:'pointer',outline:'none',maxWidth:260}}>
              <optgroup label="Earnings">{METRIC_OPTIONS.filter(m=>m.group==='Earnings').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Cash Flow">{METRIC_OPTIONS.filter(m=>m.group==='Cash Flow').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              <optgroup label="Otras métricas">{METRIC_OPTIONS.filter(m=>m.group==='Otras').map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            </select>
          </div>
          {/* Dividend toggle */}
          <button onClick={()=>setShowDiv(!showDiv)} style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${showDiv?'var(--gold)':'var(--border)'}`,background:showDiv?'rgba(255,214,10,0.08)':'transparent',color:showDiv?'#ffd60a':'var(--text-secondary)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>+Div</button>
        </div>
      </div>

      {/* Time range + PE mode controls */}
      <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginRight:4,letterSpacing:.3}}>RANGO:</span>
        {RANGES.map(r => (
          <button key={r.id} onClick={()=>setRange(r.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${range===r.id?'var(--gold)':'var(--border)'}`,background:range===r.id?'var(--gold-dim)':'transparent',color:range===r.id?'var(--gold)':'var(--text-secondary)',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>{r.id}</button>
        ))}
        <span style={{marginLeft:12,fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',marginRight:4,letterSpacing:.3}}>P/E REFERENCIA:</span>
        {[
          {id:'custom',lbl:`Custom (${fgPE}x)`},
          {id:'normal_5y',lbl:history?.avg_pe_5y?`Normal 5y (${history.avg_pe_5y.toFixed(1)}x)`:'Normal 5y'},
          {id:'normal_10y',lbl:history?.avg_pe_10y?`Normal 10y (${history.avg_pe_10y.toFixed(1)}x)`:'Normal 10y'},
          {id:'normal_all',lbl:history?.avg_pe_all?`Normal MAX (${history.avg_pe_all.toFixed(1)}x)`:'Normal MAX'},
        ].map(o => (
          <button key={o.id} onClick={()=>setPeMode(o.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${peMode===o.id?'#64d2ff':'var(--border)'}`,background:peMode===o.id?'rgba(100,210,255,0.12)':'transparent',color:peMode===o.id?'#64d2ff':'var(--text-secondary)',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'var(--fm)'}}>{o.lbl}</button>
        ))}
      </div>

      {/* Sliders row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:14}}>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5,marginBottom:4}}>P/E Custom</div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="range" min={5} max={50} step={0.5} value={fgPE} onChange={e=>{setFgPE(parseFloat(e.target.value)); setPeMode('custom');}} style={{flex:1,accentColor:'var(--gold)'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'var(--gold)',fontFamily:'var(--fm)',minWidth:34}}>{fgPE}x</span>
          </div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5,marginBottom:4}}>Crecim. Proy.</div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="range" min={-10} max={30} step={0.5} value={fgGrowth} onChange={e=>setFgGrowth(parseFloat(e.target.value))} style={{flex:1,accentColor:'#64d2ff'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'#64d2ff',fontFamily:'var(--fm)',minWidth:40}}>{fgGrowth}%</span>
          </div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5,marginBottom:4}}>Años Proyec.</div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="range" min={1} max={10} step={1} value={fgProjYears} onChange={e=>setFgProjYears(parseInt(e.target.value, 10))} style={{flex:1,accentColor:'#bf5af2'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'#bf5af2',fontFamily:'var(--fm)',minWidth:30}}>{fgProjYears}a</span>
          </div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5}}>Último valor</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',marginTop:2}}>{fC(latestMetric)}</div>
        </div>
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
          <div style={{fontSize:8,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',fontFamily:'var(--fm)',letterSpacing:.5}}>Precio actual</div>
          <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:'var(--fm)',marginTop:2}}>{fC(cfg?.price)}</div>
        </div>
      </div>

      {/* Main layout: chart + right panel */}
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 240px',gap:12,alignItems:'start'}}>
        {/* Chart */}
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,overflowX:'auto'}}>
          {loading && <div style={{padding:60,textAlign:'center',color:'var(--text-secondary)',fontSize:12}}>Cargando histórico de precio…</div>}
          {error && <div style={{padding:20,color:'#ff453a',fontSize:12}}>⚠ Error: {error}</div>}
          {!loading && !error && (
            <svg width={W} height={H} style={{display:'block',minWidth:520}}>
              <defs>
                <linearGradient id="fastFairGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.18"/>
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.02"/>
                </linearGradient>
              </defs>
              <rect x={PADL} y={PADT} width={chartW} height={chartH} fill="var(--chart-bg, rgba(0,0,0,0.2))" rx={4}/>

              {/* Y grid */}
              {gridLines.map((g, i) => (
                <g key={i}>
                  <line x1={PADL} y1={g.y} x2={PADL+chartW} y2={g.y} stroke="var(--subtle-border, rgba(255,255,255,0.04))" strokeWidth={1}/>
                  <text x={PADL-6} y={g.y+3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">${Math.round(g.val)}</text>
                </g>
              ))}

              {/* X year ticks */}
              {yearTicks.map(yr => (
                <g key={yr}>
                  <line x1={xScale(yr)} y1={PADT} x2={xScale(yr)} y2={PADT+chartH} stroke="var(--subtle-border, rgba(255,255,255,0.03))" strokeWidth={1}/>
                  <text x={xScale(yr)} y={PADT+chartH+14} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">{yr}</text>
                </g>
              ))}

              {/* Separator: hist / projection */}
              {validHist.length > 0 && (
                <line x1={xScale(lastHistY)} y1={PADT} x2={xScale(lastHistY)} y2={PADT+chartH} stroke="var(--border-hover, rgba(255,255,255,0.1))" strokeWidth={1} strokeDasharray="3,3"/>
              )}

              {/* Fair value shaded area */}
              {fairAreaPts.length > 2 && (
                <polygon points={fairAreaPoly} fill="url(#fastFairGrad)"/>
              )}

              {/* Normal P/E reference line (if different) */}
              {normalRefPts.length > 1 && (
                <polyline points={normalRefPoly} fill="none" stroke="#64d2ff" strokeWidth={1.2} strokeDasharray="2,2" opacity={0.7}/>
              )}

              {/* Historical price line (white/primary) */}
              {pricePts.length > 1 && (
                <polyline points={pricePoly} fill="none" stroke="var(--text-primary)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"/>
              )}

              {/* Fair value historical line (gold) */}
              {fairHistPts.length > 1 && (
                <polyline points={fairHistPoly} fill="none" stroke="var(--gold)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"/>
              )}

              {/* Projection fair value line (dashed blue) */}
              {projFairFull.length > 1 && (
                <polyline points={projFairPoly} fill="none" stroke="#64d2ff" strokeWidth={2} strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round"/>
              )}

              {/* Dots for each historical metric point */}
              {fairHistPts.map((pt, i) => (
                <circle key={'f'+i} cx={pt.x} cy={pt.yp} r={2.5} fill="var(--gold)"/>
              ))}

              {/* Current price marker */}
              {currentY != null && pricePts.length > 0 && (
                <>
                  <line x1={PADL} y1={currentY} x2={PADL+chartW} y2={currentY} stroke="#ff453a" strokeWidth={1} strokeDasharray="2,3" opacity={0.5}/>
                  <circle cx={pricePts[pricePts.length-1].x} cy={currentY} r={5} fill="#ff453a" stroke="var(--bg)" strokeWidth={2}/>
                  <text x={pricePts[pricePts.length-1].x-8} y={currentY-8} textAnchor="end" fontSize={10} fill="#ff453a" fontFamily="monospace" fontWeight={700}>${cfg?.price?.toFixed(2)}</text>
                </>
              )}

              {/* Legend */}
              <text x={PADL+8} y={PADT+14} fontSize={9} fill="var(--gold)" fontFamily="monospace">● Valor justo ({activePE?activePE.toFixed(1)+'x':fgPE+'x'})</text>
              <text x={PADL+8} y={PADT+28} fontSize={9} fill="var(--text-primary)" fontFamily="monospace">● Precio histórico</text>
              {showNormalRef && <text x={PADL+8} y={PADT+42} fontSize={9} fill="#64d2ff" fontFamily="monospace">-- Normal P/E 10y ({normalPE?.toFixed(1)}x)</text>}
              {projFairPts.length > 0 && <text x={PADL+8} y={PADT+56} fontSize={9} fill="#64d2ff" fontFamily="monospace">-- Proyección +{fgGrowth}%/año</text>}
            </svg>
          )}
        </div>

        {/* Right panel — 12 métricas clave */}
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,display:'flex',flexDirection:'column',gap:10}}>
          <MetricRow label="Growth Rate (CAGR)" value={metricCAGR != null ? fP(metricCAGR) : '—'} color={metricCAGR && metricCAGR > 0.05 ? '#30d158' : 'var(--text-primary)'}/>
          <MetricRow label="P/E actual (blended)" value={blendedPE ? blendedPE.toFixed(2)+'x' : '—'} color="var(--gold)"/>
          <MetricRow label="Normal P/E (10y)" value={history?.avg_pe_10y ? history.avg_pe_10y.toFixed(1)+'x' : '—'}/>
          <MetricRow label="Normal P/E (5y)" value={history?.avg_pe_5y ? history.avg_pe_5y.toFixed(1)+'x' : '—'}/>
          <MetricRow label="Fair Value Ratio" value={mosVsFair != null ? fP(mosVsFair) : '—'} color={mosVsFair && mosVsFair > 0.15 ? '#30d158' : mosVsFair && mosVsFair > 0 ? 'var(--gold)' : '#ff453a'}/>
          <Divider/>
          <MetricRow label="Precio justo" value={fC(fairValue)} color="var(--gold)"/>
          <MetricRow label="Precio futuro proj." value={fC(futureFair)} color="#64d2ff"/>
          <MetricRow label="Retorno anual impl." value={futureReturn != null ? fP(futureReturn) : '—'} color={futureReturn && futureReturn > 0.10 ? '#30d158' : futureReturn && futureReturn > 0.05 ? 'var(--gold)' : '#ff453a'}/>
          <Divider/>
          <MetricRow label="EPS Yield" value={epsYield != null ? fP(epsYield) : '—'}/>
          <MetricRow label="Div Yield" value={divYield != null ? fP(divYield) : '—'} color="var(--gold)"/>
          <MetricRow label="S&P Rating" value={history?.rating?.overall || '—'}/>
          <Divider/>
          <MetricRow label="Market Cap" value={profile.mktCap ? `$${(profile.mktCap/1e9).toFixed(1)}B` : '—'}/>
          <MetricRow label="LT Debt/Capital" value={debtCap != null ? fP(debtCap) : '—'}/>
          <MetricRow label="Country" value={profile.country || '—'}/>
          <MetricRow label="Industry" value={profile.industry || '—'} small/>
          <MetricRow label="Beta" value={profile.beta != null ? profile.beta.toFixed(2) : '—'}/>
        </div>
      </div>

      {/* Numbers table — FY / Metric / Chg/Yr / Div */}
      <div style={{marginTop:14,background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:14,overflowX:'auto'}}>
        <div style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:'var(--fm)',letterSpacing:.5,marginBottom:8,textTransform:'uppercase'}}>Histórico por año</div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'var(--fm)',minWidth:520}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)',color:'var(--text-tertiary)'}}>
              <th style={{textAlign:'left',padding:'4px 6px'}}>FY Date</th>
              {tableRows.map(r => <th key={r.y} style={{textAlign:'right',padding:'4px 6px'}}>{r.y}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.04))'}}>
              <td style={{padding:'4px 6px',fontWeight:700,color:'var(--gold)'}}>{METRIC_LABEL[fgMode]?.slice(0, 12) || 'Valor'}</td>
              {tableRows.map(r => <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:'var(--text-primary)'}}>{fC(r.val)}</td>)}
            </tr>
            <tr style={{borderBottom:'1px solid var(--subtle-border, rgba(255,255,255,0.04))'}}>
              <td style={{padding:'4px 6px',color:'var(--text-secondary)'}}>∆/año</td>
              {tableRows.map(r => (
                <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:r.chg == null ? 'var(--text-tertiary)' : r.chg > 0 ? '#30d158' : '#ff453a'}}>
                  {r.chg != null ? (r.chg > 0 ? '+' : '') + (r.chg * 100).toFixed(0) + '%' : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{padding:'4px 6px',color:'var(--text-secondary)'}}>Dividendo</td>
              {tableRows.map(r => <td key={r.y} style={{textAlign:'right',padding:'4px 6px',color:r.div ? 'var(--gold)' : 'var(--text-tertiary)'}}>{r.div ? '$'+r.div.toFixed(2) : '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricRow({ label, value, color, small }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:6}}>
      <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:.3}}>{label}</span>
      <span style={{fontSize:small ? 9 : 11,fontWeight:700,color:color || 'var(--text-primary)',fontFamily:'var(--fm)',textAlign:'right',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{height:1,background:'var(--border)',opacity:0.4}}/>;
}
