import { useHome } from '../../context/HomeContext';
import { _sf } from '../../utils/formatters.js';

export default function ScreenerTab() {
  const {
    screenerData, screenerLoading, screenerSort, setScreenerSort,
    screenerFilter, setScreenerFilter, customTickers, setCustomTickers,
    bulkLoading, bulkProgress, loadScreener, runBulkFetch,
    openAnalysis, POS_STATIC, ibData,
  } = useHome();

  const portfolioUS = Object.entries(POS_STATIC)
    .filter(([,v]) => (v.ls||"portfolio") !== "historial" && (v.c||"USD") === "USD" && (v.sh||0) > 0)
    .map(([t]) => t);

  const items = screenerData?.screener || [];
  const sectors = [...new Set(items.map(i=>i.sector).filter(Boolean).filter(s=>s!=="—"))].sort();

  const filtered = items.filter(i => {
    if (screenerFilter.minScore && i.score < screenerFilter.minScore) return false;
    if (screenerFilter.sector && i.sector !== screenerFilter.sector) return false;
    if (screenerFilter.search && !i.symbol.includes(screenerFilter.search.toUpperCase()) && !(i.name||"").toUpperCase().includes(screenerFilter.search.toUpperCase())) return false;
    if (screenerFilter.minYield && (i.divYield||0) < screenerFilter.minYield) return false;
    return true;
  });

  const getVal = (item,col) => col === "fmpRatingScore" ? (item.fmpRating?.score ?? 0) : (item[col] ?? 0);
  const sorted = [...filtered].sort((a,b) => {
    const va = getVal(a,screenerSort.col), vb = getVal(b,screenerSort.col);
    if (typeof va === "string") return screenerSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return screenerSort.asc ? va - vb : vb - va;
  });

  const sortBy = (col) => setScreenerSort(p => p.col === col ? {col, asc: !p.asc} : {col, asc: false});
  const sortArrow = (col) => screenerSort.col === col ? (screenerSort.asc ? " ▲" : " ▼") : "";

  const scoreColor = (s) => s >= 70 ? "#30d158" : s >= 50 ? "#d69e2e" : "#ff453a";
  const scoreBg = (s) => s >= 70 ? "rgba(48,209,88,.1)" : s >= 50 ? "rgba(214,158,46,.1)" : "rgba(255,69,58,.1)";
  const scoreLabel = (s) => s >= 80 ? "CORE HOLD" : s >= 60 ? "HOLD" : s >= 40 ? "REVIEW" : "SELL";

  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    {/* Header */}
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,padding:"20px 24px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>Dividend Safety Screener</div>
          <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginTop:4}}>{items.length} empresas analizadas · Scoring 0-100 basado en Payout FCF, Deuda/EBITDA, FCF trend, Crecimiento EPS, Moat</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>runBulkFetch(portfolioUS)} disabled={bulkLoading}
            style={{padding:"10px 16px",borderRadius:10,border:"1px solid var(--gold)",background:"var(--gold-dim)",color:"var(--gold)",fontSize:12,fontWeight:700,cursor:bulkLoading?"wait":"pointer",fontFamily:"var(--fm)"}}>
            {bulkLoading?"Procesando...":"Analizar Mi Portfolio ("+portfolioUS.length+" US)"}
          </button>
          <button onClick={loadScreener} disabled={screenerLoading}
            style={{padding:"10px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-tertiary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>
            Refresh Scores
          </button>
        </div>
      </div>
      {bulkProgress && <div style={{fontSize:11,color:"var(--gold)",fontFamily:"var(--fm)",marginTop:8,padding:"6px 12px",borderRadius:8,background:"rgba(201,169,80,.08)"}}>{bulkProgress}</div>}

      {/* Custom tickers input */}
      <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
        <input type="text" placeholder="Tickers personalizados: AAPL, MSFT, JNJ, PG..." value={customTickers} onChange={e=>setCustomTickers(e.target.value)}
          style={{flex:1,padding:"10px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:10,color:"var(--text-primary)",fontSize:12,outline:"none",fontFamily:"var(--fm)"}}
          onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
        <button onClick={()=>{ const syms = customTickers.split(/[,\s]+/).map(s=>s.trim().toUpperCase()).filter(Boolean); if(syms.length>0) runBulkFetch(syms); }}
          disabled={bulkLoading || !customTickers.trim()}
          style={{padding:"10px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text-secondary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>
          Analizar
        </button>
      </div>
    </div>

    {/* Filters */}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
      <input type="text" placeholder="Buscar ticker/nombre..." value={screenerFilter.search} onChange={e=>setScreenerFilter(p=>({...p,search:e.target.value}))}
        style={{padding:"8px 12px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",width:160}}/>
      <select value={screenerFilter.sector} onChange={e=>setScreenerFilter(p=>({...p,sector:e.target.value}))}
        style={{padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
        <option value="">Todos los sectores</option>
        {sectors.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      <select value={screenerFilter.minYield||""} onChange={e=>setScreenerFilter(p=>({...p,minYield:Number(e.target.value)||0}))}
        style={{padding:"8px 12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,fontFamily:"var(--fm)"}}>
        <option value="">Yield min</option>
        <option value="1">Yield ≥ 1%</option>
        <option value="2">Yield ≥ 2%</option>
        <option value="3">Yield ≥ 3%</option>
        <option value="4">Yield ≥ 4%</option>
        <option value="5">Yield ≥ 5%</option>
      </select>
      <div style={{display:"flex",gap:4}}>
        {[{l:"Todos",v:0},{l:"≥40",v:40},{l:"≥60",v:60},{l:"≥80",v:80}].map(f=>(
          <button key={f.v} onClick={()=>setScreenerFilter(p=>({...p,minScore:f.v}))}
            style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${screenerFilter.minScore===f.v?"var(--gold)":"var(--border)"}`,background:screenerFilter.minScore===f.v?"var(--gold-dim)":"transparent",color:screenerFilter.minScore===f.v?"var(--gold)":"var(--text-tertiary)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--fm)"}}>{f.l}</button>
        ))}
      </div>
      <span style={{fontSize:10,color:"var(--text-tertiary)",fontFamily:"var(--fm)",marginLeft:"auto"}}>{sorted.length} de {items.length}</span>
    </div>

    {/* Score distribution mini-bar */}
    {items.length > 0 && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {[{l:"CORE HOLD (≥80)",min:80,c:"#30d158"},{l:"HOLD (60-79)",min:60,max:79,c:"var(--gold)"},{l:"REVIEW (40-59)",min:40,max:59,c:"#ff9f0a"},{l:"SELL (<40)",min:0,max:39,c:"#ff453a"}].map(b=>{
        const count = items.filter(i=>i.score>=(b.min) && i.score<=(b.max||100)).length;
        return <div key={b.l} style={{padding:"8px 14px",borderRadius:10,background:`${b.c}11`,border:`1px solid ${b.c}33`,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:20,fontWeight:800,color:b.c,fontFamily:"var(--fm)"}}>{count}</span>
          <span style={{fontSize:9,color:b.c,fontFamily:"var(--fm)",opacity:.8}}>{b.l}</span>
        </div>;
      })}
    </div>}

    {/* Results table */}
    {screenerLoading ? <div style={{padding:40,textAlign:"center",color:"var(--text-tertiary)",fontSize:12}}>Cargando screener...</div> :
     items.length === 0 ? <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:40,textAlign:"center"}}>
      <div style={{fontSize:14,color:"var(--text-secondary)",fontFamily:"var(--fd)",marginBottom:8}}>Sin datos todavia</div>
      <div style={{fontSize:11,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Pulsa "Analizar Mi Portfolio" para descargar fundamentales de tus {portfolioUS.length} posiciones US</div>
    </div> :
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:1200}}>
          <thead><tr>
            {[
              {k:"score",l:"SCORE",a:"center"},
              {k:"symbol",l:"TICKER",a:"left"},
              {k:"name",l:"EMPRESA",a:"left"},
              {k:"sector",l:"SECTOR",a:"left"},
              {k:"divYield",l:"YIELD%",a:"right"},
              {k:"payoutFCF",l:"PAYOUT FCF%",a:"right"},
              {k:"debtEBITDA",l:"DEUDA/EBITDA",a:"right"},
              {k:"roic",l:"ROIC%",a:"right"},
              {k:"pe",l:"P/E",a:"right"},
              {k:"fmpRatingScore",l:"FMP RATING",a:"center"},
              {k:"ibPrice",l:"IB PRECIO",a:"right"},
              {k:"ibPnl",l:"IB P&L",a:"right"},
            ].map((c,i)=>(
              <th key={i} onClick={()=>c.k&&sortBy(c.k)} style={{padding:"8px 10px",textAlign:c.a,color:screenerSort.col===c.k?"var(--gold)":"var(--text-tertiary)",fontSize:9,fontWeight:600,fontFamily:"var(--fm)",letterSpacing:.4,borderBottom:"2px solid var(--border)",cursor:c.k?"pointer":"default",userSelect:"none",whiteSpace:"nowrap",position:"sticky",top:0,background:"var(--card)"}}>{c.l}{sortArrow(c.k)}</th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((item,i) => {
              const inPortfolio = !!POS_STATIC[item.symbol];
              const fmpR = item.fmpRating || {};
              return <tr key={item.symbol} style={{background:i%2?"rgba(255,255,255,.01)":"transparent",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--gold-glow)"}
                onMouseLeave={e=>e.currentTarget.style.background=i%2?"rgba(255,255,255,.01)":"transparent"}
                onClick={()=>openAnalysis(item.symbol)}>
                <td style={{padding:"6px 10px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                  <span style={{padding:"3px 10px",borderRadius:6,background:scoreBg(item.score),color:scoreColor(item.score),fontWeight:800,fontSize:13,fontFamily:"var(--fm)"}}>{item.score}</span>
                </td>
                <td style={{padding:"6px 10px",fontWeight:700,color:inPortfolio?"var(--gold)":"var(--text-primary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                  {inPortfolio && <span style={{fontSize:7,marginRight:4}}>●</span>}{item.symbol}{item.capSize&&<span style={{fontSize:6,marginLeft:4,padding:"1px 3px",borderRadius:3,background:item.capSize==="Mega Cap"?"rgba(52,211,153,.08)":item.capSize==="Large Cap"?"rgba(96,165,250,.08)":item.capSize==="Mid Cap"?"rgba(214,158,46,.08)":"rgba(248,113,113,.08)",color:item.capSize==="Mega Cap"?"#34d399":item.capSize==="Large Cap"?"#60a5fa":item.capSize==="Mid Cap"?"#d69e2e":"#f87171",verticalAlign:"middle"}}>{item.capSize==="Mega Cap"?"MEGA":item.capSize==="Large Cap"?"LARGE":item.capSize==="Mid Cap"?"MID":item.capSize==="Small Cap"?"SMALL":"MICRO"}</span>}
                </td>
                <td title={item.name} style={{padding:"6px 10px",color:"var(--text-secondary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</td>
                <td style={{padding:"6px 10px",color:"var(--text-tertiary)",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)",fontSize:9}}>{item.sector}</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.divYield>4?"var(--green)":item.divYield>2?"var(--gold)":"var(--text-secondary)",fontWeight:600,borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.divYield,1)}%</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.payoutFCF<60?"var(--green)":item.payoutFCF<80?"var(--gold)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{item.payoutFCF}%</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.debtEBITDA<3?"var(--green)":item.debtEBITDA<5?"var(--gold)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.debtEBITDA,1)}x</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.roic>15?"var(--green)":item.roic>8?"var(--text-secondary)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{_sf(item.roic,1)}%</td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",color:item.pe>0&&item.pe<20?"var(--green)":item.pe>0&&item.pe<35?"var(--text-secondary)":"var(--red)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>{item.pe>0?_sf(item.pe,1):"—"}</td>
                <td style={{padding:"6px 10px",textAlign:"center",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                  <span style={{fontSize:10,padding:"3px 10px",borderRadius:5,fontWeight:700,background:(fmpR.rating||"").startsWith("S")?"rgba(48,209,88,.12)":(fmpR.rating||"").startsWith("A")?"rgba(214,158,46,.12)":(fmpR.rating||"").startsWith("B")?"rgba(10,132,255,.1)":(fmpR.rating||"").startsWith("C")?"rgba(255,69,58,.1)":"rgba(255,255,255,.06)",color:(fmpR.rating||"").startsWith("S")?"#30d158":(fmpR.rating||"").startsWith("A")?"var(--gold)":(fmpR.rating||"").startsWith("B")?"#64d2ff":(fmpR.rating||"").startsWith("C")?"var(--red)":"var(--text-tertiary)"}}>{fmpR.rating||"—"}</span>
                </td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                  {(() => {
                    const IB_MAP = {"BME:VIS":"VIS","BME:AMS":"AMS","IIPR-PRA":"IIPR PRA","HKG:9618":"9618","HKG:1052":"1052","HKG:2219":"2219","HKG:1910":"1910","HGK:9616":"9616"};
                    const ibTicker = IB_MAP[item.symbol] || item.symbol;
                    const ibPos = (ibData?.positions||[]).find(p => (p.ticker === ibTicker || p.ticker === item.symbol) && p.assetClass === "STK");
                    if (!ibPos) return <span style={{color:"var(--text-tertiary)",fontSize:9}}>—</span>;
                    return <div>
                      <div style={{color:"#64d2ff",fontWeight:600,fontSize:11}}>${_sf(ibPos.mktPrice,2)}</div>
                      <div style={{fontSize:8,color:"var(--text-tertiary)"}}>{ibPos.shares}sh</div>
                    </div>;
                  })()}
                </td>
                <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"var(--fm)",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                  {(() => {
                    const IB_MAP = {"BME:VIS":"VIS","BME:AMS":"AMS","IIPR-PRA":"IIPR PRA","HKG:9618":"9618"};
                    const ibTicker = IB_MAP[item.symbol] || item.symbol;
                    const ibPos = (ibData?.positions||[]).find(p => (p.ticker === ibTicker || p.ticker === item.symbol) && p.assetClass === "STK");
                    if (!ibPos || !ibPos.unrealizedPnl) return <span style={{color:"var(--text-tertiary)",fontSize:9}}>—</span>;
                    const pnl = ibPos.unrealizedPnl;
                    return <span style={{fontWeight:600,fontSize:10,color:pnl>=0?"var(--green)":"var(--red)"}}>{pnl>=0?"+":""}${_sf(pnl,0)}</span>;
                  })()}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>}
  </div>;
}
