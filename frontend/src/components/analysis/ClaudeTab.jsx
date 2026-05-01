import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { _sf, n, div } from '../../utils/formatters.js';

export default function ClaudeTab() {
  const { cfg, ssd } = useAnalysis();
    const hasReport = ssd.reportGenerated || ssd.moat || ssd.verdict;
    
    if (!hasReport) {
      return (
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:48,marginBottom:16}}>🧠</div>
          <div style={{fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)",marginBottom:8}}>Análisis Inteligente con Claude</div>
          <div style={{fontSize:13,color:"var(--text-secondary)",maxWidth:500,margin:"0 auto",lineHeight:1.8,marginBottom:24}}>
            Claude analiza los 10 años de datos financieros de {cfg.name || "la empresa"} y genera un informe completo con tesis de inversión, análisis de moat, riesgos, catalizadores y evaluación de disrupción por IA.
          </div>
          <div style={{fontSize:12,color:"var(--text-tertiary)",marginBottom:8}}>Pulsa <strong style={{color:"var(--gold)"}}>⚡ Cargar</strong> en la barra superior para generar el análisis.</div>
        </div>
      );
    }

    const verdictColor = ssd.verdict==="CORE HOLD"||ssd.verdict==="ADD"?"#30d158":ssd.verdict==="HOLD"?"#ffd60a":ssd.verdict==="REVIEW"?"#ff9f0a":"#ff453a";
    const moatColor = ssd.moat==="Wide"?"#30d158":ssd.moat==="Narrow"?"#ffd60a":"#ff453a";
    const aiColor = ssd.aiDisruptionScore<=25?"#30d158":ssd.aiDisruptionScore<=50?"#ffd60a":ssd.aiDisruptionScore<=75?"#ff9f0a":"#ff453a";
    
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>🧠 Análisis Claude — {cfg.name}</h2>
        <p style={{margin:"0 0 20px",fontSize:11,color:"var(--text-tertiary)"}}>Análisis generado por IA basado en 10 años de datos financieros reales. Última actualización: {ssd.reportGenerated ? new Date(ssd.reportGenerated).toLocaleDateString() : "—"}</p>

        {/* Verdict Banner */}
        <Card glow style={{borderColor:`${verdictColor}33`,marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:20,alignItems:"center"}}>
            <div style={{textAlign:"center",padding:"12px 20px",borderRadius:16,background:`${verdictColor}08`,border:`2px solid ${verdictColor}33`}}>
              <div style={{fontSize:36,fontWeight:800,color:verdictColor,fontFamily:"var(--fm)"}}>{ssd.overallScore || "—"}</div>
              <div style={{fontSize:9,color:"var(--text-tertiary)"}}>/ 100</div>
            </div>
            <div>
              <div style={{fontSize:28,fontWeight:800,color:verdictColor,fontFamily:"var(--fd)"}}>{ssd.verdict || "—"}</div>
              {ssd.verdictSummary && <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7,marginTop:6}}>{ssd.verdictSummary}</div>}
              {ssd.targetWeight && <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:4}}>Peso sugerido: {ssd.targetWeight}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{padding:"6px 12px",borderRadius:8,background:`${moatColor}10`,border:`1px solid ${moatColor}25`,textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MOAT</div>
                <div style={{fontSize:14,fontWeight:700,color:moatColor,fontFamily:"var(--fm)"}}>{ssd.moat || "—"}</div>
              </div>
              {ssd.aiDisruptionLevel && <div style={{padding:"6px 12px",borderRadius:8,background:`${aiColor}10`,border:`1px solid ${aiColor}25`,textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>IA RISK</div>
                <div style={{fontSize:14,fontWeight:700,color:aiColor,fontFamily:"var(--fm)"}}>{ssd.aiDisruptionScore}/100</div>
              </div>}
            </div>
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Moat Analysis */}
          <Card title="Ventaja Competitiva (Moat)" icon="🏰" badge={ssd.moat?<span style={{fontSize:11,fontWeight:700,color:moatColor,background:`${moatColor}12`,padding:"3px 10px",borderRadius:100}}>{ssd.moat} · {ssd.moatScore}/10</span>:null}>
            {ssd.moatExplanation && <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8}}>{ssd.moatExplanation}</div>}
          </Card>

          {/* Financial Health */}
          <Card title="Salud Financiera" icon="💪" badge={ssd.finHealthScore?<span style={{fontSize:11,fontWeight:700,color:ssd.finHealthScore>=70?"#30d158":ssd.finHealthScore>=50?"#ffd60a":"#ff453a",background:ssd.finHealthScore>=70?"rgba(48,209,88,.12)":"rgba(255,214,10,.12)",padding:"3px 10px",borderRadius:100}}>{ssd.finHealthScore}/100</span>:null}>
            {ssd.finHealthAssessment && <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8}}>{ssd.finHealthAssessment}</div>}
          </Card>

          {/* Growth */}
          <Card title="Crecimiento" icon="📈" badge={ssd.fcfTrend?<span style={{fontSize:10,fontWeight:600,color:"var(--text-tertiary)",background:"var(--subtle-border)",padding:"3px 8px",borderRadius:100}}>{ssd.fcfTrend}</span>:null}>
            {ssd.growthAssessment && <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8}}>{ssd.growthAssessment}</div>}
          </Card>

          {/* Valuation */}
          <Card title="Valoración Claude" icon="🎯">
            {ssd.valuationFairValue && (
              <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>VALOR JUSTO</div>
                  <div style={{fontSize:24,fontWeight:800,color:"var(--green)",fontFamily:"var(--fm)"}}>${ssd.valuationFairValue}</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>ACTUAL</div>
                  <div style={{fontSize:24,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>${_sf(cfg.price,2)}</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>UPSIDE</div>
                  <div style={{fontSize:20,fontWeight:800,color:ssd.valuationUpside>0?"#30d158":"#ff453a",fontFamily:"var(--fm)"}}>{ssd.valuationUpside>0?"+":""}{ssd.valuationUpside}%</div>
                </div>
              </div>
            )}
            {ssd.valuationAssessment && <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8}}>{ssd.valuationAssessment}</div>}
            {ssd.valuationMethod && <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:4}}>Método: {ssd.valuationMethod}</div>}
          </Card>
        </div>

        {/* AI Disruption Risk — Full */}
        {ssd.aiDisruptionLevel && (
          <Card title="Riesgo Disrupción IA" icon="🤖" style={{marginTop:16}} badge={
            <span style={{fontSize:11,fontWeight:700,color:aiColor,background:`${aiColor}12`,padding:"4px 12px",borderRadius:100}}>{ssd.aiDisruptionLevel} ({ssd.aiDisruptionScore}/100)</span>
          }>
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div style={{fontSize:40,fontWeight:800,fontFamily:"var(--fm)",color:aiColor}}>{ssd.aiDisruptionScore}</div>
              <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:2}}>{ssd.aiDisruptionLevel==="Low"?"Bajo riesgo — negocio resiliente a IA":ssd.aiDisruptionLevel==="Medium"?"Riesgo moderado — vulnerabilidades parciales":ssd.aiDisruptionLevel==="High"?"Alto riesgo — modelo amenazado":"Riesgo crítico — alta probabilidad de disrupción"}</div>
            </div>
            {ssd.aiDisruptionAssessment && <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8,marginTop:10,padding:"12px 14px",background:"var(--row-alt)",borderRadius:10}}>{ssd.aiDisruptionAssessment}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
              {ssd.aiDisruptionThreats?.length > 0 && (
                <div style={{padding:"12px",background:"rgba(255,69,58,.04)",borderRadius:10,border:"1px solid rgba(255,69,58,.08)"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#ff453a",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:8}}>AMENAZAS IA</div>
                  {ssd.aiDisruptionThreats.map((t,i) => <div key={i} style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.6,marginBottom:6}}>• {t}</div>)}
                </div>
              )}
              {ssd.aiDisruptionDefenses?.length > 0 && (
                <div style={{padding:"12px",background:"rgba(48,209,88,.04)",borderRadius:10,border:"1px solid rgba(48,209,88,.08)"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#30d158",fontFamily:"var(--fm)",letterSpacing:.5,marginBottom:8}}>DEFENSAS</div>
                  {ssd.aiDisruptionDefenses.map((d,i) => <div key={i} style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.6,marginBottom:6}}>• {d}</div>)}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Risks + Catalysts */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:16}}>
          <Card title="Riesgos Principales" icon="⚠️">
            {ssd.risks?.length > 0 ? ssd.risks.map((r,i) => (
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 0",borderBottom:i<ssd.risks.length-1?"1px solid var(--subtle-border)":"none"}}>
                <span style={{fontSize:14,color:"#ff453a",flexShrink:0,marginTop:1}}>●</span>
                <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7}}>{r}</div>
              </div>
            )) : <div style={{color:"var(--text-tertiary)",fontSize:12}}>Sin datos</div>}
          </Card>
          <Card title="Catalizadores" icon="🚀">
            {ssd.catalysts?.length > 0 ? ssd.catalysts.map((c,i) => (
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 0",borderBottom:i<ssd.catalysts.length-1?"1px solid var(--subtle-border)":"none"}}>
                <span style={{fontSize:14,color:"#30d158",flexShrink:0,marginTop:1}}>●</span>
                <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.7}}>{c}</div>
              </div>
            )) : <div style={{color:"var(--text-tertiary)",fontSize:12}}>Sin datos</div>}
          </Card>
        </div>

        {/* Dividend Safety by Claude */}
        {ssd.divSafetyAssessment && (
          <Card title="Seguridad del Dividendo — Claude" icon="💰" style={{marginTop:16}} badge={ssd.divSafetyScore?<span style={{fontSize:11,fontWeight:700,color:ssd.divSafetyScore>=70?"#30d158":ssd.divSafetyScore>=50?"#ffd60a":"#ff453a",background:ssd.divSafetyScore>=70?"rgba(48,209,88,.12)":"rgba(255,214,10,.12)",padding:"3px 10px",borderRadius:100}}>{ssd.divSafetyScore}/100</span>:null}>
            <div style={{fontSize:12,color:"var(--text-secondary)",lineHeight:1.8}}>{ssd.divSafetyAssessment}</div>
          </Card>
        )}

        <div style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)",borderRadius:20,padding:16,marginTop:16}}>
          <div style={{fontSize:11,color:"var(--text-tertiary)",lineHeight:1.7,textAlign:"center"}}>
            Este análisis fue generado por Claude (Anthropic) a partir de datos financieros reales de FMP. No constituye asesoramiento financiero. Para regenerar, pulsa ⚡ Cargar.
          </div>
        </div>
      </div>
    );
}
