import { useAnalysis } from '../../context/AnalysisContext';
import { Card } from '../ui';
import { n, f2, fP, fC, div } from '../../utils/formatters.js';
import { R } from '../../utils/ratings.js';
import { YEARS } from '../../constants/index.js';

export default function MOSTab() {
  const { DATA_YEARS, L, LD, cfg, comp, dcf, fin, fmpExtra, latestDataYear } = useAnalysis();
    // ═══ RULE #1: Sticker Price ═══
    const epsTTM = LD.eps || 0;
    const bvps0 = comp[latestDataYear]?.bvps, bvps5 = comp[YEARS[5]]?.bvps;
    const bvpsCAGR = (bvps0>0 && bvps5>0) ? Math.pow(bvps0/bvps5, 1/5)-1 : null;
    const fgr = bvpsCAGR != null ? Math.min(Math.max(bvpsCAGR, 0.01), 0.20) : 0.08;
    const futureEPS = epsTTM > 0 ? epsTTM * Math.pow(1 + fgr, 10) : null;
    // Historical P/Es from FMP key-metrics (uses each year's actual closing price ÷ EPS).
    // Previous version used `comp[y]?.price` which was always undefined, falling back to
    // current price → "P/E ratios all measured against today's price" (meaningless).
    const historicalPEs = DATA_YEARS.map(y => {
      const km = fmpExtra.keyMetrics?.find(k => k.date?.startsWith(String(y)));
      return km?.peRatio;
    }).filter(v=>v!=null&&v>0&&v<100);
    const maxHistPE = historicalPEs.length ? Math.max(...historicalPEs) : 30;
    const futurePE = Math.min(fgr * 100 * 2, maxHistPE);
    const futureValue = futureEPS ? futureEPS * futurePE : null;
    const stickerPrice = futureValue ? futureValue / Math.pow(1.15, 10) : null;
    const mosPrice = stickerPrice ? stickerPrice * 0.5 : null;
    const stickerMOS = stickerPrice && cfg.price ? 1 - cfg.price/stickerPrice : null;

    // ═══ CLAUDE METHODS (sin repetir 10 Cap) ═══
    const dcfIV = dcf ? dcf.iv : null;
    const dcfMOS = dcf ? dcf.mos : null;
    const ebitdaFair = (L.ebitda>0 && LD.sharesOut) ? div((L.ebitda * 10) - (L.netDebt||0), LD.sharesOut) : null;
    const ebitdaMOS = (ebitdaFair && cfg.price) ? 1 - cfg.price/ebitdaFair : null;
    const grahamNum = (LD.eps>0 && L.bvps>0) ? Math.sqrt(22.5 * LD.eps * L.bvps) : null;
    const grahamMOS = (grahamNum && cfg.price) ? 1 - cfg.price/grahamNum : null;
    // ═══ FMP DCF (external validation) ═══
    const fmpDcfIV = fmpExtra.dcf?.dcf || null;
    const fmpDcfMOS = (fmpDcfIV && cfg.price) ? 1 - cfg.price/fmpDcfIV : null;
    // ═══ FMP Price Target (analyst consensus) ═══
    const ptIV = fmpExtra.priceTarget?.targetConsensus || null;
    const ptMOS = (ptIV && cfg.price) ? 1 - cfg.price/ptIV : null;

    const MethodBadge = ({label, color, icon}) => (
      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:12,background:`${color}15`,border:`1px solid ${color}33`,fontSize:9,fontWeight:700,color,fontFamily:"var(--fm)"}}>{icon} {label}</span>
    );

    const allMethods = [
      {name:"Sticker Price (MOS)", desc:"EPS→FGR→Future P/E→descuento al 15% MARR", iv:stickerPrice, mos:stickerMOS, icon:"🏷", color:"#ff9f0a", badge:"RULE #1"},
      {name:"DCF A&R (10 años)", desc:"FCF + WACC + valor terminal", iv:dcfIV, mos:dcfMOS, icon:"△", color:"#64d2ff", badge:"A&R"},
      {name:"DCF FMP", desc:"Modelo DCF de Financial Modeling Prep", iv:fmpDcfIV, mos:fmpDcfMOS, icon:"◈", color:"#bf5af2", badge:"FMP"},
      {name:"EV/EBITDA (10x)", desc:"Precio si EV = 10× EBITDA", iv:ebitdaFair, mos:ebitdaMOS, icon:"⬡", color:"#64d2ff", badge:"A&R"},
      {name:"Graham Number", desc:"√(22.5 × EPS × BVPS)", iv:grahamNum, mos:grahamMOS, icon:"G", color:"#bf5af2", badge:"CLASSIC"},
      {name:"Analyst Consensus", desc:"Precio objetivo medio de analistas", iv:ptIV, mos:ptMOS, icon:"🎯", color:"#30d158", badge:"ANALYSTS"},
    ];
    const validMethods = allMethods.filter(m=>m.iv!=null&&m.iv>0);
    const avgIV = validMethods.length ? validMethods.reduce((a,m)=>a+m.iv,0)/validMethods.length : null;
    const avgMOS = avgIV && cfg.price ? 1 - cfg.price/avgIV : null;

    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--fd)"}}>🛡 Margin of Safety</h2>
        <p style={{margin:"0 0 20px",fontSize:12,color:"var(--text-secondary)"}}>Phil Town: ¿A qué precio comprar con ≥50% de descuento sobre el valor intrínseco? Sticker Price + otros métodos.</p>

        {/* ══════ STICKER PRICE DETAIL ══════ */}
        <Card glow style={{marginBottom:16,borderColor:"rgba(255,159,10,.2)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <MethodBadge label="RULE #1" color="#ff9f0a" icon="📖"/>
            <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)"}}>Sticker Price — Fórmula de Phil Town</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[
              {l:"EPS TTM",v:fC(epsTTM)},{l:"FGR (BVPS CAGR 5a)",v:fP(fgr)},{l:"Future EPS (10a)",v:fC(futureEPS)},
              {l:"Future P/E (2×FGR)",v:f2(futurePE)+"x"},{l:"Sticker Price",v:fC(stickerPrice),c:"#ff9f0a"},{l:"MOS Price (50%)",v:fC(mosPrice),c:"var(--gold)"},
            ].map((x,i)=>(
              <div key={i} style={{padding:"10px",borderRadius:8,background:"var(--row-alt)",textAlign:"center"}}>
                <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase",marginBottom:4}}>{x.l}</div>
                <div style={{fontSize:17,fontWeight:700,color:x.c||"var(--text-primary)",fontFamily:"var(--fm)"}}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"center",padding:"12px 0",borderTop:"1px solid var(--table-border)"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>STICKER PRICE</div>
              <div style={{fontSize:32,fontWeight:800,color:"#ff9f0a",fontFamily:"var(--fm)"}}>{fC(stickerPrice)}</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>TU PRECIO</div>
              <div style={{fontSize:32,fontWeight:800,color:"var(--text-primary)",fontFamily:"var(--fm)"}}>{fC(cfg.price)}</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontFamily:"var(--fm)"}}>MOS PRICE (50%)</div>
              <div style={{fontSize:32,fontWeight:800,color:cfg.price<=mosPrice?"var(--green)":"var(--red)",fontFamily:"var(--fm)"}}>{fC(mosPrice)}</div>
            </div>
          </div>
          <div style={{fontSize:10,color:"var(--text-secondary)",lineHeight:1.5,marginTop:8}}>
            <strong>Fórmula:</strong> EPS × (1 + FGR)^10 × Future P/E → descontar al 15% (MARR) → ÷2 = MOS Price. FGR = menor de tu estimación y analistas. Future P/E = 2 × FGR, tope en máximo P/E histórico.
          </div>
        </Card>

        {/* ══════ RESUMEN COMBINADO ══════ */}
        <Card glow style={{marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:700,fontFamily:"var(--fm)"}}>VALOR INTRÍNSECO MEDIO</div>
              <div style={{fontSize:32,fontWeight:800,color:"var(--gold)",fontFamily:"var(--fm)",marginTop:4}}>{fC(avgIV)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{validMethods.length} métodos</div>
            </div>
            <div style={{width:1,height:50,background:"var(--border)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--text-tertiary)",fontWeight:700,fontFamily:"var(--fm)"}}>MARGIN OF SAFETY</div>
              <div style={{fontSize:32,fontWeight:800,color:avgMOS>0.30?"var(--green)":avgMOS>0?"var(--yellow)":"var(--red)",fontFamily:"var(--fm)",marginTop:4}}>{fP(avgMOS)}</div>
              <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>Precio: {fC(cfg.price)}</div>
            </div>
          </div>
        </Card>

        {/* ══════ ALL METHODS GRID ══════ */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          {allMethods.map((m,i)=>{
            const barColor = m.mos>0.30?"var(--green)":m.mos>0.15?"var(--yellow)":m.mos>0?"var(--orange)":"var(--red)";
            const barW = m.mos!=null ? Math.min(Math.max(m.mos*100, 0), 100) : 0;
            return (
              <Card key={i} style={{borderColor:m.badge==="RULE #1"?"rgba(255,159,10,.15)":m.badge==="CLASSIC"?"rgba(191,90,242,.15)":"rgba(100,210,255,.15)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                  <span style={{fontSize:16}}>{m.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text-primary)"}}>{m.name}</div>
                    <div style={{fontSize:9,color:"var(--text-tertiary)"}}>{m.desc}</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>V. Intrínseco</div>
                    <div style={{fontSize:18,fontWeight:700,color:m.color,fontFamily:"var(--fm)"}}>{fC(m.iv)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:8,color:"var(--text-tertiary)",fontFamily:"var(--fm)",textTransform:"uppercase"}}>MOS</div>
                    <div style={{fontSize:18,fontWeight:700,color:barColor,fontFamily:"var(--fm)"}}>{fP(m.mos)}</div>
                  </div>
                </div>
                <div style={{height:5,background:"var(--subtle-border)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${barW}%`,height:"100%",background:barColor,borderRadius:3,transition:"width .8s"}}/>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Tabla resumen */}
        <Card style={{overflowX:"auto",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              {["MÉTODO","V. INTRÍNSECO","MOS","PRECIO 50%","SEÑAL"].map((h,i)=>(
                <th key={i} style={{padding:"10px 12px",textAlign:i===0?"left":"center",color:i===0?"var(--gold)":"var(--text-secondary)",fontWeight:600,borderBottom:"2px solid var(--table-border)",fontFamily:"var(--fm)",fontSize:9}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allMethods.map((m,i)=>{
                const mo = m.mos!=null?m.mos:null;
                const sg = mo==null?"—":mo>0.3?"COMPRAR":mo>0.15?"INTERESANTE":mo>0?"AJUSTADO":"CARO";
                const sc = sg==="COMPRAR"?"var(--green)":sg==="INTERESANTE"?"var(--gold)":sg==="AJUSTADO"?"var(--yellow)":"var(--red)";
                return (
                  <tr key={i} style={{background:i%2?"var(--row-alt)":"transparent"}}>
                    <td style={{padding:"7px 12px",color:m.color,fontWeight:600,borderBottom:"1px solid var(--table-border)"}}>{m.icon} {m.name}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",fontWeight:700,color:m.color,borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{fC(m.iv)}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",fontWeight:700,color:sc,borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{fP(m.mos)}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",color:"var(--gold)",borderBottom:"1px solid var(--table-border)",fontFamily:"var(--fm)"}}>{fC(m.iv?m.iv*0.5:null)}</td>
                    <td style={{padding:"7px 12px",textAlign:"center",borderBottom:"1px solid var(--table-border)"}}>
                      <span style={{fontSize:9,fontWeight:700,color:sc,background:`${sc}15`,padding:"3px 10px",borderRadius:10,border:`1px solid ${sc}33`}}>{sg}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
}
