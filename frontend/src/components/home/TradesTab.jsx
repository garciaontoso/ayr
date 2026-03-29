import { useEffect } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';

export default function TradesTab() {
  const {
    tradesData, setTradesData, tradesLoading, setTradesLoading,
    tradesFilter, setTradesFilter, tradesPage, setTradesPage,
    openAnalysis, openCostBasis,
  } = useHome();

  // Load trades data from API
  const loadTrades = async (filters = tradesFilter, page = tradesPage) => {
    setTradesLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.tipo) params.set("tipo", filters.tipo);
      if (filters.year) params.set("year", filters.year);
      if (filters.ticker) params.set("ticker", filters.ticker);
      params.set("limit", "500");
      params.set("offset", String(page * 500));
      const resp = await fetch(`${API_URL}/api/costbasis/all?${params}`);
      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      // Also load summary if not already loaded
      let summary = tradesData?.summary;
      if (!summary) {
        const sResp = await fetch(`${API_URL}/api/costbasis`);
        if (sResp.ok) summary = await sResp.json();
      }
      setTradesData({ ...data, summary });
    } catch(e) { console.error("Trades load error:", e); }
    setTradesLoading(false);
  };
  // Auto-load on first render
  useEffect(() => {
    if (!tradesData && !tradesLoading) loadTrades();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const results = tradesData?.results || [];
  const total = tradesData?.total || 0;
  const summary = tradesData?.summary || [];
  const totalTxns = summary.reduce((s,d) => s + (d.txns||0), 0);
  const totalBuys = summary.reduce((s,d) => s + (d.buys||0), 0);
  const totalDivs = summary.reduce((s,d) => s + (d.divs||0), 0);
  const totalOpts = summary.reduce((s,d) => s + (d.opts||0), 0);
  const totalSells = totalTxns - totalBuys - totalDivs - totalOpts;
  const years = [...new Set(results.map(r => r.fecha?.slice(0,4)).filter(Boolean))].sort().reverse();

  const typeColors = {EQUITY:"var(--gold)", DIVIDENDS:"var(--green)", OPTION:"#64d2ff"};
  const typeLabels = {EQUITY:"Equity", DIVIDENDS:"Dividendo", OPTION:"Opción"};

  return (
  <div style={{display:"flex",flexDirection:"column",gap:16}}>
    {/* KPI Cards */}
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {[
        {l:"TRANSACCIONES",v:totalTxns.toLocaleString(),c:"var(--text-primary)"},
        {l:"TICKERS",v:summary.length.toString(),c:"var(--gold)"},
        {l:"COMPRAS",v:totalBuys.toLocaleString(),c:"var(--green)"},
        {l:"VENTAS",v:totalSells>0?totalSells.toLocaleString():"—",c:"var(--red)"},
        {l:"DIVIDENDOS",v:totalDivs.toLocaleString(),c:"var(--green)"},
        {l:"OPCIONES",v:totalOpts.toLocaleString(),c:"#64d2ff"},
      ].map((k,i)=>(
        <div key={i} style={{flex:"1 1 120px",padding:"14px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:14}}>
          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.6,fontWeight:600,marginBottom:4}}>{k.l}</div>
          <div style={{fontSize:22,fontWeight:700,color:k.c,fontFamily:"var(--fm)",lineHeight:1.2}}>{k.v}</div>
        </div>
      ))}
    </div>

    {/* Filters */}
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <input placeholder="Buscar ticker..." value={tradesFilter.ticker} onChange={e=>{const f={...tradesFilter,ticker:e.target.value};setTradesFilter(f);}} onKeyDown={e=>{if(e.key==="Enter"){setTradesPage(0);loadTrades(tradesFilter,0);}}} style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none",width:140}}/>
      <select value={tradesFilter.tipo} onChange={e=>{const f={...tradesFilter,tipo:e.target.value};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}} style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}}>
        <option value="">Todos los tipos</option>
        <option value="EQUITY">Equity</option>
        <option value="DIVIDENDS">Dividendos</option>
        <option value="OPTION">Opciones</option>
      </select>
      <select value={tradesFilter.year} onChange={e=>{const f={...tradesFilter,year:e.target.value};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}} style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:13,fontFamily:"var(--fm)",outline:"none"}}>
        <option value="">Todos los años</option>
        {["2026","2025","2024","2023","2022","2021","2020"].map(y=><option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={()=>{setTradesPage(0);loadTrades(tradesFilter,0);}} style={{padding:"8px 18px",borderRadius:8,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Buscar</button>
      {(tradesFilter.tipo||tradesFilter.year||tradesFilter.ticker)&&<button onClick={()=>{const f={tipo:"",year:"",ticker:""};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:12,cursor:"pointer",fontFamily:"var(--fm)"}}>✕ Limpiar</button>}
      <div style={{marginLeft:"auto",fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{total.toLocaleString()} resultados</div>
    </div>

    {/* Transaction Table */}
    {tradesLoading ? (
      <div style={{padding:60,textAlign:"center",color:"var(--text-tertiary)",fontSize:14}}>Cargando transacciones...</div>
    ) : (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
          <thead><tr>
            {["FECHA","TICKER","TIPO","SHARES","PRECIO","COMISIÓN","COSTE","DPS","DIV TOTAL","OPT CREDIT","BALANCE","ADJ BASIS"].map((h,i)=>(
              <th key={i} style={{padding:"8px 10px",textAlign:i>2?"right":"left",color:"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {results.map((r,i) => {
              const tColor = typeColors[r.tipo] || "var(--text-secondary)";
              return (
              <tr key={r.id||i} style={{background:i%2?"rgba(255,255,255,.012)":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"} onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.012)":"transparent"}>
                <td style={{padding:"6px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.fecha}</td>
                <td style={{padding:"6px 10px",fontWeight:700,fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid rgba(255,255,255,.03)",cursor:"pointer"}} onClick={()=>openCostBasis(r.ticker)}>{r.ticker}</td>
                <td style={{padding:"6px 10px",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:`${tColor}15`,color:tColor,fontWeight:600}}>{typeLabels[r.tipo]||r.tipo}</span></td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.shares||""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.precio?`$${_sf(r.precio,2)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)",opacity:.6}}>{r.comision?`$${_sf(r.comision,2)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:r.coste>0?"var(--green)":r.coste<0?"var(--red)":"var(--text-tertiary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.coste!=null?`$${_sf(r.coste,0)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.dps?`$${_sf(r.dps,4)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.div_total?`$${_sf(r.div_total,2)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.opt_credit_total?`$${_sf(r.opt_credit_total,2)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:r.balance>=0?"var(--green)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.balance!=null?`$${_sf(r.balance,0)}`:""}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{r.adjusted_basis?`$${_sf(r.adjusted_basis,2)}`:""}</td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {total > 500 && (
        <div style={{display:"flex",justifyContent:"center",gap:8,padding:12,borderTop:"1px solid var(--border)"}}>
          <button disabled={tradesPage===0} onClick={()=>{const p=tradesPage-1;setTradesPage(p);loadTrades(tradesFilter,p);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:tradesPage===0?"transparent":"var(--gold-dim)",color:tradesPage===0?"var(--text-tertiary)":"var(--gold)",fontSize:12,cursor:tradesPage===0?"default":"pointer",fontFamily:"var(--fm)"}}>← Anterior</button>
          <span style={{padding:"6px 14px",fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{tradesPage*500+1}–{Math.min((tradesPage+1)*500,total)} de {total.toLocaleString()}</span>
          <button disabled={(tradesPage+1)*500>=total} onClick={()=>{const p=tradesPage+1;setTradesPage(p);loadTrades(tradesFilter,p);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:(tradesPage+1)*500>=total?"transparent":"var(--gold-dim)",color:(tradesPage+1)*500>=total?"var(--text-tertiary)":"var(--gold)",fontSize:12,cursor:(tradesPage+1)*500>=total?"default":"pointer",fontFamily:"var(--fm)"}}>Siguiente →</button>
        </div>
      )}
    </div>
    )}
  </div>
  );
}
