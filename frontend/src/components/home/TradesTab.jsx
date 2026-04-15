import { useEffect, useState } from 'react';
import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters.js';
import { API_URL } from '../../constants/index.js';
import { EmptyState, InlineLoading } from '../ui/EmptyState.jsx';

export default function TradesTab() {
  const {
    tradesData, setTradesData, tradesLoading, setTradesLoading,
    tradesFilter, setTradesFilter, tradesPage, setTradesPage,
    openAnalysis, openCostBasis,
  } = useHome();

  const [sortCol, setSortCol] = useState("fecha");
  const [sortDir, setSortDir] = useState("desc");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const syncIB = async () => {
    setSyncing(true); setSyncMsg("Sincronizando con IB...");
    try {
      // IB OAuth sync: trades (7 dias), posiciones, NLV
      const r1 = await fetch(`${API_URL}/api/ib-auto-sync`, { method: "POST" });
      const d1 = await r1.json();
      const oauthTrades = d1.trades_imported || 0;

      // Sync dividendos → cost_basis para que aparezcan aqui
      const r2 = await fetch(`${API_URL}/api/costbasis/sync-dividends`, { method: "POST" });
      const d2 = await r2.json();
      const newDivs = d2.inserted || 0;

      let parts = [];
      if (oauthTrades > 0) parts.push(`${oauthTrades} trades nuevos`);
      if (newDivs > 0) parts.push(`${newDivs} dividendos sincronizados`);
      if (d1.nlv_updated) parts.push("NLV actualizado");
      if (oauthTrades === 0 && newDivs === 0) parts.push("Todo al dia");
      if (d1.errors?.length) parts.push(`${d1.errors.length} avisos`);
      setSyncMsg("✅ " + parts.join(" · "));

      // Reload trades
      loadTrades(tradesFilter, 0);
    } catch (e) {
      setSyncMsg("❌ Error: " + e.message);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(null), 8000);
  };

  // Load trades data from API
  const loadTrades = async (filters = tradesFilter, page = tradesPage, sCol = sortCol, sDir = sortDir) => {
    setTradesLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.tipo) params.set("tipo", filters.tipo);
      if (filters.year) params.set("year", filters.year);
      if (filters.ticker) params.set("ticker", filters.ticker);
      params.set("sort", sCol);
      params.set("dir", sDir);
      params.set("limit", "500");
      params.set("offset", String(page * 500));
      const resp = await fetch(`${API_URL}/api/costbasis/all?${params}`);
      if (!resp.ok) throw new Error("API error");
      const data = await resp.json();
      let summary = tradesData?.summary;
      if (!summary) {
        const sResp = await fetch(`${API_URL}/api/costbasis`);
        if (sResp.ok) summary = await sResp.json();
      }
      setTradesData({ ...data, summary });
    } catch(e) { console.error("Trades load error:", e); }
    setTradesLoading(false);
  };

  useEffect(() => {
    if (!tradesData && !tradesLoading) loadTrades();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (col) => {
    const newDir = sortCol === col && sortDir === "desc" ? "asc" : "desc";
    setSortCol(col);
    setSortDir(newDir);
    setTradesPage(0);
    loadTrades(tradesFilter, 0, col, newDir);
  };

  const results = tradesData?.results || [];
  const total = tradesData?.total || 0;
  const summary = tradesData?.summary || [];
  const totalTxns = summary.reduce((s,d) => s + (d.txns||0), 0);
  const totalBuys = summary.reduce((s,d) => s + (d.buys||0), 0);
  const totalDivs = summary.reduce((s,d) => s + (d.divs||0), 0);
  const totalOpts = summary.reduce((s,d) => s + (d.opts||0), 0);
  const totalSells = totalTxns - totalBuys - totalDivs - totalOpts;

  const typeColors = {EQUITY:"var(--gold)", DIVIDENDS:"var(--green)", OPTION:"#64d2ff"};
  const typeLabels = {EQUITY:"Equity", DIVIDENDS:"Dividendo", OPTION:"Opción"};

  const columns = [
    {id:"fecha",l:"FECHA",align:"left",sortable:true},
    {id:"ticker",l:"TICKER",align:"left",sortable:true},
    {id:"tipo",l:"TIPO",align:"left",sortable:true},
    {id:"shares",l:"SHARES",align:"right",sortable:true},
    {id:"precio",l:"PRECIO",align:"right",sortable:true},
    {id:"comision",l:"COMISIÓN",align:"right",sortable:false},
    {id:"coste",l:"COSTE",align:"right",sortable:true},
    {id:"dps",l:"DPS",align:"right",sortable:false},
    {id:"div_total",l:"DIV TOTAL",align:"right",sortable:true},
    {id:"opt_credit",l:"OPT CREDIT",align:"right",sortable:false},
    {id:"balance",l:"BALANCE",align:"right",sortable:false},
  ];

  return (
  <div style={{display:"flex",flexDirection:"column",gap:12}}>
    {/* KPI Cards — más compactos */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:8}}>
      {[
        {l:"TRANSACCIONES",v:totalTxns.toLocaleString(),c:"var(--text-primary)"},
        {l:"TICKERS",v:summary.length.toString(),c:"var(--gold)"},
        {l:"COMPRAS",v:totalBuys.toLocaleString(),c:"var(--green)"},
        {l:"VENTAS",v:totalSells>0?totalSells.toLocaleString():"—",c:"var(--red)"},
        {l:"DIVIDENDOS",v:totalDivs.toLocaleString(),c:"var(--green)"},
        {l:"OPCIONES",v:totalOpts.toLocaleString(),c:"#64d2ff"},
      ].map((k,i)=>(
        <div key={i} style={{padding:"10px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
          <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:.5,fontWeight:600,marginBottom:2}}>{k.l}</div>
          <div style={{fontSize:18,fontWeight:700,color:k.c,fontFamily:"var(--fm)",lineHeight:1.2}}>{k.v}</div>
        </div>
      ))}
    </div>

    {/* Filters */}
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <input placeholder="Buscar ticker..." value={tradesFilter.ticker} onChange={e=>{const f={...tradesFilter,ticker:e.target.value};setTradesFilter(f);}}
        onKeyDown={e=>{if(e.key==="Enter"){setTradesPage(0);loadTrades(tradesFilter,0);}}}
        style={{padding:"7px 12px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none",width:130}}/>
      <select value={tradesFilter.tipo} onChange={e=>{const f={...tradesFilter,tipo:e.target.value};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}}
        style={{padding:"7px 10px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
        <option value="">Todos los tipos</option>
        <option value="EQUITY">Equity</option>
        <option value="DIVIDENDS">Dividendos</option>
        <option value="OPTION">Opciones</option>
      </select>
      <select value={tradesFilter.year} onChange={e=>{const f={...tradesFilter,year:e.target.value};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}}
        style={{padding:"7px 10px",background:"var(--subtle-border)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:12,fontFamily:"var(--fm)",outline:"none"}}>
        <option value="">Todos los años</option>
        {["2026","2025","2024","2023","2022","2021","2020"].map(y=><option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={()=>{setTradesPage(0);loadTrades(tradesFilter,0);}}
        style={{padding:"7px 16px",borderRadius:8,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>Buscar</button>
      {(tradesFilter.tipo||tradesFilter.year||tradesFilter.ticker) &&
        <button onClick={()=>{const f={tipo:"",year:"",ticker:""};setTradesFilter(f);setTradesPage(0);loadTrades(f,0);}}
          style={{padding:"7px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>✕ Limpiar</button>}
      <button onClick={syncIB} disabled={syncing}
        style={{padding:"7px 14px",borderRadius:8,border:"1px solid rgba(100,210,255,.4)",background:"rgba(100,210,255,.08)",color:"#64d2ff",fontSize:11,fontWeight:700,cursor:syncing?"wait":"pointer",fontFamily:"var(--fm)",transition:"all .15s"}}>
        {syncing ? "⏳ Sincronizando trades y dividendos..." : "📡 Sincronizar IB (trades + dividendos)"}
      </button>
      <div style={{marginLeft:"auto",fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{total.toLocaleString()} resultados</div>
    </div>
    {syncMsg && (
      <div style={{padding:"8px 14px",background:"rgba(100,210,255,.06)",border:"1px solid rgba(100,210,255,.2)",borderRadius:8,fontSize:11,color:"#64d2ff",fontFamily:"var(--fm)"}}>
        {syncMsg}
      </div>
    )}

    {/* Transaction Table */}
    {tradesLoading ? (
      <InlineLoading message="Cargando transacciones..." />
    ) : results.length === 0 ? (
      <EmptyState icon="📝" title="Sin transacciones" subtitle="No se encontraron transacciones con los filtros seleccionados. Prueba a cambiar los filtros o sincroniza tus operaciones desde IB." action="Limpiar filtros" onAction={() => { const f={tipo:"",year:"",ticker:""}; setTradesFilter(f); setTradesPage(0); loadTrades(f,0); }} />
    ) : (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:900}}>
          <thead><tr>
            {columns.map(c=>(
              <th key={c.id} onClick={c.sortable ? ()=>toggleSort(c.id) : undefined}
                style={{padding:"7px 10px",textAlign:c.align,color:sortCol===c.id?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:700,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"2px solid var(--border)",whiteSpace:"nowrap",cursor:c.sortable?"pointer":"default",userSelect:"none"}}>
                {c.l} {sortCol===c.id?(sortDir==="desc"?"▼":"▲"):""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {results.map((r,i) => {
              const tColor = typeColors[r.tipo] || "var(--text-secondary)";
              const isNeg = (r.shares||0) < 0;
              return (
              <tr key={r.id||i} style={{background:i%2?"var(--row-alt)":"transparent",transition:"background .15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2?"var(--row-alt)":"transparent"}>
                <td style={{padding:"5px 10px",fontFamily:"var(--fm)",color:"var(--text-primary)",borderBottom:"1px solid var(--subtle-bg)",fontSize:11}}>{r.fecha}</td>
                <td style={{padding:"5px 10px",fontWeight:700,fontFamily:"var(--fm)",color:"var(--gold)",borderBottom:"1px solid var(--subtle-bg)",cursor:"pointer"}} onClick={()=>openCostBasis(r.ticker)}>{r.ticker}</td>
                <td style={{padding:"5px 10px",fontFamily:"var(--fm)",borderBottom:"1px solid var(--subtle-bg)"}}>
                  <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:`${tColor}15`,color:tColor,fontWeight:600}}>{typeLabels[r.tipo]||r.tipo}</span>
                </td>
                <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:isNeg?"var(--red)":"var(--text-primary)",fontWeight:isNeg?600:400,borderBottom:"1px solid var(--subtle-bg)"}}>{r.shares||""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid var(--subtle-bg)"}}>{r.precio?`$${_sf(r.precio,2)}`:""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--red)",borderBottom:"1px solid var(--subtle-bg)",opacity:.5,fontSize:10}}>{r.comision?`$${_sf(r.comision,2)}`:""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:r.coste>0?"var(--green)":r.coste<0?"var(--red)":"var(--text-tertiary)",borderBottom:"1px solid var(--subtle-bg)"}}>{r.coste!=null?`$${_sf(r.coste,0)}`:""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"var(--text-secondary)",borderBottom:"1px solid var(--subtle-bg)",fontSize:10}}>{r.dps?`$${_sf(r.dps,4)}`:""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:"var(--green)",borderBottom:"1px solid var(--subtle-bg)"}}>{r.div_total?`$${_sf(r.div_total,2)}`:""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"var(--fm)",color:"#64d2ff",borderBottom:"1px solid var(--subtle-bg)"}}>{r.opt_credit_total?`$${_sf(r.opt_credit_total,2)}`:""}</td>
                <td style={{padding:"5px 10px",textAlign:"right",fontWeight:600,fontFamily:"var(--fm)",color:r.balance>=0?"var(--green)":"var(--red)",borderBottom:"1px solid var(--subtle-bg)"}}>{r.balance!=null&&r.balance!==0?`$${_sf(r.balance,0)}`:""}</td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {total > 500 && (
        <div style={{display:"flex",justifyContent:"center",gap:8,padding:10,borderTop:"1px solid var(--border)"}}>
          <button disabled={tradesPage===0} onClick={()=>{const p=tradesPage-1;setTradesPage(p);loadTrades(tradesFilter,p);}}
            style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:tradesPage===0?"transparent":"var(--gold-dim)",color:tradesPage===0?"var(--text-tertiary)":"var(--gold)",fontSize:11,cursor:tradesPage===0?"default":"pointer",fontFamily:"var(--fm)"}}>← Anterior</button>
          <span style={{padding:"5px 12px",fontSize:11,color:"var(--text-secondary)",fontFamily:"var(--fm)"}}>{tradesPage*500+1}–{Math.min((tradesPage+1)*500,total)} de {total.toLocaleString()}</span>
          <button disabled={(tradesPage+1)*500>=total} onClick={()=>{const p=tradesPage+1;setTradesPage(p);loadTrades(tradesFilter,p);}}
            style={{padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:(tradesPage+1)*500>=total?"transparent":"var(--gold-dim)",color:(tradesPage+1)*500>=total?"var(--text-tertiary)":"var(--gold)",fontSize:11,cursor:(tradesPage+1)*500>=total?"default":"pointer",fontFamily:"var(--fm)"}}>Siguiente →</button>
        </div>
      )}
    </div>
    )}
  </div>
  );
}
