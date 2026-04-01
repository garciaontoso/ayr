import { useState, useRef, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { EmptyState, LoadingSkeleton } from '../ui/EmptyState.jsx';
import DividendView from './portfolio/DividendView.jsx';
import TreemapView from './portfolio/TreemapView.jsx';
import BubbleView from './portfolio/BubbleView.jsx';
import SectorView from './portfolio/SectorView.jsx';
import PerformanceView from './portfolio/PerformanceView.jsx';

const VIEW_MODES = [
  { id: "tabla", lbl: "Tabla", icon: "≡" },
  { id: "dividendos", lbl: "Dividendos", icon: "$" },
  { id: "mapa", lbl: "Mapa", icon: "▦" },
  { id: "burbujas", lbl: "Burbujas", icon: "◉" },
  { id: "sectores", lbl: "Sectores", icon: "◔" },
  { id: "rendimiento", lbl: "Rendimiento", icon: "▲" },
];
const VIEW_STORAGE_KEY = "ayr_portfolio_view";

const ALERTS_KEY = "ayr_price_alerts";

const SECTOR_COLORS = {
  "Technology":"#3b82f6","Information Technology":"#3b82f6","Tech":"#3b82f6",
  "Real Estate":"#a855f7","REIT":"#a855f7",
  "Financial Services":"#22c55e","Financials":"#22c55e","Finance":"#22c55e",
  "Healthcare":"#06b6d4",
  "Consumer Cyclical":"#f97316","Consumer Defensive":"#fb923c","Consumer Staples":"#fb923c","Consumer Discretionary":"#f97316",
  "Energy":"#ef4444",
  "Industrials":"#eab308",
  "Communication Services":"#ec4899","Communication":"#ec4899",
  "Utilities":"#14b8a6",
  "Basic Materials":"#a78bfa","Materials":"#a78bfa",
};
const getSectorColor = (sector) => {
  if (!sector || sector === "—") return null;
  return SECTOR_COLORS[sector] || "#6b7280";
};

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
    ibData,
    setHomeTab,
  } = useHome();

  const [portfolioView, setPortfolioView] = useState(() => {
    try { return localStorage.getItem(VIEW_STORAGE_KEY) || "tabla"; } catch { return "tabla"; }
  });
  const changeView = useCallback((v) => { setPortfolioView(v); try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch {} }, []);

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
  }, [portfolioTotals?.positions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty portfolio state
  if (!portfolioList || portfolioList.length === 0) {
    return pricesLoading
      ? <LoadingSkeleton rows={6} cards={4} message="Cargando portfolio..." />
      : <EmptyState
          icon="📂"
          title="Tu portfolio esta vacio"
          subtitle="Anade posiciones para empezar a hacer seguimiento de tu cartera de inversiones."
          action="Sincronizar IB"
          onAction={() => {/* trigger IB sync if available */}}
        />;
  }

  return (
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {/* IB-style live header */}
        {portfolioList.length>0 && (() => {
          const nlv = ibData?.summary?.nlv?.amount || portfolioTotals.totalValueUSD;
          const totalPnl = ibData?.loaded
            ? (ibData.positions||[]).filter(p=>p.assetClass==="STK").reduce((s,p)=>s+(p.unrealizedPnl||0),0)
            : portfolioTotals.pnlUSD;
          const costTotal = ibData?.loaded
            ? (ibData.positions||[]).filter(p=>p.assetClass==="STK").reduce((s,p)=>s+((p.avgCost||0)*(p.shares||0)),0)
            : portfolioTotals.totalCostUSD;
          const pnlPct = costTotal > 0 ? (totalPnl / costTotal * 100) : (portfolioTotals.pnlPctUSD * 100);
          const lastSync = ibData?.lastSync ? new Date(ibData.lastSync).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "";
          const isLive = ibData?.loaded;

          return (
          <div style={{display:"flex",gap:12,padding:"6px 0",flexWrap:"wrap",alignItems:"center"}}>
            {/* NLV */}
            <div style={{fontFamily:"var(--fm)"}}>
              <span style={{fontSize:9,color:"var(--text-tertiary)"}}>NLV </span>
              <span style={{fontSize:20,fontWeight:700,color:"var(--text-primary)"}}>{hide("$"+fDol(nlv))}</span>
            </div>
            {/* Total P&L */}
            <div style={{fontFamily:"var(--fm)"}}>
              <span style={{fontSize:9,color:"var(--text-tertiary)"}}>P&L </span>
              <span style={{fontSize:16,fontWeight:700,color:totalPnl>=0?"var(--green)":"var(--red)"}}>{hide((totalPnl>=0?"+":"")+fDol(totalPnl))}</span>
              <span style={{fontSize:10,color:totalPnl>=0?"var(--green)":"var(--red)",marginLeft:4,opacity:.7}}>{pnlPct>=0?"+":""}{_sf(pnlPct,1)}%</span>
            </div>
            {/* Dividends */}
            <div style={{fontFamily:"var(--fm)"}}>
              <span style={{fontSize:9,color:"var(--text-tertiary)"}}>Div </span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--gold)"}}>{hide("$"+fDol(portfolioTotals.totalDivUSD))}</span>
              <span style={{fontSize:9,color:"var(--gold)",marginLeft:3,opacity:.6}}>YOC {_sf(portfolioTotals.yocUSD*100,1)}%</span>
            </div>
            {/* Monthly dividend income — click to go to Mi Nomina */}
            <div onClick={()=>setHomeTab("nomina")} style={{fontFamily:"var(--fm)",cursor:"pointer",padding:"2px 8px",borderRadius:6,background:"var(--gold-dim)",border:"1px solid var(--gold)",opacity:.85,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.85} title="Ver Mi Nomina">
              <span style={{fontSize:13,fontWeight:700,color:"var(--gold)"}}>{"💸"} {hide("$"+fDol(portfolioTotals.totalDivUSD/12))}/mes</span>
            </div>
            {/* Live indicator */}
            {isLive && (
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,fontSize:9,fontFamily:"var(--fm)",color:"var(--green)"}}>
                <span style={{width:6,height:6,borderRadius:3,background:"var(--green)",display:"inline-block",animation:"pulse 2s infinite"}}/>
                LIVE {lastSync}
              </div>
            )}
          </div>);
        })()}
        {/* Controls bar: country filter (clickable flags) + stats + actions — ONE line */}
        {portfolioList.length>0 && (() => {
          const pos = portfolioTotals.positions || [];
          const greenCount = pos.filter(p=>(p.pnlPct||0)>=0).length;
          const countryCounts = {};
          pos.forEach(p => { const cc = getCountry(p.ticker, p.currency); countryCounts[cc] = (countryCounts[cc]||0) + 1; });
          const sorted = Object.entries(countryCounts).sort((a,b) => b[1] - a[1]);
          const exportCSV = () => {
            const rows = [["Ticker","Nombre","Acciones","Precio","Coste","P&L%","Valor USD","Peso%","Div Anual"]];
            pos.forEach(p => { rows.push([p.ticker,p.name||"",p.shares||0,(p.lastPrice||0).toFixed(2),(p.adjustedBasis||p.avgCost||0).toFixed(2),((p.pnlPct||0)*100).toFixed(1),(p.valueUSD||0).toFixed(0),((p.weight||0)*100).toFixed(1),(p.divAnnualUSD||0).toFixed(0)]); });
            const csv = rows.map(r=>r.join(",")).join("\n");
            const blob = new Blob([csv],{type:"text/csv"}); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`ayr_portfolio_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
          };
          return (
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
            {/* Country filter buttons (replaces donut + separate filter row) */}
            <button onClick={()=>setCountryFilter("")} style={{padding:"2px 6px",borderRadius:5,border:countryFilter===""?"1.5px solid var(--gold)":"1px solid var(--border)",background:countryFilter===""?"var(--gold-dim)":"transparent",color:countryFilter===""?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{pos.length}</button>
            {sorted.map(([cc, count]) => (
              <button key={cc} onClick={()=>setCountryFilter(countryFilter===cc?"":cc)} style={{padding:"2px 5px",borderRadius:5,border:countryFilter===cc?"1.5px solid var(--gold)":"1px solid var(--border)",background:countryFilter===cc?"var(--gold-dim)":"transparent",color:countryFilter===cc?"var(--gold)":"var(--text-tertiary)",fontSize:10,cursor:"pointer",fontFamily:"var(--fm)"}}>{FLAGS[cc]||cc}{count}</button>
            ))}
            {/* Quick stats inline */}
            <span style={{fontSize:9,fontFamily:"var(--fm)",color:"var(--text-tertiary)",marginLeft:4}}>Yield <b style={{color:"var(--gold)"}}>{_sf(portfolioTotals.yieldUSD*100,1)}%</b></span>
            <span style={{fontSize:9,fontFamily:"var(--fm)",color:"var(--green)"}}>{greenCount}✓</span>
            {/* Spacer + actions */}
            <div style={{marginLeft:"auto",display:"flex",gap:3,alignItems:"center"}}>
              <input type="text" placeholder="+ Ticker" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
                onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"portfolio",shares:0,avgCost:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
                style={{padding:"4px 8px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text-primary)",fontSize:10,outline:"none",fontFamily:"var(--fm)",width:70}}/>
              <button onClick={()=>refreshPrices(true)} disabled={pricesLoading} title="Refresh precios"
                style={{padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:pricesLoading?"var(--gold)":"var(--text-tertiary)",fontSize:10,cursor:pricesLoading?"wait":"pointer"}}>{pricesLoading?"⏳":"🔄"}</button>
              <button onClick={exportCSV} title="CSV" style={{padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="var(--gold)"} onMouseLeave={e=>e.target.style.color="var(--text-tertiary)"}>📥</button>
              <button onClick={()=>{
                const pw=window.open('','','width=900,height=700');const r=pos.map(p=>`<tr><td>${p.ticker}</td><td>${p.name||""}</td><td style="text-align:right">${(p.shares||0).toLocaleString()}</td><td style="text-align:right">$${(p.lastPrice||0).toFixed(2)}</td><td style="text-align:right">$${(p.valueUSD||0).toFixed(0)}</td><td style="text-align:right;color:${(p.pnlPct||0)>=0?"green":"red"}">${((p.pnlPct||0)*100).toFixed(1)}%</td><td style="text-align:right">${((p.weight||0)*100).toFixed(1)}%</td></tr>`).join('');
                pw.document.write(`<html><head><title>A&R Portfolio</title><style>body{font-family:system-ui;font-size:11px}table{width:100%;border-collapse:collapse}th,td{padding:4px 8px;border-bottom:1px solid #eee}th{text-align:left;font-size:9px;color:#666}</style></head><body><h2>A&R Portfolio · ${new Date().toLocaleDateString('es-ES')} · ${pos.length} pos.</h2><table><thead><tr><th>Ticker</th><th>Empresa</th><th style="text-align:right">Shares</th><th style="text-align:right">Precio</th><th style="text-align:right">Valor</th><th style="text-align:right">P&L</th><th style="text-align:right">Peso</th></tr></thead><tbody>${r}</tbody></table></body></html>`);
                pw.document.close();pw.focus();setTimeout(()=>pw.print(),300);
              }} title="Print/PDF" style={{padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:10,cursor:"pointer"}} onMouseEnter={e=>e.target.style.color="var(--gold)"} onMouseLeave={e=>e.target.style.color="var(--text-tertiary)"}>🖨</button>
            </div>
          </div>);
        })()}
        {/* Search + Sort — one row */}
        {portfolioList.length>1 && (
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
            {portfolioList.length>5 && (
              <div style={{position:"relative",flex:1,maxWidth:220}}>
                <input ref={searchRef} type="text" placeholder="🔍 Buscar... (⌘K)" value={quickFilter} onChange={e=>setQuickFilter(e.target.value)}
                  style={{width:"100%",padding:"5px 10px",background:"var(--subtle-bg)",border:"1px solid var(--border)",borderRadius:7,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)"}}
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
        {/* View Mode Selector */}
        {portfolioList.length > 0 && (
          <div style={{display:"flex",gap:3,padding:"4px 0",marginBottom:2,alignItems:"center"}}>
            {VIEW_MODES.map(v=>(
              <button key={v.id} onClick={()=>changeView(v.id)}
                style={{
                  padding:"4px 10px",borderRadius:6,border:`1px solid ${portfolioView===v.id?"var(--gold)":"var(--border)"}`,
                  background:portfolioView===v.id?"var(--gold-dim)":"transparent",
                  color:portfolioView===v.id?"var(--gold)":"var(--text-tertiary)",
                  fontSize:10,fontWeight:portfolioView===v.id?700:500,cursor:"pointer",fontFamily:"var(--fm)",
                  transition:"all .15s",display:"flex",alignItems:"center",gap:4,
                }}
                onMouseEnter={e=>{if(portfolioView!==v.id)e.currentTarget.style.borderColor="rgba(200,164,78,.3)";}}
                onMouseLeave={e=>{if(portfolioView!==v.id)e.currentTarget.style.borderColor="var(--border)";}}>
                <span style={{fontSize:11,lineHeight:1}}>{v.icon}</span>
                <span className="ar-hide-mobile">{v.lbl}</span>
              </button>
            ))}
          </div>
        )}

        {portfolioList.length===0 && <div style={{textAlign:"center",padding:60,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>💼</div>Portfolio vacío. Añade tu primera empresa arriba.</div>}

        {/* Non-table views */}
        {portfolioView === "dividendos" && portfolioTotals.positions?.length > 0 && (
          <DividendView positions={portfolioTotals.positions} openAnalysis={openAnalysis} hide={hide} POS_STATIC={POS_STATIC} />
        )}
        {portfolioView === "mapa" && portfolioTotals.positions?.length > 0 && (
          <TreemapView positions={portfolioTotals.positions} openAnalysis={openAnalysis} hide={hide} />
        )}
        {portfolioView === "burbujas" && portfolioTotals.positions?.length > 0 && (
          <BubbleView positions={portfolioTotals.positions} openAnalysis={openAnalysis} hide={hide} />
        )}
        {portfolioView === "sectores" && portfolioTotals.positions?.length > 0 && (
          <SectorView positions={portfolioTotals.positions} openAnalysis={openAnalysis} hide={hide} />
        )}
        {portfolioView === "rendimiento" && portfolioTotals.positions?.length > 0 && (
          <PerformanceView positions={portfolioTotals.positions} openAnalysis={openAnalysis} hide={hide} />
        )}

        {/* Table view (default) */}
        {portfolioView === "tabla" && (() => {
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
            <div className="ar-company-row" style={{display:"grid",gridTemplateColumns:"24px 1fr 65px 48px 45px 50px 50px 45px 40px 58px 45px 24px",gap:2,padding:"0 6px",marginBottom:1}}>
              <div/><div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>EMPRESA</div>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>PRECIO</div>
              <div className="ar-hide-mobile" style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>CHG$</div>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>CHG%</div>
              <div className="ar-hide-mobile" style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>SHARES</div>
              <div className="ar-hide-mobile" style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>COSTE</div>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>P&L</div>
              <div className="ar-hide-mobile" style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>PESO</div>
              <div style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>VALOR</div>
              <div className="ar-hide-mobile" style={{fontSize:7,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textAlign:"right"}}>DIV</div>
              <div/>
            </div>
            {isFiltered && filtered.length !== all.length && (
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:4}}>
                Mostrando <span style={{color:"var(--gold)",fontWeight:700}}>{filtered.length}</span> de {all.length} posiciones
                {!filtered.length && quickFilter && <span style={{marginLeft:8}}>— sin resultados para "{quickFilter}"</span>}
              </div>
            )}
            <div className="ar-portfolio-rows" style={{display:"flex",flexDirection:"column",gap:2}}>
              {sorted.map(p=>{
                const weightPct = Math.min((p.weight||0)*100, 100);
                const pnl = p.pnlPct||0;
                const pnlColor = pnl > 0.001 ? "var(--green)" : pnl < -0.001 ? "var(--red)" : "var(--gold)";
                const sectorColor = getSectorColor(p.sector);
                return (
                  <div key={p.ticker} style={{position:"relative",overflow:"hidden",borderRadius:6}}>
                    {/* Weight background bar */}
                    <div style={{
                      position:"absolute",top:0,left:0,bottom:0,
                      width:`${weightPct}%`,
                      background:"linear-gradient(90deg, rgba(200,164,78,0.04), transparent)",
                      pointerEvents:"none",zIndex:0,
                    }}/>
                    {/* P&L color bar — left edge */}
                    <div style={{
                      position:"absolute",top:1,left:0,bottom:1,
                      width:3,borderRadius:"2px 0 0 2px",
                      background:pnlColor,opacity:0.55,
                      pointerEvents:"none",zIndex:1,
                    }}/>
                    {/* Sector indicator — bottom accent line */}
                    {sectorColor && (
                      <div title={p.sector} style={{
                        position:"absolute",bottom:0,left:4,right:4,
                        height:2,borderRadius:"0 0 3px 3px",
                        background:`linear-gradient(90deg, ${sectorColor}55, transparent)`,
                        pointerEvents:"none",zIndex:2,
                      }}/>
                    )}
                    <div style={{position:"relative",zIndex:1}}>
                      <CompanyRow p={p} showPos={true} onOpen={openAnalysis}/>
                    </div>
                  </div>
                );
              })}
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
            <div style={{display:"flex",flexWrap:"wrap",gap:3,borderRadius:12,overflow:"hidden"}}>
              {[...pos].sort((a,b)=>(b.valueUSD||0)-(a.valueUSD||0)).map(p => {
                const w = Math.max((p.valueUSD||0)/totalVal*100, 2.5);
                const pnl = (p.pnlPct||0)*100;
                const isLight = document.documentElement.getAttribute("data-theme") === "light";
                const bg = isLight
                  ? (pnl > 20 ? "#bbf7d0" : pnl > 5 ? "#d1fae5" : pnl > 0 ? "#ecfdf5" : pnl > -5 ? "#fee2e2" : pnl > -20 ? "#fecaca" : "#fca5a5")
                  : (pnl > 20 ? "#1a5c2a" : pnl > 5 ? "#1e4d2a" : pnl > 0 ? "#1a3d24" : pnl > -5 ? "#3d2020" : pnl > -20 ? "#4d2020" : "#5c1a1a");
                const isLarge = w > 5;
                return (
                  <div key={p.ticker} onClick={()=>openAnalysis(p.ticker)} title={`${p.ticker}: ${_sf(pnl,1)}% · $${_sf(p.valueUSD||0,0)}`}
                    style={{width:`calc(${w}% - 3px)`,minWidth:55,minHeight:isLarge?70:50,padding:"8px 6px",background:bg,cursor:"pointer",textAlign:"center",transition:"all .15s",borderRadius:6,display:"flex",flexDirection:"column",justifyContent:"center",gap:2}}
                    onMouseEnter={e=>{e.currentTarget.style.opacity=".8";e.currentTarget.style.transform="scale(1.02)";}} onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="scale(1)";}}>
                    <div style={{fontSize:isLarge?13:10,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.ticker}</div>
                    <div style={{fontSize:isLarge?14:11,fontWeight:700,color:pnl>=0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{pnl>=0?"+":""}{_sf(pnl,0)}%</div>
                    {isLarge && <div style={{fontSize:9,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>${_sf((p.valueUSD||0)/1000,1)}K</div>}
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
            <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginBottom:8}}>Peso ideal = 100% / {portfolioTotals.positions?.length} posiciones = {_sf(100/(portfolioTotals.positions?.length||1),1)}% cada una</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Ticker","Peso actual","Peso ideal","Desviación","Acción","Importe"].map(h=>(
                    <th key={h} style={{padding:"4px 8px",textAlign:h==="Ticker"?"left":"right",color:"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(() => {
                    const idealWeight = 1 / (portfolioTotals.positions?.length || 1);
                    const totalVal = portfolioTotals.totalValueUSD;
                    return [...(portfolioTotals.positions || [])]
                      .map(p => ({...p, deviation: (p.weight||0) - idealWeight}))
                      .sort((a,b) => Math.abs(b.deviation) - Math.abs(a.deviation))
                      .slice(0,10)
                      .map(p => (
                        <tr key={p.ticker} style={{borderBottom:"1px solid var(--subtle-bg)"}}>
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
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:a.fired?"rgba(48,209,88,.06)":"var(--row-alt)",borderRadius:6,fontSize:10,fontFamily:"var(--fm)"}}>
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
