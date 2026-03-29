import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

export default function PatrimonioTab() {
  const { CTRL_DATA } = useHome();

  const data = CTRL_DATA.filter(c => c.pu > 0).sort((a,b) => (a.d||"").localeCompare(b.d||"")).map((c, i, arr) => {
  const prev = i > 0 ? arr[i-1] : null;
  const mReturnUsd = prev?.pu ? ((c.pu - prev.pu) / prev.pu * 100) : null;
  const mReturnEur = prev?.pe ? ((c.pe - prev.pe) / prev.pe * 100) : null;
  return { ...c, mReturnUsd, mReturnEur, idx: i };
});
const latest = data[data.length - 1] || {};
const first = data[0] || {};

// Group by year
const byYear = {};
data.forEach(d => {
  const y = d.d?.slice(0, 4);
  if (!y) return;
  if (!byYear[y]) byYear[y] = [];
  byYear[y].push(d);
});
const years = Object.keys(byYear).sort().reverse();

// Annual returns
const annualReturns = years.map(y => {
  const entries = byYear[y];
  const lastOfYear = entries[entries.length - 1];
  // Find last entry of previous year
  const prevYearEntries = byYear[String(parseInt(y, 10) - 1)];
  const lastOfPrevYear = prevYearEntries?.[prevYearEntries.length - 1];
  const ytdUsd = lastOfPrevYear?.pu ? ((lastOfYear.pu - lastOfPrevYear.pu) / lastOfPrevYear.pu * 100) : null;
  const ytdEur = lastOfPrevYear?.pe ? ((lastOfYear.pe - lastOfPrevYear.pe) / lastOfPrevYear.pe * 100) : null;
  return { y, ytdUsd, ytdEur, start: lastOfPrevYear?.pu, end: lastOfYear.pu, startEur: lastOfPrevYear?.pe, endEur: lastOfYear.pe, entries };
});

// CAGR
const totalYears = data.length > 1 ? ((new Date(latest.d) - new Date(first.d)) / (365.25 * 24 * 3600 * 1000)) : 1;
const cagrUsd = first.pu > 0 ? ((Math.pow(latest.pu / first.pu, 1 / totalYears) - 1) * 100) : 0;
const cagrEur = first.pe > 0 ? ((Math.pow(latest.pe / first.pe, 1 / totalYears) - 1) * 100) : 0;
const totalReturnUsd = first.pu ? ((latest.pu - first.pu) / first.pu * 100) : 0;
const totalReturnEur = first.pe ? ((latest.pe - first.pe) / first.pe * 100) : 0;

// Max drawdown (USD)
let peak = 0, maxDD = 0, ddStart = "", ddEnd = "";
data.forEach(d => {
  if (d.pu > peak) peak = d.pu;
  const dd = peak > 0 ? ((d.pu - peak) / peak * 100) : 0;
  if (dd < maxDD) { maxDD = dd; ddEnd = d.d; }
});

// Chart data
const maxPu = Math.max(...data.map(d => d.pu || 0));
const minPu = Math.min(...data.map(d => d.pu || 0));

// Best and worst months
const monthlyReturns = data.filter(d => d.mReturnUsd != null);
const bestMonth = monthlyReturns.reduce((b, d) => (d.mReturnUsd > (b?.mReturnUsd || -Infinity)) ? d : b, null);
const worstMonth = monthlyReturns.reduce((w, d) => (d.mReturnUsd < (w?.mReturnUsd || Infinity)) ? d : w, null);
const avgMonthReturn = monthlyReturns.length > 0 ? monthlyReturns.reduce((s, d) => s + d.mReturnUsd, 0) / monthlyReturns.length : 0;
const positiveMonths = monthlyReturns.filter(d => d.mReturnUsd > 0).length;
const winRate = monthlyReturns.length > 0 ? (positiveMonths / monthlyReturns.length * 100) : 0;

const retCol = (v) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-secondary)";
const retFmt = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${_sf(v,1)}%`;

// Last month delta
const prevEntry = data.length >= 2 ? data[data.length - 2] : null;
const monthDeltaUsd = prevEntry ? (latest.pu - prevEntry.pu) : 0;
const monthDeltaPct = prevEntry?.pu ? ((latest.pu - prevEntry.pu) / prevEntry.pu * 100) : 0;

// Mini sparkline points (last 12 data points)
const spark = data.slice(-12);
const sparkMin = Math.min(...spark.map(d=>d.pu||0));
const sparkMax = Math.max(...spark.map(d=>d.pu||0));
const sparkRange = sparkMax - sparkMin || 1;
const sparkW = 120, sparkH = 32;
const sparkPath = spark.map((d,i) => {
  const x = spark.length > 1 ? (i / (spark.length-1)) * sparkW : sparkW/2;
  const y = sparkH - ((d.pu - sparkMin) / sparkRange) * sparkH;
  return `${i===0?"M":"L"}${_sf(x,1)},${_sf(y,1)}`;
}).join(" ");

return (
<div style={{display:"flex",flexDirection:"column",gap:16}}>
  {/* Hero KPI — Patrimonio */}
  <div style={{background:"linear-gradient(135deg, rgba(201,169,80,.06), rgba(201,169,80,.02))",border:"1px solid rgba(201,169,80,.2)",borderRadius:20,padding:"28px 32px",display:"flex",flexDirection:"column",gap:16}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
      <div>
        <div style={{fontSize:10,color:"var(--gold)",fontFamily:"var(--fm)",letterSpacing:1.5,fontWeight:700,marginBottom:8,opacity:.7}}>PATRIMONIO NETO</div>
        <div style={{fontSize:42,fontWeight:800,fontFamily:"var(--fm)",color:"var(--text-primary)",lineHeight:1,letterSpacing:-1}}>${(latest.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
        <div style={{fontSize:18,fontWeight:500,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginTop:4}}>€{(latest.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
        <div style={{padding:"6px 14px",borderRadius:10,background:monthDeltaPct>=0?"rgba(48,209,88,.1)":"rgba(255,69,58,.1)",border:`1px solid ${monthDeltaPct>=0?"rgba(48,209,88,.2)":"rgba(255,69,58,.2)"}`}}>
          <span style={{fontSize:16,fontWeight:700,color:retCol(monthDeltaPct),fontFamily:"var(--fm)"}}>{monthDeltaPct>=0?"▲":"▼"} {retFmt(monthDeltaPct)}</span>
          <span style={{fontSize:11,color:retCol(monthDeltaPct),fontFamily:"var(--fm)",marginLeft:6,opacity:.7}}>({monthDeltaUsd>=0?"+":"−"}${fDol(Math.abs(monthDeltaUsd))})</span>
        </div>
        {/* Mini sparkline */}
        {spark.length > 2 && <div style={{opacity:.7}}>
          <svg width={sparkW+20} height={sparkH+8} viewBox={`-2 -2 ${sparkW+4} ${sparkH+4}`} style={{overflow:"visible"}}>
            <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity=".25"/><stop offset="100%" stopColor="var(--gold)" stopOpacity="0"/></linearGradient></defs>
            <path d={sparkPath + ` L${sparkW},${sparkH} L0,${sparkH} Z`} fill="url(#sparkGrad)"/>
            <path d={sparkPath} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx={sparkW} cy={sparkH - ((spark[spark.length-1].pu - sparkMin) / sparkRange) * sparkH} r="3" fill="var(--gold)"/>
          </svg>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"center",marginTop:1}}>Últimos 12m</div>
        </div>}
      </div>
    </div>
    {/* Composition bar */}
    {latest.br > 0 && (() => {
      const total = (latest.pu || 1);
      const brokerPct = ((latest.br || 0) / total * 100);
      const bankPct = ((latest.bk || 0) * (latest.fx || 1.08) / total * 100);
      const otherPct = Math.max(0, 100 - brokerPct - bankPct);
      return <div style={{marginTop:4}}>
        <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",background:"rgba(255,255,255,.03)"}}>
          <div style={{width:`${brokerPct}%`,background:"var(--gold)",transition:"width .5s"}}/>
          <div style={{width:`${bankPct}%`,background:"#64d2ff",transition:"width .5s"}}/>
          {otherPct > 1 && <div style={{width:`${otherPct}%`,background:"rgba(255,255,255,.1)"}}/>}
        </div>
        <div style={{display:"flex",gap:16,marginTop:6,fontSize:10,fontFamily:"var(--fm)"}}>
          <span style={{color:"var(--gold)"}}>● Brokers ${fDol(latest.br||0)} ({_sf(brokerPct,0)}%)</span>
          <span style={{color:"#64d2ff"}}>● Bancos €{fDol(latest.bk||0)} ({_sf(bankPct,0)}%)</span>
        </div>
      </div>;
    })()}
    <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",opacity:.6}}>Último snapshot: {latest.d || "—"} · FX: €1 = ${latest.fx?.toFixed(2) || "—"}</div>
  </div>
  {/* Secondary KPI row */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:10}}>
    {[
      {label:"RETORNO TOTAL",value:retFmt(totalReturnUsd),sub:`EUR ${retFmt(totalReturnEur)}`,color:retCol(totalReturnUsd)},
      {label:`CAGR (${_sf(totalYears,1)}a)`,value:retFmt(cagrUsd),sub:`EUR ${retFmt(cagrEur)}`,color:retCol(cagrUsd)},
      {label:"MAX DRAWDOWN",value:`${_sf(maxDD,1)}%`,sub:ddEnd?`Valle: ${ddEnd}`:"—",color:"var(--red)"},
      {label:"WIN RATE",value:`${_sf(winRate,0)}%`,sub:`${positiveMonths}/${monthlyReturns.length} meses +`,color:winRate>=50?"var(--green)":"var(--red)"},
      {label:"MEJOR MES",value:bestMonth?retFmt(bestMonth.mReturnUsd):"—",sub:bestMonth?.d||"—",color:"var(--green)"},
      {label:"PEOR MES",value:worstMonth?retFmt(worstMonth.mReturnUsd):"—",sub:worstMonth?.d||"—",color:"var(--red)"},
    ].map((k,i) => (
      <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px"}}>
        <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.8,fontWeight:600,marginBottom:6}}>{k.label}</div>
        <div style={{fontSize:20,fontWeight:700,fontFamily:"var(--fm)",color:k.color,lineHeight:1.1}}>{k.value}</div>
        <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:3}}>{k.sub}</div>
      </div>
    ))}
  </div>

  {/* Patrimony Evolution Chart — with Y axis, labels, year markers */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)"}}>📈 Evolución Patrimonio (USD)</div>
      <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{data.length} meses · {first.d?.slice(0,4)}–{latest.d?.slice(0,4)}</div>
    </div>
    {(() => {
      // Y axis scale
      const chartH = 220;
      const yMax = Math.ceil(maxPu / 200000) * 200000; // Round up to nearest 200K
      const ySteps = [];
      for (let v = 0; v <= yMax; v += yMax <= 1000000 ? 200000 : 500000) ySteps.push(v);
      if (ySteps[ySteps.length-1] < maxPu) ySteps.push(ySteps[ySteps.length-1] + (yMax <= 1000000 ? 200000 : 500000));
      const yTop = ySteps[ySteps.length-1] || 1;

      // Detect year boundaries for markers
      const yearChanges = new Set();
      data.forEach((d,i) => { if(i > 0 && d.d?.slice(0,4) !== data[i-1].d?.slice(0,4)) yearChanges.add(i); });

      // Which bars get a label (first, last, and first of each year)
      const labelBars = new Set([0, data.length-1]);
      data.forEach((d,i) => { if(yearChanges.has(i)) labelBars.add(i); });

      return (
        <div style={{display:"flex",gap:0}}>
          {/* Y Axis */}
          <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",height:chartH,paddingRight:8,flexShrink:0}}>
            {[...ySteps].reverse().map(v => (
              <div key={v} style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right",width:40,lineHeight:"1"}}>{v >= 1e6 ? `$${_sf(v/1e6,1)}M` : `$${_sf(v/1e3,0)}K`}</div>
            ))}
          </div>
          {/* Chart area */}
          <div style={{flex:1,position:"relative"}}>
            {/* Grid lines */}
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",justifyContent:"space-between",pointerEvents:"none"}}>
              {ySteps.map(v => <div key={v} style={{borderBottom:"1px solid rgba(255,255,255,.04)",width:"100%"}}/>)}
            </div>
            {/* Bars */}
            <div style={{display:"flex",alignItems:"flex-end",gap:1,height:chartH,position:"relative"}}>
              {data.map((d, i) => {
                const h = yTop > 0 ? (d.pu / yTop * 100) : 0;
                const isLast = i === data.length - 1;
                const isYearStart = yearChanges.has(i);
                const showLabel = labelBars.has(i);
                const barColor = isLast ? "var(--gold)" : "rgba(201,169,80,0.5)";
                return (
                  <div key={d.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%",borderLeft:isYearStart?"1px solid rgba(255,255,255,.1)":"none",position:"relative"}} title={`${d.d}\n$${(d.pu||0).toLocaleString()}\n€${(d.pe||0).toLocaleString()}\n${d.mReturnUsd != null ? "Mes: "+retFmt(d.mReturnUsd) : ""}`}>
                    {/* Value label on key bars */}
                    {showLabel && <div style={{fontSize:8,fontWeight:600,color:isLast?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:2,whiteSpace:"nowrap"}}>{d.pu>=1e6?`$${_sf(d.pu/1e6,2)}M`:`$${_sf(d.pu/1e3,0)}K`}</div>}
                    <div style={{width:"100%",maxWidth:16,height:`${Math.max(h,2)}%`,background:barColor,borderRadius:"2px 2px 0 0",transition:"opacity .2s"}}/>
                  </div>
                );
              })}
            </div>
            {/* X axis labels */}
            <div style={{display:"flex",gap:1,marginTop:4}}>
              {data.map((d,i) => {
                const isYearStart = yearChanges.has(i);
                const isFirst = i === 0;
                const isLast = i === data.length - 1;
                return (
                  <div key={d.d} style={{flex:1,textAlign:"center"}}>
                    {(isFirst || isYearStart || isLast) && <div style={{fontSize:8,color:isLast?"var(--gold)":"var(--text-tertiary)",fontFamily:"var(--fm)",fontWeight:isLast?600:400,whiteSpace:"nowrap",overflow:"hidden"}}>{d.d?.slice(0,7)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    })()}
  </div>

  {/* Monthly Returns heatmap-style */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:4}}>📊 Rentabilidad Mensual (%)</div>
    <div style={{display:"flex",gap:8,marginBottom:12,fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
      <span>Mejor: <span style={{color:"var(--green)",fontWeight:600}}>{retFmt(bestMonth?.mReturnUsd)} ({bestMonth?.d})</span></span>
      <span>·</span>
      <span>Peor: <span style={{color:"var(--red)",fontWeight:600}}>{retFmt(worstMonth?.mReturnUsd)} ({worstMonth?.d})</span></span>
      <span>·</span>
      <span>Media: <span style={{color:retCol(avgMonthReturn),fontWeight:600}}>{retFmt(avgMonthReturn)}</span></span>
    </div>
    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
      {monthlyReturns.map(d => {
        const v = d.mReturnUsd;
        const intensity = Math.min(Math.abs(v) / 12, 1);
        const bg = v >= 0 
          ? `rgba(48,209,88,${0.1 + intensity * 0.6})` 
          : `rgba(255,69,58,${0.1 + intensity * 0.6})`;
        return (
          <div key={d.d} title={`${d.d}: ${retFmt(v)} · $${(d.pu||0).toLocaleString()}`} style={{width:28,height:28,borderRadius:4,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:600,color:v>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)",cursor:"default"}}>
            {v>=0?"+":""}{_sf(v,0)}
          </div>
        );
      })}
    </div>
  </div>

  {/* Annual Returns */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--gold)",fontFamily:"var(--fd)",marginBottom:16}}>📅 Rentabilidad Anual</div>
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
      {annualReturns.filter(a => a.ytdUsd != null).map(a => (
        <div key={a.y} style={{flex:"1 1 120px",padding:"12px 16px",background:"rgba(255,255,255,.02)",borderRadius:12,border:"1px solid var(--border)",textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-secondary)",fontFamily:"var(--fm)",marginBottom:4}}>{a.y}</div>
          <div style={{fontSize:24,fontWeight:700,color:retCol(a.ytdUsd),fontFamily:"var(--fm)"}}>{retFmt(a.ytdUsd)}</div>
          <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>EUR {retFmt(a.ytdEur)}</div>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>${fDol(a.start||0)} → ${fDol(a.end||0)}</div>
        </div>
      ))}
    </div>
  </div>

  {/* Full History Table */}
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
    <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)"}}>
      <span style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>📋 Detalle Mensual · {data.length} snapshots</span>
    </div>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:800}}>
        <thead><tr>
          {["FECHA","PAT. USD","PAT. EUR","BROKERS","BANCOS","FX €/$","Δ USD","Δ EUR","SUELDO"].map((h,i)=>
            <th key={i} style={{padding:"7px 12px",textAlign:i>0?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",position:"sticky",top:0,background:"var(--bg)"}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {[...data].reverse().map((d, i) => {
            const bg = i%2 ? "rgba(255,255,255,.01)" : "transparent";
            return (
              <tr key={d.d} style={{background:bg}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=bg}>
                <td style={{padding:"6px 12px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontWeight:500}}>{d.d}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)",fontWeight:600}}>${(d.pu||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(d.pe||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>${(d.br||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid rgba(255,255,255,.03)"}}>€{(d.bk||0).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.fx?.toFixed(2)||"—"}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600,color:retCol(d.mReturnUsd),borderBottom:"1px solid rgba(255,255,255,.03)"}}>{retFmt(d.mReturnUsd)}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:retCol(d.mReturnEur),borderBottom:"1px solid rgba(255,255,255,.03)"}}>{retFmt(d.mReturnEur)}</td>
                <td style={{padding:"6px 12px",textAlign:"right",fontFamily:"var(--fm)",color:d.sl?"var(--text-secondary)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{d.sl ? `$${fDol(d.sl)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
</div>
);
}
