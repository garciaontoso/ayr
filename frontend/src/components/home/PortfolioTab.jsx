import { useState, useRef, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

const ALERTS_KEY = "ayr_price_alerts";

const SORT_OPTIONS = [
  {id:"name",lbl:"A-Z",fn:(a,b)=>(a.name||a.ticker).localeCompare(b.name||b.ticker)},
  {id:"value",lbl:"Valor",fn:(a,b)=>(b.valueUSD||0)-(a.valueUSD||0)},
  {id:"pnl",lbl:"P&L%",fn:(a,b)=>(b.pnlPct||0)-(a.pnlPct||0)},
  {id:"weight",lbl:"Peso",fn:(a,b)=>(b.weight||0)-(a.weight||0)},
  {id:"div",lbl:"Div",fn:(a,b)=>(b.divAnnualUSD||0)-(a.divAnnualUSD||0)},
  {id:"price",lbl:"Precio",fn:(a,b)=>(b.priceUSD||0)-(a.priceUSD||0)},
];

export default function PortfolioTab() {
  const {
    portfolioList, portfolioTotals, portfolioComputed,
    searchTicker, setSearchTicker, updatePosition,
    countryFilter, setCountryFilter, portSort, setPortSort, showCapTable, setShowCapTable,
    pricesLoading, pricesLastUpdate, refreshPrices,
    displayCcy, privacyMode, hide,
    openAnalysis, getCountry, FLAGS, POS_STATIC, CompanyRow,
  } = useHome();

  const [quickFilter, setQuickFilter] = useState("");
  const [listSort, setListSort] = useState("value");
  const searchRef = useRef(null);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showRebalance, setShowRebalance] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertForm, setAlertForm] = useState({ ticker: "", price: "", direction: "below" });
  const [alerts, setAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) || []; } catch { return []; }
  });
  const saveAlerts = useCallback((a) => { setAlerts(a); localStorage.setItem(ALERTS_KEY, JSON.stringify(a)); }, []);

  // Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && quickFilter) {
        setQuickFilter("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [quickFilter]);

  // Check price alerts on price update
  useEffect(() => {
    if (!alerts.length) return;
    const pos = portfolioTotals?.positions || [];
    alerts.forEach(a => {
      const p = pos.find(x => x.ticker === a.ticker);
      if (!p) return;
      const triggered = a.direction === "below" ? p.lastPrice <= a.price : p.lastPrice >= a.price;
      if (triggered && !a.fired) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`🔔 ${a.ticker} ${a.direction === "below" ? "bajó a" : "subió a"} $${p.lastPrice.toFixed(2)}`, { body: `Alerta: ${a.direction === "below" ? "≤" : "≥"} $${a.price}` });
        }
        saveAlerts(alerts.map(x => x === a ? { ...x, fired: true } : x));
      }
    });
  }, [portfolioTotals?.positions]);

  return (
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {/* Summary — inline compact */}
        {portfolioList.length>0 && (
          <div style={{display:"flex",gap:16,padding:"6px 0",flexWrap:"wrap",alignItems:"baseline"}}>
            {[
              {l:"Valor",v:hide(displayCcy==="EUR"?"€"+fDol(portfolioTotals.totalValueEUR):"$"+fDol(portfolioTotals.totalValueUSD)),c:"var(--text-primary)"},
              {l:"Coste",v:hide(displayCcy==="EUR"?"€"+fDol(portfolioTotals.totalCostEUR):"$"+fDol(portfolioTotals.totalCostUSD)),c:"var(--text-tertiary)"},
              {l:"P&L",v:hide((portfolioTotals.pnlUSD>=0?"+":"-")+(displayCcy==="EUR"?"€":"$")+fDol(Math.abs(displayCcy==="EUR"?portfolioTotals.pnlEUR:portfolioTotals.pnlUSD))),c:portfolioTotals.pnlUSD>=0?"var(--green)":"var(--red)",sub:privacyMode?"":_sf(portfolioTotals.pnlPctUSD*100,1)+"%"},
              {l:"Div",v:hide(displayCcy==="EUR"?"€"+fDol(portfolioTotals.totalDivEUR):"$"+fDol(portfolioTotals.totalDivUSD)),c:"var(--gold)",sub:privacyMode?"":"YOC "+_sf(portfolioTotals.yocUSD*100,1)+"%"},
            ].map((m,i)=>(
              <div key={i} style={{fontFamily:"var(--fm)"}}>
                <span style={{fontSize:9,color:"var(--text-tertiary)",marginRight:4}}>{m.l}</span>
                <span style={{fontSize:16,fontWeight:700,color:m.c}}>{m.v}</span>
                {m.sub && <span style={{fontSize:9,color:m.c,marginLeft:4,opacity:.6}}>{m.sub}</span>}
              </div>
            ))}
          </div>
        )}
        {/* Quick stats row */}
        {portfolioList.length>0 && (() => {
          const pos = portfolioTotals.positions || [];
          if (!pos.length) return null;
          const greenCount = pos.filter(p=>(p.pnlPct||0)>=0).length;
          const best = pos.reduce((a,b) => (b.pnlPct||0) > (a.pnlPct||0) ? b : a, pos[0]);
          const worst = pos.reduce((a,b) => (b.pnlPct||0) < (a.pnlPct||0) ? b : a, pos[0]);
          return (
          <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:10,fontFamily:"var(--fm)",marginBottom:2}}>
            <span><span style={{color:"var(--text-tertiary)"}}>Pos:</span> <b>{pos.length}</b></span>
            <span><span style={{color:"var(--text-tertiary)"}}>Yield:</span> <b style={{color:"var(--gold)"}}>{_sf(portfolioTotals.yieldUSD*100,1)}%</b></span>
            <span><span style={{color:"var(--text-tertiary)"}}>Verdes:</span> <b style={{color:"var(--green)"}}>{greenCount}/{pos.length}</b></span>
            <span style={{color:"var(--green)"}}>{best.ticker} +{_sf((best.pnlPct||0)*100,0)}%</span>
            <span style={{color:"var(--red)"}}>{worst.ticker} {_sf((worst.pnlPct||0)*100,0)}%</span>
          </div>);
        })()}
        {/* Allocation mini donut + Export */}
        {portfolioList.length>0 && (() => {
          const byCountry = {};
          (portfolioTotals.positions||[]).forEach(p => {
            const cc = getCountry(p.ticker, p.currency);
            byCountry[cc] = (byCountry[cc]||0) + (p.valueUSD||0);
          });
          const total = Object.values(byCountry).reduce((s,v)=>s+v,0) || 1;
          const slices = Object.entries(byCountry).sort((a,b)=>b[1]-a[1]).slice(0,8);
          const colors = ["#c8a44e","#30d158","#64d2ff","#ff9f0a","#bf5af2","#ff453a","#ffd60a","#86868b"];
          let cumPct = 0;
          const R = 40, CX = 50, CY = 50;
          const exportCSV = () => {
            const rows = [["Ticker","Nombre","Acciones","Precio","Coste","P&L%","Valor USD","Peso%","Div Anual"]];
            (portfolioTotals.positions||[]).forEach(p => {
              rows.push([p.ticker, p.name||"", p.shares||0, (p.lastPrice||0).toFixed(2),
                (p.adjustedBasis||p.avgCost||0).toFixed(2), ((p.pnlPct||0)*100).toFixed(1),
                (p.valueUSD||0).toFixed(0), ((p.weight||0)*100).toFixed(1), (p.divAnnualUSD||0).toFixed(0)]);
            });
            const csv = rows.map(r=>r.join(",")).join("\n");
            const blob = new Blob([csv], {type:"text/csv"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `ayr_portfolio_${new Date().toISOString().slice(0,10)}.csv`; a.click();
            URL.revokeObjectURL(url);
          };
          return (
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
            {/* Mini donut */}
            <svg viewBox="0 0 100 100" width="36" height="36" style={{flexShrink:0,cursor:"pointer"}} title="Distribución por país">
              {slices.map(([cc, val], i) => {
                const pct = val / total;
                const startAngle = cumPct * 360;
                const endAngle = (cumPct + pct) * 360;
                cumPct += pct;
                const s = (Math.PI/180) * (startAngle - 90);
                const e = (Math.PI/180) * (endAngle - 90);
                const large = pct > 0.5 ? 1 : 0;
                const x1 = CX + R * Math.cos(s), y1 = CY + R * Math.sin(s);
                const x2 = CX + R * Math.cos(e), y2 = CY + R * Math.sin(e);
                return <path key={cc} d={`M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z`} fill={colors[i%colors.length]} opacity=".85"/>;
              })}
              <circle cx={CX} cy={CY} r="22" fill="var(--bg)"/>
            </svg>
            {/* Compact legend — flags only */}
            <div style={{display:"flex",gap:4,flexWrap:"wrap",flex:1}}>
              {slices.map(([cc,val],i) => (
                <span key={cc} title={`${cc}: ${_sf((val/total)*100,0)}%`} style={{fontSize:9,fontFamily:"var(--fm)",color:"var(--text-tertiary)"}}>
                  <span style={{display:"inline-block",width:6,height:6,borderRadius:1,background:colors[i%colors.length],marginRight:2,verticalAlign:"middle"}}/>
                  {FLAGS[cc]||cc} {_sf((val/total)*100,0)}%
                </span>
              ))}
            </div>
            {/* Add ticker + Refresh + CSV — all in one */}
            <input type="text" placeholder="+ Ticker" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
              onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
              style={{padding:"5px 10px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",width:90}}
              onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            <button onClick={()=>refreshPrices(true)} disabled={pricesLoading}
              style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:pricesLoading?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:pricesLoading?"wait":"pointer",fontFamily:"var(--fm)"}}>
              {pricesLoading?"⏳":"🔄"}
            </button>
            <button onClick={exportCSV} title="Exportar CSV"
              style={{padding:"5px 8px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}
              onMouseEnter={e=>e.target.style.color="var(--gold)"} onMouseLeave={e=>e.target.style.color="var(--text-tertiary)"}>📥</button>
            <button onClick={()=>{
              const printWin = window.open('','','width=900,height=700');
              const rows = (portfolioTotals.positions||[]).map(p =>
                `<tr><td>${p.ticker}</td><td>${p.name||""}</td><td style="text-align:right">${(p.shares||0).toLocaleString()}</td><td style="text-align:right">$${(p.lastPrice||0).toFixed(2)}</td><td style="text-align:right">$${(p.valueUSD||0).toFixed(0)}</td><td style="text-align:right;color:${(p.pnlPct||0)>=0?"green":"red"}">${((p.pnlPct||0)*100).toFixed(1)}%</td><td style="text-align:right">${((p.weight||0)*100).toFixed(1)}%</td></tr>`
              ).join('');
              printWin.document.write(`<html><head><title>A&R Portfolio ${new Date().toISOString().slice(0,10)}</title><style>body{font-family:system-ui;font-size:11px}table{width:100%;border-collapse:collapse}th,td{padding:4px 8px;border-bottom:1px solid #eee}th{text-align:left;font-size:9px;color:#666}h1{font-size:16px}h2{font-size:12px;color:#666}</style></head><body><h1>A&R Portfolio Report</h1><h2>${new Date().toLocaleDateString('es-ES')} · ${(portfolioTotals.positions||[]).length} posiciones</h2><table><thead><tr><th>Ticker</th><th>Empresa</th><th style="text-align:right">Shares</th><th style="text-align:right">Precio</th><th style="text-align:right">Valor</th><th style="text-align:right">P&L</th><th style="text-align:right">Peso</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
              printWin.document.close();
              printWin.focus();
              setTimeout(()=>printWin.print(),300);
            }} title="Imprimir/PDF"
              style={{padding:"5px 8px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}
              onMouseEnter={e=>e.target.style.color="var(--gold)"} onMouseLeave={e=>e.target.style.color="var(--text-tertiary)"}>🖨</button>
          </div>);
        })()}
        {/* Country Flag Filter */}
        {portfolioList.length>0 && (() => {
          const countryCounts = {};
          portfolioTotals.positions?.forEach(p => {
            const cc = getCountry(p.ticker, p.currency);
            countryCounts[cc] = (countryCounts[cc] || 0) + 1;
          });
          const sorted = Object.entries(countryCounts).sort((a,b) => b[1] - a[1]);
          return (
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
            <button onClick={()=>setCountryFilter("")} style={{padding:"3px 8px",borderRadius:6,border:countryFilter===""?"2px solid var(--gold)":"1px solid var(--border)",background:countryFilter===""?"var(--gold-dim)":"transparent",color:countryFilter===""?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>🌍 {portfolioList.length}</button>
            {sorted.map(([cc, count]) => (
              <button key={cc} onClick={()=>setCountryFilter(countryFilter===cc?"":cc)} style={{padding:"3px 7px",borderRadius:6,border:countryFilter===cc?"2px solid var(--gold)":"1px solid var(--border)",background:countryFilter===cc?"var(--gold-dim)":"transparent",color:countryFilter===cc?"var(--gold)":"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{FLAGS[cc]||"🏳️"} {count}</button>
            ))}
          </div>);
        })()}
        {/* Search + Sort — one row */}
        {portfolioList.length>1 && (
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
            {portfolioList.length>5 && (
              <div style={{position:"relative",flex:1,maxWidth:220}}>
                <input ref={searchRef} type="text" placeholder="🔍 Buscar... (⌘K)" value={quickFilter} onChange={e=>setQuickFilter(e.target.value)}
                  style={{width:"100%",padding:"5px 10px",background:"rgba(255,255,255,.03)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)"}}
                  onFocus={e=>e.target.style.borderColor="rgba(200,164,78,.3)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                {quickFilter && <button onClick={()=>setQuickFilter("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:12}}>×</button>}
              </div>
            )}
            <div style={{display:"flex",gap:3,marginLeft:"auto"}}>
              {SORT_OPTIONS.map(s=>(
                <button key={s.id} onClick={()=>setListSort(s.id)}
                  style={{padding:"3px 7px",borderRadius:5,border:`1px solid ${listSort===s.id?"var(--gold)":"var(--border)"}`,background:listSort===s.id?"var(--gold-dim)":"transparent",color:listSort===s.id?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:listSort===s.id?700:500,cursor:"pointer",fontFamily:"var(--fm)"}}>
                  {s.lbl}
                </button>
              ))}
            </div>
          </div>
        )}
        {portfolioList.length===0 && <div style={{textAlign:"center",padding:60,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>💼</div>Portfolio vacío. Añade tu primera empresa arriba.</div>}
        {(() => {
          const all = portfolioTotals.positions || [];
          const filtered = all.filter(p => {
            if (countryFilter && getCountry(p.ticker, p.currency) !== countryFilter) return false;
            if (quickFilter) {
              const q = quickFilter.toLowerCase();
              return p.ticker.toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q);
            }
            return true;
          });
          const sorted = [...filtered].sort(SORT_OPTIONS.find(s=>s.id===listSort)?.fn || (()=>0));
          const isFiltered = quickFilter || countryFilter;
          return <>
            {/* Column headers */}
            <div style={{display:"grid",gridTemplateColumns:"28px 1fr 40px 70px 55px 55px 50px 50px 65px 55px 28px",gap:4,padding:"0 10px",marginBottom:2}}>
              <div/><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>EMPRESA</div>
              <div/><div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>PRECIO</div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>SHARES</div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>COSTE</div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>P&L</div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>PESO</div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>VALOR</div>
              <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>DIV</div>
              <div/>
            </div>
            {isFiltered && filtered.length !== all.length && (
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>
                Mostrando <span style={{color:"var(--gold)",fontWeight:700}}>{filtered.length}</span> de {all.length} posiciones
                {!filtered.length && quickFilter && <span style={{marginLeft:8}}>— sin resultados para "{quickFilter}"</span>}
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {sorted.map(p=><CompanyRow key={p.ticker} p={p} showPos={true} onOpen={openAnalysis}/>)}
            </div>
          </>;
        })()}

        {/* Heatmap */}
        {portfolioTotals.positions?.length > 0 && (() => {
          const pos = portfolioTotals.positions;
          const totalVal = pos.reduce((s,p)=>s+(p.valueUSD||0),0) || 1;
          return (
          <div style={{marginTop:8}}>
            <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>📊 Heatmap — tamaño = peso, color = P&L</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:2,borderRadius:10,overflow:"hidden"}}>
              {[...pos].sort((a,b)=>(b.valueUSD||0)-(a.valueUSD||0)).map(p => {
                const w = Math.max((p.valueUSD||0)/totalVal*100, 1.5);
                const pnl = (p.pnlPct||0)*100;
                const bg = pnl > 20 ? "#1a5c2a" : pnl > 5 ? "#1e4d2a" : pnl > 0 ? "#1a3d24" : pnl > -5 ? "#3d2020" : pnl > -20 ? "#4d2020" : "#5c1a1a";
                return (
                  <div key={p.ticker} onClick={()=>openAnalysis(p.ticker)} title={`${p.ticker}: ${_sf(pnl,1)}% · $${_sf(p.valueUSD||0,0)}`}
                    style={{width:`calc(${w}% - 2px)`,minWidth:40,padding:"4px 3px",background:bg,cursor:"pointer",textAlign:"center",transition:"all .15s",borderRadius:3}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{fontSize:8,fontWeight:700,color:"#fff",fontFamily:"var(--fm)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.ticker}</div>
                    <div style={{fontSize:9,fontWeight:600,color:pnl>=0?"#4ade80":"#f87171",fontFamily:"var(--fm)"}}>{pnl>=0?"+":""}{_sf(pnl,0)}%</div>
                  </div>
                );
              })}
            </div>
          </div>);
        })()}

        {/* Tools row */}
        {portfolioTotals.positions?.length > 0 && (
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
            <button onClick={()=>setShowCapTable(!showCapTable)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${showCapTable?"var(--gold)":"var(--border)"}`,background:showCapTable?"var(--gold-dim)":"transparent",color:showCapTable?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>📊 Market Cap</button>
            <button onClick={()=>setShowRebalance(!showRebalance)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${showRebalance?"var(--gold)":"var(--border)"}`,background:showRebalance?"var(--gold-dim)":"transparent",color:showRebalance?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>⚖️ Rebalanceo</button>
            <button onClick={()=>{setShowAlerts(!showAlerts);if(!showAlerts&&"Notification"in window)Notification.requestPermission();}} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${showAlerts?"var(--gold)":"var(--border)"}`,background:showAlerts?"var(--gold-dim)":"transparent",color:showAlerts?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>🔔 Alertas {alerts.length>0?`(${alerts.filter(a=>!a.fired).length})`:""}</button>
          </div>
        )}

        {/* Rebalance Tool */}
        {showRebalance && portfolioTotals.positions?.length > 0 && (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginTop:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:8}}>⚖️ Rebalanceo — Top 10 por desviación del peso ideal</div>
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:8}}>Peso ideal = 100% / {portfolioTotals.positions.length} posiciones = {_sf(100/portfolioTotals.positions.length,1)}% cada una</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Ticker","Peso actual","Peso ideal","Desviación","Acción","Importe"].map(h=>(
                    <th key={h} style={{padding:"4px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(() => {
                    const idealWeight = 1 / portfolioTotals.positions.length;
                    const totalVal = portfolioTotals.totalValueUSD;
                    return [...portfolioTotals.positions]
                      .map(p => ({...p, deviation: (p.weight||0) - idealWeight}))
                      .sort((a,b) => Math.abs(b.deviation) - Math.abs(a.deviation))
                      .slice(0,10)
                      .map(p => (
                        <tr key={p.ticker} style={{borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                          <td style={{padding:"4px 8px",fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{p.ticker}</td>
                          <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)"}}>{_sf((p.weight||0)*100,1)}%</td>
                          <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-tertiary)"}}>{_sf(idealWeight*100,1)}%</td>
                          <td style={{padding:"4px 8px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:p.deviation>0?"var(--red)":"var(--green)"}}>{p.deviation>0?"+":""}{_sf(p.deviation*100,1)}%</td>
                          <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",color:p.deviation>0?"var(--red)":"var(--green)",fontSize:10}}>{p.deviation>0?"VENDER":"COMPRAR"}</td>
                          <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"var(--fm)",fontWeight:600}}>{privacyMode?"•••":"$"+_sf(Math.abs(p.deviation)*totalVal,0)}</td>
                        </tr>
                      ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Price Alerts */}
        {showAlerts && (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginTop:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)",marginBottom:8}}>🔔 Alertas de Precio</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
              <select value={alertForm.ticker} onChange={e=>setAlertForm({...alertForm,ticker:e.target.value})}
                style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none"}}>
                <option value="">Ticker...</option>
                {(portfolioTotals.positions||[]).map(p=><option key={p.ticker} value={p.ticker}>{p.ticker} (${_sf(p.lastPrice,2)})</option>)}
              </select>
              <select value={alertForm.direction} onChange={e=>setAlertForm({...alertForm,direction:e.target.value})}
                style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none"}}>
                <option value="below">≤ Baja a</option>
                <option value="above">≥ Sube a</option>
              </select>
              <input type="number" placeholder="$" value={alertForm.price} onChange={e=>setAlertForm({...alertForm,price:e.target.value})}
                style={{padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)",outline:"none",width:70}}/>
              <button onClick={()=>{if(alertForm.ticker&&alertForm.price){saveAlerts([...alerts,{...alertForm,price:parseFloat(alertForm.price),fired:false,created:new Date().toISOString()}]);setAlertForm({ticker:"",price:"",direction:"below"});}}}
                style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Crear</button>
            </div>
            {alerts.length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {alerts.map((a,i) => (
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:a.fired?"rgba(48,209,88,.06)":"rgba(255,255,255,.02)",borderRadius:6,fontSize:10,fontFamily:"var(--fm)"}}>
                    <span><b style={{color:"var(--gold)"}}>{a.ticker}</b> {a.direction==="below"?"≤":"≥"} <b>${a.price}</b></span>
                    <span>{a.fired ? <span style={{color:"var(--green)"}}>✅ Disparada</span> : <span style={{color:"var(--text-tertiary)"}}>Pendiente</span>}</span>
                    <button onClick={()=>saveAlerts(alerts.filter((_,j)=>j!==i))} style={{border:"none",background:"transparent",color:"var(--text-tertiary)",cursor:"pointer",fontSize:10}}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Market Cap Index — Sortable Table */}
        {portfolioTotals.positions?.length > 0 && showCapTable && (
          <div style={{marginTop:8}}>
            {(() => {
              const capLabel = mc => {
                const v = (mc||0)*1e9;
                return v>=200e9?"MEGA":v>=10e9?"LC":v>=2e9?"MC":v>=300e6?"SC":v>0?"μC":"—";
              };
              const capColor = mc => {
                const v = (mc||0)*1e9;
                return v>=200e9?"#64d2ff":v>=10e9?"#30d158":v>=2e9?"#ffd60a":v>=300e6?"#ff9f0a":v>0?"#ff453a":"#555";
              };
              const cols = [
                {id:"ticker",l:"TICKER",w:"70px",align:"left"},
                {id:"name",l:"EMPRESA",w:"1fr",align:"left"},
                {id:"cap",l:"TIPO",w:"55px",align:"center"},
                {id:"mc",l:"MKT CAP",w:"80px",align:"right"},
                {id:"value",l:"VALOR",w:"80px",align:"right"},
                {id:"weight",l:"PESO",w:"55px",align:"right"},
                {id:"pnl",l:"P&L",w:"60px",align:"right"},
              ];
              const sorted = [...(portfolioTotals.positions||[])].sort((a,b) => {
                const s = portSort.col;
                let va, vb;
                if (s==="ticker") { va=a.ticker; vb=b.ticker; }
                else if (s==="name") { va=a.name||a.ticker; vb=b.name||b.ticker; }
                else if (s==="cap") { va=(a.mc||0); vb=(b.mc||0); }
                else if (s==="mc") { va=(a.mc||0); vb=(b.mc||0); }
                else if (s==="value") { va=(a.valueUSD||0); vb=(b.valueUSD||0); }
                else if (s==="weight") { va=(a.weight||0); vb=(b.weight||0); }
                else if (s==="pnl") { va=(a.pnlPct||0); vb=(b.pnlPct||0); }
                else { va=0; vb=0; }
                const cmp = typeof va==="string" ? va.localeCompare(vb) : va-vb;
                return portSort.asc ? cmp : -cmp;
              });
              const toggleSort = col => setPortSort(prev => ({col, asc: prev.col===col ? !prev.asc : false}));
              return (
              <div style={{overflowX:"auto",background:"var(--card)",border:"1px solid var(--border)",borderRadius:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr>
                    {cols.map(c=>(
                      <th key={c.id} onClick={()=>toggleSort(c.id)} style={{padding:"8px 10px",textAlign:c.align,color:portSort.col===c.id?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.5,cursor:"pointer",borderBottom:"2px solid #21262d",whiteSpace:"nowrap",userSelect:"none"}}>
                        {c.l} {portSort.col===c.id?(portSort.asc?"▲":"▼"):""}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>{sorted.map(p=>{
                    const mc = p.mc||0;
                    return (
                      <tr key={p.ticker} style={{borderBottom:"1px solid #15191f",cursor:"pointer"}} onClick={()=>openAnalysis(p.ticker)}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"6px 10px",fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{p.ticker}</td>
                        <td style={{padding:"6px 10px",color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{p.name||p.ticker}</td>
                        <td style={{padding:"6px 10px",textAlign:"center"}}><span style={{fontSize:7,fontWeight:700,padding:"2px 5px",borderRadius:3,background:`${capColor(mc)}15`,color:capColor(mc)}}>{p.cat==="ETF"?"ETF":p.cat==="REIT"?"REIT":capLabel(mc)}</span></td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{mc>=1000?`$${_sf(mc/1000,0)}T`:mc>0?`$${_sf(mc,0)}B`:"—"}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${fDol(p.valueUSD||0)}</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{_sf((p.weight||0)*100,1)}%</td>
                        <td style={{padding:"6px 10px",textAlign:"right",color:(p.pnlPct||0)>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{(p.pnlPct||0)>=0?"+":""}{_sf((p.pnlPct||0)*100,1)}%</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>);
            })()}
          </div>
        )}
      </div>
  );
}
