import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

export default function FireTab() {
  const {
    divLog, fxRates,
    fireCcy, setFireCcy, fireGastosYear, setFireGastosYear,
    gastosLog,
    CTRL_DATA, INCOME_DATA, GASTOS_MONTH,
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

// === DIVIDENDOS (USD from IB) ===
const all = divLog.filter(d => d.date && d.gross);
const divByMonth = {};
all.forEach(d => { const m=d.date.slice(0,7); if(!divByMonth[m])divByMonth[m]={g:0,n:0}; divByMonth[m].g+=d.gross||0; divByMonth[m].n+=d.net||0; });
const last12d = Object.keys(divByMonth).sort().slice(-12);
const divNet12mUSD = last12d.reduce((s,m) => s+(divByMonth[m]?.n||0), 0);
const divNetMUSD = divNet12mUSD / 12;
const divNetM = isUSD ? divNetMUSD : divNetMUSD / fxEurUsd;
const divNetA = divNetM * 12;

// === PATRIMONIO ===
const latestCtrl = CTRL_DATA.filter(c => c.pu>0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).slice(-1)[0] || {};
const pat = isUSD ? (latestCtrl.pu||0) : (latestCtrl.pe||0);

// === SUELDO ===
const sueldos = INCOME_DATA.filter(d => d.sl>0).map(d => d.sl);
const sueldoMUSD = sueldos.length>0 ? sueldos.reduce((s,v)=>s+v,0)/sueldos.length : 0;
const sueldoM = isUSD ? sueldoMUSD : sueldoMUSD / fxEurUsd;

// === FIRE METRICS ===
const divCoversPct = gastosAvg>0 ? (divNetM/gastosAvg*100) : 0;
const espCoversPct = espRealistaM>0 ? (divNetM/espRealistaM*100) : 0;
const espBasePct = espBaseM>0 ? (divNetM/espBaseM*100) : 0;
const fireRet = pat>0 ? (gastosAnnual/pat*100) : 0;
const gapM = divNetM - gastosAvg;
const savingsM = divNetM + sueldoM - gastosAvg;
const savingsRate = (divNetM+sueldoM)>0 ? (savingsM/(divNetM+sueldoM)*100) : 0;
const swr35 = gastosAnnual / 0.035;
const yearsToFire = (()=>{ if(!pat||!savingsM||!gastosAnnual||isNaN(pat)||isNaN(swr35)) return 99; if(pat>=swr35) return 0; let p=pat; for(let y=1;y<=50;y++){p=p*1.07+savingsM*12;if(p*0.035>=gastosAnnual)return y;} return 99; })();

// Div by year
const divByYear={}; all.forEach(d=>{const y=d.date.slice(0,4);if(!divByYear[y])divByYear[y]={g:0,n:0};divByYear[y].g+=d.gross||0;divByYear[y].n+=d.net||0;});
const divYK=Object.keys(divByYear).sort();

const retCol = v => v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
const fK = v => Math.abs(v)>=1000?`${_sf(v/1000,1)}K`:_sf(Math.abs(v),0);

return (
<div style={{display:"flex",flexDirection:"column",gap:14}}>
  {/* Toggle */}
  <div style={{display:"flex",justifyContent:"flex-end"}}>
    <div style={{display:"flex",borderRadius:8,border:"1px solid var(--border)",overflow:"hidden"}}>
      {["EUR","USD"].map(c=><button key={c} onClick={()=>setFireCcy(c)} style={{padding:"6px 16px",border:"none",background:fireCcy===c?"var(--gold-dim)":"transparent",color:fireCcy===c?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:fireCcy===c?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>{c==="EUR"?"€ EUR":"$ USD"}</button>)}
    </div>
  </div>

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
        <div style={{padding:"8px 14px",background:"rgba(255,255,255,.03)",borderRadius:8,display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL {selYear}</span>
          <span style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{yearTotal.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
        </div>
        <div style={{padding:"8px 14px",background:"rgba(255,255,255,.03)",borderRadius:8,display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MEDIA/MES</span>
          <span style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{yearAvg.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
        </div>
        <div style={{padding:"8px 14px",background:"rgba(255,255,255,.03)",borderRadius:8,display:"flex",gap:8,alignItems:"center"}}>
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
          return <div key={m} style={{padding:"10px 12px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{mNames[mi]}</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{total.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
            </div>
            <div style={{height:4,background:"rgba(255,255,255,.06)",borderRadius:2,marginBottom:6,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:"var(--gold)",borderRadius:2,opacity:.5}}/></div>
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
      <div style={{padding:"12px",background:"rgba(255,255,255,.02)",borderRadius:10,textAlign:"center",border:"1px solid rgba(255,255,255,.04)"}}>
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
    <div style={{padding:"10px 14px",background:"rgba(255,255,255,.03)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TOTAL</span>
      <span style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
      <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{sym}{gastosAnnual.toLocaleString(undefined,{maximumFractionDigits:0})}/año</span>
    </div>
  </div>

  {/* BANNER — 3 escenarios cobertura dividendos */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
    <div style={{padding:"20px",background:"rgba(255,159,10,.04)",border:"1px solid rgba(255,159,10,.15)",borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>VIDA ACTUAL (CHINA + ESPAÑA)</div>
      <div style={{fontSize:42,fontWeight:700,color:divCoversPct>=100?"var(--green)":"var(--orange)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(divCoversPct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"rgba(255,255,255,.06)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(divCoversPct,100)}%`,height:"100%",background:divCoversPct>=100?"var(--green)":"var(--orange)",borderRadius:3}}/></div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{sym}{gastosAvg.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
    </div>
    <div style={{padding:"20px",background:"rgba(48,209,88,.04)",border:"1px solid rgba(48,209,88,.15)",borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>🇪🇸 VIDA EN ESPAÑA (REALISTA)</div>
      <div style={{fontSize:42,fontWeight:700,color:espCoversPct>=100?"var(--green)":"#d69e2e",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(espCoversPct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"rgba(255,255,255,.06)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(espCoversPct,100)}%`,height:"100%",background:espCoversPct>=100?"var(--green)":"#d69e2e",borderRadius:3}}/></div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:6}}>{sym}{espRealistaM.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</div>
    </div>
    <div style={{padding:"20px",background:"rgba(100,210,255,.04)",border:"1px solid rgba(100,210,255,.12)",borderRadius:16,textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1,marginBottom:6}}>🇪🇸 GASTOS FIJOS ESPAÑA</div>
      <div style={{fontSize:42,fontWeight:700,color:espBasePct>=100?"var(--green)":"var(--text-secondary)",fontFamily:"var(--fm)",lineHeight:1}}>{_sf(espBasePct,0)}%</div>
      <div style={{maxWidth:200,margin:"10px auto 0",height:6,background:"rgba(255,255,255,.06)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min(espBasePct,100)}%`,height:"100%",background:espBasePct>=100?"var(--green)":"var(--text-secondary)",borderRadius:3}}/></div>
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

  {/* METRICS */}
  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    {[
      {l:"PATRIMONIO",v:`${sym}${fDol(pat)}`,c:"var(--text-primary)"},
      {l:"RENT. NECESARIA",v:`${_sf(fireRet,1)}%`,sub:"sobre patrimonio",c:fireRet<4?"var(--green)":fireRet<7?"var(--gold)":"var(--red)"},
      {l:"AÑOS PARA FIRE",v:yearsToFire===0?"✓ YA":yearsToFire>=50?"50+":String(yearsToFire),sub:"@3.5% + 7% return",c:yearsToFire===0?"var(--green)":yearsToFire<5?"var(--gold)":"var(--orange)"},
      {l:"TASA DE AHORRO",v:`${_sf(savingsRate,0)}%`,sub:`${savingsM>=0?"+":""}${sym}${fK(savingsM)}/mes`,c:savingsRate>30?"var(--green)":savingsRate>15?"var(--gold)":"var(--red)"},
    ].map((k,i)=>(<div key={i} style={{flex:"1 1 130px",padding:"12px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600,marginBottom:4}}>{k.l}</div><div style={{fontSize:20,fontWeight:700,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div>{k.sub&&<div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{k.sub}</div>}</div>))}
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
        return (<tr key={m} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}>
          <td style={{padding:"5px 8px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{mn} {m.slice(2,4)}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(g.eur||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>¥{(g.cny||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:g.usd>0?"var(--text-primary)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{g.usd>0?`$${_sf(g.usd,0)}`:"-"}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{total.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{divN.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
          <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:pct>=100?"var(--green)":pct>=50?"var(--gold)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(pct,0)}%</td>
        </tr>);
      })}
    </tbody></table></div>
  </div>

  {/* FREEDOM NUMBERS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>🎯 Freedom Numbers ({fireCcy})</div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {[{l:"@3%",fn:gastosAnnual/0.03},{l:"@3.5%",fn:swr35},{l:"@4%",fn:gastosAnnual/0.04},{l:"ESPAÑA @3.5%",fn:espRealistaA/0.035,sub:"solo EUR"},{l:"LEAN @3.5%",fn:gastosAnnual*0.7/0.035,sub:"70%"}].map((f,i)=>{const pct=f.fn>0?(pat/f.fn*100):0;const dP=f.fn>0?(divNetA/(f.fn*0.035)*100):0;return(<div key={i} style={{flex:"1 1 110px",padding:"12px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}><div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:600,marginBottom:4}}>{f.l}{f.sub?` (${f.sub})`:""}</div><div style={{fontSize:16,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{sym}{fK(f.fn)}</div><div style={{height:5,background:"rgba(255,255,255,.06)",borderRadius:3,marginTop:6,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:pct>=100?"var(--green)":"var(--gold)",borderRadius:3}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:9,fontWeight:600,color:pct>=100?"var(--green)":"var(--gold)",fontFamily:"var(--fm)"}}>{_sf(pct,0)}%</span><span style={{fontSize:9,color:dP>=100?"var(--green)":"var(--text-tertiary)",fontFamily:"var(--fm)"}}>div {_sf(dP,0)}%</span></div></div>);})}
    </div>
  </div>

  {/* DIV TRAJECTORY */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📈 Dividendos Netos por Año</div>
    <div style={{display:"flex",alignItems:"flex-end",gap:8,height:130}}>
      {divYK.map((y,i)=>{const d=divByYear[y];const nV=isUSD?d.n:d.n/fxEurUsd;const mx=Math.max(...divYK.map(k=>isUSD?divByYear[k].n:divByYear[k].n/fxEurUsd),1);const h=nV/mx*100;const prev=i>0?(isUSD?divByYear[divYK[i-1]].n:divByYear[divYK[i-1]].n/fxEurUsd):0;const gr=prev>0?((nV-prev)/prev*100):null;return(<div key={y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>{gr!=null&&<div style={{fontSize:7,fontWeight:600,color:retCol(gr),fontFamily:"var(--fm)",marginBottom:2}}>{gr>=0?"+":""}{_sf(gr,0)}%</div>}<div style={{fontSize:8,fontWeight:600,color:"var(--green)",fontFamily:"var(--fm)",marginBottom:2}}>{sym}{fK(nV)}</div><div style={{width:"100%",maxWidth:32,height:`${Math.max(h,4)}%`,background:"var(--green)",borderRadius:"3px 3px 0 0",opacity:.6}}/><div style={{fontSize:9,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:3}}>{y}</div></div>);})}
    </div>
  </div>

  {/* SCENARIOS */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
    <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:10}}>🧪 Escenarios</div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:450}}><thead><tr>{["","GASTOS","FREEDOM","PAT","DIV","GAP"].map((h,i)=><th key={i} style={{padding:"5px 8px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:8,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
      {[{l:"🌏 Actual",g:gastosAnnual},{l:"🇪🇸 España",g:espRealistaA},{l:"🔻 Lean (70%)",g:gastosAnnual*0.7},{l:"🔻🔻 Ultra (50%)",g:gastosAnnual*0.5},{l:"🔺 Fat (+30%)",g:gastosAnnual*1.3}].map((s,i)=>{const fn=s.g/0.035;const pp=fn>0?(pat/fn*100):0;const dp=s.g>0?(divNetA/s.g*100):0;const gap=divNetA-s.g;return(<tr key={i} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}><td style={{padding:"5px 8px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{s.l}</td><td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{fK(s.g)}</td><td style={{padding:"5px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{sym}{fK(fn)}</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:pp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(pp,0)}%</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:dp>=100?"var(--green)":"var(--orange)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(dp,0)}%</td><td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:gap>=0?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{gap>=0?"+":""}{sym}{fK(gap)}</td></tr>);})}
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
</div>
);
}
