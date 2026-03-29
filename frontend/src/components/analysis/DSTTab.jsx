import { useAnalysis } from '../../context/AnalysisContext.jsx';
import { _sf } from '../../utils/formatters.js';

// ── DividendST Report ──
function DSTTab() {
  const { reportData, reportLoading, reportSymbol, cfg, openReport } = useAnalysis();

  if (reportLoading) return <div style={{padding:60,textAlign:"center",color:"var(--gold)",fontSize:13,fontFamily:"var(--fm)"}}>Cargando informe DividendST de {cfg?.ticker}...</div>;
  if (!reportData || reportSymbol !== cfg?.ticker) return <div style={{padding:60,textAlign:"center"}}>
    <button onClick={()=>openReport(cfg?.ticker)} style={{padding:"14px 28px",borderRadius:10,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Generar Informe DividendST de {cfg?.ticker}</button>
  </div>;

  const d = reportData; if(d.error) return <div style={{padding:40,color:"var(--red)"}}>{d.error}</div>;
  const y = d.years||[], lat = y[y.length-1]||{};
  const sym = d.currency==="EUR"?"€":d.currency==="GBP"?"£":"$";
  const sc = v => v>=4?"#34d399":v>=3?"#d69e2e":v>=2?"#f59e0b":"#f87171";
  const fM = v => v==null?"—":Math.abs(v)>=1000?`${_sf(v/1000,1)}B`:`${v}M`;
  const hd = {fontSize:15,fontWeight:700,color:"#c9972e",fontFamily:"var(--fd)",marginBottom:12,marginTop:24,paddingBottom:6,borderBottom:"2px solid #c9972e"};
  const thS = {padding:"5px 7px",textAlign:"right",color:"#fff",fontSize:8,fontWeight:700,fontFamily:"var(--fm)",background:"#8B4513",whiteSpace:"nowrap",borderBottom:"none"};
  const tdS = {padding:"4px 7px",textAlign:"right",fontFamily:"var(--fm)",fontSize:10,borderBottom:"1px solid rgba(255,255,255,.06)",whiteSpace:"nowrap"};
  const tdL = {padding:"4px 7px",textAlign:"left",fontFamily:"var(--fm)",fontSize:10,fontWeight:600,borderBottom:"1px solid rgba(255,255,255,.06)",whiteSpace:"nowrap",background:"#8B4513",color:"#fff"};
  const pctChg = (cur,prev) => prev?Math.round((cur-prev)/Math.abs(prev)*10000)/100:null;

  // SVG line chart
  const SvgLine = ({data,keys,colors,labels,W=500,H=160,dots=true,area=false}) => {
    if(!data||data.length<2)return null;
    const allV=keys.flatMap(k=>data.map(d=>d[k])).filter(v=>v!=null&&!isNaN(v));
    if(!allV.length)return null;
    const rawMn=Math.min(...allV),rawMx=Math.max(...allV);const mn=rawMn>=0?rawMn*0.85:rawMn*1.15;const mx=rawMx>=0?rawMx*1.1:rawMx*0.85;const rg=mx-mn||1;
    const P=35;
    const toX=i=>P+i/(data.length-1)*(W-P);
    const toY=v=>H-((v-mn)/rg)*H;
    const gridN=4,gridVals=Array.from({length:gridN+1},(_,i)=>mn+rg*i/gridN);
    return <svg viewBox={`0 0 ${W} ${H+20}`} style={{width:"100%",height:"auto"}}>
      {gridVals.map((v,i)=><g key={i}><line x1={P} y1={toY(v)} x2={W} y2={toY(v)} stroke="rgba(255,255,255,.06)" strokeWidth=".5"/><text x={P-3} y={toY(v)+3} fill="rgba(255,255,255,.25)" fontSize="7" textAnchor="end" fontFamily="var(--fm)">{Math.abs(v)>=100?Math.round(v):_sf(v,1)}</text></g>)}
      {keys.map((k,ki)=>{const pts=data.map((d,i)=>[toX(i),toY(d[k]||0)]);const line=pts.map(p=>p.join(",")).join(" ");return <g key={k}>{area&&<polygon points={`${P},${H} ${line} ${toX(data.length-1)},${H}`} fill={colors[ki]} opacity=".08"/>}<polyline points={line} fill="none" stroke={colors[ki]} strokeWidth="2" strokeLinejoin="round"/>{dots&&pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={colors[ki]} stroke="var(--bg)" strokeWidth="1"/>)}</g>;})}
      {data.map((d,i)=><text key={i} x={toX(i)} y={H+14} fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="var(--fm)" textAnchor="middle">{d.year?.slice(2)}</text>)}
      {labels&&<g>{labels.map((l,i)=><g key={i}><line x1={P+i*100} y1={4} x2={P+i*100+12} y2={4} stroke={colors[i]} strokeWidth="2"/><text x={P+i*100+16} y={7} fill="rgba(255,255,255,.5)" fontSize="7" fontFamily="var(--fm)">{l}</text></g>)}</g>}
    </svg>;
  };

  // SVG bar chart
  const SvgBars = ({data,keys,colors,labels,W=500,H=140,stacked=false}) => {
    if(!data||data.length<2)return null;
    const P=35;const bW=(W-P)/data.length*0.7;
    let allV;
    if(stacked){allV=data.map(d=>keys.reduce((s,k)=>s+Math.abs(d[k]||0),0));} else {allV=keys.flatMap(k=>data.map(d=>d[k]||0));}
    const mn=Math.min(0,...allV),mx=Math.max(...allV),rg=mx-mn||1;
    const toY=v=>H-((v-mn)/rg)*H;
    const zY=toY(0);
    return <svg viewBox={`0 0 ${W} ${H+20}`} style={{width:"100%",height:"auto"}}>
      <line x1={P} y1={zY} x2={W} y2={zY} stroke="rgba(255,255,255,.1)" strokeWidth=".5"/>
      {data.map((d,i)=>{const x=P+i*(W-P)/data.length+bW*0.15; if(stacked){let cum=0;return <g key={i}>{keys.map((k,ki)=>{const v=Math.abs(d[k]||0);const h=v/rg*H;const yy=zY-cum-h;cum+=h;return <rect key={k} x={x} y={yy} width={bW} height={Math.max(h,0.5)} fill={colors[ki]} opacity=".7" rx="1"/>;})}<text x={x+bW/2} y={H+14} fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="var(--fm)" textAnchor="middle">{d.year?.slice(2)}</text></g>;} const nk=keys.length;const sw=bW/nk;return <g key={i}>{keys.map((k,ki)=>{const v=d[k]||0;const h=Math.abs(v)/rg*H;const yy=v>=0?zY-h:zY;return <rect key={k} x={x+ki*sw} y={yy} width={sw-1} height={Math.max(h,0.5)} fill={colors[ki]} opacity=".7" rx="1"/>;})}<text x={x+bW/2} y={H+14} fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="var(--fm)" textAnchor="middle">{d.year?.slice(2)}</text></g>;})}
      {labels&&<g>{labels.map((l,i)=><g key={i}><rect x={P+i*80} y={2} width={8} height={8} rx={1} fill={colors[i]} opacity=".7"/><text x={P+i*80+12} y={9} fill="rgba(255,255,255,.5)" fontSize="7" fontFamily="var(--fm)">{l}</text></g>)}</g>}
    </svg>;
  };

  // Combined bar+line chart
  const SvgCombo = ({data,barKeys,barColors,barLabels,lineKeys,lineColors,lineLabels,W=500,H=160}) => {
    if(!data||data.length<2)return null;
    const P=35;const bW=(W-P)/data.length*0.65;
    const barVals=data.map(d=>barKeys.reduce((s,k)=>s+Math.abs(d[k]||0),0));
    const lineVals=lineKeys.flatMap(k=>data.map(d=>d[k]||0));
    const allV=[...barVals,...lineVals];
    const mn=Math.min(0,...allV),mx=Math.max(...allV),rg=mx-mn||1;
    const toX=i=>P+i*(W-P)/data.length;const toY=v=>H-((v-mn)/rg)*H;const zY=toY(0);
    return <svg viewBox={`0 0 ${W} ${H+20}`} style={{width:"100%",height:"auto"}}>
      <line x1={P} y1={zY} x2={W} y2={zY} stroke="rgba(255,255,255,.1)" strokeWidth=".5"/>
      {data.map((d,i)=>{const x=toX(i)+bW*0.1;let cum=0;return <g key={i}>{barKeys.map((k,ki)=>{const v=Math.abs(d[k]||0);const h=v/rg*H;const yy=zY-cum-h;cum+=h;return <rect key={k} x={x} y={yy} width={bW} height={Math.max(h,0.5)} fill={barColors[ki]} opacity=".6" rx="1"/>;})}<text x={x+bW/2} y={H+14} fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="var(--fm)" textAnchor="middle">{d.year?.slice(2)}</text></g>;})}
      {lineKeys.map((k,ki)=>{const pts=data.map((d,i)=>`${toX(i)+bW/2},${toY(d[k]||0)}`).join(" ");return <polyline key={k} points={pts} fill="none" stroke={lineColors[ki]} strokeWidth="2" strokeLinejoin="round"/>;})}
      {[...barLabels,...lineLabels].map((l,i)=><g key={i}>{i<barLabels.length?<rect x={P+i*85} y={2} width={8} height={8} rx={1} fill={barColors[i]} opacity=".7"/>:<line x1={P+i*85} y1={6} x2={P+i*85+12} y2={6} stroke={lineColors[i-barLabels.length]} strokeWidth="2"/>}<text x={P+i*85+(i<barLabels.length?12:16)} y={9} fill="rgba(255,255,255,.5)" fontSize="7" fontFamily="var(--fm)">{l}</text></g>)}
    </svg>;
  };

  const ScorePill = ({label,value}) => <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
    <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{label}</span>
    <span style={{fontSize:13,fontWeight:800,color:sc(value),fontFamily:"var(--fm)"}}>{value!=null?value:"—"}</span>
  </div>;

  const DataTable = ({rows,years:yrs}) => <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
    <thead><tr><th style={{...thS,textAlign:"left",minWidth:130}}>({sym}M)</th>{yrs.map(yr=><th key={yr.year} style={thS}>{yr.year}</th>)}</tr></thead>
    <tbody>{rows.map(r=><tr key={r.k}><td style={tdL}>{r.l}</td>{yrs.map(yr=>{const v=yr[r.k];const prev=yrs[yrs.indexOf(yr)-1];const chg=r.chg&&prev?pctChg(v,prev[r.k]):null;return <td key={yr.year} style={{...tdS,color:v>0?"var(--text-primary)":v<0?"#f87171":"var(--text-tertiary)",fontWeight:r.bold?700:400}}>{v!=null?(r.pct?v+"%":r.dec?_sf(v,2):fM(v)):"—"}{chg!=null&&<div style={{fontSize:7,color:chg>0?"#34d399":"#f87171"}}>{chg>0?"+":""}{_sf(chg,1)}%</div>}</td>})}</tr>)}</tbody>
  </table></div>;

  const chartCard = {background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16,overflow:"hidden"};

  return <div>
    {/* 1. HEADER */}
    <div style={{textAlign:"center",marginBottom:20,paddingBottom:16,borderBottom:"2px solid #8B4513"}}>
      <div style={{fontSize:11,color:"#8B4513",letterSpacing:3,fontFamily:"var(--fm)",marginBottom:6,fontWeight:700}}>INFORME DIVIDEND ST</div>
      <div style={{fontSize:30,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>{d.name}</div>
      <div style={{fontSize:12,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>Ticker: <strong>{d.symbol}</strong> · {d.sector} · {d.currency} · Último ejercicio: <strong>{lat.year}</strong> · Fecha informe: {d.updated?.slice(0,10)}</div>
    </div>

    {/* 2. Nº ACCIONES + COTIZACIÓN */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
      <div style={chartCard}><div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8,textAlign:"center"}}>Nº DE ACCIONES</div>
        <SvgLine data={y} keys={["shares"]} colors={["#c9972e"]} W={400} H={130} area/></div>
      <div style={chartCard}><div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8,textAlign:"center"}}>COTIZACIÓN</div>
        <SvgLine data={y} keys={["price"]} colors={["#c9972e"]} W={400} H={130} area/></div>
    </div>

    {/* 3. Tabla acciones + cotización */}
    <div style={{...chartCard,marginBottom:16}}>
      <DataTable years={y} rows={[{k:"shares",l:"Nº Acciones (M)",bold:1,chg:1},{k:"price",l:`Cotización (${sym})`,dec:1,bold:1}]}/>
    </div>

    {/* 4. RECOMPRAS */}
    <div style={{...chartCard,marginBottom:16,padding:16}}>
      <div style={hd}>Recompras - Puntuación</div>
      <ScorePill label="Recompras" value={d.scoring.dividendo.recompras}/>
    </div>

    {/* 5. DEUDA + COMPOSICIÓN */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
      <div style={chartCard}><div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8,textAlign:"center"}}>DEUDA</div>
        <SvgLine data={y} keys={["netDebt","ebitda"]} colors={["#c9972e","#8B6914"]} labels={["Deuda Neta","EBITDA"]} W={400} H={140}/>
        <div style={{marginTop:8}}><SvgLine data={y} keys={["debtEbitda"]} colors={["#5b9bd5"]} labels={["D.Neta/EBITDA"]} W={400} H={80}/></div>
      </div>
      <div style={chartCard}><div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8,textAlign:"center"}}>COMPOSICIÓN</div>
        <SvgBars data={y} keys={["goodwill","intangibles","cash","currentAssets"]} colors={["#2d2d2d","#3d5a3d","#a0a0a0","#6b8e6b"]} labels={["Goodwill","Intangibles","Caja","Act.Corriente"]} stacked H={140} W={400}/>
      </div>
    </div>

    {/* 6. BALANCE */}
    <div style={{...chartCard,marginBottom:16}}>
      <div style={hd}>Balance ({sym}M)</div>
      <DataTable years={y} rows={[{k:"currentAssets",l:"Activo Corriente",bold:1},{k:"cash",l:"Tesorería"},{k:"inventory",l:"Inventarios"},{k:"goodwill",l:"Goodwill"},{k:"intangibles",l:"Intangibles"},{k:"totalAssets",l:"ACTIVO NO CORRIENTE",bold:1},{k:"currentLiab",l:"Pasivo Corriente",bold:1},{k:"ltDebt",l:"Deuda LP"},{k:"totalLiab",l:"TOTAL PASIVO",bold:1},{k:"totalEquity",l:"PATRIMONIO NETO",bold:1},{k:"autonomy",l:"Autonomía Financiera %",pct:1},{k:"currentRatio",l:"Ratio de Liquidez",dec:1},{k:"cashRatio",l:"Cash Ratio",dec:1},{k:"netDebt",l:"Deuda Neta"},{k:"debtEbitda",l:"DEUDA NETA/EBITDA",dec:1,bold:1}]}/>
    </div>

    {/* 7. BALANCE PUNTUACIÓN */}
    <div style={{...chartCard,marginBottom:16,padding:16}}>
      <div style={{...hd,color:"#c9972e"}}>Balance - Puntuación</div>
      <ScorePill label="Intangibles" value={d.scoring.solidez.intangibles}/>
      <ScorePill label="Deuda Neta" value={d.scoring.solidez.deudaNeta}/>
      <ScorePill label="Liquidez" value={d.scoring.solidez.liquidez}/>
      <ScorePill label="Reservas" value={d.scoring.solidez.reservas}/>
      <ScorePill label="Autonomía Financiera" value={d.scoring.solidez.autonomia}/>
    </div>

    {/* 8. CUENTA DE RESULTADOS */}
    <div style={{...chartCard,marginBottom:16}}>
      <div style={hd}>Cuenta de Resultados ({sym}M)</div>
      <DataTable years={y} rows={[{k:"revenue",l:"Ventas",bold:1,chg:1},{k:"ebitda",l:"EBITDA",bold:1},{k:"ebit",l:"EBIT"},{k:"netIncome",l:"Beneficio Neto",bold:1},{k:"marginOp",l:"Margen Operativo",pct:1},{k:"marginNet",l:"Margen Neto",pct:1},{k:"roa",l:"ROA",pct:1},{k:"roe",l:"ROE",pct:1},{k:"roce",l:"ROCE",pct:1}]}/>
    </div>

    {/* 9. GRÁFICOS RENTABILIDAD */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
      <div style={chartCard}><div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8,textAlign:"center"}}>VENTAS & MARGEN NETO</div>
        <SvgCombo data={y} barKeys={["revenue"]} barColors={["#8B6914"]} barLabels={["Ventas"]} lineKeys={["netIncome"]} lineColors={["#c9972e"]} lineLabels={["Beneficio Neto"]} H={150}/>
      </div>
      <div style={chartCard}><div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8,textAlign:"center"}}>BPA & DPA & PAYOUT</div>
        <SvgCombo data={y} barKeys={["eps"]} barColors={["#6b8e6b"]} barLabels={["BPA"]} lineKeys={["dps"]} lineColors={["#c9972e"]} lineLabels={["DPA"]} H={150}/>
      </div>
    </div>

    {/* 10. RENTABILIDAD PUNTUACIÓN */}
    <div style={{...chartCard,marginBottom:16,padding:16}}>
      <div style={{...hd,color:"#c9972e"}}>Rentabilidad - Puntuación</div>
      <ScorePill label="Ventas" value={d.scoring.rentabilidad.ventas}/>
      <ScorePill label="Margen Neto" value={d.scoring.rentabilidad.margenNeto}/>
      <ScorePill label="ROE/ROCE/ROA" value={d.scoring.rentabilidad.ratios}/>
    </div>

    {/* 11. DIVIDENDO */}
    <div style={{...chartCard,marginBottom:16}}>
      <div style={hd}>Dividendo</div>
      <DataTable years={y} rows={[{k:"eps",l:"Beneficio por Acción (BPA)",dec:1,bold:1,chg:1},{k:"dps",l:"Dividendo por Acción (DPA)",dec:1,bold:1,chg:1},{k:"payout",l:"Payout",pct:1},{k:"rpd",l:"Rentabilidad por Dividendo (RPD)",pct:1}]}/>
    </div>

    {/* 12. DIVIDENDO PUNTUACIÓN */}
    <div style={{...chartCard,marginBottom:16,padding:16}}>
      <div style={{...hd,color:"#c9972e"}}>Dividendo - Puntuación</div>
      <ScorePill label="Dividendo" value={d.scoring.dividendo.dividendo}/>
      <ScorePill label="Crecimiento" value={d.scoring.dividendo.crecimiento}/>
      <ScorePill label="Payout" value={d.scoring.dividendo.payout}/>
      <ScorePill label="Recompras" value={d.scoring.dividendo.recompras}/>
      <ScorePill label="Cash Flow" value={d.scoring.dividendo.cashFlow}/>
    </div>

    {/* 13. FLUJOS DE CAJA */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
      <div style={chartCard}><div style={{fontSize:10,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:6,textAlign:"center"}}>FCF vs OCF vs CAPEX</div>
        <SvgCombo data={y} barKeys={["fcf"]} barColors={["#6b8e6b"]} barLabels={["FCF"]} lineKeys={["ocf","capex"]} lineColors={["#5b9bd5","#c9972e"]} lineLabels={["OCF","CAPEX"]} W={350} H={120}/></div>
      <div style={chartCard}><div style={{fontSize:10,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:6,textAlign:"center"}}>FCF vs DIVIDENDOS</div>
        <SvgCombo data={y} barKeys={["fcf"]} barColors={["#6b8e6b"]} barLabels={["FCF"]} lineKeys={["divPaid"]} lineColors={["#c9972e"]} lineLabels={["Dividendos"]} W={350} H={120}/></div>
      <div style={chartCard}><div style={{fontSize:10,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:6,textAlign:"center"}}>RECOMPRAS & SBC</div>
        <SvgBars data={y} keys={["buybacks","sbc"]} colors={["#8B6914","#3d3d3d"]} labels={["Recompras","SBC"]} W={350} H={120}/></div>
    </div>

    {/* 14. FLUJOS DE CAJA tabla */}
    <div style={{...chartCard,marginBottom:16}}>
      <div style={hd}>Estado de Flujos de Caja ({sym}M)</div>
      <DataTable years={y} rows={[{k:"ocf",l:"Cash Flow Operativo (OCF)",bold:1},{k:"capex",l:"CAPEX"},{k:"fcf",l:"Free Cash Flow (FCF)",bold:1},{k:"sbc",l:"Share-Based Compensation (SBC)"},{k:"buybacks",l:"Recompras de Acciones"},{k:"divPaid",l:"Dividendos (DIV)"},{k:"da",l:"Depreciaciones / Amortizaciones"}]}/>
    </div>

    {/* 15. FCF + DEUDA NETA vs DIVIDENDOS */}
    <div style={{...chartCard,marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:10,textAlign:"center"}}>Free Cash Flow & Deuda Neta vs. Dividendos & Recompras & SBC</div>
      <SvgCombo data={y} barKeys={["divPaid","buybacks","sbc"]} barColors={["#8B4513","#8B6914","#3d3d3d"]} barLabels={["Dividendos","Recompras","SBC"]} lineKeys={["fcf","netDebt"]} lineColors={["#6b8e6b","#c9972e"]} lineLabels={["FCF","Deuda Neta"]} W={700} H={200}/>
    </div>

    {/* 16. CASH FLOW PUNTUACIÓN */}
    <div style={{...chartCard,marginBottom:16,padding:16}}>
      <div style={{...hd,color:"#c9972e"}}>Cash Flow - Puntuación</div>
      <ScorePill label="Cash Flow" value={d.scoring.dividendo.cashFlow}/>
    </div>

    {/* 17. VALORACIÓN gráficos */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
      <div style={chartCard}><div style={{fontSize:11,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:6,textAlign:"center"}}>PRECIO</div>
        <SvgLine data={y} keys={["price"]} colors={["#6b8e6b"]} labels={["Precio"]} W={350} H={120}/></div>
      <div style={chartCard}><div style={{fontSize:11,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:6,textAlign:"center"}}>PER</div>
        <SvgLine data={y} keys={["pe"]} colors={["#c9972e"]} labels={["PER"]} W={350} H={120}/></div>
      <div style={chartCard}><div style={{fontSize:11,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:6,textAlign:"center"}}>EV/EBITDA</div>
        <SvgLine data={y} keys={["evEbitda"]} colors={["#6b8e6b"]} labels={["EV/EBITDA"]} W={350} H={120}/></div>
    </div>

    {/* 18. VALORACIÓN tabla */}
    <div style={{...chartCard,marginBottom:16}}>
      <div style={hd}>Análisis - Valoración</div>
      <DataTable years={y} rows={[{k:"pe",l:"PER (Fin de Año Fiscal)",dec:1},{k:"evEbitda",l:"EV/EBITDA (Fin de Año Fiscal)",dec:1},{k:"price",l:`Precio (${sym})`,dec:1,bold:1}]}/>
    </div>

    {/* 19. VALORACIÓN POR MÚLTIPLOS */}
    <div style={{...chartCard,marginBottom:16,padding:20}}>
      <div style={hd}>Valoración por Múltiplos</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div>
          {[{l:"Por PER Med. Last 5Y",v:d.valuation.fairByPerMed},{l:"Por PER Min. Last 5Y",v:d.valuation.fairByPerMin}].map((r,i)=>
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
              <span style={{fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{r.l}</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{r.v?`${sym}${_sf(r.v,2)}`:"—"}</span>
            </div>)}
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#c9972e",fontFamily:"var(--fd)",marginBottom:10}}>Precios por Descuento de Flujos de Caja</div>
          {[{l:"DCF Fair Value",v:d.valuation.dcf?Math.round(d.valuation.dcf*10)/10:null},{l:"Precio Objetivo",v:d.valuation.targetConsensus},{l:"Margen de Seguridad 15%",v:d.valuation.fairByPerMed?Math.round(d.valuation.fairByPerMed*0.85*10)/10:null},{l:"Margen de Seguridad 30%",v:d.valuation.fairByPerMed?Math.round(d.valuation.fairByPerMed*0.7*10)/10:null}].map((r,i)=>
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
              <span style={{fontSize:11,color:i>=2?"#c9972e":"var(--text-secondary)",fontFamily:"var(--fm)",fontWeight:i>=2?600:400}}>{r.l}</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{r.v?`${sym}${_sf(r.v,2)}`:"—"}</span>
            </div>)}
        </div>
      </div>
    </div>

    {/* 20. PRICE RANGE */}
    <div style={{...chartCard,marginBottom:16,padding:20}}>
      <div style={hd}>Price Range</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div style={{padding:16,background:"rgba(201,151,46,.06)",borderRadius:12,borderLeft:"4px solid #c9972e"}}>
          <div style={{fontSize:10,color:"#c9972e",fontFamily:"var(--fm)",fontWeight:600}}>1º PRECIO OBJETIVO</div>
          <div style={{fontSize:28,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{d.valuation.targetHigh?`${sym}${d.valuation.targetHigh}`:"—"}</div>
        </div>
        <div style={{padding:16,background:"rgba(201,151,46,.04)",borderRadius:12,borderLeft:"4px solid #8B6914"}}>
          <div style={{fontSize:10,color:"#8B6914",fontFamily:"var(--fm)",fontWeight:600}}>2º PRECIO OBJETIVO</div>
          <div style={{fontSize:28,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:4}}>{d.valuation.targetLow?`${sym}${d.valuation.targetLow}`:"—"}</div>
        </div>
      </div>
    </div>

    {/* 21. PUNTUACIÓN TOTAL */}
    <div style={{...chartCard,marginBottom:16,padding:20}}>
      <div style={hd}>Puntuación Total</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}}>
        {[{t:"SOLIDEZ",items:d.scoring.solidez,labels:{intangibles:"Intangibles",deudaNeta:"Deuda Neta",liquidez:"Liquidez",reservas:"Reservas",autonomia:"Autonomía Fin."}},
          {t:"RENTABILIDAD",items:d.scoring.rentabilidad,labels:{ventas:"Ventas",margenNeto:"Margen Neto",ratios:"ROE/ROCE/ROA"}},
          {t:"DIVIDENDO",items:d.scoring.dividendo,labels:{dividendo:"Dividendo",crecimiento:"Crecimiento",payout:"Payout",recompras:"Recompras",cashFlow:"Cash Flow"}}
        ].map(s=><div key={s.t}><div style={{fontSize:12,fontWeight:700,color:"#c9972e",fontFamily:"var(--fm)",marginBottom:10,letterSpacing:1,borderBottom:"2px solid #c9972e",paddingBottom:4}}>{s.t}</div>
          {Object.entries(s.items).map(([k,v])=><ScorePill key={k} label={s.labels[k]||k} value={v}/>)}
        </div>)}
      </div>
      <div style={{textAlign:"center",marginTop:20,padding:"14px 0",borderTop:"2px solid #8B4513"}}>
        <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:2}}>DIVIDEND ST — PUNTUACIÓN FINAL</div>
        <div style={{fontSize:48,fontWeight:800,color:sc(d.finalScore),fontFamily:"var(--fm)",marginTop:4}}>{_sf(d.finalScore,2)}</div>
      </div>
    </div>

    {/* 22. ESTIMACIONES */}
    {d.estimates?.length > 0 && <div style={{...chartCard,marginBottom:16,padding:20}}>
      <div style={hd}>Próximos Resultados / Estimaciones</div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {d.estimates.map((e,i)=><div key={i} style={{flex:"1 1 140px",padding:14,background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:6}}>{e.year}</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)"}}>BPA Estimado ({sym})</div>
          <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{_sf(e.epsEst,2)}</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:4}}>Ventas Estimadas ({sym} Mill.)</div>
          <div style={{fontSize:14,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{fM(e.revEst)}</div>
        </div>)}
      </div>
    </div>}

    <div style={{fontSize:9,color:"var(--text-tertiary)",textAlign:"center",padding:20,fontFamily:"var(--fm)",borderTop:"1px solid rgba(255,255,255,.06)"}}>Datos: Financial Modeling Prep · Actualizado: {d.updated?.slice(0,10)} · No constituye asesoramiento financiero</div>
  </div>;
}

export default DSTTab;
