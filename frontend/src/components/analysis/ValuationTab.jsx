import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, Card } from '../ui';
import { _sf, n, fP, fX, fC, fM, div } from '../../utils/formatters.js';
import { R } from '../../utils/ratings.js';

export default function ValuationTab() {
  const { DATA_YEARS, L, LD, advancedMetrics, cfg, comp, comps, dcf, fmpExtra, setComps } = useAnalysis();
    const yrs = DATA_YEARS;
    const metrics = [
      {k:"eve",l:"EV / EBITDA",r:R.eve,f:fX},{k:"pb",l:"Precio / Book",f:fX},{k:"bvps",l:"Book Value / Acción",f:v=>fC(v)},
      {k:"fcfps",l:"FCF / Acción",f:v=>fC(v)},{k:"fcfPayout",l:"FCF Payout",f:fP},{k:"ePayout",l:"Earnings Payout",f:fP},
    ];
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>◎ Valoración por Múltiplos</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>¿Está cara o barata respecto a sus fundamentales y competidores?</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:20}}>
          {[
            {l:"EV/EBITDA",v:fX(L.eve),r:R.eve,rv:L.eve},{l:"P/Book",v:fX(L.pb)},
            {l:"PER por FCF",v:fX(dcf?.per)},{l:"FCF Yield",v:fP(dcf?.fcfYield)},
            {l:"Forward P/E",v:advancedMetrics.forwardPE?_sf(advancedMetrics.forwardPE,1)+"x":"—",sub:advancedMetrics.forwardEPS?`Est. EPS: $${_sf(advancedMetrics.forwardEPS,2)}`:null},
            {l:"Shiller P/E (CAPE)",v:advancedMetrics.shillerPE?_sf(advancedMetrics.shillerPE,1)+"x":"—",sub:`Avg ${DATA_YEARS.length}y EPS`},
          ].map((m,i)=>(
            <Card key={i}>
              <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>{m.l}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                <span style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{m.v}</span>
                {m.r && <Badge val={m.rv} rules={m.r}/>}
              </div>
              {m.sub && <div style={{fontSize:9,color:"var(--text-tertiary)",marginTop:2}}>{m.sub}</div>}
            </Card>
          ))}
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:160,fontFamily:"var(--fm)",fontSize:10}}>MÚLTIPLO</th>
              {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>(
              <tr key={m.k} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                <td style={{position:"sticky",left:0,background:i%2?"var(--card)":"var(--bg)",padding:"7px 14px",color:"var(--text-primary)",fontWeight:500,borderBottom:"1px solid var(--table-border)"}}>{m.l}</td>
                {yrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{m.f(comp[y]?.[m.k])}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </Card>

        {/* ═══ FMP INTELLIGENCE ═══ */}
        {(fmpExtra.rating?.rating || fmpExtra.priceTarget?.targetConsensus || fmpExtra.estimates?.length > 0) && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16,marginBottom:16}}>
            {/* FMP Rating */}
            {fmpExtra.rating?.rating && (
              <Card style={{borderColor:fmpExtra.rating.overallScore>=4?"rgba(48,209,88,.2)":fmpExtra.rating.overallScore>=3?"rgba(255,214,10,.2)":"rgba(255,69,58,.2)"}}>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>FMP Rating</div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:56,height:56,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,fontFamily:"var(--fm)",
                    color:fmpExtra.rating.overallScore>=4?"#30d158":fmpExtra.rating.overallScore>=3?"#ffd60a":"#ff453a",
                    background:fmpExtra.rating.overallScore>=4?"rgba(48,209,88,.1)":fmpExtra.rating.overallScore>=3?"rgba(255,214,10,.1)":"rgba(255,69,58,.1)",
                    border:`2px solid ${fmpExtra.rating.overallScore>=4?"rgba(48,209,88,.3)":fmpExtra.rating.overallScore>=3?"rgba(255,214,10,.3)":"rgba(255,69,58,.3)"}`
                  }}>{fmpExtra.rating.rating}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>Score: {fmpExtra.rating.overallScore}/5</div>
                    <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                      {[{k:"discountedCashFlowScore",l:"DCF"},{k:"returnOnEquityScore",l:"ROE"},{k:"returnOnAssetsScore",l:"ROA"},{k:"debtToEquityScore",l:"D/E"},{k:"priceToEarningsScore",l:"P/E"},{k:"priceToBookScore",l:"P/B"}].map(s=>{
                        const v = fmpExtra.rating[s.k];
                        return v != null ? <span key={s.k} style={{fontSize:8,padding:"2px 6px",borderRadius:4,fontFamily:"var(--fm)",fontWeight:600,
                          color:v>=4?"#30d158":v>=3?"#ffd60a":"#ff453a",background:v>=4?"rgba(48,209,88,.08)":v>=3?"rgba(255,214,10,.08)":"rgba(255,69,58,.08)"
                        }}>{s.l}:{v}</span> : null;
                      })}
                    </div>
                    {/* Analyst Grades Consensus */}
                    {fmpExtra.grades?.consensus && (
                      <div style={{display:"flex",gap:4,marginTop:6,alignItems:"center"}}>
                        <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,fontFamily:"var(--fm)",
                          color:fmpExtra.grades.consensus==="Strong Buy"||fmpExtra.grades.consensus==="Buy"?"#30d158":fmpExtra.grades.consensus==="Hold"?"#ffd60a":"#ff453a",
                          background:fmpExtra.grades.consensus==="Strong Buy"||fmpExtra.grades.consensus==="Buy"?"rgba(48,209,88,.1)":fmpExtra.grades.consensus==="Hold"?"rgba(255,214,10,.1)":"rgba(255,69,58,.1)"
                        }}>{fmpExtra.grades.consensus}</span>
                        <span style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
                          {fmpExtra.grades.buy||0}B {fmpExtra.grades.hold||0}H {fmpExtra.grades.sell||0}S
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
            {/* Price Targets */}
            {fmpExtra.priceTarget?.targetConsensus > 0 && (
              <Card>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>Analyst Price Targets</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
                  {[{l:"Bajo",v:fmpExtra.priceTarget.targetLow,c:"var(--red)"},{l:"Consenso",v:fmpExtra.priceTarget.targetConsensus,c:"var(--gold)"},{l:"Alto",v:fmpExtra.priceTarget.targetHigh,c:"var(--green)"}].map(x=>(
                    <div key={x.l}>
                      <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>{x.l}</div>
                      <div style={{fontSize:18,fontWeight:700,color:x.c,fontFamily:"var(--fm)"}}>{fC(x.v)}</div>
                    </div>
                  ))}
                </div>
                {cfg.price > 0 && fmpExtra.priceTarget.targetConsensus > 0 && (() => {
                  const upside = (fmpExtra.priceTarget.targetConsensus / cfg.price - 1) * 100;
                  return <div style={{marginTop:8,textAlign:"center",fontSize:11,fontWeight:600,color:upside>0?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>
                    {upside>0?"↑":"↓"} {_sf(Math.abs(upside),1)}% vs precio actual
                  </div>;
                })()}
              </Card>
            )}
            {/* Analyst Estimates */}
            {fmpExtra.estimates?.length > 0 && (
              <Card>
                <div style={{fontSize:10,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:8}}>Analyst Estimates (FY)</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {fmpExtra.estimates.slice(0,3).map((e,i) => {
                    const revG = e.revenueAvg && fmpExtra.estimates[i+1]?.revenueAvg ? (e.revenueAvg / fmpExtra.estimates[i+1].revenueAvg - 1) : null;
                    return (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",borderRadius:6,background:i===0?"rgba(200,164,78,.06)":"rgba(255,255,255,.02)"}}>
                        <span style={{fontSize:10,fontWeight:600,color:i===0?"var(--gold)":"var(--text-secondary)",fontFamily:"var(--fm)"}}>{e.date?.slice(0,4) || "—"}</span>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:10,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>EPS: {e.epsAvg ? fC(e.epsAvg) : "—"}</div>
                          <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>Rev: {e.revenueAvg ? fM(e.revenueAvg/1e6) : "—"}{n(revG)!=null?` (${revG>0?"+":""}${_sf(revG*100,1)}%)`:""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Comparables */}
        <Card title="Comparables — Competidores" icon="🏢" style={{marginTop:16}}>
          <p style={{fontSize:11,color:"var(--text-secondary)",marginBottom:12}}>Añade competidores para comparar múltiplos. Los datos los introduces tú de GuruFocus o similares.</p>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {comps.map((c,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
                <input placeholder="Nombre" value={c.name} onChange={e=>{const nc=[...comps];nc[i]={...nc[i],name:e.target.value};setComps(nc);}}
                  style={{flex:2,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)"}}
                  onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <input placeholder="P/E" type="number" value={c.pe||""} onChange={e=>{const nc=[...comps];nc[i]={...nc[i],pe:parseFloat(e.target.value)||0};setComps(nc);}}
                  style={{flex:1,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",textAlign:"right"}}
                  onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <input placeholder="EV/EBITDA" type="number" value={c.evEbitda||""} onChange={e=>{const nc=[...comps];nc[i]={...nc[i],evEbitda:parseFloat(e.target.value)||0};setComps(nc);}}
                  style={{flex:1,padding:"6px 8px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-primary)",fontSize:11,outline:"none",fontFamily:"var(--fm)",textAlign:"right"}}
                  onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <button onClick={()=>setComps(comps.filter((_,j)=>j!==i))} style={{padding:"4px 8px",background:"rgba(255,69,58,.1)",border:"1px solid rgba(255,69,58,.2)",borderRadius:6,color:"var(--red)",fontSize:10,cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={()=>setComps([...comps,{name:"",pe:0,evEbitda:0}])} style={{padding:"6px 14px",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-secondary)",fontSize:11,cursor:"pointer",fontFamily:"var(--fm)"}}>+ Añadir competidor</button>
          
          {comps.some(c=>c.name&&(c.pe||c.evEbitda)) && (
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
              {[{name:cfg.ticker||"Empresa",pe:LD.eps>0?cfg.price/LD.eps:null,evEbitda:L.eve,isSelf:true},...comps.filter(c=>c.name)].map((c,i)=>(
                <div key={i} style={{padding:"10px 12px",borderRadius:10,background:c.isSelf?"var(--gold-glow)":"rgba(255,255,255,.03)",border:`1px solid ${c.isSelf?"var(--gold-dim)":"var(--border)"}`}}>
                  <div style={{fontSize:10,fontWeight:600,color:c.isSelf?"var(--gold)":"var(--text-secondary)",marginBottom:6}}>{c.name}</div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <div><div style={{fontSize:8,color:"var(--text-tertiary)"}}>P/E</div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{c.pe?_sf(c.pe,1)+"x":"—"}</div></div>
                    <div><div style={{fontSize:8,color:"var(--text-tertiary)"}}>EV/EBITDA</div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{c.evEbitda?_sf(c.evEbitda,1)+"x":"—"}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* FMP Stock Peers — auto-detected competitors */}
        {fmpExtra.peers?.length > 0 && (
          <Card title="Peers (FMP auto-detectados)" icon="🔗" style={{marginTop:12}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {fmpExtra.peers.map((p,i)=>(
                <div key={i} style={{padding:"10px 10px",borderRadius:8,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.04)",cursor:"pointer",transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold)";e.currentTarget.style.background="var(--gold-glow)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.04)";e.currentTarget.style.background="rgba(255,255,255,.03)";}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",fontFamily:"var(--fm)"}}>{p.symbol}</div>
                  <div style={{fontSize:9.5,color:"var(--text-secondary)",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.companyName}</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                    <span style={{fontSize:10,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{fC(p.price)}</span>
                    <span style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{p.mktCap>=1e12?_sf(p.mktCap/1e12,1)+"T":p.mktCap>=1e9?_sf(p.mktCap/1e9,0)+"B":_sf(p.mktCap/1e6,0)+"M"}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
}
