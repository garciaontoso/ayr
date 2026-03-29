import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

export default function DividendosTab() {
  const {
    divLog, divLoading, divShowForm, setDivShowForm,
    divForm, setDivForm, divFilter, setDivFilter,
    divSort, setDivSort, divCalYear, setDivCalYear,
    addDivEntry, deleteDivEntry,
    POS_STATIC,
    DIV_BY_YEAR, DIV_BY_MONTH,
  } = useHome();

  return (
<div style={{display:"flex",flexDirection:"column",gap:12}}>
  {(() => {
    if (divLoading) return <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>⏳ Cargando dividendos...</div>;
    if (divLog.length === 0) return <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}><div style={{fontSize:36,marginBottom:12}}>💰</div>Sin datos de dividendos. Espera un momento o importa tu historial.</div>;
    const filtered = divLog.filter(d => {
      if (divFilter.year !== "all" && !d.date?.startsWith(divFilter.year)) return false;
      if (divFilter.month && divFilter.month !== "all" && !d.date?.startsWith(divFilter.month)) return false;
      if (divFilter.ticker && !d.ticker?.toUpperCase().includes(divFilter.ticker.toUpperCase())) return false;
      return true;
    });
    const totalGross = filtered.reduce((s,d) => s+(d.gross||0), 0);
    const totalNet = filtered.reduce((s,d) => s+(d.net||0), 0);
    const totalTax = totalGross - totalNet;
    const taxRate = totalGross > 0 ? (totalTax / totalGross * 100) : 0;
    const uniqueTickers = new Set(filtered.map(d=>d.ticker)).size;
    const all = divLog.filter(d => d.date && d.gross);
    const byYear = {}; all.forEach(d => { const y=d.date.slice(0,4); if(!byYear[y])byYear[y]={g:0,n:0,c:0}; byYear[y].g+=d.gross||0; byYear[y].n+=d.net||0; byYear[y].c++; });
    const yearKeys = Object.keys(byYear).sort();
    const maxYearG = Math.max(...yearKeys.map(y=>byYear[y].g),1);
    const byMonth = {}; all.forEach(d => { const m=d.date.slice(0,7); if(!byMonth[m])byMonth[m]={g:0,n:0,c:0}; byMonth[m].g+=d.gross||0; byMonth[m].n+=d.net||0; byMonth[m].c++; });
    const monthKeys = Object.keys(byMonth).sort().slice(-36);
    const maxMonthG = Math.max(...monthKeys.map(m=>byMonth[m].g),1);
    const fireTarget = 3500;
    const last12m = all.filter(d => { const c=new Date(); c.setMonth(c.getMonth()-12); return d.date>=c.toISOString().slice(0,10); });
    const net12m = last12m.reduce((s,d)=>s+(d.net||0),0);
    const avgNetMonth = net12m/12;
    const firePct = Math.min(avgNetMonth/fireTarget*100,100);
    const byCalMonth = {}; all.forEach(d => { const k=d.date.slice(0,4)+"-"+d.date.slice(5,7); if(!byCalMonth[k])byCalMonth[k]={g:0,n:0}; byCalMonth[k].g+=d.gross||0; byCalMonth[k].n+=d.net||0; });
    const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth()-12);
    const cutoff12m = twelveMonthsAgo.toISOString().slice(0,10);
    const recent12m = all.filter(d=>d.date>=cutoff12m);
    const byTicker12 = {}; recent12m.forEach(d => { const t=d.ticker; if(!t)return; if(!byTicker12[t])byTicker12[t]={g:0,n:0,c:0}; byTicker12[t].g+=d.gross||0; byTicker12[t].n+=d.net||0; byTicker12[t].c++; });
    const topPayers = Object.entries(byTicker12).sort((a,b)=>b[1].g-a[1].g).slice(0,25);
    const maxTickerG = topPayers.length>0?topPayers[0][1].g:1;
    const yocData = Object.entries(byTicker12).map(([t,d])=>{ const pos=POS_STATIC[t]; if(!pos||!pos.cb||!pos.sh)return null; const tc=pos.cb*pos.sh; const yoc=tc>0?(d.g/tc*100):0; const cy=pos.lp>0&&pos.sh>0?(d.g/(pos.lp*pos.sh)*100):0; return {t,g12:d.g,cost:tc,yoc,cy,sh:pos.sh,cb:pos.cb,lp:pos.lp}; }).filter(Boolean).filter(d=>d.yoc>0).sort((a,b)=>b.yoc-a.yoc);
    const tickerDates = {}; all.forEach(d=>{ const t=d.ticker; if(!t)return; if(!tickerDates[t])tickerDates[t]=[]; tickerDates[t].push(d.date); });
    const freqData = Object.entries(tickerDates).map(([t,dates])=>{ dates.sort(); if(dates.length<2)return null; const gaps=[]; for(let i=1;i<dates.length;i++){const d1=new Date(dates[i-1]),d2=new Date(dates[i]); gaps.push((d2-d1)/(864e5));} const avg=gaps.reduce((s,g)=>s+g,0)/gaps.length; let freq=avg<=35?"Mensual":avg<=65?"Bimensual":avg<=100?"Trimestral":avg<=200?"Semestral":"Anual"; const last=dates[dates.length-1]; const next=new Date(last); next.setDate(next.getDate()+Math.round(avg)); return {t,freq,avg:Math.round(avg),next:next.toISOString().slice(0,10),last,count:dates.length}; }).filter(d=>d&&byTicker12[d.t]).sort((a,b)=>a.next.localeCompare(b.next));
    const curYear = divFilter.year!=="all"?divFilter.year:new Date().getFullYear().toString();
    const prevYear = String(parseInt(curYear, 10)-1);
    const tickerByYear = {}; all.forEach(d=>{ const y=d.date.slice(0,4),t=d.ticker; if(!t)return; if(!tickerByYear[t])tickerByYear[t]={}; if(!tickerByYear[t][y])tickerByYear[t][y]=0; tickerByYear[t][y]+=d.gross||0; });
    const growthData = Object.entries(tickerByYear).map(([t,years])=>{ const cur=years[curYear]||0,prev=years[prevYear]||0; const g=prev>0?((cur-prev)/prev*100):(cur>0?999:0); return {t,cur,prev,g}; }).filter(d=>d.cur>0||d.prev>0).sort((a,b)=>b.cur-a.cur);
    const availMonths = divFilter.year!=="all"?[...new Set(divLog.filter(d=>d.date?.startsWith(divFilter.year)).map(d=>d.date?.slice(0,7)).filter(Boolean))].sort().reverse():[];
    const rc = v=>v>0?"var(--green)":v<0?"var(--red)":"var(--text-secondary)";
    const mNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return <>
      {/* KPIs + FIRE */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {[{l:"GROSS",v:`$${totalGross.toLocaleString(undefined,{maximumFractionDigits:0})}`,c:"var(--gold)"},{l:"NET",v:`$${totalNet.toLocaleString(undefined,{maximumFractionDigits:0})}`,c:"var(--green)"},{l:"TAX",v:`${_sf(taxRate,0)}%`,c:"var(--red)"},{l:"COBROS",v:filtered.length,c:"var(--text-primary)"},{l:"TICKERS",v:uniqueTickers,c:"var(--text-secondary)"},{l:"NET/MES (12m)",v:`$${avgNetMonth.toLocaleString(undefined,{maximumFractionDigits:0})}`,c:avgNetMonth>=fireTarget?"var(--green)":"var(--orange)"}].map((k,i)=>(
          <div key={i} style={{flex:"1 1 85px",padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
            <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.6,fontWeight:600,marginBottom:3}}>{k.l}</div>
            <div style={{fontSize:16,fontWeight:700,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div></div>))}
      </div>
      {/* FIRE Bar */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <span style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>🎯 FIRE: ${fireTarget.toLocaleString()}/mes neto</span>
          <span style={{fontSize:13,fontWeight:700,color:firePct>=100?"var(--green)":"var(--orange)",fontFamily:"var(--fm)"}}>{_sf(firePct,0)}% — ${avgNetMonth.toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span>
        </div>
        <div style={{height:10,background:"rgba(255,255,255,.05)",borderRadius:5,overflow:"hidden"}}>
          <div style={{width:`${Math.min(firePct,100)}%`,height:"100%",background:firePct>=100?"var(--green)":"linear-gradient(90deg,var(--gold),var(--orange))",borderRadius:5}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
          <span>$0</span><span>Faltan ${Math.max(0,fireTarget-avgNetMonth).toLocaleString(undefined,{maximumFractionDigits:0})}/mes</span><span style={{color:"var(--green)"}}>${fireTarget.toLocaleString()}</span>
        </div>
      </div>
      {/* Filters */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <select value={divFilter.year} onChange={e=>setDivFilter(p=>({...p,year:e.target.value,month:"all"}))} style={{padding:"6px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
          <option value="all">Todos años</option>
          {[...new Set(divLog.map(d=>d.date?.slice(0,4)).filter(Boolean))].sort().reverse().map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        {divFilter.year!=="all"&&<select value={divFilter.month||"all"} onChange={e=>setDivFilter(p=>({...p,month:e.target.value}))} style={{padding:"6px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
          <option value="all">Todos meses</option>{availMonths.map(m=><option key={m} value={m}>{m}</option>)}</select>}
        <input type="text" placeholder="Ticker..." value={divFilter.ticker} onChange={e=>setDivFilter(p=>({...p,ticker:e.target.value}))} style={{width:90,padding:"6px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/>
        <button onClick={()=>setDivShowForm(!divShowForm)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--gold)",background:divShowForm?"var(--gold)":"var(--gold-dim)",color:divShowForm?"#000":"var(--gold)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{divShowForm?"✕":"+ Div"}</button>
        <label style={{padding:"7px 12px",borderRadius:8,border:"1px solid rgba(48,209,88,.3)",background:"rgba(48,209,88,.06)",color:"var(--green)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>↑ Import<input type="file" accept=".json" style={{display:"none"}} onChange={e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{const data=JSON.parse(ev.target.result);const entries=Array.isArray(data)?data:(data.entries||data.dividends||[]);if(entries.length){setDivLog(prev=>{const next=[...prev,...entries.filter(e=>e.date&&e.ticker)];next.sort((a,b)=>b.date.localeCompare(a.date));saveDivLog(next);return next;});alert(`${entries.length} importados`);}}catch(err){alert("Error: "+err.message);}};reader.readAsText(file);}}/></label>
      </div>
      {/* Add form */}
      {divShowForm&&(<div style={{padding:14,background:"var(--card)",border:"1px solid var(--gold-dim)",borderRadius:12}}><div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end"}}>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>FECHA</label><input type="date" value={divForm.date} onChange={e=>setDivForm(p=>({...p,date:e.target.value}))} style={{padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>TICKER</label><input type="text" value={divForm.ticker} onChange={e=>setDivForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} placeholder="DEO" style={{width:65,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>GROSS</label><input type="number" step="0.01" value={divForm.gross||""} onChange={e=>{const g=parseFloat(e.target.value)||0;setDivForm(p=>({...p,gross:g,net:g*(1-p.taxPct/100)}));}} style={{width:75,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>TAX%</label><input type="number" value={divForm.taxPct||""} onChange={e=>{const t=parseFloat(e.target.value)||0;setDivForm(p=>({...p,taxPct:t,net:p.gross*(1-t/100)}));}} style={{width:45,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <div><label style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",display:"block",marginBottom:3}}>SHARES</label><input type="number" value={divForm.shares||""} onChange={e=>setDivForm(p=>({...p,shares:parseFloat(e.target.value)||0}))} style={{width:60,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}/></div>
        <button onClick={()=>{if(divForm.date&&divForm.ticker&&divForm.gross){addDivEntry(divForm);setDivForm(p=>({...p,ticker:"",gross:0,net:0,shares:0}));}}} style={{padding:"6px 16px",borderRadius:6,border:"none",background:"var(--gold)",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",height:30}}>Guardar</button>
      </div></div>)}
      {/* Annual chart */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📈 Dividendos por Año</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140}}>
          {yearKeys.map((y,i)=>{const d=byYear[y];const h=d.g/maxYearG*100;const pY=yearKeys[i-1];const gr=pY&&byYear[pY].g>0?((d.g-byYear[pY].g)/byYear[pY].g*100):null;return(<div key={y} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${y}: G$${_sf(d.g,0)} N$${_sf(d.n,0)} ${d.c}x`}>{gr!=null&&<div style={{fontSize:8,fontWeight:600,color:rc(gr),fontFamily:"var(--fm)",marginBottom:2}}>{gr>=0?"+":""}{_sf(gr,0)}%</div>}<div style={{fontSize:9,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:2}}>${_sf(d.g/1000,1)}K</div><div style={{width:"100%",maxWidth:40,height:`${Math.max(h,4)}%`,background:"var(--gold)",borderRadius:"4px 4px 0 0",opacity:.7}}/><div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4,fontWeight:600}}>{y}</div></div>);})}
        </div>
      </div>
      {/* ── Calendar: Dividendos Mes a Mes (selector de año) ── */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        {(() => {
          const mNF = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
          const byYM = {};
          Object.entries(DIV_BY_MONTH).forEach(([ym, dd]) => {
            const yy = ym.slice(0,4), mm = parseInt(ym.slice(5), 10)-1;
            if (!byYM[yy]) byYM[yy] = new Array(12).fill(null);
            byYM[yy][mm] = dd;
          });
          const calYrs = Object.keys(byYM).filter(yy => parseInt(yy, 10) >= 2022).sort();
          const selY = calYrs.includes(divCalYear) ? divCalYear : calYrs[calYrs.length-1];
          const mths = byYM[selY] || new Array(12).fill(null);
          const mxMG = Math.max(...mths.map(dd => dd?.g || 0), 1);
          const yTot = mths.reduce((s,dd) => s + (dd?.g || 0), 0);
          const yNet = mths.reduce((s,dd) => s + (dd?.n || 0), 0);
          const yCnt = mths.reduce((s,dd) => s + (dd?.c || 0), 0);
          const yAvg = yTot / (mths.filter(dd=>dd&&dd.g>0).length || 1);
          const prvM = byYM[String(parseInt(selY, 10)-1)];
          const prvT = prvM ? prvM.reduce((s,dd) => s + (dd?.g || 0), 0) : 0;
          const yGr = prvT > 0 ? ((yTot - prvT) / prvT * 100) : 0;
          return <>
            <div style={{display:"flex",gap:0,marginBottom:14,border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",width:"fit-content"}}>
              {calYrs.map(yy => <button key={yy} onClick={()=>setDivCalYear(yy)} style={{padding:"8px 16px",border:"none",background:selY===yy?"var(--gold-dim)":"transparent",color:selY===yy?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:selY===yy?700:500,cursor:"pointer",fontFamily:"var(--fm)",borderRight:"1px solid var(--border)"}}>{yy}</button>)}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              {[{l:"INCOME",v:`$${yTot>=1000?_sf(yTot/1000,1)+"K":_sf(yTot,0)}`,c:"var(--gold)"},{l:"⌀ MES",v:`$${_sf(yAvg,0)}`,c:"var(--green)"},{l:"NET",v:`$${yNet>=1000?_sf(yNet/1000,1)+"K":_sf(yNet,0)}`,c:"var(--text-primary)"},...(prvT>0?[{l:"YoY",v:`${yGr>=0?"+":""}${_sf(yGr,0)}%`,c:yGr>=0?"var(--green)":"var(--red)"}]:[]),{l:"COBROS",v:String(yCnt),c:"var(--text-secondary)"}].map((k,ki) => <div key={ki} style={{padding:"8px 14px",background:`${k.c}08`,borderRadius:10,border:`1px solid ${k.c}22`}}><div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5}}>{k.l}</div><div style={{fontSize:18,fontWeight:800,color:k.c,fontFamily:"var(--fm)"}}>{k.v}</div></div>)}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"flex-end",height:220,paddingTop:30}}>
              {mths.map((dd, mi) => {
                const gg = dd?.g || 0;
                const cn = dd?.c || 0;
                const hh = mxMG > 0 ? (gg / mxMG * 100) : 0;
                const pM = prvM?.[mi];
                const pG = pM?.g || 0;
                const mG = pG > 0 ? ((gg - pG) / pG * 100) : 0;
                return <div key={mi} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",position:"relative"}}>
                  {gg > 0 && <div style={{fontSize:9,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap",transform:"rotate(-45deg)",transformOrigin:"bottom center",position:"absolute",top:0,left:"50%",marginLeft:-4}}>{gg>=1000?`${_sf(gg/1000,1)}K`:`$${_sf(gg,0)}`}</div>}
                  {gg > 0 && pG > 0 && <div style={{fontSize:7,fontWeight:600,color:mG>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",marginBottom:2}}>{mG>=0?"+":""}{_sf(mG,0)}%</div>}
                  <div style={{width:"100%",maxWidth:36,height:`${Math.max(hh, gg>0?4:0)}%`,background:gg>0?"linear-gradient(180deg, var(--gold), rgba(200,164,78,.2))":"transparent",borderRadius:"4px 4px 0 0",minHeight:gg>0?4:0}}/>
                  <div style={{fontSize:10,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:5,fontWeight:600}}>{mNF[mi]}</div>
                  {cn > 0 && <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{cn}x</div>}
                </div>;
              })}
            </div>
          </>;
        })()}
      </div>
      {/* YoY por mes */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:12}}>📊 Comparativa Mensual YoY ({prevYear} vs {curYear})</div>
        <div style={{display:"flex",gap:4}}>
          {["01","02","03","04","05","06","07","08","09","10","11","12"].map(mm=>{const cur=byCalMonth[curYear+"-"+mm]?.g||0;const prev=byCalMonth[prevYear+"-"+mm]?.g||0;const mx=Math.max(cur,prev,1);const gr=prev>0?((cur-prev)/prev*100):(cur>0?100:0);return(<div key={mm} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}} title={`${mNames[parseInt(mm, 10)-1]}: ${prevYear} $${_sf(prev,0)} → ${curYear} $${_sf(cur,0)}`}><div style={{fontSize:7,fontWeight:600,color:rc(gr),fontFamily:"var(--fm)"}}>{cur>0&&prev>0?`${gr>=0?"+":""}${_sf(gr,0)}%`:""}</div><div style={{display:"flex",gap:1,alignItems:"flex-end",height:60,width:"100%"}}><div style={{flex:1,height:`${prev/mx*100}%`,background:"var(--text-tertiary)",borderRadius:"2px 2px 0 0",opacity:.4,minHeight:prev>0?2:0}}/><div style={{flex:1,height:`${cur/mx*100}%`,background:cur>=prev?"var(--green)":"var(--red)",borderRadius:"2px 2px 0 0",opacity:.8,minHeight:cur>0?2:0}}/></div><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{mNames[parseInt(mm, 10)-1]}</div></div>);})}
        </div>
        <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:8,fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}><span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"var(--text-tertiary)",opacity:.4}}/>{prevYear}</span><span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:"var(--green)"}}/>{curYear}</span></div>
      </div>
      {/* Monthly 36m */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📅 Dividendos Mensuales (36m)</div>
          <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Media: <span style={{color:"var(--gold)",fontWeight:600}}>${monthKeys.length>0?_sf(monthKeys.reduce((s,m)=>s+(byMonth[m]?.g||0),0)/monthKeys.length,0):"0"}/mes</span></div>
        </div>
        {(() => {
          const chartH = 160;
          const yMax = Math.ceil(maxMonthG / 1000) * 1000 || 5000;
          const ySteps = [];
          for (let v = 0; v <= yMax; v += yMax <= 5000 ? 1000 : 2000) ySteps.push(v);
          const yTop = ySteps[ySteps.length-1] || 1;
          // Show value on every 3rd bar + first + last
          const showValueAt = new Set([0, monthKeys.length-1]);
          monthKeys.forEach((_,i) => { if (i % 3 === 0) showValueAt.add(i); });
          return <div style={{display:"flex",gap:0}}>
            {/* Y Axis */}
            <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:chartH,paddingRight:6,flexShrink:0}}>
              {[...ySteps].reverse().map(v => (
                <div key={v} style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",width:30,lineHeight:"1"}}>${v>=1000?_sf(v/1000,0)+"K":v}</div>
              ))}
            </div>
            <div style={{flex:1,position:"relative"}}>
              {/* Grid lines */}
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",pointerEvents:"none"}}>
                {ySteps.map(v => <div key={v} style={{borderBottom:"1px solid rgba(255,255,255,.04)",width:"100%"}}/>)}
              </div>
              {/* Bars */}
              <div style={{display:"flex",alignItems:"flex-end",gap:1,height:chartH,position:"relative"}}>
                {monthKeys.map((m,i) => {
                  const d = byMonth[m];
                  const h = yTop > 0 ? (d.g / yTop * 100) : 0;
                  const isCur = m.startsWith(new Date().getFullYear().toString());
                  const isLast = i === monthKeys.length - 1;
                  const showVal = showValueAt.has(i) && d.g > 0;
                  return <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}} title={`${m}: G$${_sf(d.g,0)} N$${_sf(d.n,0)} ${d.c}x`}>
                    {showVal && <div style={{fontSize:7,fontWeight:600,color:isLast?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:1,whiteSpace:"nowrap"}}>{d.g>=1000?_sf(d.g/1000,1)+"K":_sf(d.g,0)}</div>}
                    <div style={{width:"100%",maxWidth:14,height:`${Math.max(h,3)}%`,background:isCur?"var(--gold)":"var(--green)",borderRadius:"2px 2px 0 0",opacity:isCur?1:.5}}/>
                  </div>;
                })}
              </div>
              {/* X axis */}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                {monthKeys.filter((_,i) => i === 0 || i === monthKeys.length-1 || (i % 6 === 0)).map(m => (
                  <span key={m} style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{m.slice(2)}</span>
                ))}
              </div>
            </div>
          </div>;
        })()}
      </div>
      {/* Dividends Received — DivTracker style */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>💰 Dividends Received (12m)</div>
          <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Total: <span style={{color:"var(--gold)",fontWeight:700}}>${recent12m.reduce((s,d)=>s+(d.gross||0),0).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {topPayers.map(([t,d],i)=>{
            const pct = maxTickerG > 0 ? (d.g/maxTickerG*100) : 0;
            const totG = recent12m.reduce((s,dd)=>s+(dd.gross||0),0)||1;
            return <div key={t} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topPayers.length-1?"1px solid rgba(255,255,255,.03)":"none"}}>
              <span style={{width:22,fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",fontWeight:600}}>{i+1}</span>
              <div style={{width:46,height:26,borderRadius:6,background:"rgba(200,164,78,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)"}}>{t.slice(0,5)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{height:12,background:"rgba(255,255,255,.03)",borderRadius:4,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,var(--gold),rgba(200,164,78,.15))",borderRadius:4}}/>
                </div>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",width:65,textAlign:"right"}}>${d.g>=1000?_sf(d.g/1000,2)+"K":_sf(d.g,0)}</span>
              <span style={{fontSize:10,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",width:38,textAlign:"right"}}>{_sf(d.g/totG*100,1)}%</span>
            </div>;
          })}
        </div>
      </div>
      {/* YOC */}
      {yocData.length>0&&(<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>💎 Yield on Cost (12m / coste)</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:12}}>Posiciones activas con cost basis</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:550}}><thead><tr>{["TICKER","DIV 12M","COSTE","YOC","YIELD","CB","PRECIO","SH"].map((h,i)=><th key={i} style={{padding:"6px 10px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
          {yocData.slice(0,30).map((d,i)=>(<tr key={d.t} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}><td style={{padding:"5px 10px",fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.t}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.g12,0)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.cost/1000,1)}K</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:700,fontFamily:"var(--fm)",color:d.yoc>=8?"var(--green)":d.yoc>=4?"var(--gold)":"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(d.yoc,1)}%</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(d.cy,1)}%</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.cb,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:d.lp>=d.cb?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.lp,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.sh}</td></tr>))}
        </tbody></table></div></div>)}
      {/* Frequency */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>📅 Frecuencia + Próximo Cobro</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:12}}>Basado en historial · Posiciones activas</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}><thead><tr>{["TICKER","FREQ","ÚLTIMO","PRÓXIMO","#","~DÍAS"].map((h,i)=><th key={i} style={{padding:"6px 10px",textAlign:i?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>
          {freqData.slice(0,40).map((d,i)=>{const past=d.next<new Date().toISOString().slice(0,10);return(<tr key={d.t} style={{background:i%2?"rgba(255,255,255,.01)":"transparent"}}><td style={{padding:"5px 10px",fontWeight:600,color:"var(--gold)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.t}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:d.freq==="Mensual"?"rgba(48,209,88,.1)":"rgba(201,169,80,.1)",color:d.freq==="Mensual"?"var(--green)":"var(--gold)"}}>{d.freq}</span></td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.last}</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:past?"var(--orange)":"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.next}{past?" ⏰":""}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.count}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.avg}d</td></tr>);})}
        </tbody></table></div></div>
      {/* Sortable table */}
      {(()=>{const cols=[{k:"date",l:"FECHA",a:"left"},{k:"ticker",l:"TICKER",a:"left"},{k:"gross",l:"GROSS",a:"right"},{k:"tax",l:"TAX%",a:"right"},{k:"net",l:"NET",a:"right"},{k:"currency",l:"MON",a:"right"},{k:"shares",l:"SH",a:"right"},{k:"dps",l:"DPS",a:"right"},{k:"",l:"",a:"center"}];const sk=divSort.col,sa=divSort.asc;const sorted=[...filtered].sort((a,b)=>{let va,vb;if(sk==="date"){va=a.date||"";vb=b.date||"";}else if(sk==="ticker"){va=a.ticker||"";vb=b.ticker||"";}else if(sk==="gross"){va=a.gross||0;vb=b.gross||0;}else if(sk==="net"){va=a.net||0;vb=b.net||0;}else if(sk==="tax"){va=a.gross>0?(1-a.net/a.gross):0;vb=b.gross>0?(1-b.net/b.gross):0;}else if(sk==="currency"){va=a.currency||"";vb=b.currency||"";}else if(sk==="shares"){va=a.shares||0;vb=b.shares||0;}else if(sk==="dps"){va=a.shares&&a.gross?a.gross/a.shares:0;vb=b.shares&&b.gross?b.gross/b.shares:0;}else{va=a.date||"";vb=b.date||"";}if(typeof va==="string")return sa?va.localeCompare(vb):vb.localeCompare(va);return sa?va-vb:vb-va;});const ts=k=>{if(!k)return;setDivSort(p=>p.col===k?{col:k,asc:!p.asc}:{col:k,asc:false});};const ar=k=>divSort.col===k?(divSort.asc?" ▲":" ▼"):"";return(<div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}><div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}><span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Cobros · {filtered.length}</span></div>{divLoading?<div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)"}}>Cargando...</div>:filtered.length===0?<div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)",fontSize:12}}>Sin datos.</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:700}}><thead><tr>{cols.map((c,i)=><th key={i} onClick={()=>ts(c.k)} style={{padding:"7px 10px",textAlign:c.a,color:divSort.col===c.k?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",cursor:c.k?"pointer":"default",userSelect:"none",whiteSpace:"nowrap"}}>{c.l}{ar(c.k)}</th>)}</tr></thead><tbody>{sorted.slice(0,300).map((d,i)=>(<tr key={d.id||i} style={{background:i%2?"rgba(255,255,255,.012)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.012)":"transparent"}><td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.date}</td><td style={{padding:"5px 10px",fontWeight:600,fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.ticker}</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.gross||0,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.gross&&d.net?_sf((1-(d.net||0)/(d.gross||1))*100,0):0}%</td><td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${_sf(d.net||0,2)}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.currency||"USD"}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.shares||""}</td><td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.shares&&d.gross?_sf(d.gross/d.shares,4):""}</td><td style={{padding:"3px 6px",borderBottom:"1px solid rgba(255,255,255,.03)"}}><button onClick={()=>deleteDivEntry(d.id)} style={{width:18,height:18,borderRadius:4,border:"1px solid rgba(255,69,58,.12)",background:"transparent",color:"var(--red)",fontSize:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}}>✕</button></td></tr>))}</tbody></table></div>}</div>);})()}
      {/* Export */}
      {divLog.length>0&&(<div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={()=>{const blob=new Blob([JSON.stringify(divLog,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="dividendos_ar.json";a.click();URL.revokeObjectURL(url);}} style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}>↓ Export JSON</button></div>)}
    </>;
  })()}
</div>
  );
}
