import { useAnalysis } from '../../context/AnalysisContext.jsx';
import { _sf } from '../../utils/formatters.js';

// ── A&R Professional Report ──
function ARReport() {
  const { reportData, reportLoading, reportSymbol, cfg, openReport, priceChartData } = useAnalysis();

  if (!reportData || reportSymbol !== cfg?.ticker) { if(!reportLoading) openReport(cfg?.ticker); }
  if (reportLoading) return <div style={{padding:60,textAlign:"center",color:"var(--gold)",fontSize:13}}>Generando informe profesional de {cfg?.ticker}...</div>;
  if (!reportData) return <div style={{padding:60,textAlign:"center"}}><button onClick={()=>openReport(cfg?.ticker)} style={{padding:"14px 28px",borderRadius:10,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Generar Informe de {cfg?.ticker}</button></div>;

  const r = reportData, yrs = r.years||[], L = yrs[yrs.length-1]||{}, F = yrs[0]||{};
  const s = r.currency==="EUR"?"€":r.currency==="GBP"?"£":"$";
  const fV = v => v==null?"—":Math.abs(v)>=1e3?`${_sf(v/1e3,1)}B`:`${v}M`;
  const pC = v => v>0?"#34d399":v<0?"#f87171":"var(--text-tertiary)";
  const qC = v => v>=4?"#34d399":v>=3?"#c8a44e":v>=2?"#f59e0b":"#f87171";
  const cagr = (first,last,n) => first>0&&last>0&&n>1?((Math.pow(last/first,1/(n-1))-1)*100):null;
  const revCAGR = cagr(F.revenue,L.revenue,yrs.length);
  const epsCAGR = cagr(F.eps,L.eps,yrs.length);
  const dpsCAGR = cagr(F.dps,L.dps,yrs.length);
  const fcfCAGR = cagr(F.fcf,L.fcf,yrs.length);
  const pricePd = priceChartData;
  const weekly = pricePd?.filter((_,i) => i % 5 === 0)||[];
  const prices = weekly.map(p=>p.close);
  const hd = {fontSize:14,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12,paddingBottom:6,borderBottom:"2px solid rgba(212,175,55,.2)"};
  const card = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:18,marginBottom:14};

  const PriceSvg = () => {
    if(prices.length<10) return null;
    const validPrices=prices.filter(p=>p>0); if(!validPrices.length) return null;
    const mn=Math.min(...validPrices)*.95,mx=Math.max(...validPrices)*1.02,rg=mx-mn||1,W=500,H=80;
    const pts=weekly.map((p,i)=>`${i/(weekly.length-1)*W},${H-((p.close-mn)/rg)*H}`).join(" ");
    const col=prices[prices.length-1]>=prices[0]?"#34d399":"#f87171";
    return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:80}}><defs><linearGradient id="rpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".15"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs><polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#rpg)"/><polyline points={pts} fill="none" stroke={col} strokeWidth="1.5"/></svg>;
  };

  return (
    <div>
      {/* PORTADA */}
      <div style={{background:"linear-gradient(135deg,rgba(212,175,55,.06),rgba(212,175,55,.01))",border:"2px solid var(--gold)",borderRadius:18,padding:"32px 28px",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:9,color:"var(--gold)",letterSpacing:3,fontFamily:"var(--fm)",fontWeight:600}}>EQUITY RESEARCH REPORT</div>
            <div style={{fontSize:28,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fd)",marginTop:6}}>{r.name}</div>
            <div style={{fontSize:12,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>{r.symbol} · {r.sector} · {r.industry}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:28,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{s}{_sf(r.price,2)}</div>
            <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{new Date().toLocaleDateString('es-ES')} · {r.currency}</div>
          </div>
        </div>
        <PriceSvg/>
      </div>

      {/* RESUMEN EJECUTIVO */}
      <div style={card}>
        <div style={hd}>Resumen Ejecutivo</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:12}}>
          {[
            {l:"Market Cap",v:fV(Math.round((r.marketCap||0)/1e6))},
            {l:"P/E Ratio",v:L.pe||"—",c:L.pe>0&&L.pe<20?"#34d399":L.pe<35?"var(--text-primary)":"#f87171"},
            {l:"Dividend Yield",v:`${_sf(L.rpd,2)}%`,c:"var(--gold)"},
            {l:"D/EBITDA",v:`${L.debtEbitda||"—"}x`,c:L.debtEbitda<3?"#34d399":"#f87171"},
            {l:"ROE",v:`${L.roe||"—"}%`,c:L.roe>15?"#34d399":"var(--text-primary)"},
            {l:"ROIC / ROCE",v:`${L.roce||"—"}%`},
            {l:"Margen Neto",v:`${L.marginNet||"—"}%`,c:L.marginNet>15?"#34d399":"var(--text-primary)"},
            {l:"FCF Yield",v:L.fcf&&r.marketCap?`${_sf(L.fcf/(r.marketCap/1e6)*100,1)}%`:"—",c:"#34d399"},
            {l:"BPA",v:`${s}${_sf(L.eps,2)}`},
            {l:"DPA",v:`${s}${_sf(L.dps,2)}`,c:"var(--gold)"},
            {l:"Payout",v:`${L.payout||"—"}%`,c:L.payout<60?"#34d399":L.payout<80?"#c8a44e":"#f87171"},
            {l:"Score A&R",v:`${_sf(r.finalScore,1)}/5`,c:qC(r.finalScore)},
          ].map((kpi,i)=><div key={i} style={{padding:"10px",background:"var(--row-alt)",borderRadius:10}}>
            <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,textTransform:"uppercase"}}>{kpi.l}</div>
            <div style={{fontSize:17,fontWeight:700,color:kpi.c||"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{kpi.v}</div>
          </div>)}
        </div>
      </div>

      {/* TESIS DE INVERSIÓN */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={card}>
          <div style={hd}>Crecimiento (CAGR {yrs.length}Y)</div>
          {[{l:"Ventas",v:revCAGR},{l:"BPA",v:epsCAGR},{l:"DPA",v:dpsCAGR},{l:"FCF",v:fcfCAGR}].map((g,i)=>
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--subtle-border)"}}>
              <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{g.l}</span>
              <span style={{fontSize:13,fontWeight:700,color:pC(g.v),fontFamily:"var(--fm)"}}>{g.v!=null?`${g.v>0?"+":""}${_sf(g.v,1)}%`:"—"}</span>
            </div>)}
        </div>
        <div style={card}>
          <div style={hd}>Solidez Financiera</div>
          {[{l:"Deuda Neta / EBITDA",v:L.debtEbitda!=null?`${_sf(L.debtEbitda,1)}x`:"—",c:L.debtEbitda<2?"#34d399":L.debtEbitda<4?"#c8a44e":"#f87171"},
            {l:"Ratio de Liquidez",v:L.currentRatio!=null?_sf(L.currentRatio,2):"—",c:L.currentRatio>1.5?"#34d399":"#f87171"},
            {l:"Autonomía Financiera",v:L.autonomy!=null?`${L.autonomy}%`:"—",c:L.autonomy>40?"#34d399":"#f87171"},
            {l:"Deuda Neta",v:L.netDebt!=null?`${s}${fV(L.netDebt)}`:"—",c:L.netDebt<0?"#34d399":"var(--text-primary)"},
          ].map((g,i)=>
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--subtle-border)"}}>
              <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{g.l}</span>
              <span style={{fontSize:13,fontWeight:700,color:g.c||"var(--text-primary)",fontFamily:"var(--fm)"}}>{g.v}</span>
            </div>)}
        </div>
      </div>

      {/* VALORACIÓN */}
      <div style={card}>
        <div style={hd}>Valoración — Precio Objetivo</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:14}}>
          {[{l:"DCF Fair Value",v:r.valuation.dcf?Math.round(r.valuation.dcf*10)/10:null},
            {l:"PER Medio 5Y",v:r.valuation.fairByPerMed},
            {l:"PER Mínimo 5Y",v:r.valuation.fairByPerMin},
            {l:"Target Consenso",v:r.valuation.targetConsensus},
            {l:"Target Alto",v:r.valuation.targetHigh},
            {l:"Target Bajo",v:r.valuation.targetLow},
          ].map((p,i)=>{
            const disc=p.v&&r.price?Math.round((p.v-r.price)/r.price*100):null;
            return <div key={i} style={{padding:"12px",background:"var(--row-alt)",borderRadius:10}}>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:.3}}>{p.l}</div>
              <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:3}}>{p.v?`${s}${_sf(p.v,0)}`:"—"}</div>
              {disc!=null&&<div style={{fontSize:10,fontWeight:600,color:disc>0?"#34d399":"#f87171",fontFamily:"var(--fm)"}}>{disc>0?"+":""}{disc}% upside</div>}
            </div>;
          })}
        </div>
        {r.valuation.fairByPerMed&&<div style={{display:"flex",gap:10}}>
          <div style={{flex:1,padding:"10px 14px",background:"rgba(212,175,55,.06)",borderRadius:8,borderLeft:"3px solid var(--gold)"}}>
            <div style={{fontSize:9,color:"var(--gold)",fontFamily:"var(--fm)"}}>MARGEN SEGURIDAD 15%</div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{s}{_sf(r.valuation.fairByPerMed*.85,0)}</div>
          </div>
          <div style={{flex:1,padding:"10px 14px",background:"rgba(212,175,55,.04)",borderRadius:8,borderLeft:"3px solid rgba(212,175,55,.4)"}}>
            <div style={{fontSize:9,color:"var(--gold)",fontFamily:"var(--fm)",opacity:.7}}>MARGEN SEGURIDAD 30%</div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{s}{_sf(r.valuation.fairByPerMed*.7,0)}</div>
          </div>
        </div>}
      </div>

      {/* EVOLUCIÓN HISTÓRICA */}
      <div style={card}>
        <div style={hd}>Evolución Histórica ({s} Millones)</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10,minWidth:700}}>
          <thead><tr><th style={{padding:"5px 7px",textAlign:"left",color:"var(--gold)",fontSize:8,fontWeight:700,fontFamily:"var(--fm)",borderBottom:"2px solid var(--gold)"}}>Métrica</th>
            {yrs.map(y=><th key={y.year} style={{padding:"5px 7px",textAlign:"right",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"2px solid var(--border)"}}>{y.year}</th>)}
            <th style={{padding:"5px 7px",textAlign:"right",color:"var(--gold)",fontSize:8,fontWeight:700,fontFamily:"var(--fm)",borderBottom:"2px solid var(--gold)"}}>CAGR</th>
          </tr></thead>
          <tbody>
            {[{k:"revenue",l:"Ventas",cagr:revCAGR},{k:"netIncome",l:"Beneficio Neto"},{k:"ebitda",l:"EBITDA"},{k:"fcf",l:"Free Cash Flow",cagr:fcfCAGR},{k:"eps",l:"BPA",dec:1,cagr:epsCAGR},{k:"dps",l:"DPA",dec:1,cagr:dpsCAGR,gold:1},{k:"payout",l:"Payout %",pct:1},{k:"rpd",l:"Yield %",pct:1},{k:"pe",l:"PER",dec:1},{k:"debtEbitda",l:"D/EBITDA",dec:1},{k:"roe",l:"ROE %",pct:1},{k:"marginNet",l:"Margen Neto %",pct:1}].map(row=>
              <tr key={row.k}><td style={{padding:"4px 7px",fontWeight:600,color:row.gold?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-border)",fontSize:10}}>{row.l}</td>
                {yrs.map(y=>{const v=y[row.k];return <td key={y.year} style={{padding:"4px 7px",textAlign:"right",fontFamily:"var(--fm)",color:row.gold?"var(--gold)":v>0?"var(--text-primary)":v<0?"#f87171":"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-border)",fontSize:10}}>{v!=null?(row.pct?v+"%":row.dec?_sf(v,2):fV(v)):"—"}</td>;})}
                <td style={{padding:"4px 7px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:pC(row.cagr),borderBottom:"1px solid var(--subtle-border)",fontSize:10}}>{row.cagr!=null?`${row.cagr>0?"+":""}${_sf(row.cagr,1)}%`:"—"}</td>
              </tr>)}
          </tbody>
        </table></div>
      </div>

      {/* DIVIDENDO */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}}>
        <div style={card}>
          <div style={hd}>Historial de Dividendo</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:100,marginBottom:8}}>
            {yrs.map((y,i)=>{const mx=Math.max(...yrs.map(y=>y.dps||0),0.01);const h=(y.dps||0)/mx*100;return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
              <div style={{fontSize:7,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:2}}>{_sf(y.dps,2)}</div>
              <div style={{width:"100%",height:`${Math.max(h,2)}%`,background:"var(--gold)",borderRadius:"2px 2px 0 0",opacity:.6}}/>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{y.year?.slice(2)}</div>
            </div>;})}
          </div>
          <div style={{display:"flex",gap:16}}>
            <div><span style={{fontSize:9,color:"var(--text-tertiary)"}}>DPA actual</span><div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{s}{_sf(L.dps,2)}</div></div>
            <div><span style={{fontSize:9,color:"var(--text-tertiary)"}}>Yield</span><div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(L.rpd,2)}%</div></div>
            <div><span style={{fontSize:9,color:"var(--text-tertiary)"}}>CAGR DPA</span><div style={{fontSize:16,fontWeight:700,color:pC(dpsCAGR),fontFamily:"var(--fm)"}}>{dpsCAGR!=null?`${_sf(dpsCAGR,1)}%`:"—"}</div></div>
          </div>
        </div>
        <div style={card}>
          <div style={hd}>Scoring A&R</div>
          {[{l:"Solidez",items:r.scoring.solidez},{l:"Rentabilidad",items:r.scoring.rentabilidad},{l:"Dividendo",items:r.scoring.dividendo}].map(sec=>{
            const vals=Object.values(sec.items).filter(v=>v!=null);
            const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
            return <div key={sec.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--subtle-border)"}}>
              <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{sec.l}</span>
              <span style={{fontSize:14,fontWeight:800,color:qC(avg),fontFamily:"var(--fm)"}}>{_sf(avg,1)}</span>
            </div>;
          })}
          <div style={{textAlign:"center",marginTop:12,padding:"10px 0",borderTop:"2px solid var(--gold)"}}>
            <div style={{fontSize:9,color:"var(--text-tertiary)",letterSpacing:1}}>SCORE FINAL</div>
            <div style={{fontSize:32,fontWeight:800,color:qC(r.finalScore),fontFamily:"var(--fm)"}}>{_sf(r.finalScore,2)}<span style={{fontSize:14,opacity:.4}}>/5</span></div>
          </div>
        </div>
      </div>

      {/* ESTIMACIONES */}
      {r.estimates?.length>0&&<div style={card}>
        <div style={hd}>Estimaciones de Analistas</div>
        <div style={{display:"flex",gap:14}}>
          {r.estimates.map((e,i)=><div key={i} style={{flex:1,padding:12,background:"var(--row-alt)",borderRadius:10}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{e.year}</div>
            <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:4}}>BPA Estimado</div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{s}{_sf(e.epsEst,2)}</div>
            <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:4}}>Ventas Estimadas</div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{fV(e.revEst)}</div>
          </div>)}
        </div>
      </div>}

      {/* FMP RATING */}
      {r.rating?.rating&&<div style={{display:"flex",justifyContent:"center",gap:20,padding:"16px 0",marginBottom:14}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"var(--text-tertiary)"}}>FMP RATING</div><div style={{fontSize:28,fontWeight:800,color:"#64d2ff",fontFamily:"var(--fm)"}}>{r.rating.rating}</div></div>
        <div style={{textAlign:"center"}}><div style={{fontSize:9,color:"var(--text-tertiary)"}}>FMP SCORE</div><div style={{fontSize:28,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{r.rating.score}/5</div></div>
      </div>}

      <div style={{textAlign:"center",padding:16,color:"var(--text-tertiary)",fontSize:9,borderTop:"1px solid var(--border)",fontFamily:"var(--fm)"}}>
        A&R Equity Research · {new Date().toLocaleDateString('es-ES')} · Datos: Financial Modeling Prep · No constituye asesoramiento financiero
        <div style={{marginTop:4}}>Para exportar: <strong style={{color:"var(--gold)"}}>Ctrl+P</strong> (Cmd+P en Mac) → Guardar como PDF</div>
      </div>
    </div>
  );
}

export default ARReport;
