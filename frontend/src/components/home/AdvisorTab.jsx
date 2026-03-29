import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

export default function AdvisorTab() {
  const {
    screenerData,
    openAnalysis, POS_STATIC,
  } = useHome();

  try {
  const sData = screenerData?.screener || [];
  const sMap = {}; sData.forEach(s => { sMap[s.symbol] = s; });
  const portfolioUS = Object.entries(POS_STATIC)
    .filter(([,v]) => (v.cat==="COMPANY"||v.cat==="REIT") && (v.sh||0) > 0 && (v.c||"USD") === "USD")
    .map(([t,v]) => ({ticker:t,...v,screener:sMap[t]||null,weight:(v.uv||0)}))
    .filter(p => p.screener);

  if (portfolioUS.length === 0) return <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>
    <div style={{fontSize:14,marginBottom:8}}>Sin datos de screener para tu cartera</div>
    <div style={{fontSize:11}}>Ve al Screener → "Analizar Mi Portfolio" para cargar los fundamentales</div>
  </div>;

  const totalValue = portfolioUS.reduce((s,p) => s + (p.weight||0), 0) || 1;

  // Classify each position
  const classify = (s, weightPct) => {
    const alerts = [];
    const positives = [];
    const score = s.score || 0;
    // Negatives
    if (s.payoutFCF > 100) alerts.push({msg:`Payout FCF ${s.payoutFCF}% — paga más dividendo del que genera`,sev:"high"});
    else if (s.payoutFCF > 80) alerts.push({msg:`Payout FCF elevado (${s.payoutFCF}%) — poco margen`,sev:"med"});
    if (s.debtEBITDA > 6) alerts.push({msg:`Deuda/EBITDA ${_sf(s.debtEBITDA,1)}x — exceso de apalancamiento`,sev:"high"});
    else if (s.debtEBITDA > 4) alerts.push({msg:`Deuda/EBITDA ${_sf(s.debtEBITDA,1)}x — deuda alta`,sev:"med"});
    if (s.epsCAGR < -5) alerts.push({msg:`BPA cayendo ${_sf(s.epsCAGR,1)}% anual — negocio en declive`,sev:"high"});
    else if (s.epsCAGR < 0) alerts.push({msg:`BPA decreciente (${_sf(s.epsCAGR,1)}% CAGR)`,sev:"med"});
    if (s.roic < 3) alerts.push({msg:`ROIC ${_sf(s.roic,1)}% — destruye valor`,sev:"high"});
    else if (s.roic < 8) alerts.push({msg:`ROIC moderado (${_sf(s.roic,1)}%) — sin moat claro`,sev:"med"});
    if (s.divYield === 0) alerts.push({msg:"No paga dividendo",sev:"info"});
    if (s.grossMargin < 15) alerts.push({msg:`Margen bruto ${s.grossMargin}% — negocio commodity`,sev:"med"});
    if (s.pe < 0) alerts.push({msg:"PER negativo — pérdidas",sev:"high"});
    else if (s.pe > 35) alerts.push({msg:`PER ${_sf(s.pe,1)} — posible sobrevaloración`,sev:"med"});
    if (s.discount < -30) alerts.push({msg:`Cotiza ${Math.abs(s.discount)}% sobre su valor justo`,sev:"med"});
    if (weightPct > 8) alerts.push({msg:`Peso ${_sf(weightPct,1)}% — concentración alta`,sev:"info"});
    // Positives
    if (s.roic > 20) positives.push("ROIC excelente ("+_sf(s.roic,1)+"%)");
    if (s.epsCAGR > 10) positives.push("Crecimiento BPA fuerte ("+_sf(s.epsCAGR,1)+"%)");
    if (s.grossMargin > 50) positives.push("Margen bruto >50% — ventaja competitiva");
    if (s.payoutFCF > 0 && s.payoutFCF < 50) positives.push("Payout FCF conservador ("+s.payoutFCF+"%)");
    if (s.debtEBITDA >= 0 && s.debtEBITDA < 1.5) positives.push("Deuda muy baja");
    if (s.discount > 15) positives.push("Infravalorada "+s.discount+"% vs fair value");
    if (s.tir > 12) positives.push("TIR estimada "+_sf(s.tir,1)+"%");
    if (s.divYield > 3 && s.payoutFCF < 70) positives.push("Yield "+_sf(s.divYield,1)+"% con payout sostenible");

    const highCount = alerts.filter(a=>a.sev==="high").length;
    const medCount = alerts.filter(a=>a.sev==="med").length;
    if (score >= 75 && highCount === 0) return {verdict:"MANTENER",color:"#34d399",alerts,positives};
    if (score >= 60 && highCount === 0) return {verdict:"VIGILAR",color:"#d69e2e",alerts,positives};
    if (score >= 45 && highCount <= 1) return {verdict:"REVISAR",color:"#f59e0b",alerts,positives};
    return {verdict:"VENDER",color:"#f87171",alerts,positives};
  };

  const analyzed = portfolioUS.map(p => ({...p, weightPct: p.weight/totalValue*100, analysis: classify(p.screener, p.weight/totalValue*100)})).sort((a,b) => {
    const order = {VENDER:0,REVISAR:1,VIGILAR:2,MANTENER:3};
    return (order[a.analysis.verdict]||9) - (order[b.analysis.verdict]||9) || (a.screener.score||0) - (b.screener.score||0);
  });

  const counts = {MANTENER:0,VIGILAR:0,REVISAR:0,VENDER:0};
  analyzed.forEach(a => { counts[a.analysis.verdict] = (counts[a.analysis.verdict]||0) + 1; });

  // Find alternatives — same sector priority, must be fairly valued
  const findAlts = (item) => {
    const sec = item.screener.sector;
    const myScore = item.screener.score;
    const myTicker = item.ticker;
    const portfolioTickers = new Set(portfolioUS.map(p=>p.ticker));
    const result = {sameSector:[],reinforce:[],message:null};

    // 1. Same sector alternatives — better score, pays dividend, not overvalued
    result.sameSector = sData
      .filter(s => s.sector === sec && s.score > myScore && s.symbol !== myTicker && s.divYield > 0 && (s.discount||0) >= -15 && !portfolioTickers.has(s.symbol))
      .sort((a,b) => {
        // Sort by: cheap + high score combo
        const aVal = (a.discount||0) + (a.score||0)/2;
        const bVal = (b.discount||0) + (b.score||0)/2;
        return bVal - aVal;
      }).slice(0, 5);

    // 2. Positions in your portfolio worth reinforcing (high score, cheap, different sector)
    result.reinforce = analyzed
      .filter(p => p.ticker !== myTicker && p.screener.score >= 70 && (p.screener.discount||0) > 0 && p.analysis.verdict === "MANTENER")
      .sort((a,b) => (b.screener.discount||0) - (a.screener.discount||0))
      .slice(0, 3)
      .map(p => p.screener);

    // 3. Message if no good alternatives
    if (result.sameSector.length === 0 && result.reinforce.length === 0) {
      result.message = "No hay alternativas baratas con mejores fundamentales. Considerar mantener liquidez hasta encontrar mejor oportunidad.";
    } else if (result.sameSector.length === 0) {
      result.message = `No hay alternativas mejores en ${sec}. Considerar reforzar posiciones fuertes existentes.`;
    }

    return result;
  };

  // Sector concentration
  const bySector = {};
  analyzed.forEach(p => {
    const sec = p.screener.sector || "Otros";
    if (!bySector[sec]) bySector[sec] = {count:0,value:0,avgScore:0,scores:[]};
    bySector[sec].count++;
    bySector[sec].value += p.weight;
    bySector[sec].scores.push(p.screener.score);
  });
  Object.values(bySector).forEach(v => { v.avgScore = Math.round(v.scores.reduce((a,b)=>a+b,0)/v.scores.length); v.pct = Math.round(v.value/totalValue*100); });
  const topSectors = Object.entries(bySector).sort((a,b)=>b[1].value-a[1].value);

  // Portfolio health score
  const avgScore = Math.round(analyzed.reduce((s,p)=>s+(p.screener.score||0)*p.weight,0)/totalValue);
  const avgYield = analyzed.reduce((s,p)=>s+(p.screener.divYield||0)*p.weight,0)/totalValue;
  const avgTir = analyzed.reduce((s,p)=>s+(p.screener.tir||0)*p.weight,0)/totalValue;

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    {/* Header with portfolio health */}
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,padding:"20px 24px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>Portfolio Advisor</div>
          <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>{analyzed.length} posiciones analizadas · Score ponderado por peso en cartera</div>
        </div>
        <div style={{display:"flex",gap:16}}>
          <div style={{textAlign:"center"}}><div style={{fontSize:8,color:"var(--text-tertiary)"}}>SCORE CARTERA</div><div style={{fontSize:24,fontWeight:800,color:avgScore>=70?"#34d399":avgScore>=50?"#d69e2e":"#f87171",fontFamily:"var(--fm)"}}>{avgScore}</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:8,color:"var(--text-tertiary)"}}>YIELD MEDIO</div><div style={{fontSize:24,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(avgYield,1)}%</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:8,color:"var(--text-tertiary)"}}>TIR ESPERADA</div><div style={{fontSize:24,fontWeight:800,color:avgTir>10?"#34d399":"var(--text-primary)",fontFamily:"var(--fm)"}}>{_sf(avgTir,1)}%</div></div>
        </div>
      </div>
    </div>

    {/* Verdict + sector concentration */}
    <div style={{display:"flex",gap:10}}>
      <div style={{flex:3,display:"flex",gap:8}}>
        {[{l:"MANTENER",c:"#34d399",n:counts.MANTENER},{l:"VIGILAR",c:"#d69e2e",n:counts.VIGILAR},{l:"REVISAR",c:"#f59e0b",n:counts.REVISAR},{l:"VENDER",c:"#f87171",n:counts.VENDER}].map(v=>
          <div key={v.l} style={{flex:1,padding:"10px 12px",borderRadius:10,background:`${v.c}10`,border:`1px solid ${v.c}25`,textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:v.c,fontFamily:"var(--fm)"}}>{v.n}</div>
            <div style={{fontSize:8,color:v.c,fontFamily:"var(--fm)",letterSpacing:.5,opacity:.8}}>{v.l}</div>
          </div>
        )}
      </div>
      <div style={{flex:2,background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px"}}>
        <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:6,letterSpacing:.5}}>CONCENTRACIÓN POR SECTOR</div>
        {topSectors.slice(0,4).map(([sec,d])=><div key={sec} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
          <div style={{flex:1,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}><div style={{width:`${d.pct}%`,height:"100%",background:d.pct>30?"#f87171":d.pct>20?"#f59e0b":"var(--gold)",borderRadius:2}}/></div>
          <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",width:60,textAlign:"right"}}>{sec.slice(0,12)}</span>
          <span style={{fontSize:9,fontWeight:600,color:d.pct>30?"#f87171":"var(--text-secondary)",fontFamily:"var(--fm)",width:25,textAlign:"right"}}>{d.pct}%</span>
        </div>)}
      </div>
    </div>

    {/* Position cards */}
    {analyzed.map(item => {
      const s = item.screener;
      const a = item.analysis;
      const altData = (a.verdict === "REVISAR" || a.verdict === "VENDER") ? findAlts(item) : {sameSector:[],reinforce:[],message:null};
      return <div key={item.ticker} style={{background:"var(--card)",border:`1px solid ${a.color}25`,borderLeft:`4px solid ${a.color}`,borderRadius:14,padding:"16px 20px",transition:"all .2s"}}
        onMouseEnter={e=>e.currentTarget.style.background=`${a.color}08`} onMouseLeave={e=>e.currentTarget.style.background="var(--card)"}>
        {/* Top row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:`${a.color}15`,color:a.color,fontWeight:800,fontFamily:"var(--fm)",letterSpacing:.5}}>{a.verdict}</span>
            <div>
              <span style={{fontSize:15,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",cursor:"pointer"}} onClick={()=>openAnalysis(item.ticker)}>{item.ticker}</span>
              <span style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:6}}>{s.name}</span>
              <span style={{fontSize:8,marginLeft:6,padding:"1px 5px",borderRadius:3,background:"rgba(255,255,255,.04)",color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{s.sector}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"var(--text-tertiary)"}}>PESO</div><div style={{fontSize:12,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{_sf(item.weightPct,1)}%</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"var(--text-tertiary)"}}>SCORE</div><div style={{fontSize:16,fontWeight:800,color:s.score>=70?"#34d399":s.score>=50?"#d69e2e":"#f87171",fontFamily:"var(--fm)"}}>{s.score}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"var(--text-tertiary)"}}>YIELD</div><div style={{fontSize:13,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(s.divYield,1)}%</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"var(--text-tertiary)"}}>TIR</div><div style={{fontSize:13,fontWeight:700,color:s.tir>10?"#34d399":"var(--text-secondary)",fontFamily:"var(--fm)"}}>{_sf(s.tir,1)}%</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"var(--text-tertiary)"}}>DESCUENTO</div><div style={{fontSize:13,fontWeight:700,color:(s.discount||0)>0?"#34d399":(s.discount||0)>-15?"var(--text-secondary)":"#f87171",fontFamily:"var(--fm)"}}>{(s.discount||0)>0?"+":""}{s.discount||0}%</div></div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          {[{l:"Payout FCF",v:`${s.payoutFCF}%`,c:s.payoutFCF<60?"#34d399":s.payoutFCF<80?"#d69e2e":"#f87171"},
            {l:"D/EBITDA",v:`${_sf(s.debtEBITDA,1)}x`,c:s.debtEBITDA<3?"#34d399":s.debtEBITDA<5?"#d69e2e":"#f87171"},
            {l:"ROIC",v:`${_sf(s.roic,1)}%`,c:s.roic>15?"#34d399":s.roic>8?"var(--text-secondary)":"#f87171"},
            {l:"Crec.",v:`${_sf(s.epsCAGR,1)}%`,c:s.epsCAGR>5?"#34d399":s.epsCAGR>0?"var(--text-secondary)":"#f87171"},
            {l:"PER",v:s.pe>0?_sf(s.pe,1):"—",c:s.pe>0&&s.pe<20?"#34d399":s.pe<35?"var(--text-primary)":"#f87171"},
            {l:"FMP",v:s.fmpRating?.rating||"—"},
          ].map((kpi,i) => <div key={i} style={{padding:"3px 8px",background:"rgba(255,255,255,.02)",borderRadius:5,fontSize:9,fontFamily:"var(--fm)"}}>
            <span style={{color:"var(--text-tertiary)"}}>{kpi.l} </span>
            <span style={{fontWeight:700,color:kpi.c||"var(--text-primary)"}}>{kpi.v}</span>
          </div>)}
        </div>

        {/* Positives + Alerts side by side */}
        <div style={{display:"flex",gap:12,marginBottom:(altData.sameSector.length>0||altData.reinforce.length>0)?10:0}}>
          {a.positives.length > 0 && <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {a.positives.map((p,i) => <div key={i} style={{fontSize:9,fontFamily:"var(--fm)",color:"#34d399",paddingLeft:10,borderLeft:"2px solid rgba(52,211,153,.3)"}}>✓ {p}</div>)}
          </div>}
          {a.alerts.length > 0 && <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {a.alerts.map((al,i) => <div key={i} style={{fontSize:9,fontFamily:"var(--fm)",color:al.sev==="high"?"#f87171":al.sev==="med"?"#f59e0b":"var(--text-tertiary)",paddingLeft:10,borderLeft:`2px solid ${al.sev==="high"?"rgba(248,113,113,.3)":al.sev==="med"?"rgba(245,158,11,.3)":"rgba(255,255,255,.06)"}`}}>
              {al.sev==="high"?"⚠ ":al.sev==="med"?"● ":"○ "}{al.msg}
            </div>)}
          </div>}
        </div>

        {/* Alternatives — same sector + reinforce existing */}
        {(altData.sameSector.length > 0 || altData.reinforce.length > 0 || altData.message) && <div style={{marginTop:6}}>
          {/* Same sector alternatives */}
          {altData.sameSector.length > 0 && <div style={{padding:"10px 12px",background:"rgba(52,211,153,.03)",borderRadius:8,border:"1px solid rgba(52,211,153,.08)",marginBottom:altData.reinforce.length>0?8:0}}>
            <div style={{fontSize:9,color:"#34d399",fontFamily:"var(--fm)",fontWeight:600,marginBottom:6,letterSpacing:.5}}>ALTERNATIVAS EN {s.sector.toUpperCase()}</div>
            {/* Comparison header */}
            <div style={{display:"flex",gap:4,marginBottom:4,padding:"0 10px"}}>
              <span style={{flex:2,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}></span>
              <span style={{flex:1,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>Score</span>
              <span style={{flex:1,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>Yield</span>
              <span style={{flex:1,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>TIR</span>
              <span style={{flex:1,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>Desc.</span>
              <span style={{flex:1,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>D/EBITDA</span>
              <span style={{flex:1,fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>ROIC</span>
            </div>
            {/* Current position for comparison */}
            <div style={{display:"flex",gap:4,padding:"4px 10px",background:"rgba(248,113,113,.04)",borderRadius:4,marginBottom:4}}>
              <span style={{flex:2,fontSize:9,fontWeight:700,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{item.ticker} (actual)</span>
              <span style={{flex:1,fontSize:9,fontWeight:700,color:"#f87171",fontFamily:"var(--fm)",textAlign:"center"}}>{s.score}</span>
              <span style={{flex:1,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(s.divYield,1)}%</span>
              <span style={{flex:1,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(s.tir,1)}%</span>
              <span style={{flex:1,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>{s.discount||0}%</span>
              <span style={{flex:1,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(s.debtEBITDA,1)}x</span>
              <span style={{flex:1,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(s.roic,1)}%</span>
            </div>
            {altData.sameSector.map(alt => <div key={alt.symbol} style={{display:"flex",gap:4,padding:"5px 10px",background:"rgba(255,255,255,.02)",borderRadius:4,marginBottom:2,cursor:"pointer",transition:"all .15s"}}
              onClick={()=>openAnalysis(alt.symbol)} onMouseEnter={e=>e.currentTarget.style.background="rgba(52,211,153,.06)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.02)"}>
              <div style={{flex:2}}><span style={{fontSize:10,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{alt.symbol}</span><span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:4}}>{alt.name?.slice(0,18)}</span></div>
              <span style={{flex:1,fontSize:10,fontWeight:700,color:alt.score>s.score?"#34d399":"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"center"}}>{alt.score}</span>
              <span style={{flex:1,fontSize:9,color:"var(--gold)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(alt.divYield,1)}%</span>
              <span style={{flex:1,fontSize:9,color:alt.tir>10?"#34d399":"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(alt.tir,1)}%</span>
              <span style={{flex:1,fontSize:9,fontWeight:600,color:(alt.discount||0)>0?"#34d399":"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"center"}}>{(alt.discount||0)>0?"+":""}{alt.discount||0}%</span>
              <span style={{flex:1,fontSize:9,color:alt.debtEBITDA<3?"#34d399":"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(alt.debtEBITDA,1)}x</span>
              <span style={{flex:1,fontSize:9,color:alt.roic>15?"#34d399":"var(--text-secondary)",fontFamily:"var(--fm)",textAlign:"center"}}>{_sf(alt.roic,1)}%</span>
            </div>)}
          </div>}

          {/* Reinforce existing positions */}
          {altData.reinforce.length > 0 && <div style={{padding:"10px 12px",background:"rgba(212,175,55,.03)",borderRadius:8,border:"1px solid rgba(212,175,55,.08)"}}>
            <div style={{fontSize:9,color:"var(--gold)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:6,letterSpacing:.5}}>REFORZAR POSICIONES EXISTENTES (INFRAVALORADAS)</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {altData.reinforce.map(alt => <div key={alt.symbol} style={{padding:"6px 10px",background:"rgba(255,255,255,.02)",borderRadius:6,cursor:"pointer",transition:"all .15s",flex:"1 1 120px"}}
                onClick={()=>openAnalysis(alt.symbol)} onMouseEnter={e=>e.currentTarget.style.background="rgba(212,175,55,.06)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.02)"}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{alt.symbol}</div>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{alt.sector}</div>
                <div style={{display:"flex",gap:6,marginTop:3}}>
                  <span style={{fontSize:8,fontWeight:700,color:"#34d399",fontFamily:"var(--fm)"}}>Score {alt.score}</span>
                  <span style={{fontSize:8,color:"#34d399",fontFamily:"var(--fm)"}}>{(alt.discount||0)>0?"+":""}{alt.discount||0}%</span>
                </div>
              </div>)}
            </div>
          </div>}

          {/* Message when no good alternatives */}
          {altData.message && <div style={{padding:"8px 12px",fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontStyle:"italic",background:"rgba(255,255,255,.02)",borderRadius:6}}>{altData.message}</div>}
        </div>}
      </div>;
    })}
  </div>;
} catch(advErr) { return <div style={{padding:40,color:"var(--red)",fontFamily:"var(--fm)"}}><div style={{fontSize:14,marginBottom:8}}>Error en Advisor:</div><pre style={{fontSize:10,color:"var(--text-tertiary)",whiteSpace:"pre-wrap"}}>{advErr.message}{"\n"}{advErr.stack}</pre></div>; }
}
