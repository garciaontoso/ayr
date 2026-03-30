import { useState, useRef, useEffect } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';

const SORT_OPTIONS = [
  {id:"name",lbl:"A-Z",fn:(a,b)=>(a.name||a.ticker).localeCompare(b.name||b.ticker)},
  {id:"value",lbl:"Valor",fn:(a,b)=>(b.valueUSD||0)-(a.valueUSD||0)},
  {id:"pnl",lbl:"P&L%",fn:(a,b)=>(b.pnlPct||0)-(a.pnlPct||0)},
  {id:"weight",lbl:"Peso",fn:(a,b)=>(b.weight||0)-(a.weight||0)},
  {id:"div",lbl:"Div",fn:(a,b)=>(b.divAnnualUSD||0)-(a.divAnnualUSD||0)},
  {id:"price",lbl:"Precio",fn:(a,b)=>(b.priceUSD||0)-(a.priceUSD||0)},
];

export default function PortfolioTab() {
  const [quickFilter, setQuickFilter] = useState("");
  const [listSort, setListSort] = useState("value");
  const searchRef = useRef(null);

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
  const {
    portfolioList, portfolioTotals, portfolioComputed,
    searchTicker, setSearchTicker, updatePosition,
    countryFilter, setCountryFilter, portSort, setPortSort, showCapTable, setShowCapTable,
    pricesLoading, pricesLastUpdate, refreshPrices,
    displayCcy, privacyMode, hide,
    openAnalysis, getCountry, FLAGS, POS_STATIC, CompanyRow,
  } = useHome();

  return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Summary Cards */}
        {portfolioList.length>0 && (
          <div className="ar-summary-cards" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:8}}>
            {[
              {l:"VALOR",vUSD:hide("$"+fDol(portfolioTotals.totalValueUSD)),vEUR:hide("€"+fDol(portfolioTotals.totalValueEUR)),c:"var(--text-primary)"},
              {l:"COSTE",vUSD:hide("$"+fDol(portfolioTotals.totalCostUSD)),vEUR:hide("€"+fDol(portfolioTotals.totalCostEUR)),c:"var(--text-secondary)"},
              {l:"P&L",vUSD:hide((portfolioTotals.pnlUSD>=0?"+$":"-$")+fDol(Math.abs(portfolioTotals.pnlUSD))),vEUR:hide((portfolioTotals.pnlEUR>=0?"+€":"-€")+fDol(Math.abs(portfolioTotals.pnlEUR))),c:portfolioTotals.pnlUSD>=0?"var(--green)":"var(--red)",sub:privacyMode?"•••":_sf(portfolioTotals.pnlPctUSD*100,1)+"%"},
              {l:"DIVIDENDO",vUSD:hide("$"+fDol(portfolioTotals.totalDivUSD)),vEUR:hide("€"+fDol(portfolioTotals.totalDivEUR)),c:"var(--gold)",sub:privacyMode?"•••":"YOC "+_sf(portfolioTotals.yocUSD*100,1)+"%"},
            ].map((m,i)=>(
              <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 14px"}}>
                <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",letterSpacing:.5}}>{m.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:m.c,fontFamily:"var(--fm)",marginTop:3}}>{displayCcy==="EUR"?m.vEUR:m.vUSD}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}>
                  <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{displayCcy==="EUR"?m.vUSD:m.vEUR}</span>
                  {m.sub && <span style={{fontSize:10,fontWeight:600,color:m.c,fontFamily:"var(--fm)",opacity:.7}}>{m.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Quick stats row */}
        {portfolioList.length>0 && (() => {
          const pos = portfolioTotals.positions || [];
          if (!pos.length) return null;
          const countries = new Set(pos.map(p => getCountry(p.ticker, p.currency))).size;
          const best = pos.reduce((a,b) => (b.pnlPct||0) > (a.pnlPct||0) ? b : a, pos[0]);
          const worst = pos.reduce((a,b) => (b.pnlPct||0) < (a.pnlPct||0) ? b : a, pos[0]);
          const top3Weight = [...pos].sort((a,b)=>(b.weight||0)-(a.weight||0)).slice(0,3).reduce((s,p)=>s+(p.weight||0),0);
          const greenCount = pos.filter(p=>(p.pnlPct||0)>=0).length;
          return (
          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:8}}>
            {[
              {l:"Posiciones",v:pos.length,c:"var(--text-primary)"},
              {l:"Países",v:countries,c:"#64d2ff"},
              {l:"Yield",v:_sf(portfolioTotals.yieldUSD*100,1)+"%",c:"var(--gold)"},
              {l:"Verdes",v:`${greenCount}/${pos.length}`,c:"var(--green)"},
              {l:"Top 3",v:_sf(top3Weight*100,0)+"%",c:"var(--text-secondary)"},
              {l:"Mejor",v:`${best.ticker} +${_sf((best.pnlPct||0)*100,0)}%`,c:"var(--green)"},
              {l:"Peor",v:`${worst.ticker} ${_sf((worst.pnlPct||0)*100,0)}%`,c:"var(--red)"},
            ].map((s,i)=>(
              <div key={i} style={{fontSize:10,fontFamily:"var(--fm)"}}>
                <span style={{color:"var(--text-tertiary)"}}>{s.l}: </span>
                <span style={{color:s.c,fontWeight:600}}>{s.v}</span>
              </div>
            ))}
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
          <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
            {/* Mini donut */}
            <svg viewBox="0 0 100 100" width="64" height="64" style={{flexShrink:0}}>
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
              <text x={CX} y={CY+4} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-primary)" fontFamily="var(--fm)">{slices.length}</text>
            </svg>
            {/* Legend */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",flex:1}}>
              {slices.map(([cc,val],i) => (
                <div key={cc} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>
                  <div style={{width:8,height:8,borderRadius:2,background:colors[i%colors.length],flexShrink:0}}/>
                  <span style={{fontSize:16}}>{FLAGS[cc]||"🏳️"}</span> {_sf((val/total)*100,0)}%
                </div>
              ))}
            </div>
            {/* Export CSV */}
            <button onClick={exportCSV} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",flexShrink:0,transition:"all .15s"}}
              onMouseEnter={e=>{e.target.style.borderColor="var(--gold)";e.target.style.color="var(--gold)";}}
              onMouseLeave={e=>{e.target.style.borderColor="var(--border)";e.target.style.color="var(--text-tertiary)";}}>
              📥 CSV
            </button>
          </div>);
        })()}
        {/* Add company + Refresh prices */}
        <div className="ar-actions-bar" style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
          <input type="text" placeholder="Ticker (ej: AAPL)" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
            onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
            style={{padding:"10px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:12,color:"var(--text-primary)",fontSize:14,outline:"none",fontFamily:"var(--fm)",width:160}}
            onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
          <button onClick={()=>{if(searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
            style={{padding:"10px 20px",borderRadius:12,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Añadir</button>
          <button onClick={()=>refreshPrices(true)} disabled={pricesLoading}
            style={{padding:"10px 16px",borderRadius:12,border:"1px solid var(--border)",background:pricesLoading?"rgba(201,169,80,.1)":"transparent",color:pricesLoading?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:600,cursor:pricesLoading?"wait":"pointer",fontFamily:"var(--fm)",marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
            <span style={{display:"inline-block",animation:pricesLoading?"spin 1s linear infinite":"none"}}>🔄</span> {pricesLoading?"Actualizando...":"Refresh Precios"}
          </button>
          {pricesLastUpdate && <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Precios: {new Date(pricesLastUpdate).toLocaleString()}</span>}
        </div>
        {/* Country Flag Filter */}
        {portfolioList.length>0 && (() => {
          const countryCounts = {};
          portfolioTotals.positions?.forEach(p => {
            const cc = getCountry(p.ticker, p.currency);
            countryCounts[cc] = (countryCounts[cc] || 0) + 1;
          });
          const sorted = Object.entries(countryCounts).sort((a,b) => b[1] - a[1]);
          return (
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
            <button onClick={()=>setCountryFilter("")} style={{padding:"5px 10px",borderRadius:8,border:countryFilter===""?"2px solid var(--gold)":"1px solid var(--border)",background:countryFilter===""?"var(--gold-dim)":"transparent",color:countryFilter===""?"var(--gold)":"var(--text-tertiary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>🌍 {portfolioList.length}</button>
            {sorted.map(([cc, count]) => (
              <button key={cc} onClick={()=>setCountryFilter(countryFilter===cc?"":cc)} style={{padding:"5px 10px",borderRadius:8,border:countryFilter===cc?"2px solid var(--gold)":"1px solid var(--border)",background:countryFilter===cc?"var(--gold-dim)":"transparent",color:countryFilter===cc?"var(--gold)":"var(--text-secondary)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}><span style={{fontSize:18,lineHeight:1,verticalAlign:"middle"}}>{FLAGS[cc]||"🏳️"}</span> <span style={{fontSize:11}}>{count}</span></button>
            ))}
          </div>);
        })()}
        {/* Quick filter + Company List */}
        {portfolioList.length>5 && (
          <div style={{position:"relative",marginBottom:4}}>
            <input ref={searchRef} type="text" placeholder="🔍 Buscar ticker o empresa... (⌘K)" value={quickFilter} onChange={e=>setQuickFilter(e.target.value)}
              style={{width:"100%",padding:"8px 14px 8px 14px",background:"rgba(255,255,255,.03)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:12,outline:"none",fontFamily:"var(--fm)",transition:"border-color .2s"}}
              onFocus={e=>e.target.style.borderColor="rgba(200,164,78,.3)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            {quickFilter && <button onClick={()=>setQuickFilter("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:14}}>×</button>}
          </div>
        )}
        {/* Sort buttons */}
        {portfolioList.length>1 && (
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginRight:4}}>Ordenar:</span>
            {SORT_OPTIONS.map(s=>(
              <button key={s.id} onClick={()=>setListSort(s.id)}
                style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${listSort===s.id?"var(--gold)":"var(--border)"}`,background:listSort===s.id?"var(--gold-dim)":"transparent",color:listSort===s.id?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:listSort===s.id?700:500,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"}}>
                {s.lbl}
              </button>
            ))}
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
            {isFiltered && filtered.length !== all.length && (
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>
                Mostrando <span style={{color:"var(--gold)",fontWeight:700}}>{filtered.length}</span> de {all.length} posiciones
                {!filtered.length && quickFilter && <span style={{marginLeft:8}}>— sin resultados para "{quickFilter}"</span>}
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {sorted.map(p=><CompanyRow key={p.ticker} p={p} showPos={true} onOpen={openAnalysis}/>)}
            </div>
          </>;
        })()}

        {/* Market Cap Index — Sortable Table */}
        {portfolioTotals.positions?.length > 0 && (
          <div style={{marginTop:16}}>
            <button onClick={()=>setShowCapTable(!showCapTable)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,border:"1px solid var(--border)",background:showCapTable?"var(--gold-dim)":"transparent",color:showCapTable?"var(--gold)":"var(--text-tertiary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",marginBottom:showCapTable?12:0}}>
              📊 {showCapTable?"Ocultar":"Mostrar"} Índice Market Cap
            </button>
            {showCapTable && (() => {
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
