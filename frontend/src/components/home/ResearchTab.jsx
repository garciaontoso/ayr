import { useState, useEffect, useCallback } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf, fDol } from '../../utils/formatters.js';
import { useDraggableOrder } from '../../hooks/useDraggableOrder.js';

const CUSTOM_LISTS_KEY = 'ayr_research_custom_lists';

// Draggable horizontal pills for watchlists. Uses useDraggableOrder with a
// persisted key so the order survives reloads. "+ Nueva lista" button at end.
// Custom lists (id prefix "custom_") get an inline ✕ to delete.
function ListsPillsBar({ lists, activeId, setActiveId, onAddList, onDeleteList }) {
  const items = lists.map(l => ({ id: l.id, list: l }));
  const { orderedItems, dragHandlers, getDragVisuals } = useDraggableOrder(items, 'ui_research_lists_order');
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"4px 0 6px",alignItems:"center"}}>
      {orderedItems.map(item => {
        const list = item.list;
        const isActive = activeId === list.id;
        const { isDragging, isDragOver, extraStyle } = getDragVisuals(list.id);
        const isCustom = list.id.startsWith('custom_');
        return (
          <div key={list.id} {...dragHandlers(list.id)}
            style={{
              display:"inline-flex", alignItems:"center", gap:0,
              borderRadius:8,
              border: isDragOver ? '1px solid var(--gold)' : (isActive ? `1px solid ${list.color}` : '1px solid var(--border)'),
              background: isDragOver ? 'rgba(200,164,78,.25)' : (isActive ? `${list.color}18` : 'var(--card)'),
              opacity: isDragging ? 0.4 : 1,
              ...extraStyle,
            }}>
            <button onClick={()=>setActiveId(list.id)}
              title={list.desc + " · " + list.tickers.length + " empresas · arrastra para reordenar"}
              style={{
                padding:"6px 11px", border:"none", background:"transparent",
                color: isActive ? list.color : 'var(--text-secondary)',
                fontSize:11, fontWeight: isActive ? 700 : 500,
                cursor:"pointer", fontFamily:"var(--fm)", whiteSpace:"nowrap",
                display:"flex", alignItems:"center", gap:5,
              }}>
              {list.name}
              <span style={{fontSize:9, opacity: isActive ? 1 : 0.6, padding:"0 5px", borderRadius:10, background: isActive ? `${list.color}25` : 'var(--subtle-bg)'}}>{list.tickers.length}</span>
            </button>
            {isCustom && (
              <button onClick={(e)=>{ e.stopPropagation(); onDeleteList(list.id); }}
                title="Borrar lista personalizada"
                style={{padding:"6px 7px 6px 2px",border:"none",background:"transparent",color:"var(--text-tertiary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>✕</button>
            )}
          </div>
        );
      })}
      <button onClick={onAddList}
        title="Crear nueva lista personalizada"
        style={{
          padding:"6px 11px", borderRadius:8,
          border:'1px dashed #64d2ff60', background:'rgba(100,210,255,.06)',
          color:'#64d2ff', fontSize:11, fontWeight:600,
          cursor:"pointer", fontFamily:"var(--fm)", whiteSpace:"nowrap",
        }}>+ Nueva lista</button>
    </div>
  );
}

