import { useState } from 'react';
import { useHome } from '../../context/HomeContext';

export default function WatchlistTab() {
  const {
    watchlistList,
    searchTicker, setSearchTicker, updatePosition,
    openAnalysis, CompanyRow,
  } = useHome();
  const [quickFilter, setQuickFilter] = useState("");

  const filtered = watchlistList.filter(p => {
    if (!quickFilter) return true;
    const q = quickFilter.toLowerCase();
    return p.ticker.toLowerCase().includes(q) || (p.name||"").toLowerCase().includes(q);
  });

  return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
          <input type="text" placeholder="Ticker (ej: KO)" value={searchTicker} onChange={e=>setSearchTicker(e.target.value.toUpperCase())}
            onKeyDown={e=>{if(e.key==="Enter"&&searchTicker){updatePosition(searchTicker,{list:"watchlist",targetPrice:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
            style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:12,outline:"none",fontFamily:"var(--fm)",width:140}}
            onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
          <button onClick={()=>{if(searchTicker){updatePosition(searchTicker,{list:"watchlist",targetPrice:0,dps:0,name:searchTicker,lastPrice:0});setSearchTicker("");}}}
            style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,214,10,.3)",background:"rgba(255,214,10,.06)",color:"var(--yellow)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Añadir a Watchlist</button>
        </div>
        {watchlistList.length>5 && (
          <div style={{position:"relative",marginBottom:4}}>
            <input type="text" placeholder="🔍 Buscar en watchlist..." value={quickFilter} onChange={e=>setQuickFilter(e.target.value)}
              style={{width:"100%",padding:"8px 14px",background:"rgba(255,255,255,.03)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:12,outline:"none",fontFamily:"var(--fm)",transition:"border-color .2s"}}
              onFocus={e=>e.target.style.borderColor="rgba(200,164,78,.3)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            {quickFilter && <button onClick={()=>setQuickFilter("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:14}}>×</button>}
          </div>
        )}
        {watchlistList.length===0 && <div style={{textAlign:"center",padding:60,color:"var(--text-tertiary)"}}><div style={{fontSize:48,marginBottom:16}}>👁</div>Watchlist vacía. Añade empresas que te interesen.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(p=><CompanyRow key={p.ticker} p={p} showPos={false} onOpen={openAnalysis}/>)}
        </div>
      </div>
  );
}
