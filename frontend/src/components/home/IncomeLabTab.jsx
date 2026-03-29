import { useState, useMemo } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const SECTOR_MAP = {
  ACN:"Technology",AMCR:"Materials",AMT:"Real Estate",ARE:"Real Estate",AZJ:"Industrials",
  BIZD:"Financials","BME:AMS":"Technology","BME:VIS":"Consumer Staples",
  CAG:"Consumer Staples",CLPR:"Real Estate",CMCSA:"Communication",CNSWF:"Technology",
  CPB:"Consumer Staples",CUBE:"Real Estate",CZR:"Consumer Disc.",DEO:"Consumer Staples",
  DIDIY:"Technology",EMN:"Materials",ENG:"Utilities",FDJU:"Consumer Disc.",FDS:"Financials",
  FLO:"Consumer Staples",GEO:"Real Estate",GIS:"Consumer Staples",GPC:"Consumer Disc.",
  GQG:"Financials",HEN3:"Consumer Staples","HGK:9616":"Technology","HKG:1052":"Industrials",
  "HKG:1910":"Consumer Disc.","HKG:2219":"Healthcare","HKG:9618":"Consumer Disc.",
  HR:"Healthcare",HRB:"Financials",IIPR:"Real Estate",KHC:"Consumer Staples",KRG:"Real Estate",
  LANDP:"Real Estate",LSEG:"Financials",LW:"Consumer Staples",LYB:"Materials",
  MDV:"Real Estate",MO:"Consumer Staples",MSDL:"Financials",MTN:"Consumer Disc.",
  "NET.UN":"Real Estate",NNN:"Real Estate",NOMD:"Consumer Staples",NVO:"Healthcare",
  O:"Real Estate",OBDC:"Financials",OMC:"Communication",OWL:"Financials",OZON:"Technology",
  PATH:"Technology",PAYX:"Industrials",PEP:"Consumer Staples",PFE:"Healthcare",
  PG:"Consumer Staples",PYPL:"Financials",RAND:"Financials",REXR:"Real Estate",
  RHI:"Industrials",RICK:"Consumer Disc.",RYN:"Real Estate",SAFE:"Real Estate",
  SCHD:"Financials",SHUR:"Real Estate",SPHD:"Financials",SUI:"Real Estate",
  TAP:"Consumer Staples",TROW:"Financials",UNH:"Healthcare",VICI:"Real Estate",
  WEEL:"Financials",WEN:"Consumer Disc.",WKL:"Technology",WPC:"Real Estate",
  XYZ:"Financials",YYY:"Financials",ZTS:"Healthcare",
};

export default function IncomeLabTab() {
  const { portfolioTotals, portfolioList, positions, displayCcy, privacyMode, hide, openAnalysis, getCountry, FLAGS, POS_STATIC } = useHome();
  const [section, setSection] = useState("calendar");
  const [projYears, setProjYears] = useState(10);
  const [dripRate, setDripRate] = useState(5); // DPS growth %

  const pos = portfolioTotals.positions || [];

  // ── DIVIDEND CALENDAR ──
  const calendar = useMemo(() => {
    // Estimate monthly dividend income based on DPS and frequency
    const months = Array.from({length:12}, () => ({total:0, tickers:[]}));
    pos.forEach(p => {
      const dps = p.dpsUSD || 0;
      if (dps <= 0 || !p.shares) return;
      const annual = dps * p.shares;
      // Most US stocks pay quarterly. REITs/CEFs may pay monthly.
      const cat = POS_STATIC[p.ticker]?.cat || "";
      const isMonthly = cat === "CEF" || (p.ticker||"").match(/^(O|MAIN|STAG|AGNC|NLY|PSEC|GAIN|GLAD)$/);
      if (isMonthly) {
        // Monthly payer
        for (let m = 0; m < 12; m++) { months[m].total += annual/12; months[m].tickers.push({t:p.ticker,amt:annual/12}); }
      } else {
        // Quarterly — estimate months based on ticker hash for distribution
        const hash = p.ticker.charCodeAt(0) % 3;
        for (let q = 0; q < 4; q++) {
          const m = (hash + q * 3) % 12;
          months[m].total += annual/4;
          months[m].tickers.push({t:p.ticker,amt:annual/4});
        }
      }
    });
    return months;
  }, [pos]);

  const totalAnnualDiv = pos.reduce((s,p) => s + (p.divAnnualUSD||0), 0);
  const avgMonthly = totalAnnualDiv / 12;

  // ── SECTOR CONCENTRATION ──
  const sectorData = useMemo(() => {
    const bySector = {};
    const totalVal = pos.reduce((s,p) => s + (p.valueUSD||0), 0) || 1;
    pos.forEach(p => {
      const sec = SECTOR_MAP[p.ticker] || POS_STATIC[p.ticker]?.sec || "Otros";
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
    const currentValue = portfolioTotals.totalValueUSD || 0;
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
  }, [projYears, dripRate, totalAnnualDiv, portfolioTotals.totalValueUSD]);

  const hd = {fontSize:13,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10,paddingBottom:6,borderBottom:"2px solid rgba(200,164,78,.2)"};
  const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16,marginBottom:14};
  const pill = (active) => ({padding:"5px 14px",borderRadius:8,border:`1px solid ${active?"var(--gold)":"var(--border)"}`,background:active?"var(--gold-dim)":"transparent",color:active?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:active?700:500,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Section toggle */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{id:"calendar",lbl:"📅 Calendario Dividendos"},{id:"projection",lbl:"📈 Proyección DRIP"},{id:"sectors",lbl:"🏭 Concentración"},{id:"taxloss",lbl:"🔻 Tax-Loss"}].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={pill(section===s.id)}>{s.lbl}</button>
        ))}
      </div>

      {/* ══════ CALENDAR ══════ */}
      {section === "calendar" && <>
        {/* Monthly summary */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,...(window.innerWidth<768?{gridTemplateColumns:"repeat(3,1fr)"}:{})}}>
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
            {l:"PAGADORES",v:`${pos.filter(p=>(p.dpsUSD||0)>0).length} de ${pos.length}`,c:"var(--text-secondary)"},
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
                <tr key={y.year} style={{borderBottom:"1px solid rgba(255,255,255,.04)",background:i===0?"rgba(200,164,78,.04)":"transparent"}}>
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
            {l:"MULTIPLICADOR",v:_sf((dripProjection[dripProjection.length-1]?.value||1)/(portfolioTotals.totalValueUSD||1),1)+"x",c:"var(--green)"},
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
              <div key={s.sec} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{width:10,height:10,borderRadius:2,background:colors[i%colors.length],flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:isOverweight?"var(--red)":"var(--text-primary)",fontFamily:"var(--fm)",fontWeight:isOverweight?700:400}}>
                      {s.sec} {isOverweight && "⚠️"}
                    </span>
                    <span style={{fontSize:12,fontWeight:700,color:isOverweight?"var(--red)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(s.pct*100,1)}%</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                    <div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
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
                    <tr key={p.ticker} onClick={()=>openAnalysis(p.ticker)} style={{borderBottom:"1px solid rgba(255,255,255,.04)",cursor:"pointer"}}
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
    </div>
  );
}
