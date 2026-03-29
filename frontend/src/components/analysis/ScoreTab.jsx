import { useAnalysis } from '../../context/AnalysisContext';
import { Badge, DonutChart, GaugeVerdict, Card } from '../ui';
import { _sf, n, f2, fP, fX, div } from '../../utils/formatters.js';
import { R } from '../../utils/ratings.js';

export default function ScoreTab() {
  const { DATA_YEARS, advancedMetrics, altmanZ, cfg, fin, piotroski, scoreItems, ssd, totalScore, wacc } = useAnalysis();
    const cats = [...new Set(scoreItems.map(x=>x.cat))];
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>★ Veredicto Final</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Resumen ejecutivo con puntuación global y recomendación.</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
          <Card glow><DonutChart value={totalScore} size={140} label="Puntuación Global" sublabel="/100"/></Card>
          <Card glow><GaugeVerdict score={totalScore}/></Card>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          {cats.map(cat=>{
            const items = scoreItems.filter(x=>x.cat===cat);
            return (
              <Card key={cat} title={cat}>
                {items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<items.length-1?"1px solid #21262d":"none"}}>
                    <div>
                      <div style={{fontSize:12,color:"var(--text-primary)",fontWeight:500}}>{it.name}</div>
                      <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{n(it.val)!=null?(typeof it.val==="number"&&it.rules===R.pio?`${it.val}/9`:it.rules===R.growth||it.rules===R.mos?fP(it.val):it.rules===R.d2fcf||it.rules===R.ic||it.rules===R.eve?fX(it.val):it.name==="Altman Z"?_sf(it.val,1):fP(it.val)):"—"}</div>
                    </div>
                    <Badge val={it.val} rules={it.rules}/>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>

        {/* Piotroski Detail */}
        <Card title="Piotroski F-Score" icon="🔬" badge={<Badge val={piotroski.score} rules={R.pio}/>}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {piotroski.items.map((it,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:it.pass?"rgba(48,209,88,.06)":"rgba(255,69,58,.06)",border:`1px solid ${it.pass?"rgba(48,209,88,.15)":"rgba(255,69,58,.15)"}`}}>
                <span style={{fontSize:14}}>{it.pass?"✓":"✗"}</span>
                <div><div style={{fontSize:11,color:it.pass?"var(--green)":"var(--red)",fontWeight:600}}>{it.name}</div>
                  <div style={{fontSize:9.5,color:"var(--text-tertiary)"}}>{it.desc}</div></div>
              </div>
            ))}
          </div>
        </Card>

        {/* Altman Z-Score Detail */}
        <Card title="Altman Z-Score" icon="📐" badge={altmanZ.score != null ? <span style={{fontSize:11,fontWeight:700,color:altmanZ.zoneColor,background:`${altmanZ.zoneColor}15`,padding:"4px 12px",borderRadius:100,border:`1px solid ${altmanZ.zoneColor}33`}}>{_sf(altmanZ.score,2)} — {altmanZ.zone}</span> : null} style={{marginTop:16}}>
          {altmanZ.score != null ? (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:12}}>
                {altmanZ.items.map((it,i)=>(
                  <div key={i} style={{padding:"8px",borderRadius:8,background:"rgba(255,255,255,.03)",textAlign:"center"}}>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:4}}>{it.name.split(":")[0]}</div>
                    <div style={{fontSize:16,fontWeight:700,color:it.weighted>0?"var(--text-primary)":"var(--red)",fontFamily:"var(--fm)"}}>{_sf(it.weighted,2)}</div>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",marginTop:2}}>×{it.weight}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.6}}>
                Z = 1.2×(WC/A) + 1.4×(RE/A) + 3.3×(EBIT/A) + 0.6×(MCap/Deuda) + 1.0×(Ventas/A). {'>'} 2.99 = zona segura, {'<'} 1.81 = riesgo de quiebra.
              </div>
            </div>
          ) : <div style={{color:"var(--text-tertiary)",fontSize:12,textAlign:"center",padding:16}}>Introduce datos para calcular</div>}
        </Card>

        {/* Beneish M-Score + Buyback Analysis */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16}}>
          <Card title="Beneish M-Score" icon="🔎" badge={advancedMetrics.beneish != null ? <span style={{fontSize:11,fontWeight:700,color:advancedMetrics.beneishColor,background:`${advancedMetrics.beneishColor}15`,padding:"4px 12px",borderRadius:100,border:`1px solid ${advancedMetrics.beneishColor}33`}}>{_sf(advancedMetrics.beneish,2)}</span> : null}>
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{fontSize:28,fontWeight:800,color:advancedMetrics.beneishColor,fontFamily:"var(--fm)"}}>{advancedMetrics.beneish != null ? _sf(advancedMetrics.beneish,2) : "—"}</div>
              <div style={{fontSize:12,fontWeight:600,color:advancedMetrics.beneishColor,marginTop:4}}>{advancedMetrics.beneishLabel}</div>
            </div>
            <div style={{fontSize:10,color:"var(--text-tertiary)",lineHeight:1.6,marginTop:8}}>
              {'<'} -2.22 = Improbable manipulador · -2.22 a -1.78 = Zona gris · {'>'} -1.78 = Posible manipulación de earnings. Modelo de 8 variables que detecta manipulación contable.
            </div>
          </Card>

          <Card title="Buyback / Dilución" icon="🔄" badge={advancedMetrics.buybackCAGR != null ? <span style={{fontSize:11,fontWeight:700,color:advancedMetrics.buybackCAGR<-0.01?"#30d158":advancedMetrics.buybackCAGR>0.01?"#ff453a":"#888",background:advancedMetrics.buybackCAGR<-0.01?"rgba(48,209,88,.12)":advancedMetrics.buybackCAGR>0.01?"rgba(255,69,58,.12)":"rgba(255,255,255,.06)",padding:"4px 12px",borderRadius:100,border:"1px solid rgba(255,255,255,.1)"}}>{advancedMetrics.buybackLabel}</span> : null}>
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{fontSize:28,fontWeight:800,color:advancedMetrics.buybackCAGR!=null?(advancedMetrics.buybackCAGR<-0.01?"var(--green)":advancedMetrics.buybackCAGR>0.01?"var(--red)":"var(--text-primary)"):"var(--text-tertiary)",fontFamily:"var(--fm)"}}>
                {advancedMetrics.buybackCAGR != null ? `${(advancedMetrics.buybackCAGR*100)>0?"+":""}${_sf(advancedMetrics.buybackCAGR*100,1)}%` : "—"}
              </div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:4}}>CAGR acciones en circulación</div>
            </div>
            <div style={{display:"flex",gap:3,alignItems:"flex-end",height:40,marginTop:8}}>
              {DATA_YEARS.slice().reverse().filter(y=>fin[y]?.sharesOut>0).map((y,i,arr)=>{
                const v=fin[y].sharesOut; const max=Math.max(...arr.map(yy=>fin[yy].sharesOut));
                return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{width:"100%",maxWidth:18,height:`${v/max*100}%`,background:i===arr.length-1?"var(--gold)":"rgba(100,210,255,.4)",borderRadius:"2px 2px 0 0",minHeight:3}}/>
                  <span style={{fontSize:6,color:"var(--text-tertiary)",marginTop:1,fontFamily:"var(--fm)"}}>{String(y).slice(2)}</span>
                </div>;
              })}
            </div>
            <div style={{fontSize:10,color:"var(--text-tertiary)",lineHeight:1.6,marginTop:8}}>
              Negativo = recompra de acciones (bueno para accionistas). Positivo = dilución.
            </div>
          </Card>
        </div>

        {/* AI Disruption Risk */}
        {ssd.aiDisruptionLevel && (
          <Card title="Riesgo Disrupción IA" icon="🤖" style={{marginTop:16}} badge={
            <span style={{fontSize:11,fontWeight:700,
              color:ssd.aiDisruptionLevel==="Low"?"#30d158":ssd.aiDisruptionLevel==="Medium"?"#ffd60a":ssd.aiDisruptionLevel==="High"?"#ff9f0a":"#ff453a",
              background:ssd.aiDisruptionLevel==="Low"?"rgba(48,209,88,.12)":ssd.aiDisruptionLevel==="Medium"?"rgba(255,214,10,.12)":ssd.aiDisruptionLevel==="High"?"rgba(255,159,10,.12)":"rgba(255,69,58,.12)",
              padding:"4px 12px",borderRadius:100,border:"1px solid rgba(255,255,255,.1)"
            }}>{ssd.aiDisruptionLevel} ({ssd.aiDisruptionScore}/100)</span>
          }>
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{fontSize:36,fontWeight:800,fontFamily:"var(--fm)",
                color:ssd.aiDisruptionScore<=25?"#30d158":ssd.aiDisruptionScore<=50?"#ffd60a":ssd.aiDisruptionScore<=75?"#ff9f0a":"#ff453a"
              }}>{ssd.aiDisruptionScore}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:2}}>{ssd.aiDisruptionLevel==="Low"?"Bajo riesgo de disrupción":ssd.aiDisruptionLevel==="Medium"?"Riesgo moderado":ssd.aiDisruptionLevel==="High"?"Alto riesgo":"Riesgo crítico"}</div>
            </div>
            {ssd.aiDisruptionAssessment && <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.7,marginTop:8,padding:"10px 12px",background:"rgba(255,255,255,.02)",borderRadius:8}}>{ssd.aiDisruptionAssessment}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
              {ssd.aiDisruptionThreats?.length > 0 && (
                <div style={{padding:"10px",background:"rgba(255,69,58,.04)",borderRadius:8,border:"1px solid rgba(255,69,58,.08)"}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#ff453a",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>AMENAZAS IA</div>
                  {ssd.aiDisruptionThreats.map((t,i) => <div key={i} style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.5,marginBottom:4}}>• {t}</div>)}
                </div>
              )}
              {ssd.aiDisruptionDefenses?.length > 0 && (
                <div style={{padding:"10px",background:"rgba(48,209,88,.04)",borderRadius:8,border:"1px solid rgba(48,209,88,.08)"}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#30d158",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:6}}>DEFENSAS</div>
                  {ssd.aiDisruptionDefenses.map((d,i) => <div key={i} style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.5,marginBottom:4}}>• {d}</div>)}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* WACC Detail */}
        <Card title="WACC Calculado" icon="🧮" style={{marginTop:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
            {[{l:"WACC",v:fP(wacc.wacc)},{l:"Coste Equity (Ke)",v:fP(wacc.costEquity)},{l:"Coste Deuda (Kd)",v:fP(wacc.costDebt)},{l:"Peso Equity",v:fP(wacc.weightE)},{l:"Peso Deuda",v:fP(wacc.weightD)},{l:"Beta",v:f2(cfg.beta)},{l:"Tasa libre riesgo",v:fP(cfg.riskFree/100)},{l:"Prima mercado",v:fP(cfg.marketPremium/100)}].map((x,i)=>(
              <div key={i}><div style={{fontSize:9,color:"var(--text-secondary)",fontWeight:600,textTransform:"uppercase",fontFamily:"var(--fm)"}}>{x.l}</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fm)",marginTop:2}}>{x.v}</div></div>
            ))}
          </div>
          <div style={{marginTop:12,fontSize:11,color:"var(--text-tertiary)",lineHeight:1.6}}>
            WACC = (E/V)×Ke + (D/V)×Kd×(1-t) · Ke = Rf + β×(Rm-Rf) · Kd = Intereses/Deuda×(1-t)
          </div>
        </Card>

        <Card style={{marginTop:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>📝 Notas y Tesis de Inversión</div>
          <textarea placeholder="Escribe tu tesis: ¿por qué invertir? ¿Cuáles son los riesgos? ¿Catalizadores? ¿Precio objetivo?" style={{width:"100%",minHeight:120,padding:12,background:"#000",border:"1px solid #21262d",borderRadius:8,color:"var(--text-primary)",fontSize:12,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.6}} onFocus={e=>e.target.style.borderColor="var(--gold)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
        </Card>
      </div>
    );
}
