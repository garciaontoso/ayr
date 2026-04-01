import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { _sf, n, fP, fX, fM, div } from '../../utils/formatters.js';

export default function ChecklistTab() {
  const { DATA_YEARS, L, LD, advancedMetrics, altmanZ, cfg, comp, dcf, divAnalysis, fmpExtra, piotroski, revenueCAGR, ssd, wacc } = useAnalysis();
    const price = cfg.price || 0;
    const da = divAnalysis;
    const am = advancedMetrics;
    
    // Build checklist items grouped by category
    const checks = [
      // ─── MOAT & QUALITY ───
      { cat: "Calidad / Moat", name: "Margen Bruto > 40%", val: L.gm, threshold: 0.40, pass: L.gm >= 0.40, display: fP(L.gm), note: L.gm >= 0.50 ? "Wide moat" : L.gm >= 0.40 ? "Moat probable" : L.gm >= 0.25 ? "Moat débil" : "Commoditizado" },
      { cat: "Calidad / Moat", name: "Margen Operativo > 15%", val: L.om, threshold: 0.15, pass: L.om >= 0.15, display: fP(L.om) },
      { cat: "Calidad / Moat", name: "Margen Neto > 10%", val: L.nm, threshold: 0.10, pass: L.nm >= 0.10, display: fP(L.nm) },
      { cat: "Calidad / Moat", name: "ROE > 15%", val: L.roe, threshold: 0.15, pass: L.roe >= 0.15, display: fP(L.roe) },
      { cat: "Calidad / Moat", name: "ROIC > WACC", val: L.roic, threshold: wacc.wacc, pass: L.roic > wacc.wacc, display: `${fP(L.roic)} vs ${fP(wacc.wacc)}`, note: L.roic > wacc.wacc ? "Crea valor" : "Destruye valor" },
      { cat: "Calidad / Moat", name: "ROIC > 10%", val: L.roic, threshold: 0.10, pass: L.roic >= 0.10, display: fP(L.roic) },
      
      // ─── CRECIMIENTO ───
      { cat: "Crecimiento", name: "Revenue CAGR > 5%", val: revenueCAGR, threshold: 0.05, pass: revenueCAGR >= 0.05, display: fP(revenueCAGR) },
      { cat: "Crecimiento", name: "EPS creciente 5Y", val: da.cagr5, threshold: 0, pass: da.cagr5 > 0, display: da.cagr5 != null ? fP(da.cagr5) : "—" },
      { cat: "Crecimiento", name: "FCF creciente", val: (() => { const f5 = DATA_YEARS.slice(0,5).map(y=>comp[y]?.fcf).filter(v=>v!=null); return f5.length>=2 ? (f5[0] > f5[f5.length-1] ? 1 : 0) : null; })(), pass: (() => { const f5 = DATA_YEARS.slice(0,5).map(y=>comp[y]?.fcf).filter(v=>v!=null); return f5.length>=2 && f5[0] > f5[f5.length-1]; })(), display: L.fcf > 0 ? fM(L.fcf) : "—" },
      { cat: "Crecimiento", name: "Dividendo CAGR 5Y > 5%", val: da.cagr5, threshold: 0.05, pass: da.cagr5 >= 0.05, display: da.cagr5 != null ? fP(da.cagr5) : "—" },
      
      // ─── DEUDA ───
      { cat: "Deuda / Solidez", name: "Deuda Neta/EBITDA < 3x", val: L.ebitda > 0 ? (L.netDebt||0)/L.ebitda : null, pass: L.ebitda > 0 && (L.netDebt||0)/L.ebitda < 3, display: L.ebitda > 0 ? fX((L.netDebt||0)/L.ebitda) : "—" },
      { cat: "Deuda / Solidez", name: "Cobertura Intereses > 5x", val: L.ic, pass: L.ic > 5, display: L.ic ? fX(L.ic) : "—" },
      { cat: "Deuda / Solidez", name: "Piotroski F-Score ≥ 5", val: piotroski.score, threshold: 5, pass: piotroski.score >= 5, display: `${piotroski.score}/9` },
      { cat: "Deuda / Solidez", name: "Altman Z > 2.99 (Segura)", val: altmanZ.score, threshold: 2.99, pass: altmanZ.score > 2.99, display: altmanZ.score != null ? _sf(altmanZ.score,2) : "—" },
      { cat: "Deuda / Solidez", name: "Beneish M-Score < -2.22", val: am.beneish, pass: am.beneish != null && am.beneish < -2.22, display: am.beneish != null ? _sf(am.beneish,2) : "—", note: am.beneishLabel },
      
      // ─── DIVIDENDO ───
      { cat: "Dividendo", name: "Dividend Yield > 2%", val: price > 0 && LD.dps > 0 ? LD.dps/price : null, pass: price > 0 && LD.dps > 0 && LD.dps/price >= 0.02, display: price > 0 && LD.dps > 0 ? fP(LD.dps/price) : "—" },
      { cat: "Dividendo", name: "FCF Payout < 70%", val: L.fcf > 0 && LD.dps > 0 ? (LD.dps * (LD.sharesOut||1)) / L.fcf : null, pass: L.fcf > 0 && LD.dps > 0 && ((LD.dps * (LD.sharesOut||1)) / L.fcf) < 0.70, display: L.fcf > 0 && LD.dps > 0 ? fP((LD.dps * (LD.sharesOut||1)) / L.fcf) : "—" },
      { cat: "Dividendo", name: "Racha crecimiento ≥ 5 años", val: ssd.growthStreak, pass: ssd.growthStreak >= 5, display: `${ssd.growthStreak} años` },
      { cat: "Dividendo", name: "Safety Score ≥ 60", val: ssd.safetyScore, pass: ssd.safetyScore >= 60, display: `${ssd.safetyScore}/100` },
      { cat: "Dividendo", name: "Sin recorte de dividendo", val: ssd.uninterruptedStreak, pass: ssd.uninterruptedStreak >= 5, display: `${ssd.uninterruptedStreak} años sin corte` },
      
      // ─── VALORACIÓN ───
      { cat: "Valoración", name: "P/E < 20", val: LD.eps > 0 ? price/LD.eps : null, pass: LD.eps > 0 && price/LD.eps < 20, display: LD.eps > 0 ? fX(price/LD.eps) : "—" },
      { cat: "Valoración", name: "EV/EBITDA < 15", val: L.eve, pass: L.eve > 0 && L.eve < 15, display: L.eve ? fX(L.eve) : "—" },
      { cat: "Valoración", name: "MOS ≥ 20% (DCF)", val: dcf?.mos, pass: dcf?.mos >= 0.20, display: dcf?.mos != null ? fP(dcf.mos) : "—" },
      { cat: "Valoración", name: "Forward P/E < P/E actual", val: am.forwardPE, pass: am.forwardPE != null && LD.eps > 0 && am.forwardPE < price/LD.eps, display: am.forwardPE ? `${_sf(am.forwardPE,1)}x` : "—", note: "Earnings creciendo" },
      { cat: "Valoración", name: "Precio < Analyst Consensus", val: fmpExtra.priceTarget?.targetConsensus, pass: fmpExtra.priceTarget?.targetConsensus > 0 && price < fmpExtra.priceTarget.targetConsensus, display: fmpExtra.priceTarget?.targetConsensus ? `$${_sf(fmpExtra.priceTarget.targetConsensus,0)} vs $${_sf(price,0)}` : "—" },
      
      // ─── MANAGEMENT ───
      { cat: "Management", name: "Recompra de acciones", val: am.buybackCAGR, pass: am.buybackCAGR != null && am.buybackCAGR < -0.005, display: am.buybackCAGR != null ? `${_sf(am.buybackCAGR*100,1)}%/yr` : "—", note: am.buybackLabel },
      { cat: "Management", name: "FMP Rating ≥ B", val: fmpExtra.rating?.rating, pass: fmpExtra.rating?.rating && "AB".includes(fmpExtra.rating.rating[0]), display: fmpExtra.rating?.rating || "—" },
    ];
    
    // Summary
    const validChecks = checks.filter(c => c.val != null && c.val !== "—");
    const passed = validChecks.filter(c => c.pass).length;
    const total = validChecks.length;
    const pct = total > 0 ? passed / total : 0;
    const verdict = pct >= 0.75 ? "COMPRAR" : pct >= 0.55 ? "MANTENER" : pct >= 0.35 ? "VIGILAR" : "EVITAR";
    const verdictColor = pct >= 0.75 ? "#30d158" : pct >= 0.55 ? "#ffd60a" : pct >= 0.35 ? "#ff9f0a" : "#ff453a";
    
    const cats = [...new Set(checks.map(c => c.cat))];
    
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>✅ Investment Checklist</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>
          Criterios pass/fail para decidir si comprar, mantener o vender. Preflight check del inversor.
        </p>

        {/* Summary Banner */}
        <Card glow style={{borderColor:`${verdictColor}33`,marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:24,alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{position:"relative",width:120,height:120}}>
                <svg viewBox="0 0 120 120" style={{width:120,height:120}}>
                  <circle cx={60} cy={60} r={52} fill="none" stroke="var(--subtle-bg2)" strokeWidth={8}/>
                  <circle cx={60} cy={60} r={52} fill="none" stroke={verdictColor} strokeWidth={8} strokeDasharray={`${pct*327} 327`} strokeLinecap="round" transform="rotate(-90 60 60)" style={{transition:"stroke-dasharray .8s"}}/>
                </svg>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
                  <div style={{fontSize:28,fontWeight:800,color:verdictColor,fontFamily:"var(--fm)"}}>{passed}</div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)"}}>/{total}</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{fontSize:32,fontWeight:800,color:verdictColor,fontFamily:"var(--fd)"}}>{verdict}</div>
              <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:4}}>
                {pct >= 0.75 ? "La mayoría de criterios se cumplen. Candidata sólida para la cartera." :
                 pct >= 0.55 ? "Algunos criterios fallan. Analizar los fallos antes de decidir." :
                 pct >= 0.35 ? "Muchos criterios no se cumplen. Necesita investigación adicional." :
                 "La mayoría de criterios fallan. No apta para estrategia de dividendos."}
              </div>
              <div style={{display:"flex",gap:16,marginTop:12}}>
                <div><span style={{fontSize:20,fontWeight:800,color:"#30d158",fontFamily:"var(--fm)"}}>{passed}</span> <span style={{fontSize:11,color:"var(--text-tertiary)"}}>PASS</span></div>
                <div><span style={{fontSize:20,fontWeight:800,color:"#ff453a",fontFamily:"var(--fm)"}}>{total-passed}</span> <span style={{fontSize:11,color:"var(--text-tertiary)"}}>FAIL</span></div>
                <div><span style={{fontSize:20,fontWeight:800,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>{checks.length-total}</span> <span style={{fontSize:11,color:"var(--text-tertiary)"}}>N/A</span></div>
              </div>
            </div>
            <div style={{textAlign:"center",padding:"16px 24px",borderRadius:16,background:`${verdictColor}08`,border:`2px solid ${verdictColor}33`}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)",letterSpacing:1}}>SCORE</div>
              <div style={{fontSize:42,fontWeight:800,color:verdictColor,fontFamily:"var(--fm)"}}>{Math.round(pct*100)}%</div>
            </div>
          </div>
        </Card>

        {/* Checklist by Category */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {cats.map(cat => {
            const items = checks.filter(c => c.cat === cat);
            const catPassed = items.filter(c => c.pass && c.val != null).length;
            const catTotal = items.filter(c => c.val != null && c.val !== "—").length;
            return (
              <Card key={cat} title={`${cat} (${catPassed}/${catTotal})`}>
                {items.map((c, i) => {
                  const hasData = c.val != null && c.val !== "—";
                  const icon = !hasData ? "○" : c.pass ? "✓" : "✗";
                  const iconColor = !hasData ? "#555" : c.pass ? "#30d158" : "#ff453a";
                  const bg = !hasData ? "transparent" : c.pass ? "rgba(48,209,88,.04)" : "rgba(255,69,58,.04)";
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:bg,marginBottom:4,border:`1px solid ${hasData?(c.pass?"rgba(48,209,88,.08)":"rgba(255,69,58,.08)"):"transparent"}`}}>
                      <span style={{fontSize:14,fontWeight:700,color:iconColor,width:18,textAlign:"center"}}>{icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,color:"var(--text-primary)",fontWeight:500}}>{c.name}</div>
                        {c.note && <div style={{fontSize:9,color:"var(--text-tertiary)"}}>{c.note}</div>}
                      </div>
                      <div style={{fontSize:12,fontWeight:700,color:hasData?(c.pass?"#30d158":"#ff453a"):"var(--text-tertiary)",fontFamily:"var(--fm)",whiteSpace:"nowrap"}}>{c.display}</div>
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>

        {/* Educational */}
        <div style={{background:"linear-gradient(145deg,#12161f,#0d1117)",border:"1px solid var(--gold-dim)",borderRadius:20,padding:20,marginTop:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--gold)",marginBottom:8,fontFamily:"var(--fd)"}}>📖 Cómo usar el Checklist</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,fontSize:11.5,color:"var(--text-secondary)",lineHeight:1.8}}>
            <div>
              <strong style={{color:"#30d158"}}>≥75% COMPRAR</strong> — La empresa cumple la mayoría de criterios. Si la valoración es atractiva, es candidata sólida.<br/><br/>
              <strong style={{color:"#ffd60a"}}>55-74% MANTENER</strong> — Buenos fundamentales pero algún área débil. Mantener si ya la tienes, investigar los fallos antes de comprar.
            </div>
            <div>
              <strong style={{color:"#ff9f0a"}}>35-54% VIGILAR</strong> — Demasiados criterios fallan. Poner en watchlist y esperar mejora.<br/><br/>
              <strong style={{color:"#ff453a"}}>{"<"}35% EVITAR</strong> — No apta para estrategia de dividendo-crecimiento. Buscar alternativas en el mismo sector.
            </div>
          </div>
        </div>
      </div>
    );
}