export default function ResearchTab() {
  const {
    searchTicker, setSearchTicker,
    portfolio,
    screenerData, screenerLoading,
    bulkLoading, bulkProgress, loadScreener, runBulkFetch,
    researchOpenList, setResearchOpenList, researchAdvanced, setResearchAdvanced,
    researchHide, setResearchHide, researchCapFilter, setResearchCapFilter,
    reportData, reportLoading, reportSymbol, openReport,
    openAnalysis, POS_STATIC,
    loadFromAPI, fmpLoading, fmpError, setViewMode, setTab, setCfg,
  } = useHome();

  // Custom lists — user-created watchlists, persisted in localStorage.
  // Each: { id: 'custom_NNN', name, desc, color, tickers: [...] }
  const [customLists, setCustomLists] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_LISTS_KEY) || '[]'); }
    catch { return []; }
  });
  const saveCustomLists = useCallback((lists) => {
    setCustomLists(lists);
    try { localStorage.setItem(CUSTOM_LISTS_KEY, JSON.stringify(lists)); } catch {}
  }, []);

  return (
<div style={{display:"flex",flexDirection:"column",gap:12}}>
  <div style={{display:"flex",gap:8,alignItems:"center"}}>
    <input type="text" placeholder="Escribe un ticker y pulsa Enter o Buscar" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
      onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){setCfg(prev=>({...prev,ticker:searchTicker,name:searchTicker}));setViewMode("analysis");setTab("dash");}}}
      style={{flex:1,maxWidth:300,padding:"10px 14px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:12,color:"var(--text-primary)",fontSize:13,outline:"none",fontFamily:"var(--fm)"}}
      onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
    <button onClick={()=>{if(searchTicker){setCfg(prev=>({...prev,ticker:searchTicker,name:searchTicker}));setViewMode("analysis");setTab("dash");}}}
      style={{padding:"10px 20px",borderRadius:12,border:"1px solid var(--green)",background:"rgba(48,209,88,.08)",color:"var(--green)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>🔍 Analizar</button>
    <button onClick={()=>{if(searchTicker){loadFromAPI(searchTicker);setViewMode("analysis");setTab("dash");}}} disabled={fmpLoading}
      style={{padding:"10px 20px",borderRadius:12,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:12,fontWeight:700,cursor:fmpLoading?"wait":"pointer",fontFamily:"var(--fm)",animation:fmpLoading?"pulse 1s infinite":"none"}}>
      {fmpLoading?"⏳ Cargando...":"⚡ Cargar datos"}
    </button>
  </div>
  {fmpError && <div style={{padding:10,borderRadius:8,background:"rgba(255,69,58,.06)",border:"1px solid rgba(255,69,58,.2)",color:"var(--red)",fontSize:11}}>⚠ {fmpError}</div>}

  {/* Quick access to saved companies */}
  {portfolio.length>0 && (
    <div>
      <div style={{fontSize:11,color:"var(--text-tertiary)",fontWeight:600,marginBottom:8,fontFamily:"var(--fm)"}}>EMPRESAS GUARDADAS</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {portfolio.map(t=>(
          <button key={t} onClick={()=>openAnalysis(t)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text-secondary)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold)";e.currentTarget.style.color="var(--gold)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-secondary)";}}>{t}</button>
        ))}
      </div>
    </div>
  )}

  {/* Filters row 1: Sector type */}
  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
    <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginRight:4}}>SECTOR:</span>
    {[{k:"reit",l:"REITs",emoji:"🏢",c:"#a855f7"},{k:"pharma",l:"Pharma",emoji:"💊",c:"#06b6d4"},{k:"cyclical",l:"Cíclicas",emoji:"🔄",c:"#f59e0b"},{k:"finance",l:"Financieras",emoji:"🏦",c:"#10b981"}].map(f=>{
      const hidden = !!researchHide[f.k];
      return <button key={f.k} onClick={()=>setResearchHide(p=>({...p,[f.k]:!p[f.k]}))} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${hidden?"rgba(255,69,58,.3)":"var(--border)"}`,background:hidden?"rgba(255,69,58,.08)":"transparent",color:hidden?"var(--red)":f.c,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",textDecoration:hidden?"line-through":"none",opacity:hidden?.5:1}}>{f.emoji} {f.l}</button>;
    })}
  </div>
  {/* Filters row 2: Cap size + view toggle */}
  <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}>
    <div style={{display:"flex",gap:4,alignItems:"center"}}>
      <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginRight:4}}>CAP:</span>
      {[{v:"all",l:"Todas"},{v:"Mega Cap",l:"Mega",c:"#34d399"},{v:"Large Cap",l:"Large",c:"#60a5fa"},{v:"Mid Cap",l:"Mid",c:"#c8a44e"},{v:"Small Cap",l:"Small",c:"#f59e0b"},{v:"Micro Cap",l:"Micro",c:"#f87171"}].map(f=>
        <button key={f.v} onClick={()=>setResearchCapFilter(f.v)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${researchCapFilter===f.v?(f.c||"var(--gold)"):"var(--border)"}`,background:researchCapFilter===f.v?`${f.c||"var(--gold)"}15`:"transparent",color:researchCapFilter===f.v?(f.c||"var(--gold)"):"var(--text-tertiary)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{f.l}</button>
      )}
    </div>
    <div style={{display:"flex",gap:4}}>
      {[{v:false,l:"Básico"},{v:true,l:"Avanzado"}].map(v=>(
        <button key={String(v.v)} onClick={()=>setResearchAdvanced(v.v)} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${researchAdvanced===v.v?"var(--gold)":"var(--border)"}`,background:researchAdvanced===v.v?"var(--gold-dim)":"transparent",color:researchAdvanced===v.v?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{v.l}</button>
      ))}
    </div>
  </div>

  {/* Stock Lists */}
  {(() => {
    const portfolioTickers = Object.entries(POS_STATIC).filter(([,v])=>(v.cat==="COMPANY"||v.cat==="REIT")&&(v.sh||0)>0&&(v.c||"USD")==="USD").map(([t])=>t).sort();
    const defaultLists = [
      {id:"portfolio",name:"Mi Cartera",desc:`${portfolioTickers.length} posiciones activas US`,color:"#d4af37",tickers:portfolioTickers,isPortfolio:true},
      {id:"kings",name:"Dividend Kings",desc:"50+ años de incrementos consecutivos de dividendo",color:"#d4af37",tickers:["ABM","ABT","AWR","BKH","BRC","CBU","CL","CWT","DOV","EMR","FRT","FUL","GPC","GWW","HRL","ITW","JNJ","KMB","KO","LANC","LEG","LOW","MCD","MMM","MSEX","MO","NFG","NWN","PG","PH","PNR","PPG","SCL","SJW","SWK","SYY","TGT","TR","UVV","VFC"]},
      {id:"aristocrats",name:"Dividend Aristocrats",desc:"25+ años de incrementos (S&P 500)",color:"#30d158",tickers:["ABBV","ABT","ADM","ADP","AFL","ALB","AMCR","AOS","APD","APTV","ATT","ATO","BDX","BEN","BF.B","CAH","CAT","CB","CHRW","CINF","CL","CLX","CTAS","CVX","DOV","ECL","ED","EMR","ESS","EXPD","FRT","GD","GPC","GWW","HRL","IBM","ICE","ITW","JNJ","KMB","KO","LIN","LOW","MCD","MDT","MKC","MMM","NDSN","NEE","NUE","O","OTIS","PEP","PG","PNR","PPG","ROP","ROPER","SHW","SPGI","SWK","SYY","T","TGT","TROW","VFC","WBA","WMT","WST","XOM"]},
      {id:"champions",name:"Dividend Champions",desc:"25+ años de incrementos (todas las caps)",color:"#0a84ff",tickers:["ABBV","ABM","ABT","ADM","ADP","AFL","ALB","AMCR","AOS","APD","APTV","ATO","ATR","BDX","BEN","BKH","BRC","CAH","CAT","CB","CBU","CHRW","CINF","CL","CLX","CTAS","CWT","CVX","DOV","ECL","ED","EMR","ESS","EXPD","FRT","FUL","GD","GPC","GWW","HRL","IBM","ITW","JNJ","KMB","KO","LANC","LEG","LIN","LOW","MCD","MDT","MKC","MMM","MO","MSEX","NDSN","NEE","NFG","NUE","NWN","O","PEP","PG","PH","PNR","PPG","ROP","SCL","SHW","SJW","SPGI","SWK","SYY","TGT","TR","TROW","UVV","VFC","WBA","WMT","WST","XOM"]},
      {id:"highyield",name:"High Yield (+4%)",desc:"Dividend yield superior al 4%",color:"#ff9f0a",tickers:["MO","T","VZ","ABBV","PM","KMI","OKE","EPD","ET","BEN","WBA","MMM","LYB","VFC","LEG","IRM","OHI","AGNC","NLY","MPW","PFE","KHC","DOW","IBM","CVX","XOM","AMCR","UVV"]},
      {id:"reits",name:"REITs Dividendo",desc:"REITs con historial de dividendo estable",color:"#a855f7",tickers:["O","VICI","NNN","STAG","STOR","ADC","WPC","EPRT","COLD","AMT","CCI","DLR","PSA","EXR","AVB","ESS","MAA","SPG","FRT","ARE","OHI","MPW","IRM","IIPR","LAND"]},
      {id:"growth",name:"Dividend Growth",desc:"Alto crecimiento de dividendo (>10% CAGR 5y)",color:"#34d399",tickers:["AVGO","MSFT","AAPL","V","MA","HD","COST","UNH","LMT","TXN","QCOM","SBUX","CME","ICE","FAST","WST","ROP","ODFL","POOL","CTAS","TROW","ADP","SPGI","MCO","FIS"]},
      {id:"buffett",name:"Buffett / Ideas A&R",desc:"Selección personal de ideas de inversión",color:"#f59e0b",tickers:["ARE","BDX","BMY","CAG","CMCSA","CPB","CZR","DEO","EMN","GIS","HASI","IIPR","IPG","KHC","LULU","LYB","MO","MRK","MDV","MTN","NNN","NOMD","NVO","O","OBDC","OWL","PEP","PFE","QQQX","REXR","RICK","RYN","SAFE","STZ","SUI","TAP","TROW","UPS","VZ","WEN","WES","WPC","CNC","DIDIY","LUV","PATH","PYPL","SWKS"]},
      {id:"radar_usa",name:"Radar USA",desc:"Empresas USA de calidad en seguimiento",color:"#60a5fa",tickers:["IPAR","BN","STZ","DIS","EL","FDS","FTV","GGG","HSY","HRB","ICE","ITW","KHC","JNJ","JKHY","KO","MA","MCD","MCO","NKE","PAYX","PM","SNA","SBUX","SYK","TROW","TFX","VRSN","V","WAT","ZTS"]},
      {id:"radar_china",name:"Radar China / Asia",desc:"Empresas China y Asia en seguimiento",color:"#ef4444",tickers:["2020.HK","0392.HK","0388.HK","9997.HK","0669.HK","0168.HK","1368.HK","0995.HK","0762.HK","0855.HK","1038.HK","0001.HK","0883.HK","0177.HK","3768.HK","0270.HK","2281.HK","6198.HK","0548.HK","0152.HK","1065.HK","1052.HK","0576.HK","0371.HK","3983.HK","0257.HK","0144.HK","2189.HK","1258.HK","1382.HK","2678.HK","0288.HK"]},
      {id:"radar_intl",name:"Radar Internacional",desc:"Europa, Australia y materias primas",color:"#8b5cf6",tickers:["BHP","RIO","LYB","ICL","WPP"]},
      {id:"reits_ar",name:"REITs A&R",desc:"Selección de REITs en seguimiento",color:"#ec4899",tickers:["ADC","COLD","DOC","EPR","EQR","FRT","MPW","MAA","NHI","NSA","OHI","PSA","RICK","O","SBRA","SILA","SPG","VTR","WELL","WPC"]},
      {id:"dividendst",name:"DividendST Ranking",desc:"Ranking DividendStreet.com — Score /5, actualizado periódicamente",color:"#14b8a6",tickers:["MKTX","SNA","GOOGL","MSFT","CTAS","TROW","FDS","V","RHI","NKE","GGG","MCO","LVMH","PAYX","AXP","ROK","MMM","MA","ZTS","FAST","BF-A","PFE","BRBY","AAPL","JNJ","CME","UNP","HSY","EMR","MRK","PEP","CSCO","HRL","FDX","IBE","LMT","PG","DGE","SPGI","INTC","WM","BMY","DIS","EL","KO","SBUX","ORCL","TAP","MO","WMT","IBM","T","CLX","VFC","MANU"]},
    ];
    const lists = [...defaultLists, ...customLists];
    const activeId = researchOpenList || 'portfolio';
    const setActiveId = setResearchOpenList;
    const selectedList = lists.find(l => l.id === activeId) || lists[0];
    const handleAddList = () => {
      const name = window.prompt('Nombre de la nueva lista (ej: "Mis REITs", "Cyclicals 2026"):');
      if (!name || !name.trim()) return;
      const tickersRaw = window.prompt(`Tickers separados por coma para "${name.trim()}":\nEj: KO, PEP, PG, MCD`);
      if (tickersRaw == null) return;
      const tickers = tickersRaw.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
      if (!tickers.length) { alert('Tickers vacíos'); return; }
      const colors = ["#c8a44e","#30d158","#0a84ff","#ff9f0a","#a855f7","#34d399","#f59e0b","#60a5fa","#ef4444","#8b5cf6","#ec4899","#14b8a6"];
      const newList = {
        id: 'custom_' + Date.now(),
        name: name.trim(),
        desc: 'Lista personalizada',
        color: colors[customLists.length % colors.length],
        tickers,
      };
      saveCustomLists([...customLists, newList]);
      setActiveId(newList.id);
    };
    const handleDeleteList = (id) => {
      if (!id.startsWith('custom_')) { alert('Solo se pueden borrar listas personalizadas'); return; }
      const list = customLists.find(l => l.id === id);
      if (!list) return;
      if (!window.confirm(`¿Borrar la lista "${list.name}"?`)) return;
      saveCustomLists(customLists.filter(l => l.id !== id));
      if (activeId === id) setActiveId('portfolio');
    };
    return <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <ListsPillsBar lists={lists} activeId={activeId} setActiveId={setActiveId} onAddList={handleAddList} onDeleteList={handleDeleteList} />
      {/* Selected list content */}
      {selectedList && (
        <div style={{background:"var(--card)",border:`1px solid ${selectedList.color}30`,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--border)"}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:selectedList.color,fontFamily:"var(--fd)"}}>{selectedList.name}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:2}}>{selectedList.desc} · {selectedList.tickers.length} empresas</div>
            </div>
          </div>
          {(() => {
            const list = selectedList;
            const sData = (screenerData?.screener || []);
            const sMap = {}; sData.forEach(s => { sMap[s.symbol] = s; });
            const pharmaSectors = new Set(["Healthcare","Biotechnology","Drug Manufacturers","Diagnostics & Research","Medical Devices","Pharmaceutical Retailers"]);
            const financeSectors = new Set(["Financial Services","Banks","Insurance","Capital Markets"]);
            const cyclicalSectors = new Set(["Basic Materials","Energy","Industrials","Consumer Cyclical"]);
            const isHidden = (item) => {
              const sec = (item.sector||"").trim();
              const ct = item.compType||"";
              if (researchHide.reit && (ct === "REIT" || sec === "Real Estate")) return true;
              if (researchHide.pharma && pharmaSectors.has(sec)) return true;
              if (researchHide.cyclical && (ct === "Cíclica" || cyclicalSectors.has(sec))) return true;
              if (researchHide.finance && financeSectors.has(sec)) return true;
              if (researchCapFilter !== "all" && item.capSize !== researchCapFilter) return true;
              return false;
            };
            const withData = list.tickers.filter(t => sMap[t]).map(t => sMap[t]).filter(item => !isHidden(item)).sort((a,b) => b.score - a.score);
            const noData = list.tickers.filter(t => !sMap[t]).sort();
            const loadList = async () => {
              if (bulkLoading) return;
              const toLoad = noData.length > 0 ? noData : list.tickers;
              await runBulkFetch(toLoad);
              loadScreener();
            };
            const sc = s => s >= 70 ? "#30d158" : s >= 50 ? "#c8a44e" : "#ff453a";
            const rc = r => (r||"").startsWith("S")?"#30d158":(r||"").startsWith("A")?"var(--gold)":(r||"").startsWith("B")?"#64d2ff":(r||"").startsWith("C")?"var(--red)":"var(--text-tertiary)";
            const riskC = r => r==="Bajo"?"var(--green)":r==="Medio"?"var(--orange)":"var(--red)";
            const typeC = t => t==="Calidad MAX"?"var(--green)":t==="REIT"?"#a855f7":t==="Cíclica"?"var(--orange)":"var(--text-secondary)";
            const bd = "1px solid var(--subtle-bg)";
            const cs = {padding:"4px 7px",fontFamily:"var(--fm)",borderBottom:bd,whiteSpace:"nowrap"};
            const basicCols = ["SCORE","TICKER","EMPRESA","SECTOR","YIELD%","PAYOUT FCF%","D/EBITDA","ROIC%","P/E","FMP",""];
            const advCols = ["SCORE","TICKER","EMPRESA","TIPO","RIESGO","DIV","MKT CAP","D.NETA","BPA","DPA","D/FCF","RD%","PAYOUT","PER","PER JUSTO","CREC.","TIR","P.JUSTO","DESC.","FMP"];
            const cols = researchAdvanced ? advCols : basicCols;
            return <div style={{padding:"0 0 14px"}}>
              {/* List toolbar */}
              <div style={{padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{withData.length} con datos · {noData.length} sin datos</span>
                <div style={{display:"flex",gap:6}}>
                  {withData.length > 0 && <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",padding:"4px 0"}}>Datos: {withData[0]?.updated?.slice(0,10)||"—"}</span>}
                  <button onClick={loadList} disabled={bulkLoading} style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:9,fontWeight:600,cursor:bulkLoading?"wait":"pointer",fontFamily:"var(--fm)"}}>{bulkLoading?"Cargando...":(noData.length>0?"Cargar "+noData.length+" faltantes":"Actualizar todo")}</button>
                </div>
              </div>
              {bulkProgress && <div style={{padding:"6px 16px"}}><div style={{fontSize:10,color:"var(--gold)",fontFamily:"var(--fm)",padding:"6px 10px",borderRadius:6,background:"rgba(201,169,80,.06)"}}>{bulkProgress}</div></div>}
              {withData.length > 0 && <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,minWidth:researchAdvanced?1200:800}}>
                  <thead><tr>
                    {cols.map((h,i) => <th key={i} style={{padding:"5px 7px",textAlign:i<=3&&!researchAdvanced?"left":i===0?"center":"right",color:"var(--text-tertiary)",fontSize:7.5,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.3,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {withData.map((item,i) => {
                      const ip = !!POS_STATIC[item.symbol];
                      const fr = item.fmpRating || {};
                      return <tr key={item.symbol} style={{background:i%2?"var(--row-alt)":"transparent",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"}
                        onClick={()=>openAnalysis(item.symbol)}>
                        <td style={{...cs,textAlign:"center"}}><span style={{padding:"2px 7px",borderRadius:4,background:`${sc(item.score)}18`,color:sc(item.score),fontWeight:800,fontSize:11}}>{item.score}</span></td>
                        <td style={{...cs,fontWeight:700,color:ip?"var(--gold)":"var(--text-primary)"}}>{ip?"● ":""}{item.symbol}<span style={{fontSize:7,marginLeft:4,padding:"1px 4px",borderRadius:3,fontWeight:500,background:item.capSize==="Mega Cap"?"rgba(52,211,153,.1)":item.capSize==="Large Cap"?"rgba(96,165,250,.1)":item.capSize==="Mid Cap"?"rgba(200,164,78,.1)":"rgba(248,113,113,.1)",color:item.capSize==="Mega Cap"?"#34d399":item.capSize==="Large Cap"?"#60a5fa":item.capSize==="Mid Cap"?"#c8a44e":"#f87171",verticalAlign:"middle"}}>{item.capSize==="Mega Cap"?"MEGA":item.capSize==="Large Cap"?"LARGE":item.capSize==="Mid Cap"?"MID":item.capSize==="Small Cap"?"SMALL":"MICRO"}</span></td>
                        <td title={item.name} style={{...cs,color:"var(--text-secondary)",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</td>
                        {!researchAdvanced && <>
                          <td style={{...cs,color:"var(--text-tertiary)",fontSize:9}}>{item.sector}</td>
                          <td style={{...cs,textAlign:"right",color:item.divYield>4?"var(--green)":item.divYield>2?"var(--gold)":"var(--text-secondary)",fontWeight:600}}>{_sf(item.divYield,1)}%</td>
                          <td style={{...cs,textAlign:"right",color:item.payoutFCF<60?"var(--green)":item.payoutFCF<80?"var(--gold)":"var(--red)"}}>{item.payoutFCF}%</td>
                          <td style={{...cs,textAlign:"right",color:item.debtEBITDA<3?"var(--green)":item.debtEBITDA<5?"var(--gold)":"var(--red)"}}>{_sf(item.debtEBITDA,1)}x</td>
                          <td style={{...cs,textAlign:"right",color:item.roic>15?"var(--green)":item.roic>8?"var(--text-secondary)":"var(--red)"}}>{_sf(item.roic,1)}%</td>
                          <td style={{...cs,textAlign:"right",color:item.pe>0&&item.pe<20?"var(--green)":item.pe>0&&item.pe<35?"var(--text-secondary)":"var(--red)"}}>{item.pe>0?_sf(item.pe,1):"—"}</td>
                        </>}
                        {researchAdvanced && <>
                          <td style={{...cs,textAlign:"right"}}><span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:`${typeC(item.compType)}15`,color:typeC(item.compType),fontWeight:600}}>{item.compType||"—"}</span></td>
                          <td style={{...cs,textAlign:"right"}}><span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:`${riskC(item.risk)}15`,color:riskC(item.risk),fontWeight:600}}>{item.risk||"—"}</span></td>
                          <td style={{...cs,textAlign:"right",color:"var(--text-secondary)"}}>{item.currency||"USD"}</td>
                          <td style={{...cs,textAlign:"right",color:"var(--text-secondary)"}}>{item.marketCap>1e9?_sf(item.marketCap/1e9,0)+"B":item.marketCap>1e6?_sf(item.marketCap/1e6,0)+"M":"—"}</td>
                          <td style={{...cs,textAlign:"right",color:item.netDebt<0?"var(--green)":"var(--text-secondary)"}}>{item.netDebt!=null?fDol(item.netDebt):"—"}</td>
                          <td style={{...cs,textAlign:"right",color:"var(--text-primary)",fontWeight:600}}>{item.eps?_sf(item.eps,2):"—"}</td>
                          <td style={{...cs,textAlign:"right",color:"var(--gold)"}}>{item.dps?_sf(item.dps,2):"—"}</td>
                          <td style={{...cs,textAlign:"right",color:item.debtToFCF<3?"var(--green)":item.debtToFCF<6?"var(--gold)":"var(--red)"}}>{item.debtToFCF<90?_sf(item.debtToFCF,1)+"x":"—"}</td>
                          <td style={{...cs,textAlign:"right",color:item.divYield>4?"var(--green)":item.divYield>2?"var(--gold)":"var(--text-secondary)",fontWeight:600}}>{_sf(item.divYield,1)}%</td>
                          <td style={{...cs,textAlign:"right",color:item.payoutEarnings<60?"var(--green)":item.payoutEarnings<80?"var(--gold)":"var(--red)"}}>{item.payoutEarnings||0}%</td>
                          <td style={{...cs,textAlign:"right",color:item.pe>0&&item.pe<20?"var(--green)":item.pe>0&&item.pe<35?"var(--text-secondary)":"var(--red)"}}>{item.pe>0?_sf(item.pe,1):"—"}</td>
                          <td style={{...cs,textAlign:"right",color:"var(--gold)",fontWeight:600}}>{item.fairPE||"—"}</td>
                          <td style={{...cs,textAlign:"right",color:item.growthEst>5?"var(--green)":item.growthEst>0?"var(--text-secondary)":"var(--red)"}}>{_sf(item.growthEst,1)}%</td>
                          <td style={{...cs,textAlign:"right",color:item.tir>10?"var(--green)":item.tir>6?"var(--gold)":"var(--red)",fontWeight:600}}>{_sf(item.tir,1)}%</td>
                          <td style={{...cs,textAlign:"right",color:"var(--text-primary)",fontWeight:600}}>{item.fairPrice>0?_sf(item.fairPrice,1):"—"}</td>
                          <td style={{...cs,textAlign:"right",fontWeight:700,color:item.discount>20?"var(--green)":item.discount>0?"var(--gold)":item.discount>-20?"var(--orange)":"var(--red)"}}>{item.discount>0?"+":""}{item.discount}%</td>
                        </>}
                        <td style={{...cs,textAlign:"center"}}><span style={{fontSize:9,padding:"2px 7px",borderRadius:4,fontWeight:700,background:`${rc(fr.rating)}18`,color:rc(fr.rating)}}>{fr.rating||"—"}</span></td>
                        <td style={{...cs,textAlign:"center"}}><button onClick={e=>{e.stopPropagation();openReport(item.symbol);openAnalysis(item.symbol);setTab("dst");}} style={{padding:"3px 8px",borderRadius:5,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>Informe</button></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>}
              {noData.length > 0 && <div style={{padding:"10px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>SIN DATOS ({noData.length})</span>
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {noData.map(t => <button key={t} onClick={()=>openAnalysis(t)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:9,cursor:"pointer",fontFamily:"var(--fm)"}}>{t}</button>)}
                </div>
              </div>}
            </div>;
          })()}
        </div>
      )}
    </div>;
  })()}
</div>
  );
}
