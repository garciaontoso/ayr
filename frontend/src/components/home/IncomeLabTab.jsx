import { useState, useMemo, useEffect } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';
import { useNetLiquidationValue } from '../../hooks/useNetLiquidationValue.js';

function TaxReportSection({ hide, openAnalysis, pill, card, hd }) {
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [taxData, setTaxData] = useState(null);
  const [taxLoading, setTaxLoading] = useState(false);

  useEffect(() => {
    setTaxLoading(true);
    fetch(`${API_URL}/api/tax-report?year=${taxYear}`)
      .then(r => r.json())
      .then(d => { setTaxData(d); setTaxLoading(false); })
      .catch(() => setTaxLoading(false));
  }, [taxYear]);

  return <>
    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
      {["2026","2025","2024","2023"].map(y => (
        <button key={y} onClick={() => setTaxYear(y)} style={{...pill(taxYear===y)}}>{y}</button>
      ))}
    </div>
    {taxLoading && <InlineLoading message="Cargando datos fiscales..." />}
    {taxData && !taxLoading && (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:10}}>
          {[
            {l:"VENTAS",v:hide("$"+fDol(taxData.trades?.totalSellProceeds||0)),c:"var(--text-primary)",sub:`${taxData.trades?.sells||0} operaciones`},
            {l:"DIVIDENDOS",v:hide("$"+fDol(taxData.dividends?.gross||0)),c:"var(--gold)",sub:`${taxData.dividends?.count||0} cobros`},
            {l:"OPCIONES",v:hide("$"+fDol(taxData.options?.income||0)),c:"#64d2ff"},
            {l:"COMISIONES",v:hide("$"+fDol(taxData.trades?.totalCommissions||0)),c:"var(--red)"},
          ].map((m,i) => (
            <div key={i} style={{padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,letterSpacing:.5}}>{m.l}</div>
              <div style={{fontSize:18,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:2}}>{m.v}</div>
              {m.sub && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{m.sub}</div>}
            </div>
          ))}
        </div>
        {(taxData.dividends?.byTicker||[]).length > 0 && (
          <div style={card}>
            <div style={hd}>Dividendos por Ticker — {taxYear}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
                  {["Ticker","Cobros","Total"].map(h=>(
                    <th key={h} style={{padding:"4px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {taxData.dividends.byTicker.slice(0,30).map(d => (
                    <tr key={d.ticker} style={{borderBottom:"1px solid var(--subtle-bg)",cursor:"pointer"}} onClick={()=>openAnalysis(d.ticker)}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--card-hover)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"4px 8px",fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{d.ticker}</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{d.payments}x</td>
                      <td style={{padding:"4px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)"}}>{hide("$"+_sf(d.total,2))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )}
  </>;
}

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
// Fallback sector map — only used when D1 positions lack a sector value.
// Primary source: POS_STATIC[ticker].sec (populated from D1 positions.sector column).
const SECTOR_FALLBACK = {
  ACN:"Technology",ADP:"Industrials",AHRT:"Real Estate",AMCR:"Materials",AMT:"Real Estate",
  ARE:"Real Estate",AZJ:"Industrials",BIZD:"Financials","BME:AMS":"Technology",
  "BME:VIS":"Consumer Staples",BX:"Financials",CAG:"Consumer Staples",CLPR:"Real Estate",
  CMCSA:"Communication",CNSWF:"Technology",CPB:"Consumer Staples",CUBE:"Real Estate",
  DEO:"Consumer Staples",DIVO:"Financials",EMN:"Materials",ENG:"Utilities",
  FDJU:"Consumer Disc.",FDS:"Financials",FLO:"Consumer Staples",GIS:"Consumer Staples",
  GPC:"Consumer Disc.",GQG:"Financials",HEN3:"Consumer Staples","HKG:9616":"Technology",
  "HKG:1052":"Industrials","HKG:1910":"Consumer Disc.","HKG:2219":"Healthcare",
  "HKG:9618":"Consumer Disc.",HR:"Healthcare",HRB:"Financials",IIPR:"Real Estate",
  "IIPR-PRA":"Real Estate",ITRK:"Technology",KHC:"Consumer Staples",KMB:"Consumer Staples",
  KRG:"Real Estate",LANDP:"Real Estate",LSEG:"Financials",LW:"Consumer Staples",
  MDV:"Real Estate",MO:"Consumer Staples",MSDL:"Financials",MTN:"Consumer Disc.",
  "NET.UN":"Real Estate",NNN:"Real Estate",NOMD:"Consumer Staples",NVO:"Healthcare",
  O:"Real Estate",OBDC:"Financials",OMC:"Communication",OWL:"Financials",PATH:"Technology",
  PAYX:"Industrials",PEP:"Consumer Staples",PFE:"Healthcare",PG:"Consumer Staples",
  PYPL:"Financials",RAND:"Financials",REXR:"Real Estate",RHI:"Industrials",
  RICK:"Consumer Disc.",RYN:"Real Estate",SAFE:"Real Estate",SCHD:"Financials",
  SHUR:"Real Estate",SPHD:"Financials",SPY:"Financials",SUI:"Real Estate",
  TAP:"Consumer Staples",TROW:"Financials",UNH:"Healthcare",VICI:"Real Estate",
  WEEL:"Financials",WEN:"Consumer Disc.",WKL:"Technology",WPC:"Real Estate",
  XYZ:"Financials",YYY:"Financials",ZTS:"Healthcare",
};

export default function IncomeLabTab() {
  const { portfolioTotals, portfolioList, positions, displayCcy, privacyMode, hide, openAnalysis, getCountry, FLAGS, POS_STATIC, ibData, CTRL_DATA } = useHome();
  // Canonical NLV (live IB cash+margin+positions, fallback CTRL snapshot).
  // Was using portfolioTotals.totalValueUSD which omits cash/margin → DRIP underestimated.
  const canonicalNlv = useNetLiquidationValue({ ibData, ctrlData: CTRL_DATA });
  const [section, setSection] = useState("stacking");
  const [projYears, setProjYears] = useState(10);
  const [dripRate, setDripRate] = useState(5); // DPS growth %
  const [incomeGoal, setIncomeGoal] = useState(5000); // monthly passive income target

  const pos = portfolioTotals.positions || [];

  // Fetch historical income data for stacking chart
  const [incomeHistory, setIncomeHistory] = useState(null);
  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.all([
      fetch(`${API_URL}/api/cost-basis-all?tipo=OPTION&limit=2000&sort=fecha&dir=asc`).then(r=>r.json()).catch(()=>({results:[]})),
      fetch(`${API_URL}/api/dividendos`).then(r=>r.json()).catch(()=>[]),
    ]).then(([optData, divData]) => {
      // Build monthly stacked income for last 24 months
      const months = [];
      const now = new Date();
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][d.getMonth()] + " " + String(d.getFullYear()).slice(2), year: d.getFullYear(), month: d.getMonth(), dividends: 0, coveredCalls: 0, rop: 0, roc: 0 });
      }
      // Aggregate dividends
      (Array.isArray(divData) ? divData : divData.results || []).forEach(d => {
        const dt = d.fecha ? new Date(d.fecha) : null;
        if (!dt) return;
        const idx = months.findIndex(m => m.year === dt.getFullYear() && m.month === dt.getMonth());
        if (idx >= 0) months[idx].dividends += Math.abs(d.div_total || d.total || 0);
      });
      // Aggregate option income
      (optData.results || []).forEach(t => {
        if ((t.coste || 0) <= 0) return;
        const dt = t.fecha ? new Date(t.fecha) : null;
        if (!dt) return;
        const idx = months.findIndex(m => m.year === dt.getFullYear() && m.month === dt.getMonth());
        if (idx >= 0) months[idx].coveredCalls += Math.abs(t.coste || 0);
      });
      setIncomeHistory(months);
    });
  }, []);

  // ── DIVIDEND CALENDAR (real ex-dates from /api/dividend-calendar) ──
  // Fix 2026-04-08 (Discrepancy Audit #9): previously used
  // `ticker.charCodeAt(0) % 3` as a placement hash, which produced fake
  // results (AAPL and AMZN landed in the SAME months because both start
  // with 'A', regardless of real ex-dates). Now uses the same API as
  // DividendosTab CalendarioSection for a consistent source of truth.
  const [calRaw, setCalRaw] = useState(null);
  useEffect(() => {
    const tickers = pos.map(p => p.ticker).filter(Boolean).join(",");
    if (!tickers) return;
    fetch(`${API_URL}/api/dividend-calendar?symbols=${tickers}`)
      .then(r => r.json())
      .then(setCalRaw)
      .catch(() => setCalRaw(null));
  }, [pos.length]);

  const calendar = useMemo(() => {
    const months = Array.from({length:12}, () => ({total:0, tickers:[]}));
    if (!pos.length) return months;

    // Prefer real ex-date history from API (last 12 months by symbol).
    // Fall back to the quarterly-estimate heuristic only if the API failed
    // or returned nothing for this ticker.
    const history = calRaw?.history || {};
    const posBySymbol = Object.fromEntries(
      pos.map(p => [p.ticker, p])
    );

    pos.forEach(p => {
      const annual = p.divAnnualUSD || 0;
      if (annual <= 0 || !p.shares) return;
      const perShare = annual / p.shares;
      const hist = history[p.ticker] || [];

      if (hist.length >= 2) {
        // Use real ex-date months from the last 12 months of payments.
        // Distribute `annual/hist.length` into each real payment month.
        const perPayment = annual / hist.length;
        hist.forEach(h => {
          if (!h.exDate) return;
          const m = new Date(h.exDate).getMonth();
          if (isNaN(m)) return;
          months[m].total += perPayment;
          months[m].tickers.push({ t: p.ticker, amt: perPayment });
        });
        return;
      }

      // Fallback — no real history, use category heuristic (monthly vs quarterly).
      const cat = POS_STATIC[p.ticker]?.cat || "";
      const isMonthly = cat === "CEF" || (p.ticker||"").match(/^(O|MAIN|STAG|AGNC|NLY|PSEC|GAIN|GLAD)$/);
      if (isMonthly) {
        for (let m = 0; m < 12; m++) {
          months[m].total += annual/12;
          months[m].tickers.push({t:p.ticker,amt:annual/12});
        }
      } else {
        // Quarterly — default to Mar/Jun/Sep/Dec (most common US schedule)
        // instead of hashing. This is not per-ticker-accurate but at least
        // aggregates deterministically and doesn't invent patterns.
        for (const m of [2, 5, 8, 11]) {
          months[m].total += annual/4;
          months[m].tickers.push({t:p.ticker,amt:annual/4});
        }
      }
    });
    return months;
  }, [pos, calRaw, POS_STATIC]);

  const totalAnnualDiv = pos.reduce((s,p) => s + (p.divAnnualUSD||0), 0);
  const avgMonthly = totalAnnualDiv / 12;

  // ── SECTOR CONCENTRATION ──
  const sectorData = useMemo(() => {
    const bySector = {};
    const totalVal = pos.reduce((s,p) => s + (p.valueUSD||0), 0) || 1;
    pos.forEach(p => {
      const sec = POS_STATIC[p.ticker]?.sec || SECTOR_FALLBACK[p.ticker] || "Otros";
      if (!bySector[sec]) bySector[sec] = {value:0, count:0, tickers:[]};
      bySector[sec].value += (p.valueUSD||0);
      bySector[sec].count++;
      bySector[sec].tickers.push(p.ticker);
    });
    return Object.entries(bySector)
      .map(([sec,d]) => ({sec, ...d, pct: d.value/totalVal}))
      .sort((a,b) => b.value - a.value);
  }, [pos]);

  // ── TAX-LOSS HARVESTING ──
  const taxLoss = useMemo(() => {
    return pos
      .filter(p => (p.pnlPct||0) < -0.05) // >5% loss
      .map(p => ({
        ...p,
        lossUSD: (p.pnlUSD||0),
        lossPct: (p.pnlPct||0),
      }))
      .sort((a,b) => a.lossUSD - b.lossUSD); // worst first
  }, [pos]);

  const totalLoss = taxLoss.reduce((s,p) => s + Math.abs(p.lossUSD||0), 0);

  // ── DRIP PROJECTION ──
  const dripProjection = useMemo(() => {
    const currentValue = canonicalNlv || portfolioTotals.totalValueUSD || 0;
    const currentDiv = totalAnnualDiv;
    const growthRate = dripRate / 100;
    const years = [];
    let cumValue = currentValue;
    let cumDiv = currentDiv;
    for (let y = 0; y <= projYears; y++) {
      years.push({
        year: new Date().getFullYear() + y,
        value: cumValue,
        divIncome: cumDiv,
        divMonthly: cumDiv / 12,
        yield: cumValue > 0 ? cumDiv / cumValue : 0,
      });
      // Reinvest dividends + growth
      cumValue = cumValue + cumDiv;
      cumDiv = cumDiv * (1 + growthRate);
    }
    return years;
  }, [projYears, dripRate, totalAnnualDiv, canonicalNlv, portfolioTotals.totalValueUSD]);

  const hd = {fontSize:13,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10,paddingBottom:6,borderBottom:"2px solid rgba(200,164,78,.2)"};
  const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:14};
  const pill = (active) => ({padding:"5px 14px",borderRadius:8,border:`1px solid ${active?"var(--gold)":"var(--border)"}`,background:active?"var(--gold-dim)":"transparent",color:active?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:active?700:500,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"});

  if (pos.length === 0) {
    return <EmptyState icon="🧪" title="Sin datos de income" subtitle="El laboratorio de income necesita posiciones con dividendos para generar analisis de ingresos pasivos." />;
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Section toggle */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{id:"stacking",lbl:"📊 Income Stacking"},{id:"calendar",lbl:"📅 Calendario Dividendos"},{id:"projection",lbl:"📈 Proyección DRIP"},{id:"sectors",lbl:"🏭 Concentración"},{id:"taxloss",lbl:"🔻 Tax-Loss"},{id:"ideas",lbl:"💡 Ideas Opciones"},{id:"tax",lbl:"📋 Tax Report"}].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={pill(section===s.id)}>{s.lbl}</button>
        ))}
      </div>

      {/* ══════ INCOME STACKING ══════ */}
      {section === "stacking" && <>
        {/* Passive Income Goal Tracker */}
        {(() => {
          const monthlyDiv = totalAnnualDiv / 12;
          // Estimate monthly CC income from history
          const monthlyCCEst = incomeHistory
            ? incomeHistory.slice(-6).reduce((s,m) => s + m.coveredCalls, 0) / Math.max(incomeHistory.slice(-6).filter(m => m.coveredCalls > 0).length, 1)
            : 0;
          const totalMonthly = monthlyDiv + monthlyCCEst;
          const pct = incomeGoal > 0 ? Math.min(totalMonthly / incomeGoal, 1) : 0;
          return (
            <div style={card}>
              <div style={hd}>Objetivo de Ingreso Pasivo Mensual</div>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Objetivo:</div>
                {[2000,3000,5000,7500,10000].map(g => (
                  <button key={g} onClick={()=>setIncomeGoal(g)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${incomeGoal===g?"var(--gold)":"var(--border)"}`,background:incomeGoal===g?"var(--gold-dim)":"transparent",color:incomeGoal===g?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:incomeGoal===g?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>${(g/1000).toFixed(0)}K</button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:20}}>
                {/* Thermometer */}
                <div style={{width:40,height:180,position:"relative",flexShrink:0}}>
                  <div style={{position:"absolute",bottom:0,left:0,width:"100%",height:"100%",background:"var(--subtle-border)",borderRadius:20,overflow:"hidden"}}>
                    <div style={{position:"absolute",bottom:0,left:0,width:"100%",height:`${pct*100}%`,background:pct>=1?"var(--green)":pct>0.5?"var(--gold)":"var(--red)",borderRadius:20,transition:"height .8s ease",opacity:0.7}}/>
                  </div>
                  <div style={{position:"absolute",bottom:`${pct*100}%`,left:"50%",transform:"translate(-50%,50%)",fontSize:10,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>{_sf(pct*100,0)}%</div>
                  {/* Goal line at top */}
                  <div style={{position:"absolute",top:0,left:-6,right:-6,borderTop:"2px dashed var(--gold)",opacity:0.5}}/>
                </div>
                {/* Details */}
                <div style={{flex:1}}>
                  <div style={{fontSize:22,fontWeight:700,color:pct>=1?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>
                    {privacyMode?"***":"$"+_sf(totalMonthly,0)}/mes
                  </div>
                  <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:2}}>
                    Tu ingreso pasivo: {privacyMode?"***":"$"+_sf(totalMonthly,0)}/mes ({_sf(pct*100,1)}% del objetivo de ${fDol(incomeGoal)})
                  </div>
                  <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:12,height:12,borderRadius:2,background:"#c8a44e"}}/>
                      <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",flex:1}}>Dividendos</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#c8a44e",fontFamily:"var(--fm)"}}>{privacyMode?"***":"$"+_sf(monthlyDiv,0)}/mes</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:12,height:12,borderRadius:2,background:"#30d158"}}/>
                      <span style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",flex:1}}>Covered Calls (media 6m)</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#30d158",fontFamily:"var(--fm)"}}>{privacyMode?"***":"$"+_sf(monthlyCCEst,0)}/mes</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{marginTop:12,height:8,background:"var(--subtle-bg2)",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:4,transition:"width .8s ease",width:`${pct*100}%`,
                      background:pct>=1?"var(--green)":pct>0.5?"linear-gradient(90deg,var(--gold),var(--green))":"linear-gradient(90deg,var(--red),var(--gold))"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                    <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>$0</span>
                    <span style={{fontSize:8,color:"var(--gold)",fontFamily:"var(--fm)"}}>${fDol(incomeGoal)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Income Stacking Area Chart */}
        {incomeHistory && (
          <div style={card}>
            <div style={hd}>Income Stacking -- Ultimos 24 Meses</div>
            {(() => {
              const data = incomeHistory;
              const W = 800, H = 280, PL = 50, PR = 10, PT = 10, PB = 40;
              const cW = W - PL - PR, cH = H - PT - PB;

              // Compute cumulative stacked values
              const stacked = data.map(m => {
                const d = m.dividends;
                const cc = m.coveredCalls;
                return { ...m, s0: 0, s1: d, s2: d + cc };
              });
              const maxVal = Math.max(...stacked.map(s => s.s2), 1);
              const yScale = (v) => PT + cH - (v / maxVal) * cH;
              const xScale = (i) => PL + (i / Math.max(data.length - 1, 1)) * cW;

              // Build area paths
              const buildArea = (topKey, botKey) => {
                let path = `M ${xScale(0)} ${yScale(stacked[0][topKey])}`;
                for (let i = 1; i < stacked.length; i++) path += ` L ${xScale(i)} ${yScale(stacked[i][topKey])}`;
                for (let i = stacked.length - 1; i >= 0; i--) path += ` L ${xScale(i)} ${yScale(stacked[i][botKey])}`;
                path += " Z";
                return path;
              };

              // Y-axis gridlines
              const yTicks = 5;
              const yStep = maxVal / yTicks;

              return (
                <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",fontFamily:"var(--fm)"}}>
                  {/* Grid */}
                  {Array.from({length:yTicks+1}).map((_,i) => {
                    const val = i * yStep;
                    const y = yScale(val);
                    return <g key={i}>
                      <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="var(--subtle-bg2)" strokeWidth={0.5}/>
                      <text x={PL-6} y={y+3} textAnchor="end" fill="var(--text-tertiary)" fontSize={8}>${_sf(val,0)}</text>
                    </g>;
                  })}
                  {/* Areas */}
                  <path d={buildArea("s2","s1")} fill="#30d158" opacity={0.35}/>
                  <path d={buildArea("s1","s0")} fill="#c8a44e" opacity={0.4}/>
                  {/* Top line */}
                  {(() => {
                    let line = `M ${xScale(0)} ${yScale(stacked[0].s2)}`;
                    for (let i = 1; i < stacked.length; i++) line += ` L ${xScale(i)} ${yScale(stacked[i].s2)}`;
                    return <path d={line} fill="none" stroke="#30d158" strokeWidth={1.5} opacity={0.7}/>;
                  })()}
                  {/* Divs top line */}
                  {(() => {
                    let line = `M ${xScale(0)} ${yScale(stacked[0].s1)}`;
                    for (let i = 1; i < stacked.length; i++) line += ` L ${xScale(i)} ${yScale(stacked[i].s1)}`;
                    return <path d={line} fill="none" stroke="#c8a44e" strokeWidth={1} opacity={0.6}/>;
                  })()}
                  {/* Dots on top */}
                  {stacked.map((s,i) => s.s2 > 0 ? <circle key={i} cx={xScale(i)} cy={yScale(s.s2)} r={2.5} fill="#30d158" opacity={0.8}/> : null)}
                  {/* X labels */}
                  {data.map((m,i) => i % 3 === 0 || i === data.length - 1 ? (
                    <text key={i} x={xScale(i)} y={H-PB+16} textAnchor="middle" fill="var(--text-tertiary)" fontSize={7}>{m.label}</text>
                  ) : null)}
                  {/* Legend */}
                  <rect x={PL+10} y={PT+4} width={10} height={10} rx={2} fill="#c8a44e" opacity={0.6}/>
                  <text x={PL+24} y={PT+12} fill="#c8a44e" fontSize={8}>Dividendos</text>
                  <rect x={PL+100} y={PT+4} width={10} height={10} rx={2} fill="#30d158" opacity={0.6}/>
                  <text x={PL+114} y={PT+12} fill="#30d158" fontSize={8}>Covered Calls</text>
                </svg>
              );
            })()}
            {/* Monthly totals below chart */}
            <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}>
              {(() => {
                const last6 = (incomeHistory || []).slice(-6);
                const avgDiv = last6.reduce((s,m)=>s+m.dividends,0)/Math.max(last6.length,1);
                const avgCC = last6.reduce((s,m)=>s+m.coveredCalls,0)/Math.max(last6.length,1);
                const total24 = (incomeHistory||[]).reduce((s,m)=>s+m.dividends+m.coveredCalls,0);
                return [
                  {l:"TOTAL 24M",v:"$"+fDol(total24),c:"var(--text-primary)"},
                  {l:"MEDIA DIV/MES (6M)",v:"$"+_sf(avgDiv,0),c:"#c8a44e"},
                  {l:"MEDIA CC/MES (6M)",v:"$"+_sf(avgCC,0),c:"#30d158"},
                  {l:"MEDIA TOTAL/MES",v:"$"+_sf(avgDiv+avgCC,0),c:"var(--gold)"},
                ].map((s,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>{s.l}</div>
                    <div style={{fontSize:16,fontWeight:700,color:s.c,fontFamily:"var(--fm)"}}>{privacyMode?"***":s.v}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
        {!incomeHistory && <InlineLoading message="Cargando datos de income..." />}
      </>}

      {/* ══════ CALENDAR ══════ */}
      {section === "calendar" && <>
        {/* Monthly summary */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:8}}>
          {calendar.map((m,i) => (
            <div key={i} style={{...card,marginBottom:0,padding:12,textAlign:"center"}}>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600}}>{MONTHS[i]}</div>
              <div style={{fontSize:20,fontWeight:700,color:m.total>avgMonthly*1.2?"var(--green)":m.total>0?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>
                {privacyMode?"•••":"$"+_sf(m.total,0)}
              </div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>
                {m.tickers.slice(0,4).map(t=>t.t).join(", ")}{m.tickers.length>4?` +${m.tickers.length-4}`:""}
              </div>
            </div>
          ))}
        </div>
        {/* Annual total */}
        <div style={{display:"flex",gap:20,justifyContent:"center",padding:"10px 0"}}>
          {[
            {l:"DIVIDENDO ANUAL",v:"$"+fDol(totalAnnualDiv),c:"var(--gold)"},
            {l:"MEDIA MENSUAL",v:"$"+_sf(avgMonthly,0),c:"var(--text-primary)"},
            {l:"PAGADORES",v:`${pos.filter(p=>(p.divAnnualUSD||0)>0).length} de ${pos.length}`,c:"var(--text-secondary)"},
          ].map((s,i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>{s.l}</div>
              <div style={{fontSize:18,fontWeight:700,color:s.c,fontFamily:"var(--fm)"}}>{privacyMode?"•••":s.v}</div>
            </div>
          ))}
        </div>
        {/* Bar chart */}
        <div style={card}>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:120}}>
            {calendar.map((m,i) => {
              const maxM = Math.max(...calendar.map(x=>x.total), 1);
              const h = (m.total / maxM) * 100;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{fontSize:7,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:2}}>{m.total>0?_sf(m.total,0):""}</div>
                  <div style={{width:"100%",height:`${Math.max(h,2)}%`,background:"var(--gold)",borderRadius:"3px 3px 0 0",opacity:.6,transition:"height .5s ease"}}/>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>{MONTHS[i]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </>}

      {/* ══════ DRIP PROJECTION ══════ */}
      {section === "projection" && <>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Años:</div>
          {[5,10,15,20,25].map(y=>(
            <button key={y} onClick={()=>setProjYears(y)} style={pill(projYears===y)}>{y}</button>
          ))}
          <div style={{width:1,height:16,background:"var(--border)"}}/>
          <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Crec. DPS:</div>
          {[3,5,7,10].map(r=>(
            <button key={r} onClick={()=>setDripRate(r)} style={pill(dripRate===r)}>{r}%</button>
          ))}
        </div>
        {/* Projection table */}
        <div style={{overflowX:"auto",...card}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead>
              <tr style={{borderBottom:"2px solid var(--border)"}}>
                {["Año","Valor Portfolio","Div Anual","Div Mensual","Yield"].map(h=>(
                  <th key={h} style={{padding:"6px 10px",textAlign:h==="Año"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dripProjection.map((y,i) => (
                <tr key={y.year} style={{borderBottom:"1px solid var(--subtle-border)",background:i===0?"rgba(200,164,78,.04)":"transparent"}}>
                  <td style={{padding:"6px 10px",fontFamily:"var(--fm)",fontWeight:i===0?700:400,color:i===0?"var(--gold)":"var(--text-primary)"}}>{y.year}{i===0?" (hoy)":""}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>{privacyMode?"•••":"$"+fDol(y.value)}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",fontWeight:600}}>{privacyMode?"•••":"$"+fDol(y.divIncome)}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{privacyMode?"•••":"$"+_sf(y.divMonthly,0)}</td>
                  <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:y.yield>0.05?"var(--green)":"var(--text-tertiary)"}}>{_sf(y.yield*100,1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Key projections */}
        <div style={{display:"flex",gap:20,justifyContent:"center"}}>
          {[
            {l:`EN ${projYears} AÑOS`,v:"$"+fDol(dripProjection[dripProjection.length-1]?.value||0),c:"var(--text-primary)"},
            {l:"DIV MENSUAL",v:"$"+_sf((dripProjection[dripProjection.length-1]?.divMonthly||0),0),c:"var(--gold)"},
            {l:"MULTIPLICADOR",v:_sf((dripProjection[dripProjection.length-1]?.value||1)/(canonicalNlv||portfolioTotals.totalValueUSD||1),1)+"x",c:"var(--green)"},
          ].map((s,i)=>(
            <div key={i} style={{textAlign:"center",padding:12,background:"var(--card)",borderRadius:12,border:"1px solid var(--border)",minWidth:120}}>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>{s.l}</div>
              <div style={{fontSize:22,fontWeight:700,color:s.c,fontFamily:"var(--fm)",marginTop:4}}>{privacyMode?"•••":s.v}</div>
            </div>
          ))}
        </div>
      </>}

      {/* ══════ SECTOR CONCENTRATION ══════ */}
      {section === "sectors" && <>
        <div style={card}>
          <div style={hd}>Concentración por Sector</div>
          {sectorData.map((s,i) => {
            const isOverweight = s.pct > 0.20;
            const colors = ["#c8a44e","#30d158","#64d2ff","#ff9f0a","#bf5af2","#ff453a","#ffd60a","#86868b","#34c759","#5ac8fa","#ff6b6b","#4ecdc4"];
            return (
              <div key={s.sec} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--subtle-border)"}}>
                <div style={{width:10,height:10,borderRadius:2,background:colors[i%colors.length],flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:isOverweight?"var(--red)":"var(--text-primary)",fontFamily:"var(--fm)",fontWeight:isOverweight?700:400}}>
                      {s.sec} {isOverweight && "⚠️"}
                    </span>
                    <span style={{fontSize:12,fontWeight:700,color:isOverweight?"var(--red)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(s.pct*100,1)}%</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                    <div style={{flex:1,height:4,background:"var(--subtle-bg2)",borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(s.pct*100*3,100)}%`,height:"100%",background:isOverweight?"var(--red)":colors[i%colors.length],borderRadius:2,transition:"width .5s ease"}}/>
                    </div>
                    <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",flexShrink:0}}>{s.count} pos · ${fDol(s.value)}</span>
                  </div>
                  <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{s.tickers.slice(0,8).join(", ")}{s.tickers.length>8?` +${s.tickers.length-8}`:""}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Alerts */}
        {sectorData.filter(s=>s.pct>0.20).length>0 && (
          <div style={{padding:"10px 14px",background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.2)",borderRadius:10,fontSize:11,color:"var(--red)",fontFamily:"var(--fm)"}}>
            ⚠️ Concentración alta: {sectorData.filter(s=>s.pct>0.20).map(s=>`${s.sec} (${_sf(s.pct*100,0)}%)`).join(", ")} superan el 20% del portfolio
          </div>
        )}
      </>}

      {/* ══════ TAX-LOSS HARVESTING ══════ */}
      {section === "taxloss" && <>
        {/* Summary */}
        <div style={{display:"flex",gap:16,marginBottom:8}}>
          {[
            {l:"PÉRDIDAS REALIZABLES",v:"$"+fDol(totalLoss),c:"var(--red)"},
            {l:"POSICIONES EN PÉRDIDA",v:`${taxLoss.length} de ${pos.length}`,c:"var(--text-primary)"},
            {l:"AHORRO FISCAL EST.",v:"$"+_sf(totalLoss*0.25,0),c:"var(--green)",sub:"(25% marginal)"},
          ].map((s,i)=>(
            <div key={i} style={{flex:1,...card,marginBottom:0,padding:14}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>{s.l}</div>
              <div style={{fontSize:20,fontWeight:700,color:s.c,fontFamily:"var(--fm)",marginTop:4}}>{privacyMode?"•••":s.v}</div>
              {s.sub && <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{s.sub}</div>}
            </div>
          ))}
        </div>
        {/* Positions */}
        {taxLoss.length === 0 ? (
          <div style={{textAlign:"center",padding:40,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
            <div style={{fontSize:32,marginBottom:8}}>🎉</div>
            No tienes posiciones con pérdidas significativas (&gt;5%)
          </div>
        ) : (
          <div style={card}>
            <div style={hd}>Candidatos a Tax-Loss Harvesting</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Ticker","Precio","Coste","P&L %","Pérdida $","Acciones","Valor","Ahorro Est."].map(h=>(
                      <th key={h} style={{padding:"6px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {taxLoss.map(p=>(
                    <tr key={p.ticker} onClick={()=>openAnalysis(p.ticker)} style={{borderBottom:"1px solid var(--subtle-border)",cursor:"pointer"}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--card-hover)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"6px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{p.ticker}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)"}}>${_sf(p.lastPrice,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{privacyMode?"•••":"$"+_sf(p.adjustedBasis||p.avgCost||0,2)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",fontWeight:700}}>{_sf(p.lossPct*100,1)}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)"}}>{privacyMode?"•••":"-$"+_sf(Math.abs(p.lossUSD),0)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{privacyMode?"•••":p.shares}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>{privacyMode?"•••":"$"+fDol(p.valueUSD||0)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--green)",fontWeight:600}}>{privacyMode?"•••":"$"+_sf(Math.abs(p.lossUSD)*0.25,0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{marginTop:10,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
              * Ahorro estimado al 25% marginal. Consulta con tu asesor fiscal. Recuerda la regla de wash sale (30 días).
            </div>
          </div>
        )}
      </>}

      {/* ══════ OPTIONS IDEAS ══════ */}
      {section === "ideas" && <>
        <div style={card}>
          <div style={hd}>💡 Ideas de Income con Opciones</div>
          <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:14}}>
            Estrategias generadas automáticamente basadas en condiciones de mercado actuales. No es asesoramiento financiero.
          </div>

          {/* Strategy cards */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Bull Put Spreads on RUT */}
            <div style={{padding:14,background:"rgba(48,209,88,.03)",border:"1px solid rgba(48,209,88,.12)",borderRadius:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--green)",fontFamily:"var(--fm)"}}>📉 Bull Put Spread — Russell 2000 (RUT)</div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:"rgba(48,209,88,.1)",color:"var(--green)",fontWeight:600,fontFamily:"var(--fm)"}}>INCOME</span>
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:8}}>
                Vender put OTM + comprar put más OTM como protección. Beneficio si RUT se mantiene o sube.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:10,fontFamily:"var(--fm)"}}>
                <div><span style={{color:"var(--text-tertiary)"}}>Sell Put:</span> <b style={{color:"var(--red)"}}>RUT 2050</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Buy Put:</span> <b style={{color:"var(--green)"}}>RUT 2000</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Max Loss:</span> <b>$5,000/contrato</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Credit est.:</span> <b style={{color:"var(--green)"}}>~$800-1,200</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>DTE:</span> <b>30-45 días</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>P(Profit):</span> <b style={{color:"var(--green)"}}>~70-75%</b></div>
              </div>
              <div style={{marginTop:8,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontStyle:"italic"}}>
                Ajusta strikes según tu tolerancia al riesgo. Más OTM = menos crédito pero mayor probabilidad de éxito.
              </div>
            </div>

            {/* Iron Condor on SPY */}
            <div style={{padding:14,background:"rgba(100,210,255,.03)",border:"1px solid rgba(100,210,255,.12)",borderRadius:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#64d2ff",fontFamily:"var(--fm)"}}>🦅 Iron Condor — S&P 500 (SPY)</div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:"rgba(100,210,255,.1)",color:"#64d2ff",fontWeight:600,fontFamily:"var(--fm)"}}>NEUTRAL</span>
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:8}}>
                Vender call + put OTM, comprar protección más lejos. Beneficio si SPY se queda en rango.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,fontSize:10,fontFamily:"var(--fm)"}}>
                <div><span style={{color:"var(--text-tertiary)"}}>Sell Put:</span> <b style={{color:"var(--red)"}}>SPY 580</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Buy Put:</span> <b>SPY 570</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Sell Call:</span> <b style={{color:"var(--red)"}}>SPY 660</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Buy Call:</span> <b>SPY 670</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Credit:</span> <b style={{color:"var(--green)"}}>~$200-400</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Max Loss:</span> <b>$1,000</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>DTE:</span> <b>30-45 días</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>P(Profit):</span> <b style={{color:"var(--green)"}}>~65-70%</b></div>
              </div>
            </div>

            {/* Naked Puts on portfolio positions */}
            <div style={{padding:14,background:"rgba(200,164,78,.03)",border:"1px solid rgba(200,164,78,.12)",borderRadius:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>💰 Cash-Secured Puts — Tu Portfolio</div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:"var(--gold-dim)",color:"var(--gold)",fontWeight:600,fontFamily:"var(--fm)"}}>INCOME</span>
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:8}}>
                Vender puts sobre acciones que ya tienes o quieres comprar. Si te asignan, compras a descuento.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {pos.filter(p => p.lastPrice > 20 && p.shares >= 100 && (p.pnlPct||0) < -0.1).slice(0,5).map(p => (
                  <div key={p.ticker} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"var(--row-alt)",borderRadius:8,fontSize:10,fontFamily:"var(--fm)"}}>
                    <span style={{fontWeight:700,color:"var(--text-primary)"}}>{p.ticker}</span>
                    <span style={{color:"var(--text-secondary)"}}>Precio: ${_sf(p.lastPrice,2)}</span>
                    <span style={{color:"var(--red)"}}>{_sf((p.pnlPct||0)*100,0)}%</span>
                    <span style={{color:"var(--gold)"}}>Sell Put ${Math.round(p.lastPrice * 0.9)} (~10% OTM)</span>
                    <span style={{color:"var(--green)"}}>Si te asignan: descuento extra</span>
                  </div>
                ))}
                {pos.filter(p => p.lastPrice > 20 && p.shares >= 100 && (p.pnlPct||0) < -0.1).length === 0 &&
                  <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",padding:10}}>
                    Sin candidatos ideales ahora (posiciones con P&L &lt; -10% y precio &gt; $20)
                  </div>
                }
              </div>
            </div>

            {/* Butterfly on earnings */}
            <div style={{padding:14,background:"rgba(191,90,242,.03)",border:"1px solid rgba(191,90,242,.12)",borderRadius:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#bf5af2",fontFamily:"var(--fm)"}}>🦋 Butterfly Spread — Earnings Play</div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:"rgba(191,90,242,.1)",color:"#bf5af2",fontWeight:600,fontFamily:"var(--fm)"}}>DIRECTIONAL</span>
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:8}}>
                Apuesta de bajo riesgo a que el precio se queda cerca del strike central tras earnings. Coste bajo, reward limitado pero alto ratio.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:10,fontFamily:"var(--fm)"}}>
                <div><span style={{color:"var(--text-tertiary)"}}>Estructura:</span> <b>Buy 1 / Sell 2 / Buy 1</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Coste típico:</span> <b style={{color:"var(--red)"}}>$50-150</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Max Reward:</span> <b style={{color:"var(--green)"}}>$500-1,000</b></div>
              </div>
              <div style={{marginTop:8,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontStyle:"italic"}}>
                Ideal para earnings de empresas con IV alto. Centra el butterfly en el precio actual.
              </div>
            </div>

            {/* Calendar Spread */}
            <div style={{padding:14,background:"rgba(255,159,10,.03)",border:"1px solid rgba(255,159,10,.12)",borderRadius:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#ff9f0a",fontFamily:"var(--fm)"}}>📅 Calendar Spread — Theta Play</div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:"rgba(255,159,10,.1)",color:"#ff9f0a",fontWeight:600,fontFamily:"var(--fm)"}}>THETA</span>
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:8}}>
                Vender opción cercana + comprar misma opción lejana. Beneficio del time decay diferencial.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:10,fontFamily:"var(--fm)"}}>
                <div><span style={{color:"var(--text-tertiary)"}}>Sell:</span> <b style={{color:"var(--red)"}}>30 DTE (front)</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Buy:</span> <b style={{color:"var(--green)"}}>60-90 DTE (back)</b></div>
                <div><span style={{color:"var(--text-tertiary)"}}>Riesgo:</span> <b>Coste del spread</b></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"0 4px"}}>
          ⚠️ Estas son ideas educativas, no recomendaciones de inversión. Revisa cada trade con tu propio análisis antes de ejecutar.
        </div>
      </>}

      {/* ══════ TAX REPORT ══════ */}
      {section === "tax" && <TaxReportSection hide={hide} openAnalysis={openAnalysis} pill={pill} card={card} hd={hd} />}
    </div>
  );
}
