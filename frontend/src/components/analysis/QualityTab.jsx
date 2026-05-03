import { useState, useRef } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, AreaSparkline, Card, MetricHistoryChart } from '../ui';
import { _sf, n, fP, fX, fM, div as _div } from '../../utils/formatters';
import { R } from '../../utils/ratings';
import { getPref, setPref, removePref } from '../../utils/userPrefs';

const PREF_KEY = 'ayr-row-order-quality';
const DEFAULT_ORDER = ["gm","om","nm","roe","roic","fcfm","cfm","ocfCapex"];

function savedOrder() {
  try { const v = getPref(PREF_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export default function QualityTab() {
  const { DATA_YEARS, CHART_YEARS, DISPLAY_YEARS, L, comp, fmpExtra } = useAnalysis();
  // Click any metric card or table row to show a big year-by-year line chart
  // at the top of the tab. Click ✕ or the same metric again to close.
  const [selectedKey, setSelectedKey] = useState(null);
  const [rowOrder, setRowOrder] = useState(() => savedOrder() || DEFAULT_ORDER);
  const dragKey = useRef(null);
  const [dragOver, setDragOver] = useState(null);

    const yrs = DISPLAY_YEARS || DATA_YEARS;
    const ALL_METRICS = [
      {k:"gm",l:"Margen Bruto",r:R.gm,f:fP},{k:"om",l:"Margen Operativo",r:R.om,f:fP},{k:"nm",l:"Margen Neto",r:R.nm,f:fP},
      {k:"roe",l:"ROE",r:R.roe,f:fP},{k:"roic",l:"ROIC",r:R.roic,f:fP},{k:"fcfm",l:"Margen FCF",r:R.fcfm,f:fP},
      {k:"cfm",l:"OCF / Ventas",f:fP},{k:"ocfCapex",l:"OCF / CapEx",f:fX},
    ];
    const metricMap = Object.fromEntries(ALL_METRICS.map(m => [m.k, m]));
    const metrics = [...new Set([...rowOrder, ...DEFAULT_ORDER])].filter(k => metricMap[k]).map(k => metricMap[k]);
    const selected = metrics.find(m => m.k === selectedKey);
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>◆ Calidad del Negocio</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Márgenes, rentabilidad y eficiencia operativa a lo largo del tiempo. <span style={{color:"var(--text-tertiary)"}}>Click en cualquier métrica para ver evolución anual.</span></p>
        {selected && (
          <MetricHistoryChart
            label={selected.l}
            years={CHART_YEARS}
            values={CHART_YEARS.map(y => comp[y]?.[selected.k])}
            format={selected.f}
            color={selected.r ? '#c8a44e' : '#34d399'}
            onClose={() => setSelectedKey(null)}
          />
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:12,marginBottom:20}}>
          {metrics.slice(0,6).map(m=>{
            const vals = yrs.slice().reverse().map(y=>comp[y]?.[m.k]);
            const isActive = selectedKey === m.k;
            return (
              <div key={m.k} role="button" tabIndex={0}
                onClick={() => setSelectedKey(isActive ? null : m.k)}
                onKeyDown={e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); setSelectedKey(isActive ? null : m.k); } }}
                title={isActive ? 'Click para cerrar el chart' : 'Click para ver evolución anual'}
                style={{cursor:'pointer'}}>
                <Card style={{outline: isActive ? '1.5px solid var(--gold)' : 'none', background: isActive ? 'var(--gold-dim)' : undefined, transition:'background .15s,outline .15s'}}>
                  <div style={{fontSize:10,color:isActive?"var(--gold)":"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:"var(--fm)",display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:10,opacity:.7}}>📈</span>{m.l}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                    <span style={{fontSize:24,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{m.f(L[m.k])}</span>
                    {m.r && <Badge val={L[m.k]} rules={m.r}/>}
                  </div>
                  <div style={{marginTop:10}}><AreaSparkline data={vals} w={160} h={36}/></div>
                </Card>
              </div>
            );
          })}
        </div>
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
            <thead><tr>
              <th style={{position:"sticky",left:0,background:"var(--surface)",padding:"10px 14px",textAlign:"left",color:"var(--gold)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:140,fontFamily:"var(--fm)",fontSize:10}}>MÉTRICA</th>
              <th style={{padding:"10px 8px",textAlign:"center",color:"var(--text-secondary)",borderBottom:"2px solid var(--table-border)",minWidth:80,fontSize:10}}>RATING</th>
              {yrs.map(y=><th key={y} style={{padding:"10px 6px",textAlign:"right",color:"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",minWidth:72,fontFamily:"var(--fm)",fontSize:10}}>{y}</th>)}
            </tr></thead>
            <tbody>{metrics.map((m,i)=>{
              const isActive = selectedKey === m.k;
              const isDragTarget = dragOver === m.k;
              return (
                <tr key={m.k}
                  draggable={true}
                  onDragStart={e => { dragKey.current = m.k; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', m.k); } catch {} }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragKey.current && dragKey.current !== m.k) setDragOver(m.k); }}
                  onDragLeave={() => { if (dragOver === m.k) setDragOver(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    const src = dragKey.current || e.dataTransfer.getData('text/plain');
                    if (!src || src === m.k) { dragKey.current = null; setDragOver(null); return; }
                    const keys = metrics.map(x => x.k);
                    const without = keys.filter(k => k !== src);
                    const targetIdx = without.indexOf(m.k);
                    const newOrder = [...without.slice(0, targetIdx), src, ...without.slice(targetIdx)];
                    setRowOrder(newOrder);
                    setPref(PREF_KEY, JSON.stringify(newOrder));
                    dragKey.current = null; setDragOver(null);
                  }}
                  onDragEnd={() => { dragKey.current = null; setDragOver(null); }}
                  onContextMenu={e => {
                    e.preventDefault();
                    if (window.confirm('Restablecer orden de filas al original?')) { setRowOrder(DEFAULT_ORDER); removePref(PREF_KEY); }
                  }}
                  title="Arrastra para reordenar · click derecho para restablecer"
                  style={{background: isActive ? "var(--gold-dim)" : (i%2?"var(--row-alt)":"transparent"), cursor:"grab", transition:"background .15s, border-left .1s",
                    borderLeft: isDragTarget ? "3px solid var(--gold)" : "3px solid transparent",
                    opacity: dragKey.current === m.k ? 0.4 : 1}}>
                  <td onClick={() => setSelectedKey(isActive ? null : m.k)} title="Click para ver evolución anual"
                    style={{position:"sticky",left:0,background: isActive ? "var(--gold-dim)" : (i%2?"var(--card)":"var(--bg)"),padding:"7px 14px",color: isActive ? "var(--gold)" : "var(--text-primary)",fontWeight:500,borderBottom:"1px solid var(--table-border)",cursor:"pointer",userSelect:"none"}}>
                    <span style={{display:"inline-block",marginRight:6,opacity:.35,fontSize:9,letterSpacing:1,verticalAlign:"middle",fontFamily:"var(--fm)"}}>⋮⋮</span>📈 {m.l}</td>
                  <td style={{padding:"7px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>{m.r?<Badge val={L[m.k]} rules={m.r}/>:"—"}</td>
                  {yrs.map(y=><td key={y} style={{padding:"7px 6px",textAlign:"right",color:"var(--text-primary)",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{m.f(comp[y]?.[m.k])}</td>)}
                </tr>
              );
            })}</tbody>
          </table>
        </Card>

        {/* Revenue Segmentation — Product & Geographic */}
        {(fmpExtra.revSegments?.length > 0 || fmpExtra.geoSegments?.length > 0) && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16}}>
            {/* Product Segments */}
            {fmpExtra.revSegments?.length > 0 && (() => {
              const latest = fmpExtra.revSegments.find(s => s.period === "FY") || fmpExtra.revSegments[0];
              const prev = fmpExtra.revSegments.find(s => s.period === "FY" && s.fiscalYear === (latest?.fiscalYear||0)-1);
              if (!latest?.data) return null;
              const entries = Object.entries(latest.data).sort((a,b) => b[1] - a[1]);
              const total = entries.reduce((s,e) => s + e[1], 0);
              return (
                <Card title={`Revenue por Producto (${latest.fiscalYear || "—"})`} icon="📦">
                  {entries.map(([name, val], i) => {
                    const pct = total > 0 ? val / total : 0;
                    const prevVal = prev?.data?.[name];
                    const growth = prevVal > 0 ? (val / prevVal - 1) : null;
                    return (
                      <div key={i} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:10.5,color:"var(--text-primary)",fontWeight:500}}>{name}</span>
                          <span style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
                            {fM(val/1e6)} ({_sf(pct*100,1)}%)
                            {n(growth) != null && <span style={{color:growth>0?"var(--green)":"var(--red)",marginLeft:4,fontSize:9}}>{growth>0?"+":""}{_sf(growth*100,1)}%</span>}
                          </span>
                        </div>
                        <div style={{height:4,background:"var(--subtle-border)",borderRadius:2}}>
                          <div style={{width:`${pct*100}%`,height:"100%",background:"var(--gold)",borderRadius:2,opacity:0.7}}/>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              );
            })()}
            {/* Geographic Segments */}
            {fmpExtra.geoSegments?.length > 0 && (() => {
              const latest = fmpExtra.geoSegments.find(s => s.period === "FY") || fmpExtra.geoSegments[0];
              const prev = fmpExtra.geoSegments.find(s => s.period === "FY" && s.fiscalYear === (latest?.fiscalYear||0)-1);
              if (!latest?.data) return null;
              const entries = Object.entries(latest.data).sort((a,b) => b[1] - a[1]);
              const total = entries.reduce((s,e) => s + e[1], 0);
              const geoColors = ["#64d2ff","#30d158","#ff9f0a","#bf5af2","#ff453a","#ffd60a","#5e5ce6"];
              return (
                <Card title={`Revenue por Región (${latest.fiscalYear || "—"})`} icon="🌍">
                  {entries.map(([name, val], i) => {
                    const pct = total > 0 ? val / total : 0;
                    const prevVal = prev?.data?.[name];
                    const growth = prevVal > 0 ? (val / prevVal - 1) : null;
                    const color = geoColors[i % geoColors.length];
                    return (
                      <div key={i} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:10.5,color:"var(--text-primary)",fontWeight:500}}>{name.replace(" Segment","")}</span>
                          <span style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--text-secondary)"}}>
                            {fM(val/1e6)} ({_sf(pct*100,1)}%)
                            {n(growth) != null && <span style={{color:growth>0?"var(--green)":"var(--red)",marginLeft:4,fontSize:9}}>{growth>0?"+":""}{_sf(growth*100,1)}%</span>}
                          </span>
                        </div>
                        <div style={{height:4,background:"var(--subtle-border)",borderRadius:2}}>
                          <div style={{width:`${pct*100}%`,height:"100%",background:color,borderRadius:2,opacity:0.7}}/>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              );
            })()}
          </div>
        )}

        <Card style={{marginTop:16,background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.7}}>
            <div><strong style={{color:"var(--text-primary)"}}>Margen Bruto &gt;40%</strong> indica ventaja competitiva fuerte (moat) y poder de fijación de precios. Por debajo del 20%, el negocio está commoditizado.<br/><br/><strong style={{color:"var(--text-primary)"}}>ROE &gt;15%</strong> muestra que la empresa genera gran retorno sobre el capital de los accionistas.</div>
            <div><strong style={{color:"var(--text-primary)"}}>ROIC &gt; WACC</strong> es la regla de oro: la empresa crea valor. Si ROIC &lt; WACC, destruye valor para todos.<br/><br/><strong style={{color:"var(--text-primary)"}}>OCF/CapEx &gt; 3x</strong> significa negocio ligero en activos que genera mucha más caja de la que necesita invertir.</div>
          </div>
        </Card>
      </div>
    );
}
